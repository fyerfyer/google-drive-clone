import mongoose from "mongoose";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { StatusCodes } from "http-status-codes";

import { PermissionService } from "./permission.service";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";
import { notificationQueue } from "../lib/queue/queue";

import { ShareLink, IShareLink } from "../models/ShareLink.model";
import { SharedAccess, ISharedAccess } from "../models/SharedAccess.model";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import User from "../models/User.model";

import {
  ResourceType,
  ResourceItem,
  NOTIFICATION_TYPES,
  QUEUE_TASKS,
} from "../types/model.types";

import {
  CreateShareLinkRequest,
  UpdateShareLinkRequest,
  RevokeShareLinkRequest,
  ShareWithUsersRequest,
  ShareWithUsersResult,
  UpdateUserShareRoleRequest,
  UnshareWithUserRequest,
  ListSharedWithMeRequest,
  ListSharedWithMeResponse,
  SharedWithMeItem,
  SharedResourceSummary,
  SaveSharedResourceRequest,
  SaveSharedResourceResult,
  ResourcePermissionInfo,
  ShareLinkInfo,
  PermissionDetail,
  GetResourceByTokenResult,
  SharedFileForDownload,
  SharedFolderContent,
  SharedFolderPathItem,
} from "../types/share.types";

export class ShareService {
  private permissionService: PermissionService;

  constructor(permissionService?: PermissionService) {
    this.permissionService = permissionService || new PermissionService();
  }

  // ==================== ShareLink Management ====================

  /**
   * 创建分享链接
   */
  async createShareLink(data: CreateShareLinkRequest): Promise<IShareLink> {
    const { actorId, resourceId, resourceType, options = {} } = data;

    // 权限校验：必须有分享权限
    const canShare = await this.permissionService.canShare({
      userId: actorId,
      resourceId,
      resourceType,
    });

    if (!canShare) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to create share link",
      );
    }

    const resource = await this.getResource(resourceId, resourceType);
    if (!resource) {
      throw new AppError(StatusCodes.NOT_FOUND, "Resource not found");
    }

    const token = nanoid(32);
    let passwordHash: string | undefined;
    if (options.password) {
      passwordHash = await bcrypt.hash(options.password, 10);
    }

    const shareLink = await ShareLink.create({
      resourceId,
      resourceType,
      token,
      policy: {
        role: options.role || "viewer",
        requireLogin: options.requireLogin || false,
        allowedUsers: options.allowedUsers
          ? options.allowedUsers.map((id) => new mongoose.Types.ObjectId(id))
          : [],
        allowedDomains: options.allowedDomains || [],
        allowDownload: options.allowDownload !== false,
        expiresAt: options.expiresAt || null,
        maxAccessCount: options.maxAccessCount || 0,
        passwordHash,
      },
      createdBy: actorId,
    });

    logger.info(
      { linkId: shareLink._id, resourceId, resourceType, actorId },
      "Share link created",
    );

    return shareLink;
  }

  async updateShareLink(data: UpdateShareLinkRequest): Promise<IShareLink> {
    const { actorId, linkId, options } = data;

    const shareLink = await ShareLink.findById(linkId).select(
      "+policy.passwordHash",
    );
    if (!shareLink) {
      throw new AppError(StatusCodes.NOT_FOUND, "Share link not found");
    }

    if (shareLink.isRevoked) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Share link has been revoked",
      );
    }

    const canShare = await this.permissionService.canShare({
      userId: actorId,
      resourceId: shareLink.resourceId.toString(),
      resourceType: shareLink.resourceType,
    });

    if (!canShare) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to update share link",
      );
    }

    if (options.role !== undefined) {
      shareLink.policy.role = options.role;
    }
    if (options.requireLogin !== undefined) {
      shareLink.policy.requireLogin = options.requireLogin;
    }
    if (options.allowedUsers !== undefined) {
      shareLink.policy.allowedUsers = options.allowedUsers.map(
        (id) => new mongoose.Types.ObjectId(id),
      );
    }
    if (options.allowedDomains !== undefined) {
      shareLink.policy.allowedDomains = options.allowedDomains;
    }
    if (options.allowDownload !== undefined) {
      shareLink.policy.allowDownload = options.allowDownload;
    }
    if (options.expiresAt !== undefined) {
      shareLink.policy.expiresAt = options.expiresAt || undefined;
    }
    if (options.maxAccessCount !== undefined) {
      shareLink.policy.maxAccessCount = options.maxAccessCount || 0;
    }
    if (options.password !== undefined) {
      if (options.password === null) {
        shareLink.policy.passwordHash = undefined;
      } else {
        shareLink.policy.passwordHash = await bcrypt.hash(options.password, 10);
      }
    }

    await shareLink.save();

    logger.info({ linkId, actorId }, "Share link updated");

    return shareLink;
  }

  async revokeShareLink(data: RevokeShareLinkRequest): Promise<void> {
    const { actorId, linkId } = data;

    const shareLink = await ShareLink.findById(linkId);
    if (!shareLink) {
      throw new AppError(StatusCodes.NOT_FOUND, "Share link not found");
    }

    const canShare = await this.permissionService.canShare({
      userId: actorId,
      resourceId: shareLink.resourceId.toString(),
      resourceType: shareLink.resourceType,
    });

    if (!canShare) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to revoke share link",
      );
    }

    shareLink.isRevoked = true;
    shareLink.revokedAt = new Date();
    await shareLink.save();

    logger.info({ linkId, actorId }, "Share link revoked");
  }

  async rotateShareLinkToken(
    actorId: string,
    linkId: string,
  ): Promise<IShareLink> {
    const shareLink = await ShareLink.findById(linkId);
    if (!shareLink) {
      throw new AppError(StatusCodes.NOT_FOUND, "Share link not found");
    }

    if (shareLink.isRevoked) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Share link has been revoked",
      );
    }

    const canShare = await this.permissionService.canShare({
      userId: actorId,
      resourceId: shareLink.resourceId.toString(),
      resourceType: shareLink.resourceType,
    });

    if (!canShare) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to rotate share link token",
      );
    }

    shareLink.token = nanoid(32);
    await shareLink.save();

    logger.info({ linkId, actorId }, "Share link token rotated");

    return shareLink;
  }

  async listShareLinks(
    actorId: string,
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<ShareLinkInfo[]> {
    const canView = await this.permissionService.canView({
      userId: actorId,
      resourceId,
      resourceType,
    });

    if (!canView) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to view share links",
      );
    }

    const links = await ShareLink.find({
      resourceId,
      resourceType,
      isRevoked: false,
    }).sort({ createdAt: -1 });

    return links.map((link) => ({
      id: link._id.toString(),
      token: link.token,
      role: link.policy.role,
      requireLogin: link.policy.requireLogin,
      allowDownload: link.policy.allowDownload,
      expiresAt: link.policy.expiresAt,
      maxAccessCount: link.policy.maxAccessCount,
      accessCount: link.accessCount,
      hasPassword: !!link.policy.passwordHash,
      createdAt: link.createdAt,
    }));
  }

  async recordShareLinkAccess(token: string): Promise<void> {
    await ShareLink.findOneAndUpdate(
      { token, isRevoked: false },
      { $inc: { accessCount: 1 } },
    );
  }

  async shareWithUsers(
    data: ShareWithUsersRequest,
  ): Promise<ShareWithUsersResult> {
    const {
      actorId,
      resourceId,
      resourceType,
      targetUserIds,
      role,
      expiresAt,
      notifyUsers = true,
      resourceName,
    } = data;

    const canShare = await this.permissionService.canShare({
      userId: actorId,
      resourceId,
      resourceType,
    });

    if (!canShare) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to share this resource",
      );
    }

    const users = await User.find({ _id: { $in: targetUserIds } });
    if (users.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "No valid users to share with",
      );
    }

    const validUserIds = users.map((u) => u._id.toString());
    const failedUserIds = targetUserIds.filter(
      (id) => !validUserIds.includes(id),
    );

    const sharePromises = users.map((user) =>
      SharedAccess.findOneAndUpdate(
        {
          resource: resourceId,
          resourceType,
          sharedWith: user._id,
        },
        {
          sharedBy: actorId,
          role,
          expiresAt: expiresAt || null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ),
    );

    await Promise.all(sharePromises);

    if (notifyUsers) {
      users.forEach((user) => {
        notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
          recipientId: user._id.toString(),
          senderId: actorId,
          type: NOTIFICATION_TYPES.FILE_SHARED,
          resourceType,
          resourceId,
          resourceName: resourceName || "Resource",
        });
      });
    }

    logger.info(
      { resourceId, resourceType, actorId, userCount: users.length },
      "Resource shared with users",
    );

    return {
      successCount: users.length,
      failedUserIds,
    };
  }

  async updateUserShareRole(data: UpdateUserShareRoleRequest): Promise<void> {
    const { actorId, resourceId, resourceType, targetUserId, newRole } = data;

    const canShare = await this.permissionService.canShare({
      userId: actorId,
      resourceId,
      resourceType,
    });

    if (!canShare) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to modify permissions",
      );
    }

    const result = await SharedAccess.findOneAndUpdate(
      {
        resource: resourceId,
        sharedWith: targetUserId,
      },
      { role: newRole },
    );

    if (!result) {
      throw new AppError(StatusCodes.NOT_FOUND, "Share permission not found");
    }

    logger.info(
      { resourceId, targetUserId, newRole, actorId },
      "User share role updated",
    );
  }

  async unshareWithUser(data: UnshareWithUserRequest): Promise<void> {
    const { actorId, resourceId, resourceType, targetUserId } = data;

    const canShare = await this.permissionService.canShare({
      userId: actorId,
      resourceId,
      resourceType,
    });

    if (!canShare) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to modify permissions",
      );
    }

    await SharedAccess.findOneAndDelete({
      resource: resourceId,
      sharedWith: targetUserId,
    });

    logger.info(
      { resourceId, targetUserId, actorId },
      "User unshared from resource",
    );
  }

  async getResourcePermissions(
    actorId: string,
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<ResourcePermissionInfo> {
    const canView = await this.permissionService.canView({
      userId: actorId,
      resourceId,
      resourceType,
    });

    if (!canView) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to view resource permissions",
      );
    }

    const resource =
      resourceType === "Folder"
        ? await Folder.findById(resourceId).select("name ancestors user").lean()
        : await File.findById(resourceId).select("name ancestors user").lean();

    if (!resource) {
      throw new AppError(StatusCodes.NOT_FOUND, "Resource not found");
    }

    const scopeIds = [resource._id, ...resource.ancestors];
    const now = new Date();

    const [aclList, ancestorFolders, ownerUser, shareLinks] = await Promise.all(
      [
        SharedAccess.find({
          resource: { $in: scopeIds },
          $or: [
            { expiresAt: { $gt: now } },
            { expiresAt: null },
            { expiresAt: { $exists: false } },
          ],
        })
          .populate("sharedWith", "name email avatar")
          .sort({ role: -1 })
          .lean(),
        Folder.find({ _id: { $in: resource.ancestors } })
          .select("name")
          .lean(),
        User.findById(resource.user).select("name email avatar").lean(),
        ShareLink.find({
          resourceId,
          resourceType,
          isRevoked: false,
        })
          .sort({ createdAt: -1 })
          .lean(),
      ],
    );

    // 构建资源名称映射
    const resourceNameMap = new Map<string, string>();
    resourceNameMap.set(String(resource._id), resource.name);
    ancestorFolders.forEach((folder) => {
      resourceNameMap.set(String(folder._id), folder.name);
    });

    // 构建权限列表
    const permissions: PermissionDetail[] = aclList.map((acl) => {
      const resourceIdStr = acl.resource.toString();
      const isInherited = resourceIdStr !== String(resourceId);
      const sharedWithUser = acl.sharedWith as any;

      return {
        resourceId,
        userId: sharedWithUser._id?.toString() || sharedWithUser.toString(),
        userName: sharedWithUser.name || "",
        userEmail: sharedWithUser.email || "",
        userAvatar: sharedWithUser.avatar?.thumbnail,
        role: acl.role,
        isInherited,
        inheritedFrom: isInherited
          ? {
              resourceId: resourceIdStr,
              resourceName:
                resourceNameMap.get(resourceIdStr) || "Unknown Folder",
            }
          : undefined,
      };
    });

    // 构建分享链接列表
    const shareLinkInfos: ShareLinkInfo[] = shareLinks.map((link) => ({
      id: link._id.toString(),
      token: link.token,
      role: link.policy.role,
      requireLogin: link.policy.requireLogin,
      allowDownload: link.policy.allowDownload,
      expiresAt: link.policy.expiresAt,
      maxAccessCount: link.policy.maxAccessCount,
      accessCount: link.accessCount,
      hasPassword: !!link.policy.passwordHash,
      createdAt: link.createdAt,
    }));

    return {
      owner: ownerUser
        ? {
            id: ownerUser._id.toString(),
            name: ownerUser.name,
            email: ownerUser.email,
            avatar: ownerUser.avatar?.thumbnail,
          }
        : null,
      permissions,
      shareLinks: shareLinkInfos,
    };
  }

  async listSharedWithMe(
    data: ListSharedWithMeRequest,
  ): Promise<ListSharedWithMeResponse> {
    const { userId, page, limit, resourceType } = data;
    const now = new Date();

    const query: any = {
      sharedWith: userId,
      $or: [
        { expiresAt: { $gt: now } },
        { expiresAt: null },
        { expiresAt: { $exists: false } },
      ],
    };
    if (resourceType) {
      query.resourceType = resourceType;
    }

    const [total, sharedItems] = await Promise.all([
      SharedAccess.countDocuments(query),
      SharedAccess.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("resourceType resource sharedBy role createdAt updatedAt")
        .lean(),
    ]);

    if (sharedItems.length === 0) {
      return { items: [], total };
    }

    const folderIds = sharedItems
      .filter((item) => item.resourceType === "Folder")
      .map((item) => item.resource);
    const fileIds = sharedItems
      .filter((item) => item.resourceType === "File")
      .map((item) => item.resource);
    const userIds = [...new Set(sharedItems.map((item) => item.sharedBy))];

    const [folders, files, users] = await Promise.all([
      folderIds.length > 0
        ? Folder.find({ _id: { $in: folderIds } })
            .select("name color isStarred isTrashed createdAt updatedAt")
            .lean()
        : Promise.resolve([]),
      fileIds.length > 0
        ? File.find({ _id: { $in: fileIds } })
            .select(
              "name extension mimeType size isStarred isTrashed createdAt updatedAt",
            )
            .lean()
        : Promise.resolve([]),
      User.find({ _id: { $in: userIds } })
        .select("name email avatar")
        .lean(),
    ]);

    // 创建 Map
    const folderMap = new Map(folders.map((f) => [f._id.toString(), f]));
    const fileMap = new Map(files.map((f) => [f._id.toString(), f]));
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    // 组装结果
    const validItems: SharedWithMeItem[] = [];
    for (const item of sharedItems) {
      const resourceIdStr = item.resource.toString();
      const sharedByIdStr = item.sharedBy.toString();

      let resource: SharedResourceSummary | undefined;
      if (item.resourceType === "Folder") {
        const folder = folderMap.get(resourceIdStr);
        if (folder) {
          resource = {
            _id: folder._id.toString(),
            name: folder.name,
            color: folder.color,
            isStarred: folder.isStarred,
            isTrashed: folder.isTrashed,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
          };
        }
      } else {
        const file = fileMap.get(resourceIdStr);
        if (file) {
          resource = {
            _id: file._id.toString(),
            name: file.name,
            extension: file.extension,
            mimeType: file.mimeType,
            size: file.size,
            isStarred: file.isStarred,
            isTrashed: file.isTrashed,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
          };
        }
      }

      if (!resource) continue;

      const sharedByUser = userMap.get(sharedByIdStr);
      if (!sharedByUser) continue;

      validItems.push({
        resourceType: item.resourceType,
        resource,
        sharedBy: {
          _id: sharedByUser._id.toString(),
          name: sharedByUser.name,
          email: sharedByUser.email,
          avatar: sharedByUser.avatar?.thumbnail,
        },
        role: item.role,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }

    return { items: validItems, total };
  }

  async getResourceByShareToken(
    token: string,
    resourceType: ResourceType,
    password?: string,
  ): Promise<GetResourceByTokenResult> {
    // 先检查 ShareLink Model
    const shareLink = await ShareLink.findOne({
      token,
      resourceType,
      isRevoked: false,
    })
      .select("+policy.passwordHash")
      .lean();

    if (shareLink) {
      // 验证链接有效性
      if (
        shareLink.policy.expiresAt &&
        new Date() > shareLink.policy.expiresAt
      ) {
        throw new AppError(StatusCodes.FORBIDDEN, "Share link has expired");
      }

      if (
        shareLink.policy.maxAccessCount !== undefined &&
        shareLink.policy.maxAccessCount > 0 &&
        shareLink.accessCount >= shareLink.policy.maxAccessCount
      ) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          "Maximum access count reached",
        );
      }

      // 验证密码
      if (shareLink.policy.passwordHash) {
        if (!password) {
          throw new AppError(
            StatusCodes.FORBIDDEN,
            "Password required to access this link",
          );
        }
        const isMatch = await bcrypt.compare(
          password,
          shareLink.policy.passwordHash,
        );
        if (!isMatch) {
          throw new AppError(StatusCodes.FORBIDDEN, "Incorrect password");
        }
      }

      // 获取资源
      const resource =
        resourceType === "Folder"
          ? await Folder.findById(shareLink.resourceId).select("name").lean()
          : await File.findById(shareLink.resourceId)
              .select("name mimeType size extension")
              .lean();

      if (!resource) {
        throw new AppError(StatusCodes.NOT_FOUND, "Resource not found");
      }

      await ShareLink.updateOne(
        { _id: shareLink._id, isRevoked: false },
        { $inc: { accessCount: 1 } },
      );

      return {
        resourceId: shareLink.resourceId.toString(),
        resourceType,
        name: resource.name,
        role: shareLink.policy.role,
        allowDownload: shareLink.policy.allowDownload,
        hasPassword: !!shareLink.policy.passwordHash,
        mimeType: (resource as any).mimeType,
        size: (resource as any).size,
        extension: (resource as any).extension,
      };
    }

    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Shared resource not found or link has expired",
    );
  }

  async saveSharedResource(
    data: SaveSharedResourceRequest,
  ): Promise<SaveSharedResourceResult> {
    const {
      userId,
      resourceId,
      resourceType,
      targetFolderId,
      shareLinkToken,
      shareLinkPassword,
    } = data;

    const permissions = await this.permissionService.getEffectivePermissions({
      userId,
      resourceId,
      resourceType,
      shareLinkToken,
      shareLinkPassword,
    });

    if (!permissions.canView) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Permission denied to access this resource",
      );
    }

    const resource =
      resourceType === "Folder"
        ? await Folder.findById(resourceId).select("name user").lean()
        : await File.findById(resourceId).select("name user").lean();

    if (!resource) {
      throw new AppError(StatusCodes.NOT_FOUND, "Resource not found");
    }

    if (resource.user.toString() === userId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Cannot save your own resource as shortcut",
      );
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    let ancestors: mongoose.Types.ObjectId[] = [];
    if (targetFolderId !== "root") {
      const targetFolder = await Folder.findOne({
        _id: targetFolderId,
        user: userObjectId,
      });
      if (!targetFolder) {
        throw new AppError(StatusCodes.BAD_REQUEST, "Target folder not found");
      }
      ancestors = [...targetFolder.ancestors, targetFolder._id];
    }

    // 创建快捷方式
    let shortcut;
    if (resourceType === "Folder") {
      shortcut = await Folder.create({
        name: resource.name,
        user: userObjectId,
        parent: targetFolderId === "root" ? null : targetFolderId,
        ancestors,
        isShortcut: true,
        shortcutTarget: {
          targetId: resource._id,
          targetType: "Folder",
        },
        isStarred: false,
        isTrashed: false,
      });
    } else {
      shortcut = await File.create({
        name: resource.name,
        originalName: resource.name,
        user: userObjectId,
        folder: targetFolderId === "root" ? null : targetFolderId,
        mimeType: "application/vnd.drive.shortcut",
        extension: "shortcut",
        size: 0,
        ancestors,
        isShortcut: true,
        shortcutTarget: {
          targetId: resource._id,
          targetType: "File",
        },
        isStarred: false,
        isTrashed: false,
      });
    }

    // 同时创建 ACL（如果通过链接访问）
    if (shareLinkToken) {
      await SharedAccess.findOneAndUpdate(
        {
          resource: resourceId,
          sharedWith: userObjectId,
        },
        {
          resourceType,
          sharedBy: resource.user,
          role: permissions.effectiveRole || "viewer",
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    logger.info(
      { userId, resourceId, resourceType, shortcutId: shortcut._id },
      "Shared resource saved as shortcut",
    );

    return {
      shortcutId: shortcut._id.toString(),
      shortcutType: resourceType,
      name: shortcut.name,
      targetFolderId,
    };
  }

  /**
   * 验证分享链接并获取文件详情（用于下载/预览）
   * 包含 key 字段，用于 S3 操作
   */
  async getSharedFileForDownload(
    token: string,
    password?: string,
  ): Promise<SharedFileForDownload> {
    // 首先验证分享链接
    const resourceInfo = await this.getResourceByShareToken(
      token,
      "File",
      password,
    );

    // 获取文件详细信息（包含 key 字段）
    const file = await File.findById(resourceInfo.resourceId)
      .select("+key name mimeType size originalName")
      .lean();

    if (!file) {
      throw new AppError(StatusCodes.NOT_FOUND, "Shared file not found");
    }

    return {
      fileId: file._id.toString(),
      name: file.name,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      key: file.key,
      allowDownload: resourceInfo.allowDownload,
    };
  }

  /**
   * 获取分享文件夹内容
   * 支持访问子文件夹，会验证子文件夹是否在分享范围内
   */
  async getSharedFolderContent(
    token: string,
    subfolderId?: string,
    password?: string,
  ): Promise<SharedFolderContent> {
    // 验证分享链接并获取根文件夹
    const resourceInfo = await this.getResourceByShareToken(
      token,
      "Folder",
      password,
    );

    const sharedFolder = await Folder.findById(resourceInfo.resourceId)
      .select("name")
      .lean();

    if (!sharedFolder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Shared folder not found");
    }

    // 确定要列出的目标文件夹
    let targetFolderId = sharedFolder._id;

    if (subfolderId && subfolderId !== "root") {
      // 验证子文件夹在分享文件夹层级内
      const subfolderDoc = await Folder.findById(subfolderId)
        .select("ancestors")
        .lean();

      if (!subfolderDoc) {
        throw new AppError(StatusCodes.NOT_FOUND, "Subfolder not found");
      }

      const isInSharedFolder = subfolderDoc.ancestors.some(
        (ancestorId) => ancestorId.toString() === sharedFolder._id.toString(),
      );

      if (!isInSharedFolder && subfolderId !== sharedFolder._id.toString()) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          "Access denied to this subfolder",
        );
      }

      targetFolderId = subfolderDoc._id;
    }

    // 获取文件夹内容
    const [currentFolder, folders, files] = await Promise.all([
      Folder.findById(targetFolderId).select("name color").lean(),
      Folder.find({
        parent: targetFolderId,
        isTrashed: false,
      })
        .select("name color updatedAt")
        .lean(),
      File.find({
        folder: targetFolderId,
        isTrashed: false,
      })
        .select("name mimeType size extension originalName updatedAt")
        .lean(),
    ]);

    return {
      currentFolder: currentFolder
        ? {
            id: currentFolder._id.toString(),
            name: currentFolder.name,
            color: currentFolder.color,
          }
        : null,
      folders: folders.map((f) => ({
        id: f._id.toString(),
        name: f.name,
        color: f.color,
        type: "Folder" as const,
        updatedAt: f.updatedAt,
      })),
      files: files.map((f) => ({
        id: f._id.toString(),
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        extension: f.extension,
        originalName: f.originalName,
        type: "File" as const,
        updatedAt: f.updatedAt,
      })),
      shareToken: token,
    };
  }

  /**
   * 获取分享文件夹内的路径面包屑
   * 返回从分享根文件夹到目标文件夹的路径
   */
  async getSharedFolderPath(
    token: string,
    targetFolderId: string,
    password?: string,
  ): Promise<SharedFolderPathItem[]> {
    // 验证分享链接并获取分享文件夹
    const resourceInfo = await this.getResourceByShareToken(
      token,
      "Folder",
      password,
    );

    const sharedFolder = await Folder.findById(resourceInfo.resourceId)
      .select("name ancestors")
      .lean();

    if (!sharedFolder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Shared folder not found");
    }

    // 如果请求的是分享文件夹本身的路径
    if (targetFolderId === sharedFolder._id.toString()) {
      return [
        {
          id: sharedFolder._id.toString(),
          name: sharedFolder.name,
        },
      ];
    }

    // 获取目标文件夹
    const targetFolder = await Folder.findById(targetFolderId)
      .select("name ancestors")
      .lean();

    if (!targetFolder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    // 验证目标在分享文件夹内
    const isInSharedFolder = targetFolder.ancestors.some(
      (ancestorId) => ancestorId.toString() === sharedFolder._id.toString(),
    );

    if (!isInSharedFolder) {
      throw new AppError(StatusCodes.FORBIDDEN, "Access denied to this folder");
    }

    // 构建从分享文件夹开始的路径
    const sharedFolderIndex = targetFolder.ancestors.findIndex(
      (id) => id.toString() === sharedFolder._id.toString(),
    );

    const relevantAncestors = targetFolder.ancestors.slice(sharedFolderIndex);
    const ancestorFolders = await Folder.find({
      _id: { $in: relevantAncestors },
    })
      .select("name")
      .lean();

    const ancestorMap = new Map(
      ancestorFolders.map((f) => [f._id.toString(), f.name]),
    );

    return [
      ...relevantAncestors.map((id) => ({
        id: id.toString(),
        name: ancestorMap.get(id.toString()) || "Unknown",
      })),
      {
        id: targetFolder._id.toString(),
        name: targetFolder.name,
      },
    ];
  }

  private async getResource(
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<ResourceItem | null> {
    if (resourceType === "Folder") {
      return await Folder.findById(resourceId);
    } else {
      return await File.findById(resourceId);
    }
  }
}
