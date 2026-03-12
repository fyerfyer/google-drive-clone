import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { verifyToken } from "../utils/jwt.util";
import { redisClient } from "../config/redis";
import { logger } from "../lib/logger";

const REVOKED_PREFIX = "revoked:";

export const jwtAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    logger.warn(
      { method: req.method, url: req.originalUrl },
      "JWT auth failed: no token provided",
    );
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      getReasonPhrase(StatusCodes.UNAUTHORIZED),
    );
  }

  try {
    const { id, email, name, deviceId } = verifyToken(token);

    // 使用 Redis O(1) 查询代替 MongoDB 操作
    const isRevoked = await redisClient.exists(
      `${REVOKED_PREFIX}${id}:${deviceId}`,
    );
    if (isRevoked) {
      logger.warn(
        { method: req.method, url: req.originalUrl, userId: id, deviceId },
        "JWT auth failed: device session revoked",
      );
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        getReasonPhrase(StatusCodes.UNAUTHORIZED),
      );
    }

    req.user = { id, email, name, deviceId };
    next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn(
      { method: req.method, url: req.originalUrl, err },
      "JWT auth failed: token verification error",
    );
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      getReasonPhrase(StatusCodes.UNAUTHORIZED),
    );
  }
};
