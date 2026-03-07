/**
 * Embedding Worker
 *
 * BullMQ Worker，处理 Embedding 任务队列中的作业。
 * 支持三种操作：index（新建索引）、reindex（重建索引）、cleanup（清理索引）。
 */

import { Worker, Job } from "bullmq";
import { redisClient } from "../../config/redis";
import {
  QUEUE_NAMES,
  EMBEDDING_STATUS,
  EmbeddingStatus,
} from "../../types/model.types";
import { KnowledgeService } from "../../services/knowledge.service";
import File from "../../models/File.model";
import type { EmbeddingJobData } from "../../services/embedding-manager";
import logger from "../logger";
import { getSocket } from "../socket";
import { user_room } from "../../utils/socket.util";

function emitEmbeddingStatus(
  userId: string,
  fileId: string,
  status: EmbeddingStatus,
  extra?: { error?: string; processedChunks?: number; totalChunks?: number },
) {
  try {
    const io = getSocket();
    io.to(user_room(userId)).emit("embedding:status_changed", {
      fileId,
      status,
      ...extra,
    });
  } catch {
    // Socket may not be initialized
  }
}

let worker: Worker | null = null;

export function initEmbeddingWorker(): void {
  if (worker) {
    logger.warn("Embedding worker already initialized");
    return;
  }

  const knowledgeService = new KnowledgeService();

  worker = new Worker<EmbeddingJobData>(
    QUEUE_NAMES.EMBEDDING,
    async (job: Job<EmbeddingJobData>) => {
      const { fileId, userId, action } = job.data;

      logger.info(
        { fileId, userId, action, jobId: job.id },
        "Processing embedding task",
      );

      try {
        switch (action) {
          case "index":
            await processIndex(knowledgeService, fileId, userId, job);
            break;
          case "reindex":
            await processReindex(knowledgeService, fileId, userId, job);
            break;
          case "cleanup":
            await processCleanup(knowledgeService, fileId);
            break;
          default:
            logger.warn({ action, fileId }, "Unknown embedding action");
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error, fileId, userId, action },
          "Embedding task failed",
        );

        // 标记为 failed（cleanup 不需要更新 File 状态）
        if (action !== "cleanup") {
          await File.updateOne(
            { _id: fileId },
            {
              $set: {
                embeddingStatus: EMBEDDING_STATUS.FAILED,
                embeddingError: errMsg,
              },
            },
          );
          emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.FAILED, {
            error: errMsg,
          });
        }

        throw error;
      }
    },
    {
      connection: redisClient,
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    logger.info(
      { fileId: job.data.fileId, action: job.data.action, jobId: job.id },
      "Embedding task completed",
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      {
        fileId: job?.data.fileId,
        action: job?.data.action,
        jobId: job?.id,
        error: err.message,
      },
      "Embedding task failed",
    );
  });

  logger.info("Embedding BullMQ worker started");
}

async function processIndex(
  knowledgeService: KnowledgeService,
  fileId: string,
  userId: string,
  job: Job<EmbeddingJobData>,
): Promise<void> {
  // 检查 hash 去重：如果同一用户已有相同 hash 的文件且已完成索引，跳过
  const file = await File.findById(fileId).select("+hash mimeType").lean();
  if (!file) {
    logger.warn({ fileId }, "File not found, skipping index");
    return;
  }

  if (file.hash) {
    const existing = await File.findOne({
      _id: { $ne: fileId },
      user: userId,
      hash: file.hash,
      embeddingStatus: EMBEDDING_STATUS.COMPLETED,
      isTrashed: false,
    })
      .select("_id")
      .lean();

    if (existing) {
      // Hash 命中：直接标记为 completed
      await File.updateOne(
        { _id: fileId },
        { $set: { embeddingStatus: EMBEDDING_STATUS.COMPLETED } },
      );
      emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.COMPLETED);
      logger.info(
        { fileId, existingFileId: existing._id },
        "Hash match found, skipping embedding generation",
      );
      return;
    }
  }

  // 标记为 processing
  await File.updateOne(
    { _id: fileId },
    { $set: { embeddingStatus: EMBEDDING_STATUS.PROCESSING } },
  );
  emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.PROCESSING);

  const chunkCount = await knowledgeService.indexFile(fileId, userId);

  // 更新状态为 completed
  await File.updateOne(
    { _id: fileId },
    {
      $set: {
        embeddingStatus: EMBEDDING_STATUS.COMPLETED,
        embeddingError: null,
        processedChunks: chunkCount,
        totalChunks: chunkCount,
      },
    },
  );
  emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.COMPLETED, {
    processedChunks: chunkCount,
    totalChunks: chunkCount,
  });
}

async function processReindex(
  knowledgeService: KnowledgeService,
  fileId: string,
  userId: string,
  job: Job<EmbeddingJobData>,
): Promise<void> {
  // 标记为 processing
  await File.updateOne(
    { _id: fileId },
    { $set: { embeddingStatus: EMBEDDING_STATUS.PROCESSING } },
  );
  emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.PROCESSING);

  // 先清理旧数据
  await knowledgeService.removeFileIndex(fileId);

  // 检查文件是否还存在（可能在索引期间被删除）
  const file = await File.findById(fileId).select("isTrashed").lean();
  if (!file || file.isTrashed) {
    logger.warn({ fileId }, "File trashed/deleted during reindex, aborting");
    await File.updateOne(
      { _id: fileId },
      {
        $set: {
          embeddingStatus: EMBEDDING_STATUS.NONE,
          processedChunks: 0,
          totalChunks: 0,
        },
      },
    );
    emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.NONE);
    return;
  }

  // 重新索引
  const chunkCount = await knowledgeService.indexFile(fileId, userId);

  await File.updateOne(
    { _id: fileId },
    {
      $set: {
        embeddingStatus: EMBEDDING_STATUS.COMPLETED,
        embeddingError: null,
        processedChunks: chunkCount,
        totalChunks: chunkCount,
      },
    },
  );
  emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.COMPLETED, {
    processedChunks: chunkCount,
    totalChunks: chunkCount,
  });
}

async function processCleanup(
  knowledgeService: KnowledgeService,
  fileId: string,
): Promise<void> {
  await knowledgeService.removeFileIndex(fileId);
  logger.info({ fileId }, "Embedding cleanup completed");
}

export function getEmbeddingWorker(): Worker | null {
  return worker;
}
