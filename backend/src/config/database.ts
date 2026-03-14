import mongoose from "mongoose";
import { logger } from "../lib/logger";
import { config } from "./env";

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(config.mongodbUri!);
    logger.info(
      { host: conn.connection.host },
      "MongoDB connected successfully",
    );

    // 给 index 加上 fileName 字段，之前的 index 只有 content 字段，导致无法通过 fileName 搜索
    await migrateFileChunkTextIndex(conn.connection);
  } catch (e) {
    logger.fatal({ err: e }, "MongoDB connection error");
    process.exit(1);
  }
};

async function migrateFileChunkTextIndex(
  connection: mongoose.Connection,
): Promise<void> {
  try {
    const collection = connection.collection("filechunks");
    const indexes = await collection.indexes();

    // TODO：向后兼容，旧 index 只有 content 字段
    const oldTextIndex = indexes.find(
      (idx) =>
        idx.key &&
        "content" in (idx.key as Record<string, unknown>) &&
        (idx.key as Record<string, unknown>)["content"] === "text" &&
        !("metadata.fileName" in ((idx as any).weights || {})),
    );
    if (oldTextIndex && oldTextIndex.name) {
      logger.info(
        { indexName: oldTextIndex.name },
        "Dropping old FileChunk text index (content-only) to recreate with fileName",
      );
      await collection.dropIndex(oldTextIndex.name);
    }
  } catch (error) {
    logger.debug(
      { err: error },
      "FileChunk text index migration: skipped (collection may not exist)",
    );
  }
}
