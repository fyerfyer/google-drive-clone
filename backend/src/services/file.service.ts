import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import mongoose from "mongoose";
import { minioClient } from "../config/minio";
import { uploadObject, getPresignedUrl } from "../utils/minio.util";
import User from "../models/User.model";
import { logger } from "../lib/logger";

interface FileUploadDTO {
  userId: string;
  folderId: string;
  fileBuffer: Buffer;
  fileSize: number;
  mimeType: string;
  originalName: string;
  hash: string;
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

// 用户基础信息（用于所有者和共享者）
interface IUserBasic {
  id: string;
  name: string;
  email: string;
  avatar: {
    thumbnail: string;
  };
}

// 共享信息
interface IShareInfo {
  user: IUserBasic;
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
  user: IUserBasic;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;
  isPublic: boolean;
  sharedWith: IShareInfo[];
  createdAt: Date;
  updatedAt: Date;
}

export class FileService {
  async uploadFile(data: FileUploadDTO): Promise<IFilePublic> {
    const {
      userId,
      folderId,
      fileBuffer,
      fileSize,
      mimeType,
      originalName,
      hash,
    } = data;

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

    logger.debug({ userId, folderId, fileSize, hash }, "Starting file upload");

    // 检查用户配额（用户已通过 auth middleware 验证存在）
    const user = await User.findById(userObjectId);
    if (!user) {
      logger.error({ userId }, "User not found");
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }
    logger.debug(
      {
        userId,
        storageUsage: user.storageUsage,
        storageQuota: user.storageQuota,
      },
      "User found"
    );

    if (!user.checkStorageQuota(fileSize)) {
      logger.warn(
        {
          userId,
          fileSize,
          storageUsage: user.storageUsage,
          storageQuota: user.storageQuota,
        },
        "Storage quota exceeded"
      );
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Storage quota exceeded. Cannot upload file."
      );
    }

    const folderExists = await Folder.exists({ _id: folderObjectId });
    if (!folderExists) {
      logger.error({ folderId }, "Folder not found");
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }
    logger.debug({ folderId }, "Folder exists");

    const folder = await Folder.findOne({
      _id: folderObjectId,
      user: userObjectId,
    });
    if (!folder) {
      logger.error({ folderId, userId }, "Access denied to folder");
      throw new AppError(StatusCodes.FORBIDDEN, "Access denied to folder");
    }
    logger.debug(
      { folderId, userId, folderName: folder.name },
      "Folder access verified"
    );

    // 创建文件上传事务
    const session = await mongoose.startSession();
    session.startTransaction();
    logger.debug("Transaction started");

    let objectKey: string | null = null;
    let isNewUpload = false;
    try {
      const existingFile = await File.findOne({ hash: hash }).select("+key");
      if (existingFile) {
        objectKey = existingFile.key;
        logger.info(
          { hash, objectKey, userId },
          "File deduplication: reusing existing object key"
        );
      } else {
        logger.debug(
          { hash, fileSize, mimeType },
          "Uploading new object to MinIO"
        );
        objectKey = await uploadObject("file", fileBuffer, fileSize, mimeType);
        isNewUpload = true;
        logger.debug(
          { objectKey, hash },
          "Object uploaded to MinIO successfully"
        );
      }

      const newFile = new File({
        name: originalName,
        originalName: originalName,
        extension: originalName.split(".").pop(),
        mimeType: mimeType,
        size: fileSize,
        key: objectKey,
        hash: hash,
        user: userObjectId,
        folder: folderObjectId,
        isStarred: false,
        isTrashed: false,
      });

      logger.debug(
        { fileId: newFile._id, hash, objectKey },
        "Saving file document"
      );
      await newFile.save({ session });
      logger.debug({ fileId: newFile._id }, "File document saved");

      // 更新用户存储使用
      // 使用事务内原子更新
      logger.debug({ userId, fileSize }, "Updating user storage usage");
      await User.updateOne(
        { _id: userId },
        { $inc: { storageUsage: fileSize } },
        { session }
      );
      logger.debug({ userId }, "User storage usage updated");

      logger.debug("Committing transaction");
      await session.commitTransaction();
      logger.info(
        { fileId: newFile._id, hash, objectKey, userId },
        "File uploaded successfully"
      );

      return {
        id: newFile.id,
        name: newFile.name,
        originalName: newFile.originalName,
        extension: newFile.extension,
        mimeType: newFile.mimeType,
        size: newFile.size,
        folder: String(newFile.folder),
        user: {
          id: userId,
          name: user.name,
          email: user.email,
          avatar: {
            thumbnail: user.avatar?.thumbnail || "",
          },
        },
        isStarred: newFile.isStarred,
        isTrashed: newFile.isTrashed,
        trashedAt: newFile.trashedAt,
        isPublic: newFile.isPublic,
        sharedWith: [],
        createdAt: newFile.createdAt,
        updatedAt: newFile.updatedAt,
      };
    } catch (error) {
      await session.abortTransaction();

      console.error("File upload error details:", error);
      logger.error(
        { error, userId, folderId, hash, fileSize },
        "Failed to upload file - detailed error"
      );

      if (isNewUpload && objectKey) {
        logger.warn(
          { objectKey, userId, error },
          "Transaction aborted, cleaning up MinIO object"
        );
        await minioClient.removeObject("file", objectKey).catch((err) => {
          logger.error({ err, objectKey }, "Failed to cleanup MinIO object");
        });
      }

      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to create file"
      );
    } finally {
      await session.endSession();
    }
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
      await minioClient.removeObject("file", key).catch((err) => {
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
    const presignedUrl = await getPresignedUrl(
      "file",
      file.key,
      file.originalName,
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
    const stream = await minioClient.getObject("file", file.key);

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
