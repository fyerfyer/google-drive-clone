import { Client } from "minio";

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_PORT || "9000", 10),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin123",
});

export const BUCKETS = {
  AVATARS: "avatars",
  FILES: "files",
};

// 直接设置公开读权限
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

export async function initializeBuckets() {
  for (const bucketName of Object.values(BUCKETS)) {
    try {
      const exists = await minioClient.bucketExists(bucketName);
      if (!exists) {
        await minioClient.makeBucket(bucketName, "us-east-1");
        console.log(`Successfully create bucket: ${bucketName}`);

        // Make avatars bucket publicly readable
        if (bucketName === BUCKETS.AVATARS) {
          await minioClient.setBucketPolicy(
            bucketName,
            JSON.stringify(PUBLIC_READ_POLICY(bucketName))
          );
          console.log(`Set public read policy for bucket: ${bucketName}`);
        }
      } else {
        console.log(`Bucket ${bucketName} exists`);

        // Ensure avatars bucket has public read policy
        if (bucketName === BUCKETS.AVATARS) {
          try {
            await minioClient.setBucketPolicy(
              bucketName,
              JSON.stringify(PUBLIC_READ_POLICY(bucketName))
            );
            console.log(`Updated public read policy for bucket: ${bucketName}`);
          } catch (policyError) {
            console.warn(
              `Could not set policy for ${bucketName}:`,
              policyError
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error with bucket ${bucketName}:`, error);
    }
  }
}
