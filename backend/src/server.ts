import app from "./app";
import { config } from "./config/env";
import { connectDB } from "./config/database";
import { initializeBuckets } from "./config/s3";
import { logger } from "./lib/logger";
import { initScheduledJobs } from "./lib/cron";

const startServer = async () => {
  try {
    await connectDB();

    try {
      await initializeBuckets();
    } catch (e) {
      logger.warn({ err: e }, "Failed to initialize MinIO buckets");
    }

    // 初始化定时任务
    await initScheduledJobs();

    app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          env: config.nodeEnv,
        },
        `Server is running on port ${config.port}`
      );
    });
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
};

startServer();
