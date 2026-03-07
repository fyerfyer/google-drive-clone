import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { verifyToken } from "../utils/jwt.util";
import User from "../models/User.model";
import { logger } from "../lib/logger";

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
    const { id, email } = verifyToken(token);
    const currentUser = await User.findOne({ _id: id, email: email });
    if (!currentUser) {
      logger.warn(
        { method: req.method, url: req.originalUrl, userId: id },
        "JWT auth failed: user not found in DB",
      );
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        getReasonPhrase(StatusCodes.UNAUTHORIZED),
      );
    }

    req.user = currentUser;
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
