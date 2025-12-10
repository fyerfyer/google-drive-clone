// import { config } from "../config/env";
// import { v4 as uuidv4 } from "uuid";
// import { minioClient } from "../config/minio";
// import { Readable } from "stream";
// import mimeTypes from "mime-types";
// import { logger } from "../lib/logger";

// const replaceHostInUrl = (originalUrl: string): string => {
//   try {
//     const publicUrl = new URL(config.MINIO_PUBLIC_URL);
//     const urlObj = new URL(originalUrl);

//     // 把原始 URL 的 Protocol 和 Host 替换掉
//     urlObj.protocol = publicUrl.protocol;
//     urlObj.host = publicUrl.host;
//     return urlObj.toString();
//   } catch (error) {
//     logger.error(
//       { err: error, originalUrl },
//       "Failed to replace host in MinIO URL"
//     );
//     return originalUrl;
//   }
// };

// export const uploadObject = async (
//   bucketName: string,
//   file: Buffer | Readable,
//   size: number,
//   mimeType: string
// ): Promise<string> => {
//   const extension = mimeTypes.extension(mimeType) || "bin";
//   const objectKey = `${uuidv4()}.${extension}`;
//   const metaData = { "Content-Type": mimeType };
//   await minioClient.putObject(bucketName, objectKey, file, size, metaData);
//   return objectKey;
// };

// export const getPresignedUrl = async (
//   bucketName: string,
//   objectKey: string,
//   originalName: string,
//   expirySeconds: number = 3600,
//   disposition: "attachment" | "inline" = "attachment"
// ): Promise<string> => {
//   const headers = {
//     "response-content-disposition": `${disposition}; filename=${encodeURIComponent(originalName)}`,
//   };

//   const internalUrl = await minioClient.presignedGetObject(
//     bucketName,
//     objectKey,
//     expirySeconds,
//     headers
//   );

//   const publicUrl = replaceHostInUrl(internalUrl);
//   logger.debug(
//     { bucketName, objectKey, expirySeconds, disposition },
//     "Generated presigned URL"
//   );

//   return publicUrl;
// };
