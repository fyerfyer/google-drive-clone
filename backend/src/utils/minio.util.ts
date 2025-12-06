import { config } from "../config/env";
import { v4 as uuidv4 } from "uuid";
import { minioClient } from "../config/minio";
import { Readable } from "stream";
import mimeTypes from "mime-types";
import { logger } from "../lib/logger";

const replaceHostInUrl = (originalUrl: string): string => {
  try {
    const publicUrl = new URL(config.MINIO_PUBLIC_URL);
    const urlObj = new URL(originalUrl);

    // 把原始 URL 的 Protocol 和 Host 替换掉
    urlObj.protocol = publicUrl.protocol;
    urlObj.host = publicUrl.host;
    return urlObj.toString();
  } catch (error) {
    logger.error(
      { err: error, originalUrl },
      "Failed to replace host in MinIO URL"
    );
    return originalUrl;
  }
};

export const uploadObject = async (
  bucketName: string,
  buffer: Buffer,
  size: number,
  mimeType: string
): Promise<string> => {
  const extension = mimeTypes.extension(mimeType) || "bin";
  const objectKey = `${uuidv4()}.${extension}`;
  const metaData = { "Content-Type": mimeType };
  await minioClient.putObject(bucketName, objectKey, buffer, size, metaData);
  return objectKey;
};

/**
 * 生成预签名 URL（用于文件下载）
 * @param bucketName - MinIO bucket 名称
 * @param objectKey - 对象存储 key
 * @param originalName - 原始文件名
 * @param expirySeconds - URL 有效期（秒），默认 3600（1小时）
 * @param disposition - Content-Disposition 类型：'attachment'（下载）或 'inline'（预览）
 * @returns 替换为公网地址后的预签名 URL
 */
export const getPresignedUrl = async (
  bucketName: string,
  objectKey: string,
  originalName: string,
  expirySeconds: number = 3600,
  disposition: "attachment" | "inline" = "attachment"
): Promise<string> => {
  const headers = {
    "response-content-disposition": `${disposition}; filename=${encodeURIComponent(originalName)}`,
  };

  const internalUrl = await minioClient.presignedGetObject(
    bucketName,
    objectKey,
    expirySeconds,
    headers
  );

  const publicUrl = replaceHostInUrl(internalUrl);
  logger.debug(
    { bucketName, objectKey, expirySeconds, disposition },
    "Generated presigned URL"
  );

  return publicUrl;
};

// /**
//  * 获取对象流（用于后端代理预览）
//  * @param bucketName - MinIO bucket 名称
//  * @param objectKey - 对象存储 key
//  * @returns Readable Stream
//  */
// export const getObjectStream = async (
//   bucketName: string,
//   objectKey: string
// ): Promise<Readable> => {
//   logger.debug({ bucketName, objectKey }, "Getting object stream from MinIO");
//   const stream = await minioClient.getObject(bucketName, objectKey);
//   return stream;
// };

// /**
//  * 删除对象
//  * @param bucketName - MinIO bucket 名称
//  * @param objectKey - 对象存储 key
//  */
// export const deleteObject = async (
//   bucketName: string,
//   objectKey: string
// ): Promise<void> => {
//   logger.debug({ bucketName, objectKey }, "Deleting object from MinIO");
//   await minioClient.removeObject(bucketName, objectKey);
//   logger.info({ bucketName, objectKey }, "Object deleted successfully");
// };
