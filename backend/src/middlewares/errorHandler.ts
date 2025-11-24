import { Request, Response, NextFunction } from "express";
import { getReasonPhrase, StatusCodes } from "http-status-codes";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
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

  console.error("Error: ", err);
  res.status(statusCode).json({
    success: false,
    message,
    error: {
      message: err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
};
