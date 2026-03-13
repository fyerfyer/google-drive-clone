import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  handler: sendRateLimitResponse,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0], ...args.slice(1)) as never,
    prefix: "rl:upload:",
  }),
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip ?? ""),
  handler: sendRateLimitResponse,
});

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
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip ?? ""),
  handler: sendRateLimitResponse,
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(args[0], ...args.slice(1)) as never,
    prefix: "rl:general:",
  }),
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip ?? ""),
  handler: sendRateLimitResponse,
});
