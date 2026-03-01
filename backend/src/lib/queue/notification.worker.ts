import { Worker } from "bullmq";
import { QUEUE_NAMES } from "../../types/model.types";
import logger from "../logger";
import { Notification } from "../../models/Notification.model";
import { user_room } from "../../utils/socket.util";
import { redisClient } from "../../config/redis";
import { getSocket } from "../socket";

export const notificationWorker = new Worker(
  QUEUE_NAMES.NOTIFICATIONS,
  async (job) => {
    const {
      type,
      recipientId,
      senderId,
      data,
      // 兼容旧字段
      resourceType,
      resourceId,
      resourceName,
    } = job.data;

    logger.info(
      `Processing notification job ${job.id} of type ${type} for recipient ${recipientId}`,
    );

    // 优先使用 data，否则使用旧字段
    const notificationData = data ?? {
      title: resourceName || "Notification",
      resourceId,
      resourceType,
      resourceName,
    };

    const notification = await Notification.create({
      type,
      recipient: recipientId,
      sender: senderId || null,
      data: notificationData,
    });

    // 推送
    try {
      const io = getSocket();
      io.to(user_room(recipientId)).emit(
        QUEUE_NAMES.NOTIFICATIONS,
        notification,
      );
    } catch (error) {
      logger.warn(
        { err: error, recipientId },
        "Socket not initialized; skipped real-time notification",
      );
    }
    return true;
  },
  {
    connection: redisClient,
    concurrency: 5,
  },
);
