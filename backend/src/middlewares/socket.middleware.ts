import { Socket } from "socket.io";
import logger from "../lib/logger";
import { AppError } from "./errorHandler";
import { StatusCodes } from "http-status-codes";
import { verifyToken } from "../utils/jwt.util";
import User from "../models/User.model";

interface SocketData {
  user: any;
}

export const socketAuth = async (
  socket: Socket,
  next: (err?: Error) => void
) => {
  try {
    // 客户端连接时如下传入: io({ auth: { token: "Bearer eyJ..." } })
    let token = socket.handshake.auth.token;
    if (!token) {
      return next(
        new AppError(
          StatusCodes.UNAUTHORIZED,
          "Socket authentication failed: No token provided"
        )
      );
    }

    // 去掉 Bearer 前缀
    if (token.startsWith("Bearer ")) {
      token = token.slice(7, token.length);
    }

    const decode = verifyToken(token);
    if (!decode || !decode.id) {
      return next(
        new AppError(
          StatusCodes.UNAUTHORIZED,
          "Socket authentication failed: Invalid token"
        )
      );
    }
    const user = await User.findById({
      _id: decode.id,
      email: decode.email,
    }).select("_id name email avatar");

    if (!user) {
      return next(
        new AppError(
          StatusCodes.UNAUTHORIZED,
          "Socket authentication failed: User not found"
        )
      );
    }

    // 挂在用户到 Socket 实例上，之后可以直接 socket.data.user 访问
    socket.data.user = user;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Socket authentication error: ${message}`);
    next(
      new AppError(
        StatusCodes.UNAUTHORIZED,
        "Socket authentication failed: Internal server error"
      )
    );
  }
};
