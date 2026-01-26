import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import logger from "../lib/logger";
import { config } from "./env";

// S3 client for backend operations (uses internal endpoint)
export const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: config.minioEndpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.minioAccessKey,
    secretAccessKey: config.minioSecretKey,
  },
});

// S3 client for presigned URL generation (uses public endpoint)
export const s3ClientForPresign = new S3Client({
  region: "us-east-1",
  endpoint: config.minioPublicUrl,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.minioAccessKey,
    secretAccessKey: config.minioSecretKey,
  },
});

export const BUCKETS = {
  AVATARS: "avatars",
  FILES: "files",
} as const;

export type BucketsType = (typeof BUCKETS)[keyof typeof BUCKETS];

// 公开读权限策略
const PUBLIC_READ_POLICY = (bucketName: string) => ({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucketName}/*`],
    },
  ],
});

// 注意：CORS 配置已在 MinIO 服务级别通过环境变量配置
// (MINIO_API_CORS_ALLOW_ORIGIN="*")
// MinIO 不完全支持 S3 的 PutBucketCors API，因此我们不在代码中设置

export async function initializeBuckets() {
  for (const bucketName of Object.values(BUCKETS)) {
    try {
      // 检查 bucket 是否存在
      try {
        await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
        logger.info(`Bucket ${bucketName} already exists`);

        // 注意：CORS 配置已在 MinIO 服务级别配置 (MINIO_API_CORS_ALLOW_ORIGIN)
        // 不需要在 bucket 级别重复配置，避免 MinIO 不支持某些 S3 CORS API

        // 确保 avatars bucket 有公开读权限
        if (bucketName === BUCKETS.AVATARS) {
          try {
            await s3Client.send(
              new PutBucketPolicyCommand({
                Bucket: bucketName,
                Policy: JSON.stringify(PUBLIC_READ_POLICY(bucketName)),
              }),
            );
            logger.info(`Set public read policy for bucket: ${bucketName}`);
          } catch (policyErr) {
            logger.warn(
              { err: policyErr, bucket: bucketName },
              "Failed to set bucket policy (may already be set)",
            );
          }
        }
      } catch (err: any) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
          // Bucket 不存在，创建它
          await s3Client.send(
            new CreateBucketCommand({
              Bucket: bucketName,
            }),
          );
          logger.info(`Successfully created bucket: ${bucketName}`);

          // CORS 配置已在 MinIO 服务级别配置
          // 不在 bucket 级别设置

          // 为 avatars bucket 设置公开读权限
          if (bucketName === BUCKETS.AVATARS) {
            await s3Client.send(
              new PutBucketPolicyCommand({
                Bucket: bucketName,
                Policy: JSON.stringify(PUBLIC_READ_POLICY(bucketName)),
              }),
            );
            logger.info(`Set public read policy for bucket: ${bucketName}`);
          }
        } else {
          throw err;
        }
      }
    } catch (error) {
      logger.error(
        { err: error, bucket: bucketName },
        `Failed to initialize bucket: ${bucketName}`,
      );
      throw error;
    }
  }
}
