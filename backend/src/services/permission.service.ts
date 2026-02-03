import { AccessRole, ResourceType, ResourceItem } from "../types/model.types";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import { SharedAccess } from "../models/SharedAccess.model";
import {
  ShareLink,
  IShareLink,
  IShareLinkPolicy,
} from "../models/ShareLink.model";
import mongoose from "mongoose";
import {
  PermissionSet,
  PermissionSource,
  PermissionSourceType,
  CheckPermissionRequest,
  GetEffectivePermissionsRequest,
  ResolvedShareLink,
} from "../types/share.types";
import bcrypt from "bcryptjs";

// Lean document types for MongoDB queries
type LeanShareLink = {
  _id: mongoose.Types.ObjectId;
  resourceId: mongoose.Types.ObjectId;
  resourceType: "File" | "Folder";
  token: string;
  policy: IShareLinkPolicy;
  createdBy: mongoose.Types.ObjectId;
  accessCount: number;
  isRevoked: boolean;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

// 角色权限等级映射
const ROLE_LEVELS: Record<AccessRole, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
};

// 根据角色确定权限
const ROLE_PERMISSIONS: Record<
  AccessRole,
  Omit<PermissionSet, "effectiveRole" | "isOwner" | "source">
> = {
  viewer: {
    canView: true,
    canComment: false,
    canEdit: false,
    canShare: false,
    canDelete: false,
  },
  commenter: {
    canView: true,
    canComment: true,
    canEdit: false,
    canShare: false,
    canDelete: false,
  },
  editor: {
    canView: true,
    canComment: true,
    canEdit: true,
    canShare: false,
    canDelete: false,
  },
  owner: {
    canView: true,
    canComment: true,
    canEdit: true,
    canShare: true,
    canDelete: true,
  },
};

export class PermissionService {
  async checkPermission(
    data: CheckPermissionRequest,
    resourceCache?: ResourceItem,
  ): Promise<boolean> {
    const { userId, resourceId, resourceType, requireRole, token, password } =
      data;

    // 特殊情况："root" 文件夹对已认证用户始终可访问
    if (resourceId === "root" && resourceType === "Folder") {
      return userId !== null;
    }

    const permissions = await this.getEffectivePermissions(
      {
        userId,
        resourceId,
        resourceType,
        shareLinkToken: token,
        shareLinkPassword: password,
      },
      resourceCache,
    );

    return this.hasSufficientRole(permissions.effectiveRole, requireRole);
  }

  async getEffectivePermissions(
    data: GetEffectivePermissionsRequest,
    resourceCache?: ResourceItem,
  ): Promise<PermissionSet> {
    const {
      userId,
      resourceId,
      resourceType,
      shareLinkToken,
      shareLinkPassword,
    } = data;

    // 获取资源
    let resource: ResourceItem | null = resourceCache || null;
    if (!resource) {
      resource = await this.getResource(resourceId, resourceType);
    }

    if (!resource) {
      return this.createEmptyPermissionSet();
    }

    // 1. 检查是否为所有者
    if (userId && resource.user.toString() === userId) {
      return this.createOwnerPermissionSet();
    }

    // 准备继承链
    const inheritanceChain = [resource._id, ...resource.ancestors];

    // 2. 通过分享链接访问
    if (shareLinkToken) {
      const linkPermission = await this.checkShareLinkPermission(
        shareLinkToken,
        resourceId,
        resourceType,
        userId,
        shareLinkPassword,
      );
      if (linkPermission) {
        return linkPermission;
      }
    }

    // 3. 检查 ACL（需要登录）
    if (!userId) {
      return this.createEmptyPermissionSet();
    }

    const aclPermission = await this.checkACLPermission(
      inheritanceChain,
      userId,
    );

    return aclPermission || this.createEmptyPermissionSet();
  }

  async getUserRoleForResource(
    userId: string,
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<AccessRole | null> {
    const permissions = await this.getEffectivePermissions({
      userId,
      resourceId,
      resourceType,
    });
    return permissions.effectiveRole;
  }

  async canView(ctx: GetEffectivePermissionsRequest): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(ctx);
    return permissions.canView;
  }

  async canComment(ctx: GetEffectivePermissionsRequest): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(ctx);
    return permissions.canComment;
  }

  async canEdit(ctx: GetEffectivePermissionsRequest): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(ctx);
    return permissions.canEdit;
  }

  async canShare(ctx: GetEffectivePermissionsRequest): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(ctx);
    return permissions.canShare;
  }

  async canDelete(ctx: GetEffectivePermissionsRequest): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(ctx);
    return permissions.canDelete;
  }

  async resolveShareLink(token: string): Promise<ResolvedShareLink | null> {
    const shareLink = await ShareLink.findOne({ token })
      .select("+policy.passwordHash")
      .lean();

    if (!shareLink) {
      return null;
    }

    const isValid = this.validateShareLinkPolicy(shareLink);

    return {
      linkId: shareLink._id.toString(),
      resourceId: shareLink.resourceId.toString(),
      resourceType: shareLink.resourceType,
      role: shareLink.policy.role,
      requireLogin: shareLink.policy.requireLogin,
      allowedUsers: shareLink.policy.allowedUsers.map((id) => id.toString()),
      allowedDomains: shareLink.policy.allowedDomains,
      allowDownload: shareLink.policy.allowDownload,
      expiresAt: shareLink.policy.expiresAt,
      maxAccessCount: shareLink.policy.maxAccessCount,
      currentAccessCount: shareLink.accessCount,
      hasPassword: !!shareLink.policy.passwordHash,
      isValid: isValid.valid,
      invalidReason: isValid.reason,
    };
  }

  async validateShareLinkAccess(
    token: string,
    userId: string | null,
    userEmail: string | null,
    password?: string,
  ): Promise<{ valid: boolean; role?: AccessRole; reason?: string }> {
    const shareLink = await ShareLink.findOne({ token })
      .select("+policy.passwordHash")
      .lean();

    if (!shareLink) {
      return { valid: false, reason: "Link not found" };
    }

    // 检查基本有效性
    const basicValidation = this.validateShareLinkPolicy(shareLink);
    if (!basicValidation.valid) {
      return { valid: false, reason: basicValidation.reason };
    }

    // 检查是否需要登录
    if (shareLink.policy.requireLogin && !userId) {
      return { valid: false, reason: "Login required" };
    }

    // 检查允许的用户列表
    if (shareLink.policy.allowedUsers.length > 0 && userId) {
      const isAllowed = shareLink.policy.allowedUsers.some(
        (allowedId) => allowedId.toString() === userId,
      );
      if (!isAllowed) {
        return { valid: false, reason: "User not in allowed list" };
      }
    }

    // 检查允许的域名
    if (shareLink.policy.allowedDomains.length > 0 && userEmail) {
      const emailDomain = userEmail.split("@")[1]?.toLowerCase();
      const isAllowed = shareLink.policy.allowedDomains.some(
        (domain) => domain.toLowerCase() === emailDomain,
      );
      if (!isAllowed) {
        return { valid: false, reason: "Email domain not allowed" };
      }
    }

    // 检查密码
    if (shareLink.policy.passwordHash) {
      if (!password) {
        return { valid: false, reason: "Password required" };
      }
      const isMatch = await bcrypt.compare(
        password,
        shareLink.policy.passwordHash,
      );
      if (!isMatch) {
        return { valid: false, reason: "Invalid password" };
      }
    }

    return { valid: true, role: shareLink.policy.role };
  }

  private async getResource(
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<any> {
    if (resourceType === "Folder") {
      return await Folder.findById(resourceId)

        .select("name ancestors user")
        .lean();
    } else {
      return await File.findById(resourceId)
        .select("name ancestors user")
        .lean();
    }
  }

  private async checkShareLinkPermission(
    token: string,
    resourceId: string,
    resourceType: ResourceType,
    userId: string | null,
    password?: string,
  ): Promise<PermissionSet | null> {
    const shareLink = await ShareLink.findOne({
      token,
      resourceId,
      resourceType,
      isRevoked: false,
    })
      .select("+policy.passwordHash")
      .lean();

    if (!shareLink) {
      return null;
    }

    // 验证链接有效性
    const validation = this.validateShareLinkPolicy(shareLink);
    if (!validation.valid) {
      return null;
    }

    // 检查是否需要登录
    if (shareLink.policy.requireLogin && !userId) {
      return null;
    }

    // 检查允许的用户列表
    if (shareLink.policy.allowedUsers.length > 0) {
      if (!userId) return null;
      const isAllowed = shareLink.policy.allowedUsers.some(
        (allowedId) => allowedId.toString() === userId,
      );
      if (!isAllowed) return null;
    }

    // 检查密码
    if (shareLink.policy.passwordHash) {
      if (!password) return null;
      const isMatch = await bcrypt.compare(
        password,
        shareLink.policy.passwordHash,
      );
      if (!isMatch) return null;
    }

    return this.createPermissionSetFromRole(shareLink.policy.role, {
      type: "share_link",
      shareLinkId: shareLink._id.toString(),
    });
  }

  private async checkACLPermission(
    chainIds: mongoose.Types.ObjectId[],
    userId: string,
  ): Promise<PermissionSet | null> {
    const now = new Date();
    const permissions = await SharedAccess.find({
      sharedWith: userId,
      resource: { $in: chainIds },
      $or: [
        { expiresAt: { $gt: now } },
        { expiresAt: null },
        { expiresAt: { $exists: false } },
      ],
    })
      .populate({
        path: "resource",
        select: "name",
      })
      .lean();

    if (permissions.length === 0) {
      return null;
    }

    // 找出最高权限
    let maxRole: AccessRole = "viewer";
    let maxPermission = permissions[0];

    for (const perm of permissions) {
      if (ROLE_LEVELS[perm.role] > ROLE_LEVELS[maxRole]) {
        maxRole = perm.role;
        maxPermission = perm;
      }
    }

    // 判断是直接授权还是继承
    const isInherited =
      maxPermission.resource._id.toString() !== chainIds[0].toString();
    const resourceDoc = maxPermission.resource as any;

    return this.createPermissionSetFromRole(maxRole, {
      type: isInherited ? "inherited_acl" : "direct_acl",
      inheritedFrom: isInherited
        ? {
            resourceId: maxPermission.resource._id.toString(),
            resourceName: resourceDoc.name || "Unknown",
          }
        : undefined,
    });
  }

  private validateShareLinkPolicy(shareLink: LeanShareLink): {
    valid: boolean;
    reason?: string;
  } {
    if (shareLink.isRevoked) {
      return { valid: false, reason: "Link has been revoked" };
    }

    if (shareLink.policy.expiresAt && new Date() > shareLink.policy.expiresAt) {
      return { valid: false, reason: "Link has expired" };
    }

    if (
      shareLink.policy.maxAccessCount !== undefined &&
      shareLink.policy.maxAccessCount > 0 &&
      shareLink.accessCount >= shareLink.policy.maxAccessCount
    ) {
      return { valid: false, reason: "Maximum access count reached" };
    }

    return { valid: true };
  }

  private hasSufficientRole(
    userRole: AccessRole | null,
    requiredRole: AccessRole,
  ): boolean {
    if (!userRole) return false;
    return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole];
  }

  private createEmptyPermissionSet(): PermissionSet {
    return {
      canView: false,
      canComment: false,
      canEdit: false,
      canShare: false,
      canDelete: false,
      isOwner: false,
      effectiveRole: null,
      source: { type: "public" },
    };
  }

  private createOwnerPermissionSet(): PermissionSet {
    return {
      ...ROLE_PERMISSIONS.owner,
      isOwner: true,
      effectiveRole: "owner",
      source: { type: "owner" },
    };
  }

  private createPermissionSetFromRole(
    role: AccessRole,
    source: PermissionSource,
  ): PermissionSet {
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
    return {
      ...permissions,
      isOwner: role === "owner",
      effectiveRole: role,
      source,
    };
  }
}
