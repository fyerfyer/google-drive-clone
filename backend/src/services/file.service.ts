import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import File, { IFile } from "../models/File.model";
import Folder from "../models/Folder.model";
import mongoose from "mongoose";
import { minioClient } from "../config/minio";
import { uploadObject } from "../utils/minio.util";
import User from "../models/User.model";

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

    // 检查用户配额（用户已通过 auth middleware 验证存在）
    const user = await User.findById(userObjectId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }

    if (!user.checkStorageQuota(fileSize)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Storage quota exceeded. Cannot upload file."
      );
    }

    const folderExists = await Folder.exists({ _id: folderObjectId });
    if (!folderExists) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    const folder = await Folder.findOne({
      _id: folderObjectId,
      user: userObjectId,
    });
    if (!folder) {
      throw new AppError(StatusCodes.FORBIDDEN, "Access denied to folder");
    }

    // 创建文件上传事务
    const session = await mongoose.startSession();
    session.startTransaction();

    let objectKey: string | null = null;
    let isNewUpload = false;
    try {
      const existingFile = await File.findOne({ hash: hash }).select("+key");
      if (existingFile) {
        objectKey = existingFile.key;
        console.log(
          `Deduplication hit for hash ${hash}, reusing key ${objectKey}`
        );
      } else {
        objectKey = await uploadObject("file", fileBuffer, fileSize, mimeType);
        isNewUpload = true;
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

      await newFile.save({ session });

      // 更新用户存储使用
      // 使用事务内原子更新
      await User.updateOne(
        { _id: userId },
        { $inc: { storageUsage: fileSize } },
        { session }
      );

      await session.commitTransaction();
      return newFile;
    } catch (error) {
      await session.abortTransaction();
      if (isNewUpload && objectKey) {
        console.log(
          "Transaction aborted, cleaning up MinIO object: ",
          objectKey
        );
        await minioClient.removeObject("file", objectKey).catch(console.error);
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
      console.error("Error deleting file permanently:", error);
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
      console.log(
        `No references left for key ${key} (hash: ${hash}), deleting from MinIO...`
      );
      await minioClient.removeObject("file", key).catch(console.error);
    } else {
      console.log(
        `Key ${key} is still referenced by ${count} files. Keeping it.`
      );
    }
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
}
