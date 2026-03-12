import { Socket } from "socket.io";
import logger from "../lib/logger";
import { AppError } from "./errorHandler";
import { StatusCodes } from "http-status-codes";
import { verifyToken, decodeTokenExp } from "../utils/jwt.util";
import { redisClient } from "../config/redis";

const REVOKED_PREFIX = "revoked:";

export const socketAuth = async (
  socket: Socket,
  next: (err?: Error) => void,
) => {
  try {
    // 客户端连接时如下传入: io({ auth: { token: "Bearer ..." } })
    let token = socket.handshake.auth.token;
    if (!token) {
      return next(
        new AppError(
          StatusCodes.UNAUTHORIZED,
          "Socket authentication failed: No token provided",
        ),
      );
    }

    // 去掉 Bearer 前缀
    if (token.startsWith("Bearer ")) {
      token = token.slice(7, token.length);
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return next(
        new AppError(
          StatusCodes.UNAUTHORIZED,
          "Socket authentication failed: Invalid token",
        ),
      );
    }

    const isRevoked = await redisClient.exists(
      `${REVOKED_PREFIX}${decoded.id}:${decoded.deviceId}`,
    );
    if (isRevoked) {
      return next(
        new AppError(
          StatusCodes.UNAUTHORIZED,
          "Socket authentication failed: Session revoked",
        ),
      );
    }

    // 挂载用户信息到 Socket 实例上，之后可以直接 socket.data.user 访问
    socket.data.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      deviceId: decoded.deviceId,
    };

    // 存储 token 过期时间，用于后续自动断开僵尸连接
    socket.data.tokenExp = decodeTokenExp(token);

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Socket authentication error: ${message}`);
    next(
      new AppError(
        StatusCodes.UNAUTHORIZED,
        "Socket authentication failed: Internal server error",
      ),
    );
  }
};
