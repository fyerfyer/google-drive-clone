import {
  AccessRole,
  NOTIFICATION_TYPES,
  QUEUE_TASKS,
  ResourceType,
  ResourceItem,
} from "../types/model.types";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import User from "../models/User.model";
import { SharedAccess } from "../models/SharedAccess.model";
import mongoose from "mongoose";
import { ILinkShareConfig } from "../models/LinkShareConfig.schema";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { logError } from "../lib/logger";
import { nanoid } from "nanoid";
import { notificationQueue } from "../lib/queue/queue";
import {
  CheckPermissionRequest,
  ResourcePermission,
  ShareResourceRequest,
  RemovePermissionRequest,
  ChangePermissionRequest,
  UpdateShareLinkRequest,
  ListSharedWithMeRequest,
  ListSharedWithMeResponse,
  SharedWithMeItem,
  SharedResourceSummary,
} from "../types/permission.types";

export class PermissionService {
  async checkPermission(
    data: CheckPermissionRequest,
    resourceCache?: ResourceItem,
  ): Promise<boolean> {
    const { userId, resourceId, resourceType, requireRole, token } = data;
    let resource: any = resourceCache;
    if (!resource) {
      if (resourceType === "Folder") {
        resource = await Folder.findById(resourceId)
          .select("name ancestors user linkShare")
          .lean();
      } else {
        resource = await File.findById(resourceId)
          .select("name ancestors user linkShare")
          .lean();
      }
    }

    if (!resource) {
      return false;
    }

    if (userId && resource.user.toString() === userId) return true;

    // 准备继承链
    const inheritanceChain = [resource._id, ...resource.ancestors];

    // Policy 检查
    const policyAccess = await this.checkInheritedPolicy(
      inheritanceChain,
      requireRole,
      resource.linkShare,
      token,
    );
    if (policyAccess) return true;

    // ACL 检查
    if (!userId) return false;

    const aclAccess = await this.checkInheritedACL(
      inheritanceChain,
      userId,
      requireRole,
    );

    return aclAccess;
  }

  // 获取用户最大有效权限
  async getUserRoleForResource(
    userId: string,
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<AccessRole | null> {
    let resource;
    if (resourceType == "Folder") {
      resource = await Folder.findById(resourceId)
        .select("ancestors user linkShare")
        .lean();
    } else {
      resource = await File.findById(resourceId)
        .select("ancestors user linkShare")
        .lean();
    }

    if (!resource) {
      return null;
    }

    if (resource.user.toString() === userId) {
      return "owner";
    }

    const now = new Date();
    const inheritanceChain = [resource._id, ...resource.ancestors];

    const permissions = await SharedAccess.find({
      sharedWith: userId,
      resource: { $in: inheritanceChain },
      $or: [
        { expiresAt: { $gt: now } },
        { expiresAt: null },
        { expiresAt: { $exists: false } },
      ],
    });

    if (permissions.length === 0) {
      return null;
    }

    const levels = { viewer: 1, commenter: 2, editor: 3, owner: 4 };
    let maxRole: AccessRole = "viewer";

    for (const perm of permissions) {
      if (levels[perm.role] > levels[maxRole]) {
        maxRole = perm.role;
      }
    }

    return maxRole;
  }

  async getResourcePermissions(
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<ResourcePermission> {
    let resource;

    if (resourceType === "Folder") {
      resource = await Folder.findById(resourceId)
        .select("name ancestors user linkShare")
        .lean();
    } else {
      resource = await File.findById(resourceId)
        .select("name ancestors user linkShare")
        .lean();
    }

    if (!resource) {
      const msg = "Resource not found";
      logError(new Error(msg), msg, { resourceId });
      throw new AppError(StatusCodes.NOT_FOUND, msg);
    }

    // 构建查询范围：资源本身+所有祖先
    const scopeIds = [resource._id, ...resource.ancestors];
    const now = new Date();

    // 并行查询
    const [aclList, ancestorFolders, ownerUser] = await Promise.all([
      SharedAccess.find({
        resource: { $in: scopeIds },
        $or: [
          { expiresAt: { $gt: now } },
          { expiresAt: null },
          { expiresAt: { $exists: false } },
        ],
      })
        .populate("sharedWith", "name email avatar")
        //手动查表而不是 populate 来查 resource，性能更好且类型更安全
        .sort({ role: -1 }) // Owner > Editor > Commenter > Viewer
        .lean(),
      Folder.find({ _id: { $in: resource.ancestors } })
        .select("name")
        .lean(),
      User.findById(resource.user).select("name email avatar").lean(),
    ]);

    if (!ownerUser) {
      const msg = "Owner user not found";
      logError(new Error(msg), msg, { resourceId });
      throw new AppError(StatusCodes.NOT_FOUND, msg);
    }

    const resourceNameMap = new Map<string, string>();
    resourceNameMap.set(String(resource._id), resource.name);
    ancestorFolders.forEach((folder) => {
      resourceNameMap.set(String(folder._id), folder.name);
    });

    const permissionResults = aclList.map((acl) => {
      const resourceIdStr = acl.resource.toString();
      const isInherited = resourceIdStr !== String(resourceId);

      return {
        resourceId,
        userId: (acl.sharedWith as any)._id || acl.sharedWith,
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

    return {
      owner: {
        name: ownerUser.name,
        email: ownerUser.email,
        avatar: ownerUser.avatar?.thumbnail,
      },
      permissions: permissionResults,
      linkShare: resource.linkShare,
    };
  }

  async shareResource(data: ShareResourceRequest) {
    const canShare = await this.checkPermission({
      userId: data.requesterId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      requireRole: "owner",
    });

    if (!canShare) {
      const msg = "Permission denied to share this resource";
      logError(new Error(msg), msg, {
        resourceId: data.resourceId,
        requesterId: data.requesterId,
      });
      throw new AppError(StatusCodes.FORBIDDEN, msg);
    }

    const usersToShare = await User.find({ _id: { $in: data.targetUserIds } });
    if (usersToShare.length === 0) {
      const msg = "No valid users to share with";
      logError(new Error(msg), msg, { targetUserIds: data.targetUserIds });
      throw new AppError(StatusCodes.BAD_REQUEST, msg);
    }

    const sharePromises = usersToShare.map((user) => {
      return SharedAccess.findOneAndUpdate(
        {
          resource: data.resourceId,
          resourceType: data.resourceType,
          sharedWith: user._id,
        },
        {
          sharedBy: data.requesterId,
          role: data.role,
          expiresAt: data.expiresAt,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    });

    await Promise.all(sharePromises);

    usersToShare.forEach((user) => {
      notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
        recipientId: user._id.toString(),
        senderId: data.requesterId,
        type: NOTIFICATION_TYPES.FILE_SHARED,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        resourceName: data.resourceName,
      });
    });

    return true;
  }

  async removePermission(data: RemovePermissionRequest) {
    const canModify = await this.checkPermission({
      userId: data.requesterId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      requireRole: "owner",
    });

    if (!canModify) {
      const msg = "Permission denied to modify permissions";
      logError(new Error(msg), msg, {
        resourceId: data.resourceId,
        requesterId: data.requesterId,
      });
      throw new AppError(StatusCodes.FORBIDDEN, msg);
    }

    await SharedAccess.findOneAndDelete({
      resource: data.resourceId,
      sharedWith: data.targetUserId,
    });

    return true;
  }

  async changePermission(data: ChangePermissionRequest) {
    const canModify = await this.checkPermission({
      userId: data.requesterId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      requireRole: "owner",
    });

    if (!canModify) {
      const msg = "Permission denied to modify permissions";
      logError(new Error(msg), msg, {
        resourceId: data.resourceId,
        requesterId: data.requesterId,
        targetUserId: data.targetUserId,
      });
      throw new AppError(StatusCodes.FORBIDDEN, msg);
    }

    await SharedAccess.findOneAndUpdate(
      {
        resource: data.resourceId,
        sharedWith: data.targetUserId,
      },
      {
        role: data.newRole,
      },
    );

    return true;
  }

  async updateLinkShare(data: UpdateShareLinkRequest) {
    const canShare = await this.checkPermission({
      userId: data.userId,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      requireRole: "owner",
    });

    if (!canShare) {
      const msg = "Permission denied to update link sharing settings";
      logError(new Error(msg), msg, {
        resourceId: data.resourceId,
        userId: data.userId,
      });
      throw new AppError(StatusCodes.FORBIDDEN, msg);
    }

    let resource: ResourceItem | null;
    if (data.resourceType === "Folder") {
      resource = await Folder.findById(data.resourceId);
    } else {
      resource = await File.findById(data.resourceId);
    }

    if (!resource) {
      const msg = "Resource not found";
      logError(new Error(msg), msg, { resourceId: data.resourceId });
      throw new AppError(StatusCodes.NOT_FOUND, msg);
    }

    const currentConfig = resource.linkShare || {};
    let newToken = currentConfig.token;
    if (
      (data.linkShareConfig.enableLinkSharing && !currentConfig.token) ||
      data.linkShareConfig.token === "RESET"
    ) {
      newToken = nanoid(); // 生成唯一 Token
    }

    const newConfig = {
      ...currentConfig,
      ...data.linkShareConfig,
      token: newToken,
    };

    resource.linkShare = newConfig;
    await resource.save();

    return {
      token: newToken,
      linkShareConfig: newConfig,
    };
  }

  async listSharedWithMe(
    data: ListSharedWithMeRequest,
  ): Promise<ListSharedWithMeResponse> {
    const { userId, page, limit, resourceType } = data;
    const now = new Date();

    // 构建查询条件
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

    // 并行查询总数和分页数据
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

    // 提取所有需要查询的 ID
    const resourceIds = sharedItems.map((item) => item.resource);
    const userIds = [...new Set(sharedItems.map((item) => item.sharedBy))];

    // 按类型分组资源 ID
    const folderIds = sharedItems
      .filter((item) => item.resourceType === "Folder")
      .map((item) => item.resource);
    const fileIds = sharedItems
      .filter((item) => item.resourceType === "File")
      .map((item) => item.resource);

    // 并行查询所有资源和用户
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

    // 创建 Map 以便快速查找
    const folderMap = new Map(folders.map((f) => [f._id.toString(), f]));
    const fileMap = new Map(files.map((f) => [f._id.toString(), f]));
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    // 组装结果
    const validItems: SharedWithMeItem[] = [];
    for (const item of sharedItems) {
      const resourceIdStr = item.resource.toString();
      const sharedByIdStr = item.sharedBy.toString();

      // 获取资源
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

      // 如果资源已被删除，跳过
      if (!resource) {
        continue;
      }

      // 获取分享者信息
      const sharedByUser = userMap.get(sharedByIdStr);
      if (!sharedByUser) {
        continue;
      }

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

    return {
      items: validItems,
      total,
    };
  }

  private validateLinkPolicy(
    config: ILinkShareConfig | undefined,
    requireRole: AccessRole,
  ): boolean {
    if (!config || !config.enableLinkSharing) return false;
    if (config.expiresAt && new Date() > config.expiresAt) return false;
    return this.hasSufficientRole(config.role, requireRole);
  }

  private async checkInheritedPolicy(
    chainIds: mongoose.Types.ObjectId[],
    requireRole: AccessRole,
    selfLinkShare: ILinkShareConfig | undefined,
    token?: string,
  ): Promise<boolean> {
    // 如果提供了 token，优先检查 token 是否匹配当前资源
    if (
      token &&
      selfLinkShare &&
      selfLinkShare.token &&
      this.validateLinkPolicy(selfLinkShare, requireRole) &&
      selfLinkShare.token === token
    ) {
      return true;
    }

    // 对当前资源的公开链接也做一次兜底检查（无需 token）
    if (
      !token &&
      selfLinkShare &&
      selfLinkShare.scope === "anyone" &&
      !selfLinkShare.password &&
      this.validateLinkPolicy(selfLinkShare, requireRole)
    ) {
      return true;
    }

    // 检查是否处于公开分享文件夹当中
    const ancestors = await Folder.find({
      _id: { $in: chainIds },
    }).select("linkShare");
    for (const folder of ancestors) {
      const config = folder.linkShare;
      if (!this.validateLinkPolicy(config, requireRole)) continue;

      const tokenMatches = token && config.token === token;
      const openAccess =
        !token && config.scope === "anyone" && !config.password;

      if (tokenMatches || openAccess) {
        return true;
      }
    }

    return false;
  }

  private async checkInheritedACL(
    chainIds: mongoose.Types.ObjectId[],
    userId: string,
    requireRole: AccessRole,
  ): Promise<boolean> {
    const now = new Date();
    const permissions = await SharedAccess.find({
      sharedWith: userId,
      resource: { $in: chainIds },
      $or: [
        { expiresAt: { $gt: now } },
        { expiresAt: null },
        { expiresAt: { $exists: false } },
      ],
    });

    for (const perm of permissions) {
      if (perm.expiresAt && new Date() > perm.expiresAt) continue;
      if (this.hasSufficientRole(perm.role, requireRole)) return true;
    }

    return false;
  }

  private hasSufficientRole(
    userRole: AccessRole,
    requiredRole: AccessRole,
  ): boolean {
    const levels = { viewer: 1, commenter: 2, editor: 3, owner: 4 };
    return (levels[userRole] || 0) >= (levels[requiredRole] || 0);
  }
}
