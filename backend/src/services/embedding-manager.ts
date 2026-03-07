/**
 * Embedding Manager
 *
 * 事件驱动的 Embedding 流水线管理器。
 * 负责接收文件生命周期事件，将 Embedding 任务入队，
 * 并提供状态查询和重试接口。
 *
 * 流程：
 *   file.created  -> enqueue('index', fileId)   -> 检查 hash -> 生成向量
 *   file.updated  -> enqueue('reindex', fileId)  -> 先清理旧 points -> 重新分片
 *   file.deleted  -> enqueue('cleanup', fileId)  -> 物理删除向量 + chunks
 */

import { embeddingQueue } from "../lib/queue/queue";
import {
  QUEUE_TASKS,
  EMBEDDING_STATUS,
  EmbeddingStatus,
} from "../types/model.types";
import File from "../models/File.model";
import { isTextExtractable } from "./knowledge.service";
import { logger } from "../lib/logger";
import { getSocket } from "../lib/socket";
import { user_room } from "../utils/socket.util";

export interface EmbeddingJobData {
  fileId: string;
  userId: string;
  action: "index" | "reindex" | "cleanup";
}

// 使用 websocket 实时通知用户 Embedding 状态变化
function emitEmbeddingStatus(
  userId: string,
  fileId: string,
  status: EmbeddingStatus,
) {
  try {
    const io = getSocket();
    io.to(user_room(userId)).emit("embedding:status_changed", {
      fileId,
      status,
    });
  } catch {
    // Socket may not be initialized
  }
}

export class EmbeddingManager {
  async onFileCreated(
    fileId: string,
    userId: string,
    mimeType: string,
  ): Promise<void> {
    if (!isTextExtractable(mimeType)) {
      return;
    }

    await File.updateOne(
      { _id: fileId },
      { $set: { embeddingStatus: EMBEDDING_STATUS.PENDING } },
    );
    emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.PENDING);

    await embeddingQueue.add(
      QUEUE_TASKS.EMBEDDING_INDEX,
      { fileId, userId, action: "index" } as EmbeddingJobData,
      { jobId: `embed-index-${fileId}-${Date.now()}` },
    );

    logger.info({ fileId, userId }, "Embedding index task enqueued");
  }

  async onFileUpdated(fileId: string, userId: string): Promise<void> {
    const file = await File.findById(fileId).select("mimeType").lean();
    if (!file || !isTextExtractable(file.mimeType)) {
      return;
    }

    await File.updateOne(
      { _id: fileId },
      {
        $set: {
          embeddingStatus: EMBEDDING_STATUS.PENDING,
          embeddingError: null,
          processedChunks: 0,
          totalChunks: 0,
        },
      },
    );
    emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.PENDING);

    await embeddingQueue.add(
      QUEUE_TASKS.EMBEDDING_REINDEX,
      { fileId, userId, action: "reindex" } as EmbeddingJobData,
      { jobId: `embed-reindex-${fileId}-${Date.now()}` },
    );

    logger.info({ fileId, userId }, "Embedding reindex task enqueued");
  }

  async onFileDeleted(fileId: string, userId: string): Promise<void> {
    await embeddingQueue.add(
      QUEUE_TASKS.EMBEDDING_CLEANUP,
      { fileId, userId, action: "cleanup" } as EmbeddingJobData,
      { jobId: `embed-cleanup-${fileId}-${Date.now()}` },
    );

    logger.info({ fileId, userId }, "Embedding cleanup task enqueued");
  }

  async retryIndex(fileId: string, userId: string): Promise<void> {
    const file = await File.findOne({ _id: fileId, user: userId }).select(
      "mimeType embeddingStatus",
    );
    if (!file) {
      throw new Error("File not found");
    }
    if (!isTextExtractable(file.mimeType)) {
      throw new Error("File type not supported for indexing");
    }

    await File.updateOne(
      { _id: fileId },
      {
        $set: {
          embeddingStatus: EMBEDDING_STATUS.PENDING,
          embeddingError: null,
          processedChunks: 0,
          totalChunks: 0,
        },
      },
    );
    emitEmbeddingStatus(userId, fileId, EMBEDDING_STATUS.PENDING);

    await embeddingQueue.add(
      QUEUE_TASKS.EMBEDDING_REINDEX,
      { fileId, userId, action: "reindex" } as EmbeddingJobData,
      { jobId: `embed-retry-${fileId}-${Date.now()}` },
    );

    logger.info({ fileId, userId }, "Embedding retry task enqueued");
  }

  async getFileEmbeddingStatus(fileId: string, userId: string) {
    const file = await File.findOne({ _id: fileId, user: userId })
      .select("embeddingStatus embeddingError processedChunks totalChunks name")
      .lean();

    if (!file) {
      throw new Error("File not found");
    }

    return {
      fileId,
      fileName: file.name,
      status: file.embeddingStatus || EMBEDDING_STATUS.NONE,
      error: file.embeddingError || null,
      processedChunks: file.processedChunks || 0,
      totalChunks: file.totalChunks || 0,
      progress:
        file.totalChunks && file.totalChunks > 0
          ? Math.round(((file.processedChunks || 0) / file.totalChunks) * 100)
          : 0,
    };
  }

  // TODO：未接入前端，后续补充 API 和 UI
  async getEmbeddingSummary(userId: string) {
    const activeFiles = await File.find({
      user: userId,
      embeddingStatus: {
        $in: [EMBEDDING_STATUS.PENDING, EMBEDDING_STATUS.PROCESSING],
      },
      isTrashed: false,
    })
      .select("name embeddingStatus processedChunks totalChunks")
      .lean();

    return {
      activeCount: activeFiles.length,
      files: activeFiles.map((f) => ({
        fileId: f._id.toString(),
        fileName: f.name,
        status: f.embeddingStatus as EmbeddingStatus,
        processedChunks: f.processedChunks || 0,
        totalChunks: f.totalChunks || 0,
      })),
    };
  }
}
