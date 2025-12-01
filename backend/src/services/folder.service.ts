import mongoose from "mongoose";
import Folder, { IFolder } from "../models/Folder.model";
import File from "../models/File.model";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";

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
        { isTrashed: true },
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
        { isTrashed: true },
        { session }
      );
      await session.commitTransaction();
    } catch (error) {
      console.error("Error removing folder:", error);
      await session.abortTransaction();
    } finally {
      session.endSession();
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
      });

      if (!folderToMove) {
        throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
      }

      const destinationFolder = await Folder.findOne({
        _id: destinationId,
        user: userObjectId,
      });

      if (!destinationFolder) {
        throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
      }

      // 循环引用检查：不能把自己移到自己的文件夹
      const isCircular = destinationFolder.ancestors.some((_id) =>
        _id.equals(folderId)
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
        { _id: folderObjectId, user: userObjectId },
        { ancestors: newAncestors },
        { session }
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
      console.error("Error moving folder:", error);
      await session.abortTransaction();
    } finally {
      session.endSession();
    }
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
}
