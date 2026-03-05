import pinoHttp from "pino-http";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger";
import { Request } from "express";

export const requestLogger = pinoHttp({
  logger: logger,

  // Generate unique request ID for each request
  genReqId: (req, res) => {
    const existingId = req.id ?? req.headers["x-request-id"];
    if (existingId) return existingId.toString();
    return uuidv4();
  },

  // Customize request logging
  customProps: (req: Request, res) => {
    return {
      userId: req.user?.id || "anonymous",
      userEmail: req.user?.email || undefined,
    };
  },

  // Customize log message based on response
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) {
      return "error";
    } else if (res.statusCode >= 400) {
      return "warn";
    } else if (res.statusCode >= 300) {
      return "info";
    }
    return "info";
  },

  // Customize success message
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed`;
  },

  // Customize error message
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },

  // Additional request attributes to log
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "responseTime",
  },

  // Serialize request
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      // Don't log sensitive headers or body by default
      headers: {
        host: req.headers.host,
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
      },
      remoteAddress: req.socket?.remoteAddress,
      remotePort: req.socket?.remotePort,
    }),
    res: (res) => {
      // Type guard to check if res has getHeader method
      if (res && typeof res.getHeader === "function") {
        return {
          statusCode: res.statusCode,
          headers: {
            "content-type": res.getHeader("content-type"),
            "content-length": res.getHeader("content-length"),
          },
        };
      }
      // Fallback for cases where res doesn't have getHeader
      return {
        statusCode: res.statusCode,
      };
    },
    err: (err) => ({
      type: err.type,
      message: err.message,
      stack: err.stack,
    }),
  },

  // Don't log health check or frequent polling endpoints to reduce noise
  autoLogging: {
    ignore: (req) => {
      return (
        req.url === "/health" ||
        req.url === "/api" ||
        req.url === "/api/notifications/unread-count"
      );
    },
  },
});

declare global {
  namespace Express {
    interface Request {
      log: typeof logger;
      id: string;
    }
  }
}

export default requestLogger;
