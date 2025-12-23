import { Redis } from "ioredis";
import { logger } from "../lib/logger";
import { config } from "./env";

export const redisClient = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // BullMQ 需要
  enableReadyCheck: true,
});

export const redisSubscriber = new Redis(config.redisUrl, {
  enableReadyCheck: true,
});

redisClient.on("connect", () => {
  logger.info("Redis client connected");
});

redisClient.on("error", (err) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Redis client error: ${message}`);
});
