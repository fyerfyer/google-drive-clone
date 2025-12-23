import {
  AccessRole,
  NOTIFICATION_TYPES,
  QUEUE_TASKS,
  ResourceType,
} from "../types/model.types";
import File, { IFile } from "../models/File.model";
import Folder, { IFolder } from "../models/Folder.model";
import User from "../models/User.model";
import { SharedAccess } from "../models/SharedAccess.model";
import mongoose from "mongoose";
import { ILinkShareConfig } from "../models/LinkShareConfig.schema";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { logError } from "../lib/logger";
import { nanoid } from "nanoid";
import { notificationQueue } from "../lib/queue/queue";

interface checkPermissionRequest {
  userId: string | null; // 未登录用户可以访问公开链接
  resourceId: string;
  resourceType: ResourceType; // 显式传入，减少数据库查询
  requireRole: AccessRole;
  token?: string; // 如果用户通过链接访问需要带上 token
}

interface inheritedFromDTO {
  resourceId: string;
  resourceName: string;
}

interface ResourceDTO {
  resourceId: string;
  userId: string;
  role: AccessRole;
  isInherited: boolean;
  inheritedFrom?: inheritedFromDTO; // 继承自哪个资源 ID
}

interface IResourcePermission {
  owner: {
    name: string;
    email: string;
    avatar?: string;
  } | null;
  permissions: ResourceDTO[];
  linkShare: ILinkShareConfig;
}

interface shareResourceRequest {
  requesterId: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  targetUserIds: string[];
  role: AccessRole;
  expiresAt?: Date;
}

interface RemovePermissionRequest {
  requesterId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetUserId: string;
}

interface ChangePermissionRequest {
  requesterId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetUserId: string;
  newRole: AccessRole;
}

interface UpdateShareLinkRequest {
  userId: string;
  resourceId: string;
  resourceType: ResourceType;
  linkShareConfig: Partial<ILinkShareConfig>;
}

export class PermissionService {
  async checkPermission(data: checkPermissionRequest): Promise<boolean> {
    const { userId, resourceId, resourceType, requireRole, token } = data;
    let resource: IFolder | IFile | null;
    if (resourceType === "Folder") {
      resource = await Folder.findById(resourceId).select(
        "user ancestors linkShare"
      );
    } else {
      resource = await File.findById(resourceId).select(
        "user ancestors linkShare"
      );
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
      token
    );
    if (policyAccess) return true;

    // ACL 检查
    if (!userId) return false;

    const aclAccess = await this.checkInheritedACL(
      inheritanceChain,
      userId,
      requireRole
    );

    return aclAccess;
  }

  async getResourcePermissions(
    resourceId: string,
    resourceType: ResourceType
  ): Promise<IResourcePermission> {
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

    // 并行查询
    const [aclList, ancestorFolders, ownerUser] = await Promise.all([
      SharedAccess.find({ resource: { $in: scopeIds } })
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
        avatar: ownerUser.avatar.thumbnail,
      },
      permissions: permissionResults,
      linkShare: resource.linkShare,
    };
  }

  async shareResource(data: shareResourceRequest) {
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
          sharedWith: user._id,
        },
        {
          role: data.role,
          expiresAt: data.expiresAt,
        },
        { upsert: true, new: true }
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
      }
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

    let resource: IFolder | IFile | null;
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

  private validateLinkPolicy(
    config: ILinkShareConfig,
    requireRole: AccessRole
  ): boolean {
    if (config.expiresAt && new Date() > config.expiresAt) return false;
    return this.hasSufficientRole(config.role, requireRole);
  }

  private async checkInheritedPolicy(
    chainIds: mongoose.Types.ObjectId[],
    requireRole: AccessRole,
    selfLinkShare: ILinkShareConfig,
    token?: string
  ): Promise<boolean> {
    // 如果提供了 token，优先检查 token 是否匹配当前资源
    if (
      token &&
      selfLinkShare.enableLinkSharing &&
      selfLinkShare.token === token
    ) {
      if (this.validateLinkPolicy(selfLinkShare, requireRole)) {
        return true;
      }
    }

    // 如果没有 token，检查是否处于公开分享文件夹当中
    const ancestors = await Folder.find({
      _id: { $in: chainIds },
    }).select("linkShare");
    for (const folder of ancestors) {
      const config = folder.linkShare;
      if (!config.enableLinkSharing) continue;

      // 如果是公开链接且无密码，直接继承
      if (config.scope === "anyone" && !config.password) {
        return true;
      }

      // 如果提供了 token，检查 token 是否匹配
      if (token && config.token === token) {
        if (this.validateLinkPolicy(config, requireRole)) {
          return true;
        }
      }
    }

    return false;
  }

  private async checkInheritedACL(
    chainIds: mongoose.Types.ObjectId[],
    userId: string,
    requireRole: AccessRole
  ): Promise<boolean> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const permissions = await SharedAccess.find({
      sharedWith: userId,
      resource: { $in: chainIds },
    });

    for (const perm of permissions) {
      if (perm.expiresAt && new Date() > perm.expiresAt) continue;
      if (this.hasSufficientRole(perm.role, requireRole)) return true;
    }

    return false;
  }

  private hasSufficientRole(
    userRole: AccessRole,
    requiredRole: AccessRole
  ): boolean {
    const levels = { viewer: 1, commenter: 2, editor: 3, owner: 4 };
    return (levels[userRole] || 0) >= (levels[requiredRole] || 0);
  }
}
