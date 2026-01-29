import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import File, { IFile } from "../models/File.model";
import Folder from "../models/Folder.model";
import mongoose from "mongoose";
import { StorageService } from "./storage.service";
import { BUCKETS } from "../config/s3";
import mimeTypes from "mime-types";
import User from "../models/User.model";
import { logger } from "../lib/logger";
import { LinkAccessStatus } from "../types/model.types";

interface CreateFileRecordDTO {
  userId: string;
  folderId: string;
  key: string;
  fileSize: number;
  mimeType: string;
  originalName: string;
  hash?: string;
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

// 用户基础信息（用于所有者和共享者）
interface IUserBasic {
  id: string;
  name: string;
  email: string;
  avatar: {
    thumbnail: string;
  };
}

// 返回给前端的脱敏文件信息
export interface IFilePublic {
  id: string;
  name: string;
  originalName: string;
  extension: string;
  mimeType: string;
  size: number;
  folder: string | null; // Can be null for root-level files
  user: IUserBasic;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;
  linkAccessStatus: LinkAccessStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class FileService {
  private async getUserBasic(userId: string): Promise<IUserBasic> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjectId).select("name email avatar");
    return {
      id: userId,
      name: user?.name || "",
      email: user?.email || "",
      avatar: {
        thumbnail: user?.avatar?.thumbnail || "",
      },
    };
  }

  private getLinkAccessStatus(file: IFile): LinkAccessStatus {
    if (!file.linkShare?.enableLinkSharing) {
      return "none";
    }
    return file.linkShare.role;
  }

  private toFilePublic(file: IFile, userBasic: IUserBasic): IFilePublic {
    return {
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      extension: file.extension,
      mimeType: file.mimeType,
      size: file.size,
      folder: file.folder ? file.folder.toString() : null,
      user: userBasic,
      isStarred: file.isStarred,
      isTrashed: file.isTrashed,
      trashedAt: file.trashedAt,
      linkAccessStatus: this.getLinkAccessStatus(file),
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async createFileRecord(data: CreateFileRecordDTO): Promise<IFilePublic> {
    const { userId, folderId, key, fileSize, mimeType, originalName, hash } =
      data;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Handle "root" folder ID (same as folder.service.ts)
    const isRoot = folderId === "root";
    const folderObjectId = isRoot
      ? null
      : new mongoose.Types.ObjectId(folderId);

    // 计算文件 ancestors（用于后续权限传递与查询优化）
    let ancestors: mongoose.Types.ObjectId[] = [];
    if (folderObjectId) {
      const parentFolder = await Folder.findOne({
        _id: folderObjectId,
        user: userObjectId,
      });
      if (!parentFolder) {
        throw new AppError(StatusCodes.NOT_FOUND, "Parent folder not found");
      }
      ancestors = [...parentFolder.ancestors, folderObjectId];
    }

    // 使用原子操作
    const updateUser = await User.findOneAndUpdate(
      {
        _id: userObjectId,
        // 使用 $expr 确保配额检查是原子的
        $expr: {
          $lte: [{ $add: ["$storageUsage", fileSize] }, "$storageQuota"],
        },
      },
      { $inc: { storageUsage: fileSize } },
      { new: true },
    );

    if (!updateUser) {
      // 配额不足的话需要回滚 MinIO 中的上传
      await StorageService.deleteObject(BUCKETS.FILES, key).catch((err) => {
        logger.error(
          { err, userId, key },
          "Failed to rollback MinIO object after quota exceeded",
        );
      });

      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Storage quota exceeded or user not found",
      );
    }

    // 推断文件扩展名
    const extension = mimeTypes.extension(mimeType) || "";

    // 创建文件记录
    const file = await File.create({
      user: userObjectId,
      folder: folderObjectId,
      ancestors,
      key,
      size: fileSize,
      mimeType,
      originalName,
      name: originalName,
      extension,
      hash,
      isStarred: false,
      isTrashed: false,
    });

    const userBasic = await this.getUserBasic(userId);

    return this.toFilePublic(file, userBasic);
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
      },
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
      },
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
        "File not found or not trashed",
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
        { session },
      );

      await User.updateOne(
        {
          _id: userId,
        },
        {
          $inc: { storageUsage: -fileToDelete.size },
        },
        { session },
      );

      await session.commitTransaction();
    } catch (error) {
      logger.error(
        { err: error, fileId, userId },
        "Failed to delete file permanently",
      );
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to delete file permanently",
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

    // 使用原子操作更新
    const result = await File.findOneAndUpdate(
      {
        _id: fileObjectId,
        user: userObjectId,
      },
      { isStarred: star },
      { new: true },
    );

    if (!result) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    logger.info({ fileId, userId, star }, "File star status updated");
  }

  private async cleanupMinioObject(key: string, hash?: string) {
    // 如果有hash，按hash查询；否则按key查询
    const query = hash ? { hash: hash } : { key: key };
    const count = await File.countDocuments(query);
    if (count === 0) {
      logger.info(
        { key, hash },
        "No file references remaining, deleting object from MinIO",
      );
      await StorageService.deleteObject(BUCKETS.FILES, key).catch((err) => {
        logger.error({ err, key }, "Failed to delete object from MinIO");
      });
    } else {
      logger.debug(
        { key, hash, referenceCount: count },
        "Object still has file references, keeping in MinIO",
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

    if (fileToMove.folder?.equals(targetFolderObjectId)) {
      logger.info(
        { fileId, targetFolderId },
        "File is already in the target folder",
      );
      return;
    }

    // 更新文件夹与祖先路径
    fileToMove.folder = targetFolderObjectId;
    fileToMove.ancestors = [...targetFolder.ancestors, targetFolderObjectId];
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

    // Find file without owner check
    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size user");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for download",
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    // Check if user has permission (owner or shared access)
    const isOwner = file.user.toString() === data.userId;
    if (!isOwner) {
      // Check shared access via PermissionService
      const { PermissionService } = await import("./permission.service");
      const permissionService = new PermissionService();
      const hasAccess = await permissionService.checkPermission({
        userId: data.userId,
        resourceId: data.fileId,
        resourceType: "File",
        requireRole: "viewer",
      });

      if (!hasAccess) {
        logger.warn(
          { fileId: data.fileId, userId: data.userId },
          "User does not have permission to download file",
        );
        throw new AppError(StatusCodes.FORBIDDEN, "Access denied");
      }
    }

    const expirySeconds = data.expirySeconds || 3600;
    const presignedUrl = await StorageService.getDownloadUrl(
      BUCKETS.FILES,
      file.key,
      expirySeconds,
      "attachment",
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, expirySeconds },
      "Generated presigned download URL",
    );

    return {
      url: presignedUrl,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      expiresIn: expirySeconds,
    };
  }

  async getPreviewUrl(data: PresignedUrlDTO) {
    const fileObjectId = new mongoose.Types.ObjectId(data.fileId);
    const userObjectId = new mongoose.Types.ObjectId(data.userId);

    // Find file without owner check
    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size user");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for preview",
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    // Check if user has permission (owner or shared access)
    const isOwner = file.user.toString() === data.userId;
    if (!isOwner) {
      // Check shared access via PermissionService
      const { PermissionService } = await import("./permission.service");
      const permissionService = new PermissionService();
      const hasAccess = await permissionService.checkPermission({
        userId: data.userId,
        resourceId: data.fileId,
        resourceType: "File",
        requireRole: "viewer",
      });

      if (!hasAccess) {
        logger.warn(
          { fileId: data.fileId, userId: data.userId },
          "User does not have permission to preview file",
        );
        throw new AppError(StatusCodes.FORBIDDEN, "Access denied");
      }
    }

    const expirySeconds = data.expirySeconds || 3600;
    const presignedUrl = await StorageService.getDownloadUrl(
      BUCKETS.FILES,
      file.key,
      expirySeconds,
      "inline",
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, expirySeconds },
      "Generated presigned preview URL",
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

    // Find file without owner check
    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size user");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for preview",
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    // Check if user has permission (owner or shared access)
    const isOwner = file.user.toString() === data.userId;
    if (!isOwner) {
      // Check shared access via PermissionService
      const { PermissionService } = await import("./permission.service");
      const permissionService = new PermissionService();
      const hasAccess = await permissionService.checkPermission({
        userId: data.userId,
        resourceId: data.fileId,
        resourceType: "File",
        requireRole: "viewer",
      });

      if (!hasAccess) {
        logger.warn(
          { fileId: data.fileId, userId: data.userId },
          "User does not have permission to preview file",
        );
        throw new AppError(StatusCodes.FORBIDDEN, "Access denied");
      }
    }

    // 避免代理超大文件（50MB 以内）
    const MAX_PREVIEW_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_PREVIEW_SIZE) {
      logger.warn(
        { fileId: data.fileId, fileSize: file.size, maxSize: MAX_PREVIEW_SIZE },
        "File too large for preview stream",
      );
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "File too large for preview. Please use download instead.",
      );
    }

    // 从 MinIO 获取文件流
    const stream = await StorageService.getObjectStream(
      BUCKETS.FILES,
      file.key,
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, fileSize: file.size },
      "Generated preview stream",
    );

    return {
      stream,
      mimeType: file.mimeType,
      fileName: file.originalName,
      size: file.size,
    };
  }

  async getStarredFiles(userId: string): Promise<IFilePublic[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [files, userBasic] = await Promise.all([
      File.find({
        user: userObjectId,
        isStarred: true,
        isTrashed: false,
      }).sort({ updatedAt: -1 }),
      this.getUserBasic(userId),
    ]);

    return files.map((file) => this.toFilePublic(file, userBasic));
  }

  async getTrashedFiles(userId: string): Promise<IFilePublic[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [files, userBasic] = await Promise.all([
      File.find({
        user: userObjectId,
        isTrashed: true,
      }).sort({ trashedAt: -1 }),
      this.getUserBasic(userId),
    ]);

    return files.map((file) => this.toFilePublic(file, userBasic));
  }

  async getRecentFiles(
    userId: string,
    limit: number = 20,
  ): Promise<IFilePublic[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [files, userBasic] = await Promise.all([
      File.find({
        user: userObjectId,
        isTrashed: false,
      })
        .sort({ updatedAt: -1 })
        .limit(limit),
      this.getUserBasic(userId),
    ]);

    return files.map((file) => this.toFilePublic(file, userBasic));
  }

  async getAllUserFiles(userId: string): Promise<IFilePublic[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [files, user] = await Promise.all([
      File.find({
        user: userObjectId,
        isTrashed: false,
      }).sort({ name: 1 }),
      User.findById(userObjectId).select("name email avatar"),
    ]);

    const userBasic = {
      id: userId,
      name: user?.name || "",
      email: user?.email || "",
      avatar: {
        thumbnail: user?.avatar?.thumbnail || "",
      },
    };

    return files.map((file) => this.toFilePublic(file, userBasic));
  }
}
