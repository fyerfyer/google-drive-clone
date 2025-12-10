import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import logger from "../lib/logger";

// S3 client for backend operations (uses internal endpoint)
export const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin123",
  },
});

// S3 client for presigned URL generation (uses public endpoint)
export const s3ClientForPresign = new S3Client({
  region: "us-east-1",
  endpoint: process.env.MINIO_PUBLIC_URL || "http://localhost:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin123",
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

// CORS 配置
const CORS_CONFIGURATION = {
  CORSRules: [
    {
      AllowedHeaders: ["*"],
      AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
      AllowedOrigins: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
};

export async function initializeBuckets() {
  for (const bucketName of Object.values(BUCKETS)) {
    try {
      // 检查 bucket 是否存在
      try {
        await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
        logger.info(`Bucket ${bucketName} already exists`);

        // 设置 CORS 配置
        try {
          await s3Client.send(
            new PutBucketCorsCommand({
              Bucket: bucketName,
              CORSConfiguration: CORS_CONFIGURATION,
            })
          );
          logger.info(`Set CORS configuration for bucket: ${bucketName}`);
        } catch (corsErr) {
          logger.warn(
            { err: corsErr, bucket: bucketName },
            "Failed to set CORS configuration"
          );
        }

        // 确保 avatars bucket 有公开读权限
        if (bucketName === BUCKETS.AVATARS) {
          try {
            await s3Client.send(
              new PutBucketPolicyCommand({
                Bucket: bucketName,
                Policy: JSON.stringify(PUBLIC_READ_POLICY(bucketName)),
              })
            );
            logger.info(`Set public read policy for bucket: ${bucketName}`);
          } catch (policyErr) {
            logger.warn(
              { err: policyErr, bucket: bucketName },
              "Failed to set bucket policy (may already be set)"
            );
          }
        }
      } catch (err: any) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
          // Bucket 不存在，创建它
          await s3Client.send(
            new CreateBucketCommand({
              Bucket: bucketName,
            })
          );
          logger.info(`Successfully created bucket: ${bucketName}`);

          // 设置 CORS 配置
          await s3Client.send(
            new PutBucketCorsCommand({
              Bucket: bucketName,
              CORSConfiguration: CORS_CONFIGURATION,
            })
          );
          logger.info(`Set CORS configuration for bucket: ${bucketName}`);

          // 为 avatars bucket 设置公开读权限
          if (bucketName === BUCKETS.AVATARS) {
            await s3Client.send(
              new PutBucketPolicyCommand({
                Bucket: bucketName,
                Policy: JSON.stringify(PUBLIC_READ_POLICY(bucketName)),
              })
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
        `Failed to initialize bucket: ${bucketName}`
      );
      throw error;
    }
  }
}
