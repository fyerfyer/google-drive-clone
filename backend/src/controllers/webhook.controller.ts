import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import File from "../models/File.model";
import { EmbeddingManager } from "../services/embedding-manager";
import { ResponseHelper } from "../utils/response.util";

// 使用 MinIO webhook 来解耦一些上传后处理逻辑，比如 embedding
// MinIO POST 一些关于 S3 事件的 JSON 数据，根据需要可以进行处理
interface S3EventRecord {
  eventVersion: string;
  eventSource: string;
  eventName: string;
  s3: {
    bucket: { name: string };
    object: { key: string; size: number; eTag: string; contentType?: string };
  };
  source?: { host: string; port: string; userAgent: string };
}

interface MinIOEvent {
  EventName?: string;
  Key?: string;
  Records?: S3EventRecord[];
}

export class WebhookController {
  private embeddingManager = new EmbeddingManager();

  async handleS3Event(req: Request, res: Response, next: NextFunction) {
    try {
      const event = req.body as MinIOEvent;
      const records = event.Records;

      if (!records || !Array.isArray(records) || records.length === 0) {
        logger.warn({ body: req.body }, "S3 webhook: no Records in payload");
        return ResponseHelper.success(res, { received: true });
      }

      // 异步处理每条记录，让 MinIO 来做
      for (const record of records) {
        const rawKey = record.s3?.object?.key;
        const eventName = record.eventName;

        if (!rawKey) continue;

        // TODO：这里特殊处理一下 MinIO 对空格的 encode,可能还需要处理别的
        // MongoDB 存的是 Decode 后的
        const objectKey = decodeURIComponent(rawKey.replace(/\+/g, "%20"));

        logger.info(
          { eventName, objectKey, bucket: record.s3?.bucket?.name },
          "S3 webhook event received",
        );

        if (
          !eventName?.startsWith("s3:ObjectCreated") ||
          record.s3?.bucket?.name !== "files"
        ) {
          continue;
        }

        // 对于小文件，前端的confirmSimpleUpload
        // 可能尚未执行——在放弃前，先短暂延迟后重试一次，
        // 以覆盖竞态条件的时间窗口。
        let file = await File.findOne({ key: objectKey })
          .select("_id user mimeType embeddingStatus")
          .lean();

        if (!file) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          file = await File.findOne({ key: objectKey })
            .select("_id user mimeType embeddingStatus")
            .lean();
        }

        if (!file) {
          // 默认 Embedding 被 upload 触发了
          logger.debug(
            { objectKey },
            "S3 webhook: no matching file record for key after retry; embedding will be triggered by upload confirm",
          );
          continue;
        }

        if (file.embeddingStatus && file.embeddingStatus !== "none") {
          logger.debug(
            { objectKey, embeddingStatus: file.embeddingStatus },
            "S3 webhook: embedding already triggered by upload endpoint, skipping",
          );
          continue;
        }

        this.embeddingManager
          .onFileCreated(
            file._id.toString(),
            file.user.toString(),
            file.mimeType,
          )
          .catch((err) => {
            logger.warn(
              { err, fileId: file!._id, objectKey },
              "S3 webhook: failed to enqueue embedding task",
            );
          });
      }

      return ResponseHelper.success(res, { received: true });
    } catch (err) {
      next(err);
    }
  }
}
