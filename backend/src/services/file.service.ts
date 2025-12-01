import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import File, { IFile } from "../models/File.model";
import Folder from "../models/Folder.model";
import mongoose from "mongoose";
import { minioClient } from "../config/minio";
import { uploadObject } from "../utils/minio.util";

interface FileUploadDTO {
  userId: string;
  folderId: string;
  fileBuffer: Buffer;
  fileSize: number;
  mimeType: string;
  originalName: string;
}

interface DownloadLinkDTO {
  userId: string;
  fileId: string;
}

export class FileService {
  async uploadFile(data: FileUploadDTO): Promise<IFile> {
    const { userId, folderId, fileBuffer, fileSize, mimeType, originalName } =
      data;

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

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
    try {
      objectKey = await uploadObject("file", fileBuffer, fileSize, mimeType);
      const newFile = new File({
        name: originalName,
        originalName: originalName,
        extension: originalName.split(".").pop(),
        mimeType: mimeType,
        size: fileSize,
        key: objectKey,
        user: userObjectId,
        folder: folderObjectId,
        isStarred: false,
        isTrashed: false,
      });

      await newFile.save({ session });
      await session.commitTransaction();
      return newFile;
    } catch (error) {
      await session.abortTransaction();
      if (objectKey) {
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
