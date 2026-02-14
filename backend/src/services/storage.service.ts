import { Readable } from "stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { BucketsType, s3Client, s3ClientForPresign } from "../config/s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class StorageService {
  // 分片上传
  static async createMultipartUpload(
    bucketName: BucketsType,
    objectKey: string,
    mimeType: string,
  ) {
    const command = new CreateMultipartUploadCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: mimeType,
    });

    const { UploadId } = await s3Client.send(command);
    return UploadId;
  }

  static async getPresignedPartUrl(
    bucketName: BucketsType,
    objectKey: string,
    uploadId: string,
    partNumber: number,
    expireTime: number = 3600,
  ) {
    const command = new UploadPartCommand({
      Bucket: bucketName,
      Key: objectKey,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    // Use s3ClientForPresign for multipart upload part URLs
    const url = await getSignedUrl(s3ClientForPresign, command, {
      expiresIn: expireTime,
    });
    return url;
  }

  // 生成简单上传的预签名 URL
  // 用于小文件
  static async getPutUrl(
    bucketName: BucketsType,
    objectKey: string,
    mimeType: string,
    expireTime: number = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: mimeType,
    });

    // Use s3ClientForPresign to generate URLs with correct public endpoint
    const url = await getSignedUrl(s3ClientForPresign, command, {
      expiresIn: expireTime,
    });
    return url; // No need for replaceHostUrl anymore
  }

  static async completeMultipartUpload(
    bucketName: BucketsType,
    objectKey: string,
    uploadId: string,
    parts: { ETag: string; PartNumber: number }[],
  ) {
    const command = new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    return await s3Client.send(command);
  }

  // 列出已上传分片
  static async listParts(
    bucketName: BucketsType,
    objectKey: string,
    uploadId: string,
  ) {
    const command = new ListPartsCommand({
      Bucket: bucketName,
      Key: objectKey,
      UploadId: uploadId,
    });

    const result = await s3Client.send(command);
    return result.Parts || [];
  }

  static async abortMultipartUpload(
    bucketName: BucketsType,
    objectKey: string,
    uploadId: string,
  ): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: bucketName,
      Key: objectKey,
      UploadId: uploadId,
    });

    await s3Client.send(command);
  }

  static async getObjectStream(
    bucketName: BucketsType,
    objectKey: string,
  ): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const { Body } = await s3Client.send(command);
    return Body as Readable;
  }

  // 原有 MinIO 功能迁移
  static async getDownloadUrl(
    bucketName: BucketsType,
    objectKey: string,
    expireTime: number = 3600,
    disposition: "attachment" | "inline" = "attachment",
    fileName?: string,
  ): Promise<string> {
    const fallbackFileName = objectKey.split("/").pop() || "download";
    const safeFileName = (fileName || fallbackFileName).replace(/"/g, "");

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ResponseContentDisposition: `${disposition}; filename="${safeFileName}"`,
    });

    // Use s3ClientForPresign for download URLs as well
    const url = await getSignedUrl(s3ClientForPresign, command, {
      expiresIn: expireTime,
    });
    return url;
  }

  // 小文件对象上传
  static async putObject(
    bucketName: BucketsType,
    objectKey: string,
    body: Buffer | Uint8Array | Blob | Readable | string,
    contentLength: number,
    mimeType: string,
    metadata?: Record<string, string>,
  ) {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: body,
      ContentLength: contentLength,
      ContentType: mimeType,
      Metadata: metadata,
    });

    return await s3Client.send(command);
  }

  static async deleteObject(
    bucketName: BucketsType,
    objectKey: string,
  ): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    await s3Client.send(command);
  }

  static async checkObjectExists(
    bucketName: BucketsType,
    objectKey: string,
  ): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      await s3Client.send(command);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as any).name === "NotFound" ||
          (error as any).name === "NoSuchKey")
      ) {
        return false;
      }
      throw error;
    }
  }

  static getPublicUrl(bucketName: BucketsType, objectKey: string): string {
    const publicBase = process.env.MINIO_PUBLIC_URL || "http://localhost:9000";
    return `${publicBase}/${bucketName}/${objectKey}`;
  }

  static async getObjectMetadata(bucketName: BucketsType, objectKey: string) {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    return await s3Client.send(command);
  }
}
