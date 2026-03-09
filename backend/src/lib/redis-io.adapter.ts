import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server as SocketIOServer } from "socket.io";
import { config } from "../config/env";
import { logger } from "./logger";

// 为 Socket.IO 创建基于 Redis 的适配器
// 在多副本/集群部署时，不同节点上的 Socket 实例通过 Redis Pub/Sub 通信
export async function setupRedisAdapter(io: SocketIOServer): Promise<void> {
  const pubClient = new Redis(config.redisUrl, {
    enableReadyCheck: true,
    lazyConnect: true,
  });

  const subClient = new Redis(config.redisUrl, {
    enableReadyCheck: true,
    lazyConnect: true,
  });

  pubClient.on("error", (err) => {
    logger.error({ err }, "Redis adapter pub client error");
  });

  subClient.on("error", (err) => {
    logger.error({ err }, "Redis adapter sub client error");
  });

  await Promise.all([pubClient.connect(), subClient.connect()]);

  io.adapter(createAdapter(pubClient, subClient));

  logger.info(
    "Socket.IO Redis adapter initialized — ready for horizontal scaling",
  );
}
