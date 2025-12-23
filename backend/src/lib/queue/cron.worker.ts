import { Worker } from "bullmq";
import { QUEUE_NAMES, QUEUE_TASKS } from "../../types/model.types";
import { redisClient } from "../../config/redis";
import File from "../../models/File.model";
import logger from "../logger";
import Folder from "../../models/Folder.model";
import { BatchItemRequest, BatchService } from "../../services/batch.service";

const batchService = new BatchService();

export const maintainanceWorker = new Worker(
  QUEUE_NAMES.MAINTAINANCE,
  async (job) => {
    logger.info(`Processing job ${job.name} with id ${job.id}`);
    if (job.name === QUEUE_TASKS.CLEANUP_TRASH) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      try {
        const expiredFiles = await File.find({
          isTrashed: true,
          trashedAt: { $lte: thirtyDaysAgo },
        }).select("_id user");

        const expiredFolders = await Folder.find({
          isTrashed: true,
          trashedAt: { $lte: thirtyDaysAgo },
        }).select("_id user");

        if (expiredFiles.length === 0 && expiredFolders.length === 0) {
          logger.info("No expired files or folders to delete from trash.");
          return;
        }

        logger.info(
          `Found ${expiredFiles.length} files and ${expiredFolders.length} folders to permanently delete from trash.`
        );

        const tasksByUser = new Map<string, BatchItemRequest[]>();
        const addItem = (userId: string, item: BatchItemRequest) => {
          if (!tasksByUser.has(userId)) {
            tasksByUser.set(userId, []);
          }
          tasksByUser.get(userId)!.push(item);
        };

        expiredFiles.forEach((file) => {
          addItem(file.user.toString(), {
            type: "file",
            id: file._id.toString(),
          });
        });

        expiredFolders.forEach((folder) => {
          addItem(folder.user.toString(), {
            type: "folder",
            id: folder._id.toString(),
          });
        });

        logger.info(
          `Prepared batch delete tasks for ${tasksByUser.size} users.`
        );

        for (const [userId, items] of tasksByUser.entries()) {
          try {
            await batchService.batchDeletePermanent(userId, items);
            logger.info(
              `Permanently deleted ${items.length} items for user ${userId} from trash.`
            );
          } catch (error) {
            logger.error(
              `Failed to permanently delete items for user ${userId} from trash: ${error}`
            );
          }
        }
      } catch (error) {
        logger.error(`Error during cleanup trash job: ${error}`);
        throw error;
      }
    }
  },
  { connection: redisClient }
);
