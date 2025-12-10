import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import User from "../models/User.model";
import { StorageService } from "./storage.service";
import { BUCKETS } from "../config/s3";
import { logger } from "../lib/logger";

export interface BatchItemRequest {
  id: string;
  type: "file" | "folder";
}

export interface BatchOperationResult {
  id: string;
  type: "file" | "folder";
  success: boolean;
  error?: string;
}

export interface BatchOperationResponse {
  results: BatchOperationResult[];
  successCount: number;
  failureCount: number;
}

export class BatchService {
  async batchTrash(
    userId: string,
    items: BatchItemRequest[]
  ): Promise<BatchOperationResponse> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const results: BatchOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    const fileIds = items
      .filter((item) => item.type === "file")
      .map((item) => new mongoose.Types.ObjectId(item.id));
    const folderIds = items
      .filter((item) => item.type === "folder")
      .map((item) => new mongoose.Types.ObjectId(item.id));

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const folderId of folderIds) {
        try {
          // 标记文件夹
          const folderResult = await Folder.updateOne(
            { _id: folderId, user: userObjectId, isTrashed: false },
            { isTrashed: true, trashedAt: new Date() },
            { session }
          );

          if (folderResult.matchedCount === 0) {
            results.push({
              id: folderId.toString(),
              type: "folder",
              success: false,
              error: "Folder not found or already trashed",
            });
            failureCount++;
            continue;
          }

          // 获取所有子文件夹
          const subFolderIds = await Folder.find({
            ancestors: folderId,
            user: userObjectId,
          })
            .distinct("_id")
            .session(session);

          // 标记所有子文件夹
          if (subFolderIds.length > 0) {
            await Folder.updateMany(
              { _id: { $in: subFolderIds } },
              { isTrashed: true, trashedAt: new Date() },
              { session }
            );
          }

          // 标记文件夹及其子文件夹内的所有文件
          await File.updateMany(
            {
              folder: { $in: [folderId, ...subFolderIds] },
              user: userObjectId,
            },
            { isTrashed: true, trashedAt: new Date() },
            { session }
          );

          results.push({
            id: folderId.toString(),
            type: "folder",
            success: true,
          });
          successCount++;
        } catch (error) {
          logger.error(
            { err: error, folderId, userId },
            "Failed to trash folder in batch"
          );
          results.push({
            id: folderId.toString(),
            type: "folder",
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to trash folder",
          });
          failureCount++;
        }
      }

      // 处理文件
      if (fileIds.length > 0) {
        const fileResult = await File.updateMany(
          {
            _id: { $in: fileIds },
            user: userObjectId,
            isTrashed: false,
          },
          { isTrashed: true, trashedAt: new Date() },
          { session }
        );

        // 检查每个文件是否成功
        const updatedFiles = await File.find({
          _id: { $in: fileIds },
          user: userObjectId,
          isTrashed: true,
        })
          .select("_id")
          .session(session);

        const updatedFileIds = new Set(
          updatedFiles.map((f) => f._id.toString())
        );

        for (const fileId of fileIds) {
          const fileIdStr = fileId.toString();
          if (updatedFileIds.has(fileIdStr)) {
            results.push({
              id: fileIdStr,
              type: "file",
              success: true,
            });
            successCount++;
          } else {
            results.push({
              id: fileIdStr,
              type: "file",
              success: false,
              error: "File not found or already trashed",
            });
            failureCount++;
          }
        }
      }

      await session.commitTransaction();
      logger.info(
        { userId, successCount, failureCount },
        "Batch trash operation completed"
      );
    } catch (error) {
      logger.error({ err: error, userId }, "Batch trash operation failed");
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Batch trash operation failed"
      );
    } finally {
      session.endSession();
    }

    return {
      results,
      successCount,
      failureCount,
    };
  }

  async batchRestore(
    userId: string,
    items: BatchItemRequest[]
  ): Promise<BatchOperationResponse> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const results: BatchOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    const fileIds = items
      .filter((item) => item.type === "file")
      .map((item) => new mongoose.Types.ObjectId(item.id));
    const folderIds = items
      .filter((item) => item.type === "folder")
      .map((item) => new mongoose.Types.ObjectId(item.id));

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 处理文件夹
      for (const folderId of folderIds) {
        try {
          const folderResult = await Folder.updateOne(
            { _id: folderId, user: userObjectId, isTrashed: true },
            { isTrashed: false, trashedAt: null },
            { session }
          );

          if (folderResult.matchedCount === 0) {
            results.push({
              id: folderId.toString(),
              type: "folder",
              success: false,
              error: "Folder not found or not trashed",
            });
            failureCount++;
            continue;
          }

          // 获取所有子文件夹
          const subFolderIds = await Folder.find({
            ancestors: folderId,
            user: userObjectId,
          })
            .distinct("_id")
            .session(session);

          // 恢复所有子文件夹
          if (subFolderIds.length > 0) {
            await Folder.updateMany(
              { _id: { $in: subFolderIds } },
              { isTrashed: false, trashedAt: null },
              { session }
            );
          }

          // 恢复文件夹及其子文件夹内的所有文件
          await File.updateMany(
            {
              folder: { $in: [folderId, ...subFolderIds] },
              user: userObjectId,
            },
            { isTrashed: false, trashedAt: null },
            { session }
          );

          results.push({
            id: folderId.toString(),
            type: "folder",
            success: true,
          });
          successCount++;
        } catch (error) {
          logger.error(
            { err: error, folderId, userId },
            "Failed to restore folder in batch"
          );
          results.push({
            id: folderId.toString(),
            type: "folder",
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to restore folder",
          });
          failureCount++;
        }
      }

      // 处理文件
      if (fileIds.length > 0) {
        await File.updateMany(
          {
            _id: { $in: fileIds },
            user: userObjectId,
            isTrashed: true,
          },
          { isTrashed: false, trashedAt: null },
          { session }
        );

        const updatedFiles = await File.find({
          _id: { $in: fileIds },
          user: userObjectId,
          isTrashed: false,
        })
          .select("_id")
          .session(session);

        const updatedFileIds = new Set(
          updatedFiles.map((f) => f._id.toString())
        );

        for (const fileId of fileIds) {
          const fileIdStr = fileId.toString();
          if (updatedFileIds.has(fileIdStr)) {
            results.push({
              id: fileIdStr,
              type: "file",
              success: true,
            });
            successCount++;
          } else {
            results.push({
              id: fileIdStr,
              type: "file",
              success: false,
              error: "File not found or not trashed",
            });
            failureCount++;
          }
        }
      }

      await session.commitTransaction();
      logger.info(
        { userId, successCount, failureCount },
        "Batch restore operation completed"
      );
    } catch (error) {
      logger.error({ err: error, userId }, "Batch restore operation failed");
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Batch restore operation failed"
      );
    } finally {
      session.endSession();
    }

    return {
      results,
      successCount,
      failureCount,
    };
  }

  async batchDeletePermanent(
    userId: string,
    items: BatchItemRequest[]
  ): Promise<BatchOperationResponse> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const results: BatchOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    const fileIds = items
      .filter((item) => item.type === "file")
      .map((item) => new mongoose.Types.ObjectId(item.id));
    const folderIds = items
      .filter((item) => item.type === "folder")
      .map((item) => new mongoose.Types.ObjectId(item.id));

    const session = await mongoose.startSession();
    session.startTransaction();

    let totalStorageFreed = 0;
    let minioCleanupTasks: Array<{ key: string; hash?: string }> = [];

    try {
      // 处理文件夹
      for (const folderId of folderIds) {
        try {
          const folder = await Folder.findOne({
            _id: folderId,
            user: userObjectId,
            isTrashed: true,
          }).session(session);

          if (!folder) {
            results.push({
              id: folderId.toString(),
              type: "folder",
              success: false,
              error: "Folder not found or not trashed",
            });
            failureCount++;
            continue;
          }

          // 获取所有子文件夹
          const subFolderIds = await Folder.find({
            $or: [{ _id: folderId }, { ancestors: folderId }],
            user: userObjectId,
            isTrashed: true,
          })
            .distinct("_id")
            .session(session);

          // 获取所有文件
          const filesToDelete = await File.find({
            folder: { $in: subFolderIds },
            user: userObjectId,
            isTrashed: true,
          })
            .select("+key +hash size")
            .session(session);

          const fileIdsToDelete = filesToDelete.map((f) => f._id);
          const folderStorageSize = filesToDelete.reduce(
            (sum, f) => sum + f.size,
            0
          );

          // 删除文件
          if (fileIdsToDelete.length > 0) {
            await File.deleteMany(
              {
                _id: { $in: fileIdsToDelete },
                user: userObjectId,
              },
              { session }
            );
          }

          // 删除文件夹
          await Folder.deleteMany(
            {
              _id: { $in: subFolderIds },
              user: userObjectId,
            },
            { session }
          );

          totalStorageFreed += folderStorageSize;

          // 记录需要清理的MinIO对象
          filesToDelete.forEach((file) => {
            minioCleanupTasks.push({ key: file.key, hash: file.hash });
          });

          results.push({
            id: folderId.toString(),
            type: "folder",
            success: true,
          });
          successCount++;
        } catch (error) {
          logger.error(
            { err: error, folderId, userId },
            "Failed to delete folder permanently in batch"
          );
          results.push({
            id: folderId.toString(),
            type: "folder",
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to delete folder",
          });
          failureCount++;
        }
      }

      // 处理文件
      if (fileIds.length > 0) {
        const filesToDelete = await File.find({
          _id: { $in: fileIds },
          user: userObjectId,
          isTrashed: true,
        })
          .select("+key +hash size")
          .session(session);

        const validFileIds = filesToDelete.map((f) => f._id);
        const filesStorageSize = filesToDelete.reduce(
          (sum, f) => sum + f.size,
          0
        );

        if (validFileIds.length > 0) {
          await File.deleteMany(
            {
              _id: { $in: validFileIds },
              user: userObjectId,
            },
            { session }
          );

          totalStorageFreed += filesStorageSize;

          // 记录需要清理的MinIO对象
          filesToDelete.forEach((file) => {
            minioCleanupTasks.push({ key: file.key, hash: file.hash });
          });
        }

        // 记录结果
        const deletedFileIds = new Set(validFileIds.map((id) => id.toString()));
        for (const fileId of fileIds) {
          const fileIdStr = fileId.toString();
          if (deletedFileIds.has(fileIdStr)) {
            results.push({
              id: fileIdStr,
              type: "file",
              success: true,
            });
            successCount++;
          } else {
            results.push({
              id: fileIdStr,
              type: "file",
              success: false,
              error: "File not found or not trashed",
            });
            failureCount++;
          }
        }
      }

      // 更新用户存储配额
      if (totalStorageFreed > 0) {
        await User.updateOne(
          { _id: userId },
          { $inc: { storageUsage: -totalStorageFreed } },
          { session }
        );
      }

      await session.commitTransaction();
      logger.info(
        {
          userId,
          successCount,
          failureCount,
          storageFreed: totalStorageFreed,
        },
        "Batch delete operation completed"
      );
    } catch (error) {
      logger.error({ err: error, userId }, "Batch delete operation failed");
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Batch delete operation failed"
      );
    } finally {
      session.endSession();
    }

    // 异步清理MinIO对象（事务提交后）
    if (minioCleanupTasks.length > 0) {
      Promise.all(
        minioCleanupTasks.map((task) =>
          this.cleanupMinioObject(task.key, task.hash)
        )
      ).catch((err) => {
        logger.error({ err, userId }, "Failed to cleanup MinIO objects");
      });
    }

    return {
      results,
      successCount,
      failureCount,
    };
  }

  async batchMove(
    userId: string,
    items: BatchItemRequest[],
    destinationFolderId: string
  ): Promise<BatchOperationResponse> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const destinationObjectId = new mongoose.Types.ObjectId(
      destinationFolderId
    );
    const results: BatchOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    const fileIds = items
      .filter((item) => item.type === "file")
      .map((item) => new mongoose.Types.ObjectId(item.id));
    const folderIds = items
      .filter((item) => item.type === "folder")
      .map((item) => new mongoose.Types.ObjectId(item.id));

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 验证目标文件夹
      const destinationFolder = await Folder.findOne({
        _id: destinationObjectId,
        user: userObjectId,
        isTrashed: false,
      }).session(session);

      if (!destinationFolder) {
        throw new AppError(
          StatusCodes.NOT_FOUND,
          "Destination folder not found"
        );
      }

      const newAncestors = [
        ...destinationFolder.ancestors,
        destinationObjectId,
      ];

      // 处理文件夹
      for (const folderId of folderIds) {
        try {
          // 检查是否移动到自己
          if (folderId.equals(destinationObjectId)) {
            results.push({
              id: folderId.toString(),
              type: "folder",
              success: false,
              error: "Cannot move folder to itself",
            });
            failureCount++;
            continue;
          }

          const folderToMove = await Folder.findOne({
            _id: folderId,
            user: userObjectId,
            isTrashed: false,
          }).session(session);

          if (!folderToMove) {
            results.push({
              id: folderId.toString(),
              type: "folder",
              success: false,
              error: "Folder not found",
            });
            failureCount++;
            continue;
          }

          // 检查循环引用
          const isCircular = destinationFolder.ancestors.some((ancestorId) =>
            ancestorId.equals(folderId)
          );
          if (isCircular) {
            results.push({
              id: folderId.toString(),
              type: "folder",
              success: false,
              error: "Cannot move folder into itself or its children",
            });
            failureCount++;
            continue;
          }

          // 更新文件夹
          await Folder.updateOne(
            { _id: folderId, user: userObjectId },
            { parent: destinationObjectId, ancestors: newAncestors },
            { session }
          );

          // 更新所有子文件夹的ancestors
          const subFolders = await Folder.find({
            ancestors: folderId,
            user: userObjectId,
          }).session(session);

          if (subFolders.length > 0) {
            const bulkOps = subFolders.map((folder) => {
              const index = folder.ancestors.findIndex((id) =>
                id.equals(folderId)
              );
              const relativePath = folder.ancestors.slice(index + 1);
              const updatedAncestors = [
                ...newAncestors,
                folderId,
                ...relativePath,
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

          results.push({
            id: folderId.toString(),
            type: "folder",
            success: true,
          });
          successCount++;
        } catch (error) {
          logger.error(
            { err: error, folderId, userId },
            "Failed to move folder in batch"
          );
          results.push({
            id: folderId.toString(),
            type: "folder",
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to move folder",
          });
          failureCount++;
        }
      }

      // 处理文件
      if (fileIds.length > 0) {
        const fileResult = await File.updateMany(
          {
            _id: { $in: fileIds },
            user: userObjectId,
            isTrashed: false,
          },
          { folder: destinationObjectId },
          { session }
        );

        const updatedFiles = await File.find({
          _id: { $in: fileIds },
          user: userObjectId,
          folder: destinationObjectId,
        })
          .select("_id")
          .session(session);

        const updatedFileIds = new Set(
          updatedFiles.map((f) => f._id.toString())
        );

        for (const fileId of fileIds) {
          const fileIdStr = fileId.toString();
          if (updatedFileIds.has(fileIdStr)) {
            results.push({
              id: fileIdStr,
              type: "file",
              success: true,
            });
            successCount++;
          } else {
            results.push({
              id: fileIdStr,
              type: "file",
              success: false,
              error: "File not found",
            });
            failureCount++;
          }
        }
      }

      await session.commitTransaction();
      logger.info(
        { userId, destinationFolderId, successCount, failureCount },
        "Batch move operation completed"
      );
    } catch (error) {
      logger.error({ err: error, userId }, "Batch move operation failed");
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Batch move operation failed"
      );
    } finally {
      session.endSession();
    }

    return {
      results,
      successCount,
      failureCount,
    };
  }

  async batchStar(
    userId: string,
    items: BatchItemRequest[],
    star: boolean
  ): Promise<BatchOperationResponse> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const results: BatchOperationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    const fileIds = items
      .filter((item) => item.type === "file")
      .map((item) => new mongoose.Types.ObjectId(item.id));
    const folderIds = items
      .filter((item) => item.type === "folder")
      .map((item) => new mongoose.Types.ObjectId(item.id));

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 处理文件夹
      if (folderIds.length > 0) {
        await Folder.updateMany(
          {
            _id: { $in: folderIds },
            user: userObjectId,
          },
          { isStarred: star },
          { session }
        );

        const updatedFolders = await Folder.find({
          _id: { $in: folderIds },
          user: userObjectId,
          isStarred: star,
        })
          .select("_id")
          .session(session);

        const updatedFolderIds = new Set(
          updatedFolders.map((f) => f._id.toString())
        );

        for (const folderId of folderIds) {
          const folderIdStr = folderId.toString();
          if (updatedFolderIds.has(folderIdStr)) {
            results.push({
              id: folderIdStr,
              type: "folder",
              success: true,
            });
            successCount++;
          } else {
            results.push({
              id: folderIdStr,
              type: "folder",
              success: false,
              error: "Folder not found",
            });
            failureCount++;
          }
        }
      }

      // 处理文件
      if (fileIds.length > 0) {
        await File.updateMany(
          {
            _id: { $in: fileIds },
            user: userObjectId,
          },
          { isStarred: star },
          { session }
        );

        const updatedFiles = await File.find({
          _id: { $in: fileIds },
          user: userObjectId,
          isStarred: star,
        })
          .select("_id")
          .session(session);

        const updatedFileIds = new Set(
          updatedFiles.map((f) => f._id.toString())
        );

        for (const fileId of fileIds) {
          const fileIdStr = fileId.toString();
          if (updatedFileIds.has(fileIdStr)) {
            results.push({
              id: fileIdStr,
              type: "file",
              success: true,
            });
            successCount++;
          } else {
            results.push({
              id: fileIdStr,
              type: "file",
              success: false,
              error: "File not found",
            });
            failureCount++;
          }
        }
      }

      await session.commitTransaction();
      logger.info(
        { userId, star, successCount, failureCount },
        "Batch star operation completed"
      );
    } catch (error) {
      logger.error({ err: error, userId }, "Batch star operation failed");
      await session.abortTransaction();
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Batch star operation failed"
      );
    } finally {
      session.endSession();
    }

    return {
      results,
      successCount,
      failureCount,
    };
  }

  private async cleanupMinioObject(key: string, hash?: string) {
    const query = hash ? { hash: hash } : { key: key };
    const count = await File.countDocuments(query);
    if (count === 0) {
      logger.info(
        { key, hash },
        "No file references remaining, deleting object from MinIO"
      );
      await StorageService.deleteObject(BUCKETS.FILES, key).catch((err) => {
        logger.error({ err, key }, "Failed to delete object from MinIO");
      });
    } else {
      logger.debug(
        { key, hash, referenceCount: count },
        "Object still has file references, keeping in MinIO"
      );
    }
  }
}
