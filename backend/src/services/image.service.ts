import sharp from "sharp";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import { StorageService } from "./storage.service";
import { BucketsType } from "../config/s3";
import { IMAGE_PRESETS } from "../types/image-presets";
import logger from "../lib/logger";

export interface ImageResource {
  publicId: string;
  thumbnailId: string;
  thumbnail: string;
}

export interface ImageProcessingOptions {
  bucket: BucketsType;
  thumbnailSize?: { width: number; height: number };
  thumbnailQuality?: number;
  thumbnailExtension?: string;
  logContext?: string;
}

export enum ImageType {
  AVATAR = "avatar",
  ICON = "icon",
}

export interface ImagePreset {
  thumbnailSize: { width: number; height: number };
  thumbnailQuality: number;
  thumbnailExtension: string;
  logContext: string;
}

export class ImageService {
  private static readonly PRESETS: Record<ImageType, ImagePreset> =
    IMAGE_PRESETS;

  static async processImage(
    userId: string,
    tempKey: string,
    options: ImageProcessingOptions
  ): Promise<ImageResource> {
    const config = this.mergeWithDefaults(options);
    const {
      bucket,
      thumbnailSize,
      thumbnailQuality,
      thumbnailExtension,
      logContext,
    } = config;

    try {
      // 验证图片是否存在
      const exists = await StorageService.checkObjectExists(bucket, tempKey);
      if (!exists) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `${logContext} not found in storage`
        );
      }

      // 获取元数据验证是否为图片
      const metadata = await StorageService.getObjectMetadata(bucket, tempKey);
      if (!metadata.ContentType?.startsWith("image/")) {
        await StorageService.deleteObject(bucket, tempKey);
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Uploaded file is not an image"
        );
      }

      // 生成缩略图 key
      const thumbnailKey = tempKey.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        thumbnailExtension
      );

      // 获取原图流并生成缩略图
      const originalStream = await StorageService.getObjectStream(
        bucket,
        tempKey
      );

      const thumbnailTransform = sharp()
        .resize(thumbnailSize.width, thumbnailSize.height, {
          fit: "cover",
          position: "center",
        })
        .png({ quality: thumbnailQuality });

      const thumbnailStream = originalStream.pipe(thumbnailTransform);

      // 收集缩略图数据
      const chunks: Buffer[] = [];
      for await (const chunk of thumbnailStream) {
        chunks.push(chunk);
      }
      const thumbnailBuffer = Buffer.concat(chunks);

      // 上传缩略图
      await StorageService.putObject(
        bucket,
        thumbnailKey,
        thumbnailBuffer,
        thumbnailBuffer.length,
        "image/png"
      );

      const thumbnailUrl = StorageService.getPublicUrl(bucket, thumbnailKey);

      logger.info(
        { userId, originalKey: tempKey, thumbnailKey, type: logContext },
        `${logContext} processed successfully`
      );

      return {
        publicId: tempKey,
        thumbnailId: thumbnailKey,
        thumbnail: thumbnailUrl,
      };
    } catch (error) {
      logger.error(
        { err: error, userId, tempKey, type: logContext },
        `Failed to process ${logContext}`
      );
      throw error;
    }
  }

  static async processImageWithPreset(
    userId: string,
    tempKey: string,
    type: ImageType,
    bucket: BucketsType
  ): Promise<ImageResource> {
    const preset = this.PRESETS[type];
    return this.processImage(userId, tempKey, { ...preset, bucket });
  }

  static async deleteImage(
    key: string,
    bucket: BucketsType,
    thumbnailExtension: string = "-thumb.png"
  ): Promise<void> {
    if (!key) return;

    try {
      // 删除原图
      await StorageService.deleteObject(bucket, key);

      // 尝试删除缩略图
      const thumbnailKey = key.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        thumbnailExtension
      );

      const thumbnailExists = await StorageService.checkObjectExists(
        bucket,
        thumbnailKey
      );

      if (thumbnailExists) {
        await StorageService.deleteObject(bucket, thumbnailKey);
      }

      logger.info({ key, bucket }, "Image deleted successfully");
    } catch (error) {
      logger.error({ err: error, key, bucket }, "Failed to delete image");
      throw error;
    }
  }

  static getImageUrl(bucket: BucketsType, publicId: string): string {
    return StorageService.getPublicUrl(bucket, publicId);
  }

  private static mergeWithDefaults(
    options: ImageProcessingOptions
  ): Required<ImageProcessingOptions> {
    return {
      bucket: options.bucket,
      thumbnailSize: options.thumbnailSize ?? { width: 200, height: 200 },
      thumbnailQuality: options.thumbnailQuality ?? 90,
      thumbnailExtension: options.thumbnailExtension ?? "-thumb.png",
      logContext: options.logContext ?? "image",
    };
  }
}
