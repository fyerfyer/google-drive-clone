import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { config } from "../config/env";
import { socketAuth } from "../middlewares/socket.middleware";
import logger from "./logger";
import { user_room } from "../utils/socket.util";

let io: SocketIOServer;

export const initSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.frontendUrl,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(socketAuth); // 使用认证中间件

  io.on("connection", (socket) => {
    const user = socket.data.user;
    logger.info(
      `User connected: ${user ? user.email : "Unknown user"} (Socket ID: ${
        socket.id
      })`,
    );
    socket.join(user_room(user._id.toString())); // 加入以用户ID命名的房间

    // ─── Document Editing — join/leave document rooms ──────────────────
    socket.on("document:join", (data: { fileId: string }) => {
      if (data.fileId) {
        const room = `document:${data.fileId}`;
        socket.join(room);
        logger.info(
          { userId: user._id, fileId: data.fileId },
          "User joined document room",
        );
        // Notify others in the room
        socket.to(room).emit("document:user_joined", {
          userId: user._id.toString(),
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
          { userId: user._id, fileId: data.fileId },
          "User left document room",
        );
        socket.to(room).emit("document:user_left", {
          userId: user._id.toString(),
          userName: user.name || user.email,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ─── Agent Approval — respond to approval requests ────────────────
    socket.on(
      "agent:approval_response",
      (data: { approvalId: string; approved: boolean }) => {
        // This is handled via REST API (POST /api/agent/approve/:approvalId)
        // But we also accept it via WebSocket for convenience
        logger.info(
          {
            userId: user._id,
            approvalId: data.approvalId,
            approved: data.approved,
          },
          "Agent approval response received via WebSocket",
        );
        // Emit back acknowledgment
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
