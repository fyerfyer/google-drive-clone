import mongoose from "mongoose";
import Folder, { IFolder } from "../models/Folder.model";
import File, { IFile } from "../models/File.model";
import User from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { minioClient } from "../config/minio";
import { logger } from "../lib/logger";

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

export class FolderService {
  async createFolder(data: CreateFolderDTO): Promise<IFolder> {
    let ancestors: mongoose.Types.ObjectId[] = [];
    let parentId: mongoose.Types.ObjectId | null = null;

    if (data.parentId) {
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
      isPublic: false,
      isTrashed: false,
      isStarred: false,
    });

    return folder;
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
        { session }
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
        { session }
      );

      // 标记文件夹内的所有文件
      await File.updateMany(
        {
          folder: { $in: [folderObjectId, ...allFoldersIds] },
          user: userObjectId,
        },
        { isTrashed: true, trashedAt: new Date() },
        { session }
      );

      await session.commitTransaction();
    } catch (error) {
      logger.error({ err: error, folderId, userId }, "Failed to trash folder");
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to trash folder"
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
        { session }
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
        { session }
      );

      // 恢复文件夹内的所有文件
      await File.updateMany(
        {
          folder: { $in: [folderObjectId, ...allFoldersIds] },
          user: userObjectId,
        },
        { isTrashed: false, trashedAt: null },
        { session }
      );

      await session.commitTransaction();
    } catch (error) {
      logger.error(
        { err: error, folderId, userId },
        "Failed to restore folder"
      );
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to restore folder"
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
          "Folder not found or not trashed"
        );
      }

      // 找到所有子文件夹和文件
      const folderIdsToDelete = await Folder.find({
        $or: [{ _id: folderObjectId }, { ancestors: folderObjectId }],
        user: userObjectId,
        isTrashed: true,
      })
        .distinct("_id")
        .session(session);

      // 查找所有需要删除的文件
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
        { session }
      );

      await Folder.deleteMany(
        {
          _id: { $in: folderIdsToDelete },
          user: userObjectId,
        },
        { session }
      );

      // 更新用户存储使用量
      if (totalFileSize > 0) {
        await User.updateOne(
          { _id: userId },
          { $inc: { storageUsage: -totalFileSize } },
          { session }
        );
      }

      await session.commitTransaction();
    } catch (error) {
      logger.error(
        { err: error, folderId, userId },
        "Failed to delete folder permanently"
      );
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to delete folder permanently"
      );
    } finally {
      session.endSession();
    }

    // 在事务提交后从 MinIO 删除所有文件对象
    // 不然无法获取最新引用计数
    if (filesToDelete.length > 0) {
      await Promise.all(
        filesToDelete.map((file) =>
          this.cleanupMinioObject(file.key, file.hash)
        )
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
          "Cannot move folder to itself"
        );
      }

      // 循环引用检查：不能把自己移到自己的子文件夹
      const isCircular = destinationFolder.ancestors.some((_id) =>
        _id.equals(folderObjectId)
      );
      if (isCircular) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Cannot move folder into itself or its children"
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
        { session }
      );

      logger.debug(
        { folderId, destinationId, newAncestors },
        "Folder ancestors updated"
      );

      // 更新所有子目录
      const sonFolders = await Folder.find({
        ancestors: folderObjectId,
      }).session(session);
      if (sonFolders.length > 0) {
        const bulkOps = sonFolders.map((folder) => {
          const index = folder.ancestors.findIndex((id) =>
            id.equals(folderObjectId)
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
        "Failed to move folder"
      );
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Failed to move folder"
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

  async getFolderContent(folderId: string, userId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const currentFolder = await Folder.findOne({
      _id: folderId,
      user: userObjectId,
    });

    if (!currentFolder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    const [folders, files] = await Promise.all([
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
    ]);

    // 构建面包屑导航
    // 先找出所有父目录再排序
    let breadcrumbs: Array<{ _id: mongoose.Types.ObjectId; name: string }> = [];
    if (currentFolder && currentFolder.ancestors.length > 0) {
      const ancestorDocs = await Folder.find({
        _id: { $in: currentFolder.ancestors },
        user: userObjectId,
      }).select("name _id");

      const ancestorMap = new Map(
        ancestorDocs.map((doc) => [String(doc._id), doc])
      );

      breadcrumbs = currentFolder.ancestors
        .map((ancestorId) => {
          const doc = ancestorMap.get(ancestorId.toString());
          if (doc) {
            return { _id: ancestorId, name: doc.name };
          }

          return null;
        })
        .filter(
          (item): item is { _id: mongoose.Types.ObjectId; name: string } =>
            item !== null
        );
    }

    return {
      currentFolder,
      breadcrumbs,
      folders,
      files,
    };
  }

  async starFolder(folderId: string, userId: string, star: boolean = true) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

    const folder = await Folder.findOne({
      _id: folderObjectId,
      user: userObjectId,
    });

    if (!folder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    folder.isStarred = star;
    await folder.save();
    logger.info({ folderId, userId, star }, "Folder star status updated");
  }
}
