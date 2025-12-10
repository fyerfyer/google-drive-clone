import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { BUCKETS } from "../config/s3";
import { v4 as uuidv4 } from "uuid";
import User from "../models/User.model";
import { StorageService } from "../services/storage.service";
import { ResponseHelper } from "../utils/response.util";

export class UploadController {
  async presignAvatar(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { filename, contentType, size } = req.body;
    const userId = req.user.id;
    if (!filename || !contentType || !size) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Missing required fields");
    }

    // 限制头像大小不超过 5MB
    if (size > 5 * 1024 * 1024) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Avatar size exceeds 5MB limit"
      );
    }
    if (!contentType.startsWith("image/")) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Invalid avatar content type"
      );
    }

    const ext = filename.split(".").pop() || "jpg";
    const key = `users/${userId}/avatar-${Date.now()}.${ext}`;

    const url = await StorageService.getPutUrl(
      BUCKETS.AVATARS,
      key,
      contentType
    );

    // Return in standard API response format
    return ResponseHelper.success(res, {
      method: "PUT",
      url,
      fields: {},
      headers: { "Content-Type": contentType },
      key, // 前端使用 key 更新 profile
    });
  }

  // 生成普通文件上传的预签名 URL
  async presignFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { filename, contentType, size } = req.body;
    const userId = req.user.id;

    if (!filename || !contentType || !size) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Missing required fields");
    }

    // 检查配额
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }

    if (user.storageUsage + size > user.storageQuota) {
      throw new AppError(StatusCodes.FORBIDDEN, "Storage quota exceeded");
    }

    // 生成文件 Key: users/{userId}/file/{uuid}/{filename}
    const key = `${userId}/file/${uuidv4()}/${filename}`;

    const url = await StorageService.getPutUrl(BUCKETS.FILES, key, contentType);

    return ResponseHelper.success(res, {
      method: "PUT",
      url,
      key,
      headers: {
        "Content-Type": contentType,
      },
    });
  }

  async createMultipartUpload(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { filename, type, metadata } = req.body;
    const fileSize = metadata?.size || req.body.size || 0;
    const mimeType = type || metadata?.type || "application/octet-stream";
    const userId = req.user.id;

    // 配额检查
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }

    if (user.storageUsage + fileSize > user.storageQuota) {
      throw new AppError(StatusCodes.FORBIDDEN, "Storage quota exceeded");
    }

    // 结构： users/{userId}/file/{uuid}/{originalFilename}
    // 保留原始文件名
    const objectKey = `${userId}/file/${uuidv4()}/${filename}`;

    const uploadId = await StorageService.createMultipartUpload(
      BUCKETS.FILES,
      objectKey,
      mimeType
    );

    // Return in standard API response format
    return ResponseHelper.success(res, {
      uploadId,
      key: objectKey,
    });
  }

  async signPart(req: Request, res: Response, next: NextFunction) {
    const { uploadId, partNumber } = req.params;
    const { key } = req.query;

    if (!uploadId || !key || !partNumber) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Missing required parameters: uploadId, key, partNumber"
      );
    }

    const url = await StorageService.getPresignedPartUrl(
      BUCKETS.FILES,
      key as string,
      uploadId,
      parseInt(partNumber, 10)
    );
    return ResponseHelper.success(res, { url });
  }

  async listParts(req: Request, res: Response, next: NextFunction) {
    const { uploadId } = req.params;
    const { key } = req.query;

    if (!uploadId || !key) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Missing required parameters: uploadId, key"
      );
    }

    const parts = await StorageService.listParts(
      BUCKETS.FILES,
      key as string,
      uploadId
    );
    return ResponseHelper.success(res, { parts });
  }

  async completeMultipartUpload(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { uploadId } = req.params;
    const { key, parts } = req.body;

    if (!uploadId || !key || !parts) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Missing required parameters: uploadId, key, parts"
      );
    }

    const result = await StorageService.completeMultipartUpload(
      BUCKETS.FILES,
      key,
      uploadId,
      parts
    );

    return ResponseHelper.success(res, { location: result.Location, key });
  }

  async abortMultipartUpload(req: Request, res: Response, next: NextFunction) {
    const { uploadId } = req.params;
    const { key } = req.query;

    if (!uploadId || !key) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Missing required parameters: uploadId, key"
      );
    }

    await StorageService.abortMultipartUpload(
      BUCKETS.FILES,
      key as string,
      uploadId
    );

    return res.status(StatusCodes.NO_CONTENT).send();
  }
}
