import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { Redis } from "ioredis";
import { config } from "../config/env";
import { socketAuth } from "../middlewares/socket.middleware";
import logger from "./logger";
import { user_room } from "../utils/socket.util";
import { setupRedisAdapter } from "./redis-io.adapter";

let io: SocketIOServer;

export const initSocket = async (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.frontendUrl,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // 使用 Redis 适配器实现多节点间 Socket 消息广播
  try {
    await setupRedisAdapter(io);
  } catch (e) {
    logger.warn(
      { err: e },
      "Failed to initialize Redis adapter for Socket.IO — falling back to in-memory adapter",
    );
  }

  // 监听设备会话撤销事件，强制断开相关 Socket 连接
  try {
    const revokeSubscriber = new Redis(config.redisUrl, {
      enableReadyCheck: true,
      lazyConnect: true,
    });
    await revokeSubscriber.connect();
    await revokeSubscriber.subscribe("device:revoked");
    revokeSubscriber.on("message", (_channel, message) => {
      try {
        const { userId, deviceId } = JSON.parse(message);
        const room = user_room(userId);
        const socketIds = io.sockets.adapter.rooms.get(room);
        if (socketIds) {
          for (const sid of socketIds) {
            const s = io.sockets.sockets.get(sid);
            if (s && s.data.user?.deviceId === deviceId) {
              s.emit("session:revoked", {
                deviceId,
                reason: "Session revoked",
              });
              s.disconnect(true);
              logger.info(
                { userId, deviceId, socketId: sid },
                "Socket forcefully disconnected — device revoked",
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Error handling device:revoked event");
      }
    });
    logger.info("Device-revocation Pub/Sub listener initialized");
  } catch (e) {
    logger.warn(
      { err: e },
      "Failed to initialize device-revocation Pub/Sub listener",
    );
  }

  io.use(socketAuth); // 使用认证中间件

  io.on("connection", (socket) => {
    const user = socket.data.user;
    logger.info(
      `User connected: ${user ? user.email : "Unknown user"} (Socket ID: ${
        socket.id
      })`,
    );
    socket.join(user_room(user.id)); // 加入以用户ID命名的房间

    if (socket.data.tokenExp) {
      const now = Math.floor(Date.now() / 1000);
      const ttlMs = Math.max((socket.data.tokenExp - now) * 1000, 0);
      const expiryTimer = setTimeout(() => {
        socket.emit("session:token_expired", {
          reason: "Access token expired — please refresh and reconnect",
        });
        socket.disconnect(true);
        logger.info(
          { userId: user.id, deviceId: user.deviceId, socketId: socket.id },
          "Socket disconnected — access token expired",
        );
      }, ttlMs);
      socket.on("disconnect", () => clearTimeout(expiryTimer));
    }

    // TODO：文档协作功能开发
    socket.on("document:join", (data: { fileId: string }) => {
      if (data.fileId) {
        const room = `document:${data.fileId}`;
        socket.join(room);
        logger.info(
          { userId: user.id, fileId: data.fileId },
          "User joined document room",
        );
        socket.to(room).emit("document:user_joined", {
          userId: user.id,
          userName: user.name || user.email,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on("document:leave", (data: { fileId: string }) => {
      if (data.fileId) {
        const room = `document:${data.fileId}`;
        socket.leave(room);
        logger.info(
          { userId: user.id, fileId: data.fileId },
          "User left document room",
        );
        socket.to(room).emit("document:user_left", {
          userId: user.id,
          userName: user.name || user.email,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on(
      "agent:approval_response",
      (data: { approvalId: string; approved: boolean }) => {
        logger.info(
          {
            userId: user.id,
            approvalId: data.approvalId,
            approved: data.approved,
          },
          "Agent approval response received via WebSocket",
        );
        socket.emit("agent:approval_ack", {
          approvalId: data.approvalId,
          received: true,
        });
      },
    );
  });

  return io;
};

export const getSocket = (): SocketIOServer => {
  if (!io) {
    throw new Error("Socket.io not initialized. Call initSocket first.");
  }
  return io;
};
