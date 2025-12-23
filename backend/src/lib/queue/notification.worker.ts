import { Worker } from "bullmq";
import { QUEUE_NAMES } from "../../types/model.types";
import logger from "../logger";
import { Notification } from "../../models/Notification.model";
import { getSocket } from "../socket";
import { user_room } from "../../utils/socket.util";
import { redisClient } from "../../config/redis";

const io = getSocket();

export const notificationWorker = new Worker(
  QUEUE_NAMES.NOTIFICATIONS,
  async (job) => {
    const { type, recipientId, senderId, data } = job.data;
    logger.info(
      `Processing notification job ${job.id} of type ${type} for recipient ${recipientId}`
    );

    // 持久化消息，这样离线后上线还能看到消息
    const notification = await Notification.create({
      type,
      recipient: recipientId,
      sender: senderId,
      data,
    });

    // 实时推送
    io.to(user_room(recipientId)).emit(QUEUE_NAMES.NOTIFICATIONS, notification);
    return true;
  },
  {
    connection: redisClient,
    concurrency: 5,
  }
);
