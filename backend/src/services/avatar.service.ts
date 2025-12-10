import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import { StorageService } from "./storage.service";
import { BUCKETS } from "../config/s3";
import logger from "../lib/logger";

interface AvatarResponse {
  publicId: string;
  thumbnailId: string;
  url: string;
  thumbnail: string;
}

export class AvatarService {
  async processUploadAvatar(
    userId: string,
    tempKey: string
  ): Promise<AvatarResponse> {
    try {
      // Verify avatar exists in storage
      const exists = await StorageService.checkObjectExists(
        BUCKETS.AVATARS,
        tempKey
      );

      if (!exists) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Avatar not found in storage"
        );
      }

      // Get metadata to verify it's an image
      const metadata = await StorageService.getObjectMetadata(
        BUCKETS.AVATARS,
        tempKey
      );

      if (!metadata.ContentType?.startsWith("image/")) {
        // Clean up invalid upload
        await StorageService.deleteObject(BUCKETS.AVATARS, tempKey);
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Uploaded file is not an image"
        );
      }

      // Generate thumbnail key
      const thumbnailKey = tempKey.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        "-thumb.png"
      );

      // Stream original image, resize to thumbnail, and upload
      const originalStream = await StorageService.getObjectStream(
        BUCKETS.AVATARS,
        tempKey
      );

      // Use sharp to resize image
      const thumbnailTransform = sharp()
        .resize(200, 200, { fit: "cover", position: "center" })
        .png({ quality: 90 });

      // Pipe original stream through sharp
      const thumbnailStream = originalStream.pipe(thumbnailTransform);

      // Collect thumbnail data
      const chunks: Buffer[] = [];
      for await (const chunk of thumbnailStream) {
        chunks.push(chunk);
      }
      const thumbnailBuffer = Buffer.concat(chunks);

      // Upload thumbnail
      await StorageService.putObject(
        BUCKETS.AVATARS,
        thumbnailKey,
        thumbnailBuffer,
        thumbnailBuffer.length,
        "image/png"
      );

      const originalUrl = StorageService.getPublicUrl(BUCKETS.AVATARS, tempKey);
      const thumbnailUrl = StorageService.getPublicUrl(
        BUCKETS.AVATARS,
        thumbnailKey
      );

      logger.info(
        { userId, originalKey: tempKey, thumbnailKey },
        "Avatar processed successfully"
      );

      return {
        publicId: tempKey,
        thumbnailId: thumbnailKey,
        url: originalUrl,
        thumbnail: thumbnailUrl,
      };
    } catch (error) {
      logger.error({ err: error, userId, tempKey }, "Failed to process avatar");
      throw error;
    }
  }

  async deleteAvatar(key: string): Promise<void> {
    if (!key) return;

    try {
      // Delete original
      await StorageService.deleteObject(BUCKETS.AVATARS, key);

      // Try to delete thumbnail if exists
      const thumbnailKey = key.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        "-thumb.png"
      );

      const thumbnailExists = await StorageService.checkObjectExists(
        BUCKETS.AVATARS,
        thumbnailKey
      );

      if (thumbnailExists) {
        await StorageService.deleteObject(BUCKETS.AVATARS, thumbnailKey);
      }

      logger.info({ key }, "Avatar deleted successfully");
    } catch (error) {
      logger.error({ err: error, key }, "Failed to delete avatar");
      throw error;
    }
  }
}
