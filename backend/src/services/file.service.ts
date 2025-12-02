import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import File, { IFile } from "../models/File.model";
import Folder from "../models/Folder.model";
import mongoose from "mongoose";
import { minioClient } from "../config/minio";
import { uploadObject } from "../utils/minio.util";
import User from "../models/User.model";
import { logger } from "../lib/logger";
import { log } from "console";

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

export class FileService {
  async uploadFile(data: FileUploadDTO): Promise<IFile> {
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
      return newFile;
    } catch (error) {
      await session.abortTransaction();

      // 记录详细的错误信息用于调试
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

    // 在事务提交后清理MinIO对象（需要查询最新的引用计数）
    await this.cleanupMinioObject(fileToDelete.key, fileToDelete.hash);
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

  async getDownloadLink(data: DownloadLinkDTO) {
    const fileObjectId = new mongoose.Types.ObjectId(data.fileId);
    const userObjectId = new mongoose.Types.ObjectId(data.userId);

    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName");

    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const stream = await minioClient.getObject("file", file.key);
    return {
      stream,
      mimeType: file.mimeType,
      fileName: file.originalName,
    };
  }

  async starFile(fileId: string, userId: string, star: boolean = true) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
    });

    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    file.isStarred = star;
    await file.save();

    logger.info({ fileId, userId, star }, "File star status updated");
  }
}
