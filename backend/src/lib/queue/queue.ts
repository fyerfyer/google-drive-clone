import { Queue } from "bullmq";
import { redisClient } from "../../config/redis";
import { QUEUE_NAMES } from "../../types/model.types";

// 1. 通知队列：发送邮件、站内信、Socket推送
export const notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
  connection: redisClient,
});

export const fileProcessingQueue = new Queue(QUEUE_NAMES.FILE_PROCESSING, {
  connection: redisClient,
});

export const maintainanceQueue = new Queue(QUEUE_NAMES.MAINTAINANCE, {
  connection: redisClient,
});
