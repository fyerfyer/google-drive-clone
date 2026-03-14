import { Worker } from "bullmq";
import { QUEUE_NAMES, QUEUE_TASKS } from "../../types/model.types";
import { redisClient } from "../../config/redis";
import File from "../../models/File.model";
import User from "../../models/User.model";
import logger from "../logger";
import Folder from "../../models/Folder.model";
import { BatchItemRequest, BatchService } from "../../services/batch.service";
import { StorageService } from "../../services/storage.service";
import { BUCKETS } from "../../config/s3";

const batchService = new BatchService();

export const maintainanceWorker = new Worker(
  QUEUE_NAMES.MAINTAINANCE,
  async (job) => {
    logger.info(`Processing job ${job.name} with id ${job.id}`);
    if (job.name === QUEUE_TASKS.CLEANUP_TRASH) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      try {
        // 只查顶层过期的文件（不在已被删除文件夹内的独立文件）
        const expiredFiles = await File.find({
          isTrashed: true,
          trashedAt: { $lte: thirtyDaysAgo },
        }).select("_id user folder");

        // 只查顶层过期的文件夹（父文件夹未被删除或本身就在root的）
        // batchDeletePermanent 会自动处理子文件夹和子文件
        const expiredFolders = await Folder.find({
          isTrashed: true,
          trashedAt: { $lte: thirtyDaysAgo },
        }).select("_id user parent");

        if (expiredFiles.length === 0 && expiredFolders.length === 0) {
          logger.info("No expired files or folders to delete from trash.");
          return;
        }

        // 收集所有过期文件夹 ID，用来过滤子文件
        const expiredFolderIds = new Set(
          expiredFolders.map((f) => f._id.toString()),
        );

        // 过滤出顶层文件夹：父文件夹不在过期列表中的
        const topLevelFolders = expiredFolders.filter(
          (f) => !f.parent || !expiredFolderIds.has(f.parent.toString()),
        );

        // 过滤出独立过期文件：不属于任何过期文件夹的文件
        const topLevelFiles = expiredFiles.filter(
          (f) => !f.folder || !expiredFolderIds.has(f.folder.toString()),
        );

        logger.info(
          `Found ${topLevelFiles.length} top-level files and ${topLevelFolders.length} top-level folders to permanently delete from trash.`,
        );

        const tasksByUser = new Map<string, BatchItemRequest[]>();
        const addItem = (userId: string, item: BatchItemRequest) => {
          if (!tasksByUser.has(userId)) {
            tasksByUser.set(userId, []);
          }
          tasksByUser.get(userId)!.push(item);
        };

        topLevelFiles.forEach((file) => {
          addItem(file.user.toString(), {
            type: "file",
            id: file._id.toString(),
          });
        });

        topLevelFolders.forEach((folder) => {
          addItem(folder.user.toString(), {
            type: "folder",
            id: folder._id.toString(),
          });
        });

        logger.info(
          `Prepared batch delete tasks for ${tasksByUser.size} users.`,
        );

        for (const [userId, items] of tasksByUser.entries()) {
          try {
            await batchService.batchDeletePermanent(userId, items);
            logger.info(
              `Permanently deleted ${items.length} items for user ${userId} from trash.`,
            );
          } catch (error) {
            logger.error(
              `Failed to permanently delete items for user ${userId} from trash: ${error}`,
            );
          }
        }
      } catch (error) {
        logger.error(`Error during cleanup trash job: ${error}`);
        throw error;
      }
    }

    if (job.name === QUEUE_TASKS.CLEANUP_STALE_MULTIPARTS) {
      // 定期清理没上传完成的分片
      const cutoffMs = 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - cutoffMs);

      try {
        const staleUploads = await StorageService.listMultipartUploads(
          BUCKETS.FILES,
        );

        const toAbort = staleUploads.filter(
          (u) => u.Initiated && u.Initiated < cutoff,
        );

        if (toAbort.length === 0) {
          logger.info("No stale multipart uploads to clean up.");
          return;
        }

        logger.info(
          `Found ${toAbort.length} stale multipart uploads to abort.`,
        );

        let aborted = 0;
        let failed = 0;
        for (const upload of toAbort) {
          try {
            await StorageService.abortMultipartUpload(
              BUCKETS.FILES,
              upload.Key,
              upload.UploadId,
            );
            aborted++;
          } catch (err) {
            logger.warn(
              { key: upload.Key, uploadId: upload.UploadId, err },
              "Failed to abort stale multipart upload",
            );
            failed++;
          }
        }

        logger.info(
          `Stale multipart cleanup: ${aborted} aborted, ${failed} failed.`,
        );
      } catch (error) {
        logger.error(`Error during stale multipart cleanup: ${error}`);
        throw error;
      }
    }

    if (job.name === QUEUE_TASKS.RECONCILE_STORAGE) {
      try {
        const users = await User.find({}).select("_id storageUsage").lean();
        let fixed = 0;

        for (const user of users) {
          const actualUsage = await File.aggregate([
            { $match: { user: user._id, isTrashed: false } },
            { $group: { _id: null, total: { $sum: "$size" } } },
          ]);

          const actual = actualUsage[0]?.total ?? 0;
          const recorded = user.storageUsage ?? 0;

          if (actual !== recorded) {
            await User.updateOne(
              { _id: user._id },
              { $set: { storageUsage: actual } },
            );
            logger.warn(
              {
                userId: user._id,
                recorded,
                actual,
                diff: recorded - actual,
              },
              "Reconciled storageUsage drift",
            );
            fixed++;
          }
        }

        logger.info(`Storage reconciliation complete: ${fixed} users fixed.`);
      } catch (error) {
        logger.error(`Error during storage reconciliation: ${error}`);
        throw error;
      }
    }
  },
  { connection: redisClient },
);
