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
import { PermissionService } from "./permission.service";
import { buildShortcutFileOverrides } from "../utils/shortcut.util";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { generateOnlyOfficeToken } from "../utils/jwt.util";
import {
  revokeSharedAccessAndNotify,
  cascadeTrashShortcuts,
  cascadeRestoreShortcuts,
  cascadeDeleteShortcuts,
} from "../utils/cascade.util";

interface CreateFileRecordDTO {
  userId: string;
  folderId: string;
  key: string;
  fileSize: number;
  mimeType: string;
  originalName: string;
  hash?: string;
}

interface CreateBlankFileDTO {
  userId: string;
  folderId: string;
  fileName: string;
  content?: string;
}

interface UpdateFileContentDTO {
  userId: string;
  fileId: string;
  content: string;
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
  folder: string | null;
  user: IUserBasic;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  isShared?: boolean;
  sharedUsers?: IUserBasic[];
}

export class FileService {
  constructor(private permissionService: PermissionService) {}

  // 如果因同名冲突失败，则自动重试并生成唯一名称
  private async createFileWithUniqueName(
    doc: Record<string, unknown>,
  ): Promise<IFile> {
    const baseName = doc.name as string;
    let name = baseName;
    const MAX = 50;

    for (let attempt = 0; attempt < MAX; attempt++) {
      try {
        return await File.create({ ...doc, name });
      } catch (err: unknown) {
        const mongoErr = err as { code?: number; message?: string };
        if (
          mongoErr.code === 11000 &&
          mongoErr.message?.includes("user_1_folder_1_name_1")
        ) {
          const dotIdx = baseName.lastIndexOf(".");
          const stem = dotIdx > 0 ? baseName.substring(0, dotIdx) : baseName;
          const ext = dotIdx > 0 ? baseName.substring(dotIdx) : "";
          name = `${stem} (${attempt + 1})${ext}`;
          continue;
        }
        throw err;
      }
    }
    throw new AppError(
      StatusCodes.CONFLICT,
      "Unable to generate unique file name",
    );
  }

  private async resolveFileForRead(file: IFile): Promise<IFile> {
    if (
      !file.isShortcut ||
      !file.shortcutTarget ||
      file.shortcutTarget.targetType !== "File"
    ) {
      return file;
    }

    const targetFile = await File.findOne({
      _id: file.shortcutTarget.targetId,
      isTrashed: false,
    }).select("+key mimeType originalName size user");

    if (!targetFile) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "Shortcut target file not found",
      );
    }

    return targetFile;
  }

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

  private toFilePublic(
    file: IFile,
    userBasic: IUserBasic,
    override?: Partial<IFilePublic>,
  ): IFilePublic {
    return {
      id: file.id,
      name: file.name,
      originalName: override?.originalName ?? file.originalName,
      extension: override?.extension ?? file.extension,
      mimeType: override?.mimeType ?? file.mimeType,
      size: override?.size ?? file.size,
      folder: file.folder ? file.folder.toString() : null,
      user: userBasic,
      isStarred: file.isStarred,
      isTrashed: file.isTrashed,
      trashedAt: file.trashedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      ...(override?.isShared !== undefined && { isShared: override.isShared }),
      ...(override?.sharedUsers && { sharedUsers: override.sharedUsers }),
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
    let file;
    try {
      file = await this.createFileWithUniqueName({
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
    } catch (err) {
      // 回滚用户配额
      await User.updateOne(
        { _id: userObjectId },
        { $inc: { storageUsage: -fileSize } },
      ).catch((rollbackErr) => {
        logger.error(
          { rollbackErr, userId, key, fileSize },
          "Failed to rollback storageUsage after File.create failure",
        );
      });
      throw err;
    }

    const userBasic = await this.getUserBasic(userId);

    return this.toFilePublic(file, userBasic);
  }

  async createBlankFile(data: CreateBlankFileDTO): Promise<IFilePublic> {
    const { userId, folderId, fileName, content = "" } = data;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Determine mime type from file name
    const extension = fileName.split(".").pop()?.toLowerCase() || "txt";
    const mimeTypeMap: Record<string, string> = {
      txt: "text/plain",
      md: "text/markdown",
      markdown: "text/markdown",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      ts: "application/typescript",
      json: "application/json",
      xml: "application/xml",
      csv: "text/csv",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const mimeType =
      mimeTypeMap[extension] || mimeTypes.lookup(fileName) || "text/plain";

    const isRoot = folderId === "root";
    const folderObjectId = isRoot
      ? null
      : new mongoose.Types.ObjectId(folderId);

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

    const key = `files/${userId}/${Date.now()}-${fileName}`;

    const contentBuffer = Buffer.from(content, "utf-8");
    await StorageService.putObject(
      BUCKETS.FILES,
      key,
      contentBuffer,
      contentBuffer.length,
      mimeType,
    );

    // 更新用户配额
    const updateUser = await User.findOneAndUpdate(
      {
        _id: userObjectId,
        $expr: {
          $lte: [
            { $add: ["$storageUsage", contentBuffer.length] },
            "$storageQuota",
          ],
        },
      },
      { $inc: { storageUsage: contentBuffer.length } },
      { new: true },
    );

    if (!updateUser) {
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

    const file = await File.create({
      user: userObjectId,
      folder: folderObjectId,
      ancestors,
      key,
      size: contentBuffer.length,
      mimeType,
      originalName: fileName,
      name: fileName,
      extension: mimeTypes.extension(mimeType) || extension,
      isStarred: false,
      isTrashed: false,
    });

    const userBasic = await this.getUserBasic(userId);
    logger.info(
      { fileId: file.id, fileName, userId },
      "Blank file created successfully",
    );

    return this.toFilePublic(file, userBasic);
  }

  async getFileById(fileId: string, userId: string): Promise<IFilePublic> {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);

    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select(
      "+key name originalName extension mimeType size folder user isStarred isTrashed trashedAt isShortcut shortcutTarget createdAt updatedAt",
    );

    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const targetFile = await this.resolveFileForRead(file);
    const userBasic = await this.getUserBasic(targetFile.user.toString());

    return this.toFilePublic(targetFile, userBasic);
  }

  async getFileContent(data: {
    userId: string;
    fileId: string;
  }): Promise<{ content: string; file: IFilePublic }> {
    const fileObjectId = new mongoose.Types.ObjectId(data.fileId);

    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select(
      "+key name originalName extension mimeType size folder user isStarred isTrashed trashedAt isShortcut shortcutTarget createdAt updatedAt",
    );

    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const targetFile = await this.resolveFileForRead(file);

    const MAX_TEXT_SIZE = 10 * 1024 * 1024;
    if (targetFile.size > MAX_TEXT_SIZE) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Failed to record file view");
    }

    const stream = await StorageService.getObjectStream(
      BUCKETS.FILES,
      targetFile.key,
    );

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf-8");

    const userBasic = await this.getUserBasic(targetFile.user.toString());

    return {
      content,
      file: this.toFilePublic(targetFile, userBasic),
    };
  }

  async updateFileContent(data: UpdateFileContentDTO): Promise<IFilePublic> {
    const { userId, fileId, content } = data;
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: false,
    }).select(
      "+key name originalName extension mimeType size folder user isStarred isTrashed trashedAt createdAt updatedAt",
    );

    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const oldSize = file.size;
    const newBuffer = Buffer.from(content, "utf-8");
    const newSize = newBuffer.length;
    const sizeDiff = newSize - oldSize;

    if (sizeDiff > 0) {
      const updateUser = await User.findOneAndUpdate(
        {
          _id: userObjectId,
          $expr: {
            $lte: [{ $add: ["$storageUsage", sizeDiff] }, "$storageQuota"],
          },
        },
        { $inc: { storageUsage: sizeDiff } },
        { new: true },
      );

      if (!updateUser) {
        throw new AppError(StatusCodes.BAD_REQUEST, "Storage quota exceeded");
      }
    } else if (sizeDiff < 0) {
      await User.updateOne(
        { _id: userObjectId },
        { $inc: { storageUsage: sizeDiff } },
      );
    }

    await StorageService.putObject(
      BUCKETS.FILES,
      file.key,
      newBuffer,
      newSize,
      file.mimeType,
    );

    file.size = newSize;
    await file.save();

    const userBasic = await this.getUserBasic(userId);
    logger.info(
      { fileId, userId, oldSize, newSize },
      "File content updated successfully",
    );

    return this.toFilePublic(file, userBasic);
  }

  async trashFile(fileId: string, userId: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
    }).select("name isTrashed folder ancestors");

    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    if (!file.isTrashed) {
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

    this.runAsyncCascadeTrash([fileObjectId], userId);
  }

  async restoreFile(fileId: string, userId: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const file = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
    });
    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    // 如果文件在文件夹中，检查该文件夹是否也被 trashed
    // 如果是，恢复到根目录以避免“僵尸”状态
    let targetFolder: mongoose.Types.ObjectId | null = file.folder;
    let targetAncestors: mongoose.Types.ObjectId[] = file.ancestors;

    if (file.folder) {
      const parentFolder = await Folder.findById(file.folder);
      if (!parentFolder || parentFolder.isTrashed) {
        // 父文件夹已删除或被 trashed：恢复到根目录
        targetFolder = null;
        targetAncestors = [];
        logger.info(
          { fileId, parentFolderId: file.folder.toString() },
          "Restoring file to root because parent folder is trashed",
        );
      }
    }

    const result = await File.updateOne(
      {
        _id: fileObjectId,
        user: userObjectId,
      },
      {
        isTrashed: false,
        trashedAt: null,
        folder: targetFolder,
        ancestors: targetAncestors,
      },
    );

    if (result.matchedCount === 0) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    // 异步恢复指向该文件的快捷方式
    this.runAsyncCascadeRestore([fileObjectId]);
  }

  async deleteFilePermanent(fileId: string, userId: string) {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const fileToDelete = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: true,
    }).select("+key +hash name folder ancestors size");

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

      // 在这里 commit Tx，不阻塞之后的操作
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

    this.runAsyncCascadeDelete([fileObjectId], userId);

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

    // Handle "root" folder — move file to root directory
    const isRoot = targetFolderId === "root";
    const targetFolderObjectId = isRoot
      ? null
      : new mongoose.Types.ObjectId(targetFolderId);

    const fileToMove = await File.findOne({
      _id: fileObjectId,
      user: userObjectId,
      isTrashed: false,
    });

    if (!fileToMove) {
      logger.error({ fileId, userId }, "File not found");
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    if (isRoot) {
      if (!fileToMove.folder) {
        logger.info({ fileId }, "File is already in root");
        return;
      }
    } else {
      const targetFolder = await Folder.findOne({
        _id: targetFolderObjectId,
        user: userObjectId,
        isTrashed: false,
      });

      if (!targetFolder) {
        logger.error({ targetFolderId, userId }, "Target folder not found");
        throw new AppError(StatusCodes.NOT_FOUND, "Target folder not found");
      }

      if (fileToMove.folder?.equals(targetFolderObjectId!)) {
        logger.info(
          { fileId, targetFolderId },
          "File is already in the target folder",
        );
        return;
      }
    }

    // 更新文件夹与祖先路径
    fileToMove.folder = targetFolderObjectId;
    if (isRoot) {
      fileToMove.ancestors = [];
    } else {
      const targetFolder = await Folder.findOne({ _id: targetFolderObjectId });
      fileToMove.ancestors = [
        ...(targetFolder?.ancestors || []),
        targetFolderObjectId!,
      ];
    }
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

    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size user isShortcut shortcutTarget");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for download",
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const targetFile = await this.resolveFileForRead(file);

    // 检查是否有权限（快捷方式需校验目标文件权限）
    const isOwner = targetFile.user.toString() === data.userId;
    if (!isOwner) {
      const hasAccess = await this.permissionService.checkPermission({
        userId: data.userId,
        resourceId: targetFile._id.toString(),
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
      targetFile.key,
      expirySeconds,
      "attachment",
      targetFile.originalName,
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, expirySeconds },
      "Generated presigned download URL",
    );

    return {
      url: presignedUrl,
      fileName: targetFile.originalName,
      mimeType: targetFile.mimeType,
      size: targetFile.size,
      expiresIn: expirySeconds,
    };
  }

  async getPreviewUrl(data: PresignedUrlDTO) {
    const fileObjectId = new mongoose.Types.ObjectId(data.fileId);

    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size user isShortcut shortcutTarget");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for preview",
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const targetFile = await this.resolveFileForRead(file);

    // 检查是否有权限（快捷方式需校验目标文件权限）
    const isOwner = targetFile.user.toString() === data.userId;
    if (!isOwner) {
      const hasAccess = await this.permissionService.checkPermission({
        userId: data.userId,
        resourceId: targetFile._id.toString(),
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
      targetFile.key,
      expirySeconds,
      "inline",
      targetFile.originalName,
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, expirySeconds },
      "Generated presigned preview URL",
    );

    return {
      url: presignedUrl,
      fileName: targetFile.originalName,
      mimeType: targetFile.mimeType,
      size: targetFile.size,
      expiresIn: expirySeconds,
    };
  }

  async getPreviewStream(data: PreviewStreamDTO) {
    const fileObjectId = new mongoose.Types.ObjectId(data.fileId);

    const file = await File.findOne({
      _id: fileObjectId,
      isTrashed: false,
    }).select("+key mimeType originalName size user isShortcut shortcutTarget");

    if (!file) {
      logger.warn(
        { fileId: data.fileId, userId: data.userId },
        "File not found for preview",
      );
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    const targetFile = await this.resolveFileForRead(file);

    // 检查是否有权限（快捷方式需校验目标文件权限）
    const isOwner = targetFile.user.toString() === data.userId;
    if (!isOwner) {
      const hasAccess = await this.permissionService.checkPermission({
        userId: data.userId,
        resourceId: targetFile._id.toString(),
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
    if (targetFile.size > MAX_PREVIEW_SIZE) {
      logger.warn(
        {
          fileId: data.fileId,
          fileSize: targetFile.size,
          maxSize: MAX_PREVIEW_SIZE,
        },
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
      targetFile.key,
    );

    logger.info(
      { fileId: data.fileId, userId: data.userId, fileSize: targetFile.size },
      "Generated preview stream",
    );

    return {
      stream,
      mimeType: targetFile.mimeType,
      fileName: targetFile.originalName,
      size: targetFile.size,
      key: targetFile.key,
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

    const overrides = await buildShortcutFileOverrides(files);
    return files.map((file) =>
      this.toFilePublic(file, userBasic, overrides.get(file.id)),
    );
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

    const overrides = await buildShortcutFileOverrides(files);
    return files.map((file) =>
      this.toFilePublic(file, userBasic, overrides.get(file.id)),
    );
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

    const overrides = await buildShortcutFileOverrides(files);
    return files.map((file) =>
      this.toFilePublic(file, userBasic, overrides.get(file.id)),
    );
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

    const overrides = await buildShortcutFileOverrides(files);
    return files.map((file) =>
      this.toFilePublic(file, userBasic, overrides.get(file.id)),
    );
  }

  private getDocumentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return "word";
    if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "cell";
    if (["ppt", "pptx", "odp"].includes(ext)) return "slide";
    return "word";
  }

  private getFileType(filename: string): string {
    return filename.split(".").pop()?.toLowerCase() || "docx";
  }

  async getOnlyOfficeConfig(data: {
    userId: string;
    userEmail: string;
    fileId: string;
  }): Promise<{
    url: string;
    config: any;
    token?: string;
  }> {
    const { userId, userEmail, fileId } = data;

    const file = await this.getFileById(fileId, userId);
    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }

    // 生成用于访问的临时 token
    const officeToken = jwt.sign(
      {
        id: userId,
        email: userEmail,
        fileId,
        purpose: "office-content",
      },
      config.jwtSecret,
      { expiresIn: "15m" },
    );

    // 通过参数传递 token
    const officeContentUrl = `${config.officeCallbackUrl}/api/files/${fileId}/office-content?token=${officeToken}`;

    // 生成回调 token（较长有效期，编辑期间需持续有效）
    const callbackToken = jwt.sign(
      {
        id: userId,
        email: userEmail,
        fileId,
        purpose: "office-callback",
      },
      config.jwtSecret,
      { expiresIn: "24h" },
    );

    const callbackUrl = `${config.officeCallbackUrl}/api/files/${fileId}/office-callback?token=${callbackToken}`;

    const documentConfig = {
      document: {
        fileType: this.getFileType(file.name),
        key: `${fileId}_${file.updatedAt.getTime()}`, // 只在更新时变化的 key
        title: file.name,
        url: officeContentUrl,
        permissions: {
          comment: true,
          copy: true,
          download: true,
          edit: true,
          fillForms: true,
          modifyContentControl: true,
          modifyFilter: true,
          print: true,
          review: true,
        },
      },
      documentType: this.getDocumentType(file.name),
      editorConfig: {
        callbackUrl,
        user: {
          id: userId,
          name: userEmail,
        },
        customization: {
          autosave: true,
          forcesave: true,
        },
      },
    };

    const response: any = {
      url: officeContentUrl,
      config: documentConfig,
    };

    if (config.onlyofficeJwtEnabled) {
      const onlyofficeToken = generateOnlyOfficeToken(documentConfig);
      response.token = onlyofficeToken;
    }

    logger.info(
      { fileId, userId, fileName: file.name },
      "Generated OnlyOffice configuration",
    );

    return response;
  }

  verifyOfficeContentToken(token: string): {
    id: string;
    email: string;
    fileId: string;
    purpose: string;
  } {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as {
        id: string;
        email: string;
        fileId: string;
        purpose: string;
      };
      return payload;
    } catch {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid or expired token");
    }
  }

  // OnlyOffice 回调处理，响应 Save 等请求
  async handleOnlyOfficeCallback(data: {
    fileId: string;
    userId: string;
    callbackBody: {
      status: number;
      url?: string;
      key?: string;
      users?: string[];
      actions?: Array<{ type: number; userid: string }>;
      forcesavetype?: number;
      userdata?: string;
    };
  }): Promise<{ error: number }> {
    const { fileId, userId, callbackBody } = data;
    const { status, url } = callbackBody;

    logger.info(
      {
        fileId,
        userId,
        status,
        url: url ? "[present]" : "[absent]",
        key: callbackBody.key,
      },
      "OnlyOffice callback received",
    );

    // status 2 = 准备保存（编辑器关闭后），status 6 = 强制保存（Ctrl+S）
    if ((status === 2 || status === 6) && url) {
      try {
        // 从 OnlyOffice Document Server 下载修改后的文档
        // OnlyOffice 返回的 URL 可能包含 localhost，需要在 Docker 环境中转换为容器名
        let downloadUrl = url;

        // 在 Docker 环境中，将 localhost 替换为 OnlyOffice 容器名
        // 处理各种可能的格式：localhost, localhost:80, localhost:8080, 127.0.0.1
        if (downloadUrl.includes("://localhost:8080")) {
          // 宿主机8080映射到容器内部80
          downloadUrl = downloadUrl.replace(
            "://localhost:8080",
            "://gdrive-onlyoffice",
          );
          logger.info(
            { originalUrl: url, convertedUrl: downloadUrl },
            "Converted localhost:8080 URL for Docker network",
          );
        } else if (downloadUrl.includes("://localhost:80")) {
          downloadUrl = downloadUrl.replace(
            "://localhost:80",
            "://gdrive-onlyoffice",
          );
          logger.info(
            { originalUrl: url, convertedUrl: downloadUrl },
            "Converted localhost:80 URL for Docker network",
          );
        } else if (downloadUrl.includes("://localhost")) {
          downloadUrl = downloadUrl.replace(
            "://localhost",
            "://gdrive-onlyoffice",
          );
          logger.info(
            { originalUrl: url, convertedUrl: downloadUrl },
            "Converted localhost URL for Docker network",
          );
        } else if (downloadUrl.includes("://127.0.0.1")) {
          downloadUrl = downloadUrl.replace(
            "://127.0.0.1",
            "://gdrive-onlyoffice",
          );
          logger.info(
            { originalUrl: url, convertedUrl: downloadUrl },
            "Converted 127.0.0.1 URL for Docker network",
          );
        }

        logger.info(
          { fileId, downloadUrl },
          "Downloading document from OnlyOffice",
        );

        const response = await fetch(downloadUrl);
        if (!response.ok) {
          logger.error(
            {
              fileId,
              downloadUrl,
              status: response.status,
              statusText: response.statusText,
            },
            "Failed to download document from OnlyOffice",
          );
          return { error: 1 };
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const newSize = buffer.length;

        // 获取文件信息
        const fileObjectId = new mongoose.Types.ObjectId(fileId);
        const file = await File.findById(fileObjectId).select(
          "+key name mimeType size user",
        );

        if (!file) {
          logger.error({ fileId }, "File not found for OnlyOffice callback");
          return { error: 1 };
        }

        const oldSize = file.size;
        const sizeDiff = newSize - oldSize;

        // 更新存储配额
        if (sizeDiff > 0) {
          const updateUser = await User.findOneAndUpdate(
            {
              _id: file.user,
              $expr: {
                $lte: [{ $add: ["$storageUsage", sizeDiff] }, "$storageQuota"],
              },
            },
            { $inc: { storageUsage: sizeDiff } },
            { new: true },
          );

          if (!updateUser) {
            logger.warn(
              { fileId, userId, sizeDiff },
              "Storage quota exceeded during OnlyOffice save",
            );
            return { error: 1 };
          }
        } else if (sizeDiff < 0) {
          await User.updateOne(
            { _id: file.user },
            { $inc: { storageUsage: sizeDiff } },
          );
        }

        // 上传到 MinIO
        await StorageService.putObject(
          BUCKETS.FILES,
          file.key,
          buffer,
          newSize,
          file.mimeType,
        );

        // 更新文件大小
        file.size = newSize;
        await file.save();

        logger.info(
          { fileId, userId, oldSize, newSize },
          "OnlyOffice document saved successfully",
        );

        return { error: 0 };
      } catch (err) {
        logger.error(
          {
            fileId,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            url: callbackBody.url,
          },
          "Error processing OnlyOffice callback",
        );
        return { error: 1 };
      }
    }

    // 其他 status 直接返回成功
    return { error: 0 };
  }

  // 秒传检查：通过 hash 判断用户是否已有相同文件
  // 如果存在，直接在 DB 创建新记录并指向已有 MinIO key，无需重新上传
  async checkFileByHash(data: {
    userId: string;
    hash: string;
    folderId: string;
    originalName: string;
    mimeType: string;
    size: number;
  }): Promise<{ exists: boolean; file?: IFilePublic }> {
    const { userId, hash, folderId, originalName, mimeType, size } = data;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 查找该用户或任何用户中具有相同 hash 的文件（共享 key 节省存储）
    const existingFile = await File.findOne({
      hash,
      isTrashed: false,
    }).select("+key +hash size mimeType originalName user");

    if (!existingFile) {
      return { exists: false };
    }

    // 找到后，创建新记录并指向已有 MinIO key，无需重新上传
    const isRoot = folderId === "root";
    const folderObjectId = isRoot
      ? null
      : new mongoose.Types.ObjectId(folderId);

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

    // 更新用户配额
    const updateUser = await User.findOneAndUpdate(
      {
        _id: userObjectId,
        $expr: {
          $lte: [{ $add: ["$storageUsage", size] }, "$storageQuota"],
        },
      },
      { $inc: { storageUsage: size } },
      { new: true },
    );

    if (!updateUser) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Storage quota exceeded or user not found",
      );
    }

    const ext = mimeTypes.extension(mimeType) || "";

    let newFile;
    try {
      newFile = await this.createFileWithUniqueName({
        user: userObjectId,
        folder: folderObjectId,
        ancestors,
        key: existingFile.key, // 复用 MinIO key
        size,
        mimeType,
        originalName,
        name: originalName,
        extension: ext,
        hash,
        isStarred: false,
        isTrashed: false,
      });
    } catch (err) {
      // 创建文件记录失败，回滚用户配额
      await User.updateOne(
        { _id: userObjectId },
        { $inc: { storageUsage: -size } },
      ).catch((rollbackErr) => {
        logger.error(
          { rollbackErr, userId, size },
          "Failed to rollback storageUsage after dedup File.create failure",
        );
      });
      throw err;
    }

    const userBasic = await this.getUserBasic(userId);

    logger.info(
      { fileId: newFile.id, originalName, hash, userId },
      "Instant upload (dedup) — reused existing MinIO key",
    );

    return { exists: true, file: this.toFilePublic(newFile, userBasic) };
  }

  private async runAsyncCascadeTrash(
    fileIds: mongoose.Types.ObjectId[],
    userId: string,
  ): Promise<void> {
    try {
      if (fileIds.length > 0) {
        await cascadeTrashShortcuts(fileIds, "File");
        await revokeSharedAccessAndNotify(fileIds, "File", userId);
      }
    } catch (err) {
      logger.error(
        { err, fileIds, userId },
        "Background cascade trash failed for file operation",
      );
    }
  }

  private async runAsyncCascadeRestore(
    fileIds: mongoose.Types.ObjectId[],
  ): Promise<void> {
    try {
      if (fileIds.length > 0) {
        await cascadeRestoreShortcuts(fileIds, "File");
      }
    } catch (err) {
      logger.error(
        { err, fileIds },
        "Background cascade restore failed for file operation",
      );
    }
  }

  private async runAsyncCascadeDelete(
    fileIds: mongoose.Types.ObjectId[],
    userId: string,
  ): Promise<void> {
    try {
      if (fileIds.length > 0) {
        await cascadeDeleteShortcuts(fileIds, "File");
        await revokeSharedAccessAndNotify(fileIds, "File", userId);
      }
    } catch (err) {
      logger.error(
        { err, fileIds, userId },
        "Background cascade delete failed for file operation",
      );
    }
  }
}
