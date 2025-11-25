import { URL } from "url";
import { minioClient, BUCKETS } from "../config/minio";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { config } from "../config/env";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import UserModel from "../models/User.model";

interface AvatarResponse {
  publicId: string;
  thumbnailId: string;
  url: string;
  thumbnail: string;
}

interface AvatarDTO {
  userId: string;
  avatarFile: Express.Multer.File;
}

interface AvatarDataUrlDTO {
  userId: string;
  avatarDataUrl: string;
}

interface ProcessUploadDTO {
  userId: string;
  buffer: Buffer;
  originalName?: string;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export class AvatarService {
  async uploadAvatar(data: AvatarDTO): Promise<AvatarResponse> {
    const user = await UserModel.findById(data.userId);
    const oldAvatarId = user?.avatar?.publicId;
    const oldThumbnailId = user?.avatar?.thumbnailId;

    const response = await this.processUpload({
      userId: data.userId,
      buffer: data.avatarFile.buffer,
      originalName: data.avatarFile.originalname,
    });

    if (oldAvatarId) {
      await minioClient.removeObject("avatar", oldAvatarId);
    }

    if (oldThumbnailId) {
      await minioClient.removeObject("avatar", oldThumbnailId);
    }

    return response;
  }

  async uploadAvatarFromDataUrl(
    data: AvatarDataUrlDTO
  ): Promise<AvatarResponse> {
    const { buffer } = this.parseDataUrl(data.avatarDataUrl);
    return this.processUpload({
      userId: data.userId,
      buffer,
      originalName: `${data.userId}-inline.png`,
    });
  }

  private parseDataUrl(dataUrl: string): { buffer: Buffer } {
    const matches = dataUrl.match(
      /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/
    );
    if (!matches || matches.length !== 3) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Invalid avatar data URL provided"
      );
    }

    const base64Payload = matches[2];
    const buffer = Buffer.from(base64Payload, "base64");
    if (!buffer.length) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Avatar data URL payload is empty"
      );
    }

    if (buffer.length > MAX_AVATAR_BYTES) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Avatar must be smaller than 5MB"
      );
    }

    return { buffer };
  }

  private async processUpload(data: ProcessUploadDTO): Promise<AvatarResponse> {
    const baseName = `${data.userId}-${uuidv4()}`;
    const originalPublicId = `${baseName}.png`;
    const thumbnailPublicId = `thumb-${baseName}.png`;

    const compressedBuffer = await sharp(data.buffer)
      .resize(500, 500, { fit: "cover" })
      .png({ quality: 95 })
      .toBuffer();

    const thumbnailBuffer = await sharp(data.buffer)
      .resize(150, 150, { fit: "cover" })
      .png({ quality: 80 })
      .toBuffer();

    const metaData: Record<string, string> = {
      "Content-Type": "image/png",
      "x-amz-meta-user-id": data.userId,
    };

    if (data.originalName) {
      metaData["x-amz-meta-original-name"] = encodeURIComponent(
        data.originalName
      );
    }

    await minioClient.putObject(
      BUCKETS.AVATARS,
      originalPublicId,
      compressedBuffer,
      compressedBuffer.length,
      metaData
    );

    await minioClient.putObject(
      BUCKETS.AVATARS,
      thumbnailPublicId,
      thumbnailBuffer,
      thumbnailBuffer.length,
      metaData
    );

    const publicBase = config.MINIO_PUBLIC_URL;
    const url = `${publicBase}/${BUCKETS.AVATARS}/${originalPublicId}`;
    const thumbnail = `${publicBase}/${BUCKETS.AVATARS}/${thumbnailPublicId}`;

    return {
      publicId: originalPublicId,
      thumbnailId: thumbnailPublicId,
      url: url,
      thumbnail: thumbnail,
    };
  }
}
