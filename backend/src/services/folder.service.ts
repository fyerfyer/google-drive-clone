import mongoose from "mongoose";
import Folder, { IFolder } from "../models/Folder.model";
import File, { IFile } from "../models/File.model";
import User from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { SharedAccess } from "../models/SharedAccess.model";
import { StorageService } from "./storage.service";
import { BUCKETS } from "../config/s3";
import { logger } from "../lib/logger";
import { EMBEDDING_STATUS } from "../types/model.types";
import {
  revokeSharedAccessAndNotify,
  cascadeTrashShortcuts,
  cascadeRestoreShortcuts,
  cascadeDeleteShortcuts,
} from "../utils/cascade.util";
import { IFilePublic } from "./file.service";
import {
  buildShortcutFileOverrides,
  buildShortcutFolderOverrides,
} from "../utils/shortcut.util";
import archiver from "archiver";
import { Response } from "express";

interface CreateFolderDTO {
  userId: string;
  name: string;
  parentId: string;
}

interface MoveFolderDTO {
  folderId: string;
  destinationId: string;
  userId: string;
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

// 返回给前端的脱敏文件夹信息
export interface IFolderPublic {
  id: string;
  name: string;
  parent: string | null;
  user: IUserBasic;
  color: string;
  description?: string;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  isShared?: boolean;
  sharedUsers?: IUserBasic[];
}

// 面包屑项
export interface IBreadcrumbItem {
  id: string;
  name: string;
  user?: IUserBasic;
}

export interface IFolderContent {
  currentFolder: IFolderPublic;
  breadcrumbs: IBreadcrumbItem[];
  folders: IFolderPublic[];
  files: IFilePublic[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export class FolderService {
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

  private toFolderPublic(
    folder: IFolder,
    userBasic: IUserBasic,
    override?: Partial<IFolderPublic>,
  ): IFolderPublic {
    return {
      id: folder.id,
      name: override?.name ?? folder.name,
      parent: folder.parent ? folder.parent.toString() : null,
      user: userBasic,
      color: override?.color ?? folder.color,
      description: override?.description ?? folder.description,
      isStarred: folder.isStarred,
      isTrashed: folder.isTrashed,
      trashedAt: folder.trashedAt,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,

      // 分享状态
      ...(override?.isShared !== undefined && { isShared: override.isShared }),
      ...(override?.sharedUsers && { sharedUsers: override.sharedUsers }),
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
      // Embedding
      embeddingStatus: file.embeddingStatus || EMBEDDING_STATUS.NONE,
      embeddingError: file.embeddingError || undefined,
      processedChunks: file.processedChunks || 0,
      totalChunks: file.totalChunks || 0,
    };
  }

  async createFolder(data: CreateFolderDTO): Promise<IFolderPublic> {
    let ancestors: mongoose.Types.ObjectId[] = [];
    let parentId: mongoose.Types.ObjectId | null = null;

    if (data.parentId && data.parentId !== "root") {
      parentId = new mongoose.Types.ObjectId(data.parentId);
      const parentFolder = await Folder.findOne({
        _id: parentId,
        user: data.userId,
      });

      if (!parentFolder) {
        throw new AppError(StatusCodes.NOT_FOUND, "Parent folder not found");
      }

      ancestors = [...parentFolder.ancestors, parentId];
    }

    const userObjectId = new mongoose.Types.ObjectId(data.userId);
    const folder = await Folder.create({
      name: data.name,
      user: userObjectId,
      parent: parentId,
      ancestors: ancestors,
      isTrashed: false,
      isStarred: false,
    });

    // 获取用户信息
    const userBasic = await this.getUserBasic(data.userId);
    return this.toFolderPublic(folder, userBasic);
  }

  async trashFolder(folderId: string, userId: string) {
    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // 标记自己的 isTrashed
      await Folder.updateOne(
        { _id: folderObjectId, user: userObjectId },
        { isTrashed: true, trashedAt: new Date() },
        { session },
      );

      // 标记子文件夹
      const allFoldersIds = await Folder.find({
        ancestors: { $in: folderObjectId },
        user: userObjectId,
      })
        .distinct("_id")
        .session(session);

      await Folder.updateMany(
        { _id: { $in: allFoldersIds } },
        { isTrashed: true, trashedAt: new Date() },
        { session },
      );

      // 获取要删除的文件IDs
      const fileIds = await File.find({
        folder: { $in: [folderObjectId, ...allFoldersIds] },
        user: userObjectId,
      })
        .distinct("_id")
        .session(session);

      // 标记文件夹内的所有文件
      await File.updateMany(
        {
          folder: { $in: [folderObjectId, ...allFoldersIds] },
          user: userObjectId,
        },
        { isTrashed: true, trashedAt: new Date() },
        { session },
      );

      await session.commitTransaction();

      // 级联删除快捷方式和通知
      const allFolderIds = [folderObjectId, ...allFoldersIds];
      this.runAsyncCascadeTrash(allFolderIds, fileIds, userId);
    } catch (error) {
      logger.error({ err: error, folderId, userId }, "Failed to trash folder");
      await session.abortTransaction();
      if (error instanceof AppError) throw error;
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to trash folder",
      );
    } finally {
      session.endSession();
    }
  }

  async restoreFolder(folderId: string, userId: string) {
    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const folder = await Folder.findOne({
        _id: folderObjectId,
        user: userObjectId,
      }).session(session);

      if (!folder) {
        throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
      }

      // 检查父文件夹是否仍然被删除或不存在）
      // 如果是，则恢复到根目录以防止孤儿状态
      let targetParent: mongoose.Types.ObjectId | null = folder.parent || null;
      let targetAncestors: mongoose.Types.ObjectId[] = folder.ancestors || [];

      if (folder.parent) {
        const parentFolder = await Folder.findById(folder.parent).session(
          session,
        );
        if (!parentFolder || parentFolder.isTrashed) {
          targetParent = null;
          targetAncestors = [];
          logger.info(
            { folderId, parentFolderId: folder.parent.toString() },
            "Restoring folder to root because parent folder is trashed",
          );
        }
      }

      // 标记自己的 isTrashed，并修正 parent/ancestors
      await Folder.updateOne(
        { _id: folderObjectId, user: userObjectId },
        {
          isTrashed: false,
          trashedAt: null,
          parent: targetParent,
          ancestors: targetAncestors,
        },
        { session },
      );

      // 标记子文件夹
      const allFoldersIds = await Folder.find({
        ancestors: { $in: folderObjectId },
        user: userObjectId,
      })
        .distinct("_id")
        .session(session);

      await Folder.updateMany(
        { _id: { $in: allFoldersIds } },
        { isTrashed: false, trashedAt: null },
        { session },
      );

      const fileIds = await File.find({
        folder: { $in: [folderObjectId, ...allFoldersIds] },
        user: userObjectId,
      })
        .distinct("_id")
        .session(session);

      // 恢复文件夹内的所有文件
      await File.updateMany(
        {
          folder: { $in: [folderObjectId, ...allFoldersIds] },
          user: userObjectId,
        },
        { isTrashed: false, trashedAt: null },
        { session },
      );

      await session.commitTransaction();

      // 异步处理快捷方式
      const allFolderIds = [folderObjectId, ...allFoldersIds];
      this.runAsyncCascadeRestore(allFolderIds, fileIds);
    } catch (error) {
      logger.error(
        { err: error, folderId, userId },
        "Failed to restore folder",
      );
      await session.abortTransaction();
      if (error instanceof AppError) throw error;
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to restore folder",
      );
    } finally {
      session.endSession();
    }
  }

  async deleteFolderPermanent(folderId: string, userId: string) {
    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const session = await mongoose.startSession();
    session.startTransaction();

    let filesToDelete: IFile[] = [];

    try {
      const folderToDelete = await Folder.findOne({
        _id: folderId,
        user: userObjectId,
        isTrashed: true,
      });

      if (!folderToDelete) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          "Folder not found or not trashed",
        );
      }

      const folderIdsToDelete = await Folder.find({
        $or: [{ _id: folderObjectId }, { ancestors: folderObjectId }],
        user: userObjectId,
        isTrashed: true,
      })
        .distinct("_id")
        .session(session);

      filesToDelete = await File.find({
        folder: { $in: folderIdsToDelete },
        user: userObjectId,
        isTrashed: true,
      })
        .select("+key +hash size")
        .session(session);

      const fileIdsToDelete = filesToDelete.map((f) => f._id);
      const totalFileSize = filesToDelete.reduce((sum, f) => sum + f.size, 0);

      await File.deleteMany(
        {
          _id: { $in: fileIdsToDelete },
          user: userObjectId,
        },
        { session },
      );

      await Folder.deleteMany(
        {
          _id: { $in: folderIdsToDelete },
          user: userObjectId,
        },
        { session },
      );

      if (totalFileSize > 0) {
        await User.updateOne(
          { _id: userId },
          { $inc: { storageUsage: -totalFileSize } },
          { session },
        );
      }

      await session.commitTransaction();

      // 异步处理快捷方式和通知
      this.runAsyncCascadeDelete(folderIdsToDelete, fileIdsToDelete, userId);
    } catch (error) {
      logger.error(
        { err: error, folderId, userId },
        "Failed to delete folder permanently",
      );
      await session.abortTransaction();
      if (error instanceof AppError) throw error;
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to delete folder permanently",
      );
    } finally {
      session.endSession();
    }

    if (filesToDelete.length > 0) {
      await Promise.all(
        filesToDelete.map((file) =>
          this.cleanupMinioObject(file.key, file.hash),
        ),
      );
    }
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

  async moveFolder(data: MoveFolderDTO) {
    const { folderId, destinationId, userId } = data;
    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const destinationObjectId = new mongoose.Types.ObjectId(destinationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const folderToMove = await Folder.findOne({
        _id: folderId,
        user: userObjectId,
        isTrashed: false,
      });

      if (!folderToMove) {
        throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
      }

      const destinationFolder = await Folder.findOne({
        _id: destinationId,
        user: userObjectId,
        isTrashed: false,
      });

      if (!destinationFolder) {
        throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
      }

      // 检查是否移动到自己
      if (folderObjectId.equals(destinationObjectId)) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Cannot move folder to itself",
        );
      }

      // 循环引用检查：不能把自己移到自己的子文件夹
      const isCircular = destinationFolder.ancestors.some((_id) =>
        _id.equals(folderObjectId),
      );
      if (isCircular) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Cannot move folder into itself or its children",
        );
      }

      const newAncestors = [
        ...destinationFolder.ancestors,
        destinationObjectId,
      ];

      // 更新自己
      await Folder.updateOne(
        {
          _id: folderObjectId,
          user: userObjectId,
        },
        { parent: destinationObjectId, ancestors: newAncestors },
        { session },
      );

      logger.debug(
        { folderId, destinationId, newAncestors },
        "Folder ancestors updated",
      );

      // 更新所有子目录，同时为每个子目录计算新的 ancestors 用于更新其下的文件
      const sonFolders = await Folder.find({
        ancestors: folderObjectId,
      }).session(session);

      // 收集每个子目录的新 ancestors，用于后续更新文件
      const subFolderNewAncestors = new Map<
        string,
        mongoose.Types.ObjectId[]
      >();

      if (sonFolders.length > 0) {
        const bulkOps = sonFolders.map((folder) => {
          const index = folder.ancestors.findIndex((id) =>
            id.equals(folderObjectId),
          );
          const relatedPath = folder.ancestors.slice(index + 1);
          const updatedAncestors = [
            ...newAncestors,
            folderObjectId,
            ...relatedPath,
          ];
          subFolderNewAncestors.set(folder._id.toString(), updatedAncestors);
          return {
            updateOne: {
              filter: { _id: folder._id },
              update: { $set: { ancestors: updatedAncestors } },
            },
          };
        });

        await Folder.bulkWrite(bulkOps, { session });
      }

      // 更新文件的 ancestors（文件的 ancestors = 所在文件夹的 ancestors + 文件夹本身）
      // 被移动文件夹中的直接文件
      const fileBulkOps: Parameters<typeof File.bulkWrite>[0] = [
        {
          updateMany: {
            filter: { folder: folderObjectId },
            update: { $set: { ancestors: [...newAncestors, folderObjectId] } },
          },
        },
      ];

      // 各子文件夹中的文件
      for (const [
        subFolderId,
        updatedFolderAncestors,
      ] of subFolderNewAncestors) {
        const subFolderObjectId = new mongoose.Types.ObjectId(subFolderId);
        fileBulkOps.push({
          updateMany: {
            filter: { folder: subFolderObjectId },
            update: {
              $set: {
                ancestors: [...updatedFolderAncestors, subFolderObjectId],
              },
            },
          },
        });
      }

      await File.bulkWrite(fileBulkOps, { session });

      logger.debug(
        { folderId, destinationId, movedFolderCount: sonFolders.length + 1 },
        "Folder and file ancestors updated successfully",
      );

      await session.commitTransaction();
    } catch (error) {
      logger.error(
        {
          err: error,
          folderId: data.folderId,
          destinationId: data.destinationId,
          userId: data.userId,
        },
        "Failed to move folder",
      );
      await session.abortTransaction();
      if (error instanceof AppError) throw error;
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to move folder",
      );
    } finally {
      session.endSession();
    }
  }

  async renameFolder(folderId: string, userId: string, newName: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folder = await Folder.findOne({ _id: folderId, user: userObjectId });
    if (!folder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    folder.name = newName;
    await folder.save();
    logger.info({ folderId, newName }, "Folder renamed successfully");
  }

  async getFolderContent(
    folderId: string,
    userId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<IFolderContent> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const pageSize = Math.min(options?.limit || 50, 200);

    // 前端定义了 root folder id
    const isRoot = folderId === "root";
    const folderObjectId = isRoot
      ? null
      : new mongoose.Types.ObjectId(folderId);

    let currentFolder: IFolder | null = null;
    if (!isRoot) {
      currentFolder = await Folder.findOne({
        _id: folderId,
        user: userObjectId,
      });

      if (!currentFolder) {
        throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
      }
    }

    // 解析游标：格式 "folders:<createdAt>:<id>"，"files:<createdAt>:<id>"
    let cursorPhase: "folders" | "files" = "folders";
    let cursorDate: Date | null = null;
    let cursorId: mongoose.Types.ObjectId | null = null;

    if (options?.cursor) {
      const parts = options.cursor.split(":");
      if (parts.length === 3) {
        cursorPhase = parts[0] as "folders" | "files";
        cursorDate = new Date(parts[1]);
        cursorId = new mongoose.Types.ObjectId(parts[2]);
      }
    }

    let foldersPublic: IFolderPublic[] = [];
    let filesPublic: IFilePublic[] = [];
    let remaining = pageSize;
    let nextCursor: string | null = null;
    let hasMore = false;

    const user = await User.findById(userObjectId);
    const userBasic: IUserBasic = {
      id: userId,
      name: user?.name || "Unknown",
      email: user?.email || "",
      avatar: {
        thumbnail: user?.avatar?.thumbnail || "",
      },
    };

    if (cursorPhase === "folders") {
      const folderQuery: Record<string, any> = {
        parent: folderObjectId,
        user: userObjectId,
        isTrashed: false,
      };

      if (cursorDate && cursorId) {
        folderQuery.$or = [
          { createdAt: { $lt: cursorDate } },
          { createdAt: cursorDate, _id: { $lt: cursorId } },
        ];
      }

      const folders = await Folder.find(folderQuery)
        .sort({ createdAt: -1, _id: -1 })
        .limit(remaining + 1);

      if (folders.length > remaining) {
        // 还有更多文件夹
        folders.pop();
        const last = folders[folders.length - 1];
        nextCursor = `folders:${last.createdAt.toISOString()}:${last._id}`;
        hasMore = true;
      }

      // 构建分享信息
      const folderResourceIds = folders.map((f) => f._id);
      const folderSharedMap =
        await this.buildSharedAccessMap(folderResourceIds);
      const folderOverrides = await buildShortcutFolderOverrides(folders);

      foldersPublic = folders.map((folder) => {
        const su = folderSharedMap[folder._id.toString()] || [];
        const override = {
          ...(folderOverrides.get(folder.id) || {}),
          isShared: su.length > 0,
          sharedUsers: su,
        };
        return this.toFolderPublic(folder, userBasic, override as any);
      });

      remaining -= folders.length;
    }

    // 获取文件（文件夹取完后或从文件游标继续）
    if (remaining > 0 && !hasMore) {
      const fileQuery: Record<string, any> = {
        folder: folderObjectId,
        user: userObjectId,
        isTrashed: false,
      };

      if (cursorPhase === "files" && cursorDate && cursorId) {
        fileQuery.$or = [
          { createdAt: { $lt: cursorDate } },
          { createdAt: cursorDate, _id: { $lt: cursorId } },
        ];
      }

      const files = await File.find(fileQuery)
        .sort({ createdAt: -1, _id: -1 })
        .limit(remaining + 1);

      if (files.length > remaining) {
        files.pop();
        const last = files[files.length - 1];
        nextCursor = `files:${last.createdAt.toISOString()}:${last._id}`;
        hasMore = true;
      }

      const fileResourceIds = files.map((f) => f._id);
      const fileSharedMap = await this.buildSharedAccessMap(fileResourceIds);
      const fileOverrides = await buildShortcutFileOverrides(files);

      filesPublic = files.map((file) => {
        const su = fileSharedMap[file._id.toString()] || [];
        const override = {
          ...(fileOverrides.get(file.id) || {}),
          isShared: su.length > 0,
          sharedUsers: su,
        };
        return this.toFilePublic(file, userBasic, override as any);
      });
    }

    // 首页请求才返回面包屑
    let breadcrumbs: IBreadcrumbItem[] = [];
    if (!options?.cursor) {
      if (currentFolder && currentFolder.ancestors.length > 0) {
        const ancestorDocs = await Folder.find({
          _id: { $in: currentFolder.ancestors },
          user: userObjectId,
        }).select("name _id");

        const ancestorMap = new Map(
          ancestorDocs.map((doc) => [String(doc._id), doc]),
        );

        breadcrumbs = currentFolder.ancestors
          .map((ancestorId) => {
            const doc = ancestorMap.get(ancestorId.toString());
            if (doc) {
              return {
                id: String(ancestorId),
                name: doc.name,
              };
            }
            return null;
          })
          .filter((item): item is IBreadcrumbItem => item !== null);
      }

      if (currentFolder && !isRoot) {
        breadcrumbs.push({
          id: String(currentFolder._id),
          name: currentFolder.name,
        });
      }
    }

    // 为根文件夹创建虚拟文件夹对象
    const currentFolderPublic: IFolderPublic = isRoot
      ? {
          id: "root",
          name: "My Drive",
          parent: null,
          user: userBasic,
          color: "#5F6368",
          description: "Root folder",
          isStarred: false,
          isTrashed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : this.toFolderPublic(currentFolder!, userBasic);

    return {
      currentFolder: currentFolderPublic,
      breadcrumbs,
      folders: foldersPublic,
      files: filesPublic,
      nextCursor,
      hasMore,
    };
  }

  private async buildSharedAccessMap(
    resourceIds: mongoose.Types.ObjectId[],
  ): Promise<Record<string, IUserBasic[]>> {
    if (resourceIds.length === 0) return {};

    const sharedAccesses = await SharedAccess.find({
      resource: { $in: resourceIds },
    }).populate("sharedWith", "name email avatar");

    type PopulatedSharedWith = {
      _id: mongoose.Types.ObjectId;
      name: string;
      email: string;
      avatar?: { thumbnail?: string };
    };

    return sharedAccesses.reduce(
      (acc: Record<string, IUserBasic[]>, access: any) => {
        const resourceIdStr = access.resource.toString();
        if (!acc[resourceIdStr]) {
          acc[resourceIdStr] = [];
        }
        if (
          access.sharedWith &&
          (access.sharedWith as PopulatedSharedWith)._id
        ) {
          const sw = access.sharedWith as PopulatedSharedWith;
          acc[resourceIdStr].push({
            id: sw._id.toString(),
            name: sw.name,
            email: sw.email,
            avatar: { thumbnail: sw.avatar?.thumbnail || "" },
          });
        }
        return acc;
      },
      {} as Record<string, IUserBasic[]>,
    );
  }

  async starFolder(folderId: string, userId: string, star: boolean = true) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

    // 使用原子操作
    const result = await Folder.findOneAndUpdate(
      {
        _id: folderObjectId,
        user: userObjectId,
      },
      { isStarred: star },
      { new: true },
    );

    if (!result) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    logger.info({ folderId, userId, star }, "Folder star status updated");
  }

  async getStarredFolders(userId: string): Promise<IFolderPublic[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [folders, userBasic] = await Promise.all([
      Folder.find({
        user: userObjectId,
        isStarred: true,
        isTrashed: false,
      }).sort({ updatedAt: -1 }),
      this.getUserBasic(userId),
    ]);

    return folders.map((folder) => this.toFolderPublic(folder, userBasic));
  }

  async getTrashedFolders(userId: string): Promise<IFolderPublic[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [folders, userBasic] = await Promise.all([
      Folder.find({
        user: userObjectId,
        isTrashed: true,
      }).sort({ trashedAt: -1 }),
      this.getUserBasic(userId),
    ]);

    return folders.map((folder) => this.toFolderPublic(folder, userBasic));
  }

  async getRecentFolders(
    userId: string,
    limit: number = 20,
  ): Promise<IFolderPublic[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [folders, userBasic] = await Promise.all([
      Folder.find({
        user: userObjectId,
        isTrashed: false,
      })
        .sort({ updatedAt: -1 })
        .limit(limit),
      this.getUserBasic(userId),
    ]);

    return folders.map((folder) => this.toFolderPublic(folder, userBasic));
  }

  async getFolderPath(
    folderId: string,
    userId: string,
  ): Promise<IBreadcrumbItem[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Handle root folder
    if (folderId === "root") {
      return [];
    }

    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const folder = await Folder.findOne({
      _id: folderObjectId,
      user: userObjectId,
    });

    if (!folder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    let breadcrumbs: IBreadcrumbItem[] = [];
    if (folder.ancestors.length > 0) {
      const ancestorDocs = await Folder.find({
        _id: { $in: folder.ancestors },
        user: userObjectId,
      }).select("name _id");

      const ancestorMap = new Map(
        ancestorDocs.map((doc) => [String(doc._id), doc]),
      );

      breadcrumbs = folder.ancestors
        .map((ancestorId) => {
          const doc = ancestorMap.get(ancestorId.toString());
          if (doc) {
            return {
              id: String(ancestorId),
              name: doc.name,
            };
          }
          return null;
        })
        .filter((item): item is IBreadcrumbItem => item !== null);
    }

    // 添加当前文件夹到面包屑导航
    breadcrumbs.push({
      id: String(folder._id),
      name: folder.name,
    });

    return breadcrumbs;
  }

  // 将文件夹内容打包成 ZIP 并流式写入 HTTP Response
  // 使用 archiver 实现流式 ZIP，避免内存溢出
  async downloadFolderAsZip(
    folderId: string,
    userId: string,
    res: Response,
  ): Promise<void> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

    const rootFolder = await Folder.findOne({
      _id: folderObjectId,
    });

    if (!rootFolder || rootFolder.isTrashed) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    const folderName = rootFolder.name;

    const allFolderIds: mongoose.Types.ObjectId[] = [folderObjectId];
    const childFolderIds = await Folder.find({
      ancestors: folderObjectId,
      isTrashed: false,
    })
      .select("_id")
      .lean();
    allFolderIds.push(...childFolderIds.map((f) => f._id));

    const allFiles = await File.find({
      folder: { $in: allFolderIds },
      isTrashed: false,
      isShortcut: { $ne: true },
    })
      .select("+key name originalName mimeType folder ancestors")
      .lean();

    // 构建文件夹路径映射
    const folderDocs = await Folder.find({
      _id: { $in: allFolderIds },
    })
      .select("_id name ancestors parent")
      .lean();

    const folderPathMap = new Map<string, string>();
    folderPathMap.set(folderId, "");

    // 按祖先长度排序，确保父级始终先解析
    folderDocs.sort((a, b) => a.ancestors.length - b.ancestors.length);

    for (const fd of folderDocs) {
      const fdId = fd._id.toString();
      if (folderPathMap.has(fdId)) continue;

      const parentId = fd.parent?.toString();
      const parentPath = parentId ? (folderPathMap.get(parentId) ?? "") : "";
      folderPathMap.set(
        fdId,
        parentPath ? `${parentPath}/${fd.name}` : fd.name,
      );
    }

    // ZIP 响应头
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(folderName)}.zip"`,
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    archive.on("error", (err) => {
      logger.error({ err, folderId, userId }, "Archiver error during zip");
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).end();
      }
    });

    // 流式写入 archive
    for (const file of allFiles) {
      try {
        const stream = await StorageService.getObjectStream(
          BUCKETS.FILES,
          file.key,
        );
        const folderRelPath = file.folder
          ? (folderPathMap.get(file.folder.toString()) ?? "")
          : "";
        const entryName = folderRelPath
          ? `${folderRelPath}/${file.originalName}`
          : file.originalName;

        archive.append(stream, { name: entryName });
      } catch (err) {
        logger.warn(
          { err, fileId: file._id, key: file.key },
          "Failed to stream file into zip, skipping",
        );
      }
    }

    await archive.finalize();
    logger.info(
      { folderId, userId, fileCount: allFiles.length },
      "Folder zip download complete",
    );
  }

  private async runAsyncCascadeTrash(
    folderIds: mongoose.Types.ObjectId[],
    fileIds: mongoose.Types.ObjectId[],
    userId: string,
  ): Promise<void> {
    try {
      if (folderIds.length > 0) {
        await cascadeTrashShortcuts(folderIds, "Folder");
        await revokeSharedAccessAndNotify(folderIds, "Folder", userId);
      }
      if (fileIds.length > 0) {
        await cascadeTrashShortcuts(fileIds, "File");
        await revokeSharedAccessAndNotify(fileIds, "File", userId);
      }
    } catch (err) {
      logger.error(
        { err, folderIds, fileIds, userId },
        "Background cascade trash failed for folder operation",
      );
    }
  }

  private async runAsyncCascadeRestore(
    folderIds: mongoose.Types.ObjectId[],
    fileIds: mongoose.Types.ObjectId[],
  ): Promise<void> {
    try {
      if (folderIds.length > 0) {
        await cascadeRestoreShortcuts(folderIds, "Folder");
      }
      if (fileIds.length > 0) {
        await cascadeRestoreShortcuts(fileIds, "File");
      }
    } catch (err) {
      logger.error(
        { err, folderIds, fileIds },
        "Background cascade restore failed for folder operation",
      );
    }
  }

  private async runAsyncCascadeDelete(
    folderIds: mongoose.Types.ObjectId[],
    fileIds: mongoose.Types.ObjectId[],
    userId: string,
  ): Promise<void> {
    try {
      if (folderIds.length > 0) {
        await cascadeDeleteShortcuts(folderIds, "Folder");
        await revokeSharedAccessAndNotify(folderIds, "Folder", userId);
      }
      if (fileIds.length > 0) {
        await cascadeDeleteShortcuts(fileIds, "File");
        await revokeSharedAccessAndNotify(fileIds, "File", userId);
      }
    } catch (err) {
      logger.error(
        { err, folderIds, fileIds, userId },
        "Background cascade delete failed for folder operation",
      );
    }
  }
}
