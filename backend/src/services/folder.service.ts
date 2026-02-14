import mongoose from "mongoose";
import Folder, { IFolder } from "../models/Folder.model";
import File, { IFile } from "../models/File.model";
import User from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { StorageService } from "./storage.service";
import { BUCKETS } from "../config/s3";
import { logger } from "../lib/logger";
import { IFilePublic } from "./file.service";
import {
  buildShortcutFileOverrides,
  buildShortcutFolderOverrides,
} from "../utils/shortcut.util";

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
    } catch (error) {
      logger.error({ err: error, folderId, userId }, "Failed to trash folder");
      await session.abortTransaction();
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
      // 标记自己的 isTrashed
      await Folder.updateOne(
        { _id: folderObjectId, user: userObjectId },
        { isTrashed: false, trashedAt: null },
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
    } catch (error) {
      logger.error(
        { err: error, folderId, userId },
        "Failed to restore folder",
      );
      await session.abortTransaction();
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
    } catch (error) {
      logger.error(
        { err: error, folderId, userId },
        "Failed to delete folder permanently",
      );
      await session.abortTransaction();
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

      // 更新所有子目录
      const sonFolders = await Folder.find({
        ancestors: folderObjectId,
      }).session(session);
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
          return {
            updateOne: {
              filter: { _id: folder._id },
              update: { $set: { ancestors: updatedAncestors } },
            },
          };
        });

        await Folder.bulkWrite(bulkOps, { session });
      }

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
  ): Promise<IFolderContent> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

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

    const [folders, files, user] = await Promise.all([
      Folder.find({
        parent: folderObjectId,
        user: userObjectId,
        isTrashed: false,
      }).sort({ createdAt: -1 }),

      File.find({
        folder: folderObjectId,
        user: userObjectId,
        isTrashed: false,
      }).sort({ createdAt: -1 }),

      User.findById(userObjectId),
    ]);

    // 用户基础信息
    const userBasic: IUserBasic = {
      id: userId,
      name: user?.name || "Unknown",
      email: user?.email || "",
      avatar: {
        thumbnail: user?.avatar?.thumbnail || "",
      },
    };

    // 构建面包屑导航
    let breadcrumbs: IBreadcrumbItem[] = [];
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

    // 添加当前文件夹到面包屑导航
    if (currentFolder && !isRoot) {
      breadcrumbs.push({
        id: String(currentFolder._id),
        name: currentFolder.name,
      });
    }

    // 为根文件夹创建虚拟文件夹对象
    const folderOverrides = await buildShortcutFolderOverrides(folders);

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

    const foldersPublic: IFolderPublic[] = folders.map((folder) =>
      this.toFolderPublic(folder, userBasic, folderOverrides.get(folder.id)),
    );

    const fileOverrides = await buildShortcutFileOverrides(files);
    const filesPublic: IFilePublic[] = files.map((file) =>
      this.toFilePublic(file, userBasic, fileOverrides.get(file.id)),
    );

    return {
      currentFolder: currentFolderPublic,
      breadcrumbs,
      folders: foldersPublic,
      files: filesPublic,
    };
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
}
