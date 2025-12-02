import mongoose from "mongoose";
import { logger } from "../lib/logger";

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI!);
    logger.info(
      { host: conn.connection.host },
      "MongoDB connected successfully"
    );
  } catch (e) {
    logger.fatal({ err: e }, "MongoDB connection error");
    process.exit(1);
  }
};
