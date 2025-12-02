import pino from "pino";
import { config } from "../config/env";

const isDevelopment = config.nodeEnv === "development";
const isTest = config.nodeEnv === "test";

const productionConfig: pino.LoggerOptions = {
  level: "info",
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      {
        target: "pino/file",
        options: {
          destination: "./logs/app.log",
          mkdir: true,
        },
        level: "info",
      },
      {
        target: "pino/file",
        options: {
          destination: "./logs/error.log",
          mkdir: true,
        },
        level: "error",
      },
      {
        target: "pino/file",
        options: {
          destination: 1, // stdout
        },
        level: "info",
      },
    ],
  },
};

const developmentConfig: pino.LoggerOptions = {
  level: "debug",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      singleLine: false,
    },
  },
};

const testConfig: pino.LoggerOptions = {
  // 允许通过环境变量控制测试日志级别，方便调试
  // 使用 LOG_LEVEL=debug 来启用调试日志
  level: "debug",
  transport: process.env.LOG_LEVEL
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
          singleLine: false,
        },
      }
    : undefined,
};

let loggerConfig: pino.LoggerOptions;
if (isTest) {
  loggerConfig = testConfig;
} else if (isDevelopment) {
  loggerConfig = developmentConfig;
} else {
  loggerConfig = productionConfig;
}

export const logger = pino(loggerConfig);

export const createChildLogger = (bindings: pino.Bindings) => {
  return logger.child(bindings);
};

export const logError = (
  error: Error | unknown,
  message: string,
  context?: Record<string, any>
) => {
  if (error instanceof Error) {
    logger.error(
      {
        err: error,
        stack: error.stack,
        ...context,
      },
      message
    );
  } else {
    logger.error(
      {
        error: String(error),
        ...context,
      },
      message
    );
  }
};

export default logger;
