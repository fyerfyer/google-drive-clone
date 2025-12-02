import { Request, Response, NextFunction } from "express";
import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { logger } from "../lib/logger";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let message = getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR);

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Use request logger if available, otherwise use global logger
  const log = req.log || logger;

  // Log with appropriate level based on status code
  const logContext = {
    err: err,
    statusCode: statusCode,
    method: req.method,
    url: req.url,
    userId: req.user?.id,
    requestId: req.id,
  };

  if (statusCode >= 500) {
    log.error(logContext, `Server error: ${message}`);
  } else if (statusCode >= 400) {
    log.warn(logContext, `Client error: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      message: err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
};
