import app from "./app";
import { config } from "./config/env";
import { connectDB } from "./config/database";
import { initializeBuckets } from "./config/minio";

const startServer = async () => {
  try {
    await connectDB();
    // Ensure required MinIO buckets exist before serving requests
    try {
      await initializeBuckets();
    } catch (e) {
      console.warn("Failed to initialize MinIO buckets:", e);
    }

    app.listen(config.port, () => {
      console.log(`Server is running at port: ${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
