import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { logError } from "../lib/logger";

interface JwtPayload {
  id: string;
  email: string;
}

export const generateToken = (payload: JwtPayload): string => {
  const secret: string = config.jwtSecret;
  return jwt.sign(payload, secret, {
    expiresIn: config.jwtExpire,
  } as jwt.SignOptions);
};

// 生成 OnlyOffice 编辑器使用的 JWT Token
export const generateOnlyOfficeToken = (payload: any): string => {
  const secret: string = config.onlyofficeJwtSecret;
  return jwt.sign(payload, secret, {
    expiresIn: "8h",
  });
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    const secret: string = config.jwtSecret;
    const decode = jwt.verify(token, secret);
    return decode as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      const msg = "Token expired";
      logError(error, msg);
      throw new AppError(StatusCodes.UNAUTHORIZED, msg);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      const msg = "Invalid token";
      logError(error, msg);
      throw new AppError(StatusCodes.UNAUTHORIZED, msg);
    }
    const msg = "Failed to verify token";
    logError(error, msg);
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, msg);
  }
};
