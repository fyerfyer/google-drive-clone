import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { logError } from "../lib/logger";

interface JwtPayload {
  id: string;
  email: string;
  name: string;
  deviceId: string;
}

export const generateToken = (payload: JwtPayload): string => {
  const secret: string = config.jwtSecret;
  return jwt.sign(payload, secret, {
    expiresIn: "15m",
  } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  const secret: string = config.jwtRefreshSecret;
  return jwt.sign(payload, secret, {
    expiresIn: "30d",
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

export const verifyRefreshToken = (token: string): JwtPayload => {
  try {
    const secret: string = config.jwtRefreshSecret;
    const decode = jwt.verify(token, secret);
    return decode as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token");
    }
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Failed to verify refresh token",
    );
  }
};

/**
 * Decode token expiration time without verification (for socket TTL timers).
 */
export const decodeTokenExp = (token: string): number | undefined => {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp;
};
