import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import mongoose from "mongoose";
import { StorageService } from "./storage.service";
import { BUCKETS } from "../config/s3";
import { v4 as uuidv4 } from "uuid";
import mimeTypes from "mime-types";
import User from "../models/User.model";
import { logger } from "../lib/logger";

interface CreateFileRecordDTO {
  userId: string;
  folderId: string;
  key: string;
  fileSize: number;
  mimeType: string;
  originalName: string;
  hash?: string;
}

interface DownloadLinkDTO {
  userId: string;
  fileId: string;
}

interface PreviewStreamDTO {
  userId: string;
  fileId: string;
}

interface PresignedUrlDTO {
  userId: string;
  fileId: string;
  expirySeconds?: number;
}

// 共享信息
interface IShareInfo {
  userId: string;
  role: "viewer" | "editor";
}

// 返回给前端的脱敏文件信息
export interface IFilePublic {
  id: string;
  name: string;
  originalName: string;
  extension: string;
  mimeType: string;
  size: number;
  folder: string;
  user: string;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;
  isPublic: boolean;
  sharedWith: IShareInfo[];
  createdAt: Date;
  updatedAt: Date;
}

export class FileService {
  async createFileRecord(data: CreateFileRecordDTO): Promise<IFilePublic> {
    const { userId, folderId, key, fileSize, mimeType, originalName, hash } =
      data;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

    // 再次检查用户（Upload Controller 中进行了配额检查）
    const user = await User.findById(userObjectId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }

    // 扣除配额
    // 在这里扣除配额，Upload Controller 只是进行检查
    const updateUser = await User.findOneAndUpdate(
      {
        _id: userObjectId,
        $expr: {
          $lte: [{ $add: ["$storageUsage", fileSize] }, "$storageQuota"],
        },
      },
      { $inc: { storageUsage: fileSize } },
      { new: true }
    );

    if (!updateUser) {
      // 配额不足的话需要回滚 MinIO 中的上传
      await StorageService.deleteObject(BUCKETS.FILES, key).catch((err) => {
        logger.error(
          { err, userId, key },
          "Failed to rollback MinIO object after quota exceeded"
        );
      });

      throw new AppError(StatusCodes.BAD_REQUEST, "Storage quota exceeded");
    }

    // 创建文件记录
    const file = await File.create({
      user: userObjectId,
      folder: folderObjectId,
      key,
      size: fileSize,
      mimeType,
      originalName,
      name: originalName,
      extension: mimeTypes.extension(mimeType) || "",
      hash,
      isPublic: false,
      isStarred: false,
      isTrashed: false,
      sharedWith: [],
    });

    return {
      id: file._id.toString(),
      name: originalName,
      originalName: file.originalName,
      extension: mimeTypes.extension(file.mimeType) || "",
      mimeType: file.mimeType,
      size: file.size,
      folder: file.folder.toString(),
      user: userId,
      isStarred: file.isStarred,
      isTrashed: file.isTrashed,
      trashedAt: file.trashedAt,
      isPublic: file.isPublic,
      sharedWith: file.sharedWith.map((share) => ({
        userId: share.user.toString(),
        role: share.role,
      })),
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async trashFile(fileId: string, userId: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const result = await File.updateOne(
      {
        _id: fileObjectId,
        user: userObjectId,
      },
      {
        isTrashed: true,
        trashedAt: new Date(),
      }
    );

    if (result.matchedCount === 0) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }
  }

  async restoreFile(fileId: string, userId: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const result = await File.updateOne(
      {
        _id: fileObjectId,
        user: userObjectId,
      },
      {
        isTrashed: false,
        trashedAt: null,
      }
    );

    if (result.matchedCount === 0) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }
  }

  async deleteFilePermanent(fileId: string, userId: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const fileToDelete = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: true,
    }).select("+key +hash size");

    if (!fileToDelete) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "File not found or not trashed"
      );
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await File.deleteOne(
        {
          _id: fileObjectId,
          user: userObjectId,
        },
        { session }
      );

      await User.updateOne(
        {
          _id: userId,
        },
        {
          $inc: { storageUsage: -fileToDelete.size },
        },
        { session }
      );

      await session.commitTransaction();
    } catch (error) {
      logger.error(
        { err: error, fileId, userId },
        "Failed to delete file permanently"
      );
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to delete file permanently"
      );
    } finally {
      await session.endSession();
    }

    // 在事务提交后清理MinIO对象
    await this.cleanupMinioObject(fileToDelete.key, fileToDelete.hash);
  }

  async starFile(fileId: string, userId: string, star: boolean) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folder = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isStarred: { $ne: star },
    });

    if (!folder) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    folder.isStarred = star;
    await folder.save();
    logger.info({ fileId, userId, star }, "File star status updated");
  }

  private async cleanupMinioObject(key: string, hash?: string) {
    // 如果有hash，按hash查询；否则按key查询
    const query = hash ? { hash: hash } : { key: key };
    const count = await File.countDocuments(query);
    if (count === 0) {
      logger.info(
        { key, hash },
        "No file references remaining, deleting object from MinIO"
      );
      await StorageService.deleteObject(BUCKETS.FILES, key).catch((err) => {
        logger.error({ err, key }, "Failed to delete object from MinIO");
      });
    } else {
      logger.debug(
        { key, hash, referenceCount: count },
        "Object still has file references, keeping in MinIO"
      );
    }
  }

  async moveFile(fileId: string, userId: string, targetFolderId: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const targetFolderObjectId = new mongoose.Types.ObjectId(targetFolderId);

    const [fileToMove, targetFolder] = await Promise.all([
      File.findOne({
        _id: fileObjectId,
        user: userObjectId,
        isTrashed: false,
      }),
      Folder.findOne({
        _id: targetFolderObjectId,
        user: userObjectId,
        isTrashed: false,
      }),
    ]);

    if (!fileToMove) {
      logger.error({ fileId, userId }, "File not found");
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    if (!targetFolder) {
      logger.error({ targetFolderId, userId }, "Target folder not found");
      throw new AppError(StatusCodes.NOT_FOUND, "Target folder not found");
    }

    if (fileToMove.folder.equals(targetFolderObjectId)) {
      logger.info(
        { fileId, targetFolderId },
        "File is already in the target folder"
      );
      return;
    }

    fileToMove.folder = targetFolderObjectId;
    await fileToMove.save();

    logger.info({ fileId, targetFolderId, userId }, "File moved successfully");
  }

  async renameFile(fileId: string, userId: string, newName: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: false,
    });

    if (!file) {
      logger.error({ fileId, userId }, "File not found");
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    file.name = newName;
    await file.save();

    logger.info({ fileId, newName, userId }, "File renamed successfully");
  }

  async getPresignedDownloadUrl(data: PresignedUrlDTO) {
    const fileObjectId = new mongoose.Types.ObjectId(data.fileId);
    const userObjectId = new mongoose.Types.ObjectId(data.userId);

    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for download"
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const expirySeconds = data.expirySeconds || 3600;
    const presignedUrl = await StorageService.getDownloadUrl(
      BUCKETS.FILES,
      file.key,
      expirySeconds,
      "attachment"
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, expirySeconds },
      "Generated presigned download URL"
    );

    return {
      url: presignedUrl,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      expiresIn: expirySeconds,
    };
  }

  async getPreviewStream(data: PreviewStreamDTO) {
    const fileObjectId = new mongoose.Types.ObjectId(data.fileId);
    const userObjectId = new mongoose.Types.ObjectId(data.userId);

    // 验证文件权限
    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for preview"
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    // 避免代理超大文件（50MB 以内）
    const MAX_PREVIEW_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_PREVIEW_SIZE) {
      logger.warn(
        { fileId: data.fileId, fileSize: file.size, maxSize: MAX_PREVIEW_SIZE },
        "File too large for preview stream"
      );
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "File too large for preview. Please use download instead."
      );
    }

    // 从 MinIO 获取文件流
    const stream = await StorageService.getObjectStream(
      BUCKETS.FILES,
      file.key
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, fileSize: file.size },
      "Generated preview stream"
    );

    return {
      stream,
      mimeType: file.mimeType,
      fileName: file.originalName,
      size: file.size,
    };
  }
}
