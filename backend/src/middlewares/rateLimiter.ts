import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";

const sendRateLimitResponse = (_req: Request, res: Response) => {
  res.status(StatusCodes.TOO_MANY_REQUESTS).json({
    success: false,
    error: {
      message: "Too many requests, please try again later",
      code: "RATE_LIMIT_EXCEEDED",
      statusCode: StatusCodes.TOO_MANY_REQUESTS,
    },
  });
};

// Strict: auth endpoints (login/register) - 5 requests per minute
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0], ...args.slice(1)) as never,
    prefix: "rl:auth:",
  }),
  keyGenerator: (req) => req.ip || "unknown",
  handler: sendRateLimitResponse,
});

// Medium: upload endpoints - 30 requests per minute
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0], ...args.slice(1)) as never,
    prefix: "rl:upload:",
  }),
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || req.ip || "unknown";
  },
  handler: sendRateLimitResponse,
});

// Relaxed: multipart sign endpoints - 500 per minute per user
// These are lightweight metadata-only requests (no file data),
// but a 1.5 GB file at 5 MB/part = 300 sign requests.
export const multipartSignLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0], ...args.slice(1)) as never,
    prefix: "rl:multipart-sign:",
  }),
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || req.ip || "unknown";
  },
  handler: sendRateLimitResponse,
});

// Relaxed: general API endpoints - 100 requests per minute
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0], ...args.slice(1)) as never,
    prefix: "rl:general:",
  }),
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId || req.ip || "unknown";
  },
  handler: sendRateLimitResponse,
});
