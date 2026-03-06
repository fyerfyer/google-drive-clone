import { Readable } from "stream";
import { StorageService } from "./storage.service";
import { BucketsType } from "../config/s3";

export class MediaService {
  static async getPartialStream(
    bucket: BucketsType,
    objectKey: string,
    range?: string,
  ): Promise<{
    stream: Readable;
    contentLength: number;
    contentRange?: string;
    statusCode: number;
    totalSize: number;
  }> {
    const metadata = await StorageService.getObjectMetadata(bucket, objectKey);
    const totalSize = metadata.ContentLength || 0;

    if (!range) {
      const stream = await StorageService.getObjectStream(bucket, objectKey);
      return {
        stream,
        contentLength: totalSize,
        statusCode: 200,
        totalSize,
      };
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    const chunkSize = end - start + 1;

    const stream = await StorageService.getObjectStreamRange(
      bucket,
      objectKey,
      start,
      end,
    );

    return {
      stream,
      contentLength: chunkSize,
      contentRange: `bytes ${start}-${end}/${totalSize}`,
      statusCode: 206,
      totalSize,
    };
  }
}
