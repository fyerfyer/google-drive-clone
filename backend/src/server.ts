import app from "./app";
import { config } from "./config/env";
import { connectDB } from "./config/database";
import { initializeBuckets } from "./config/minio";
import { logger } from "./lib/logger";

const startServer = async () => {
  try {
    await connectDB();
    // Ensure required MinIO buckets exist before serving requests
    try {
      await initializeBuckets();
    } catch (e) {
      logger.warn({ err: e }, "Failed to initialize MinIO buckets");
    }

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
