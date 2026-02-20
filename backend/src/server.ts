import { createServer } from "http";
import app from "./app";
import { config } from "./config/env";
import { connectDB } from "./config/database";
import { initializeBuckets } from "./config/s3";
import { logger } from "./lib/logger";
import { initScheduledJobs } from "./lib/cron";
import { ensureCollection as ensureQdrantCollection } from "./config/qdrant";
import { initSocket } from "./lib/socket";

const startServer = async () => {
  try {
    await connectDB();

    try {
      await initializeBuckets();
    } catch (e) {
      logger.warn({ err: e }, "Failed to initialize MinIO buckets");
    }

    // 初始化 Qdrant 向量数据库 collection
    try {
      await ensureQdrantCollection();
    } catch (e) {
      logger.warn({ err: e }, "Failed to initialize Qdrant collection");
    }

    // 初始化定时任务
    await initScheduledJobs();

    // 创建 HTTP Server 并初始化 WebSocket
    const httpServer = createServer(app);
    initSocket(httpServer);
    logger.info("WebSocket initialized for document editing & agent approvals");

    httpServer.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          env: config.nodeEnv,
        },
        `Server is running on port ${config.port}`,
      );
    });
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
};

startServer();
