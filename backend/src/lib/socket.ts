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
      })`
    );
    socket.join(user_room(user._id.toString())); // 加入以用户ID命名的房间
  });
  return io;
};

export const getSocket = (): SocketIOServer => {
  if (!io) {
    throw new Error("Socket.io not initialized. Call initSocket first.");
  }
  return io;
};
