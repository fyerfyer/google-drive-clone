import { AccessRole, ResourceType } from "./model.types";

export const PERMISSION_SOURCE_MAP = {
  OWNER: "owner", // 资源所有者
  DIRECT_ACL: "direct_acl", // 直接 ACL 授权
  INHERITED_ACL: "inherited_acl", // 继承的 ACL
  SHARE_LINK: "share_link", // 通过分享链接
  PUBLIC: "public", // 公开访问
} as const;

export type PermissionSourceType =
  (typeof PERMISSION_SOURCE_MAP)[keyof typeof PERMISSION_SOURCE_MAP];

export interface PermissionSource {
  type: PermissionSourceType;
  shareLinkId?: string;
  inheritedFrom?: {
    resourceId: string;
    resourceName: string;
  };
}

export interface PermissionSet {
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  isOwner: boolean;
  effectiveRole: AccessRole | null;
  source: PermissionSource;
}

export interface CheckPermissionRequest {
  userId: string | null;
  resourceId: string;
  resourceType: ResourceType;
  requireRole: AccessRole;
  token?: string;
  password?: string;
}

export interface GetEffectivePermissionsRequest {
  userId: string | null;
  resourceId: string;
  resourceType: ResourceType;
  shareLinkToken?: string;
  shareLinkPassword?: string;
}

export interface ShareLinkPolicyOptions {
  role: AccessRole;
  requireLogin?: boolean;
  allowedUsers?: string[];
  allowedDomains?: string[];
  allowDownload?: boolean;
  expiresAt?: Date;
  maxAccessCount?: number;
  password?: string;
}

export interface CreateShareLinkOptions {
  role?: AccessRole;
  requireLogin?: boolean;
  allowedUsers?: string[];
  allowedDomains?: string[];
  allowDownload?: boolean;
  expiresAt?: Date;
  maxAccessCount?: number;
  password?: string;
}

export interface CreateShareLinkRequest {
  actorId: string;
  resourceId: string;
  resourceType: ResourceType;
  options?: CreateShareLinkOptions;
}

export interface UpdateShareLinkOptions {
  role?: AccessRole;
  requireLogin?: boolean;
  allowedUsers?: string[];
  allowedDomains?: string[];
  allowDownload?: boolean;
  expiresAt?: Date | null;
  maxAccessCount?: number | null;
  password?: string | null;
}

export interface UpdateShareLinkRequest {
  actorId: string;
  linkId: string;
  options: UpdateShareLinkOptions;
}

export interface RevokeShareLinkRequest {
  actorId: string;
  linkId: string;
}

export interface ResolvedShareLink {
  linkId: string;
  resourceId: string;
  resourceType: ResourceType;
  role: AccessRole;
  requireLogin: boolean;
  allowedUsers: string[];
  allowedDomains: string[];
  allowDownload: boolean;
  expiresAt?: Date;
  maxAccessCount?: number;
  currentAccessCount: number;
  hasPassword: boolean;
  isValid: boolean;
  invalidReason?: string;
}

export interface ShareLinkInfo {
  id: string;
  token: string;
  role: AccessRole;
  requireLogin: boolean;
  allowDownload: boolean;
  expiresAt?: Date;
  maxAccessCount?: number;
  accessCount: number;
  hasPassword: boolean;
  createdAt: Date;
}

export interface ShareWithUsersRequest {
  actorId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetUserIds: string[];
  role: AccessRole;
  expiresAt?: Date;
  notifyUsers?: boolean;
  resourceName?: string;
}

export interface ShareWithUsersResult {
  successCount: number;
  failedUserIds: string[];
}

export interface UpdateUserShareRoleRequest {
  actorId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetUserId: string;
  newRole: AccessRole;
}

export interface UnshareWithUserRequest {
  actorId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetUserId: string;
}

export interface ListSharedWithMeRequest {
  userId: string;
  page: number;
  limit: number;
  resourceType?: ResourceType;
}

export interface SharedResourceSummary {
  _id: string;
  name: string;
  isStarred: boolean;
  isTrashed: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Folder specific
  color?: string;
  // File specific
  extension?: string;
  mimeType?: string;
  size?: number;
}

export interface SharedWithMeItem {
  resourceType: ResourceType;
  resource: SharedResourceSummary;
  sharedBy: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  role: AccessRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListSharedWithMeResponse {
  items: SharedWithMeItem[];
  total: number;
}

export interface SaveSharedResourceRequest {
  userId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetFolderId: string;
  shareLinkToken?: string;
  shareLinkPassword?: string;
}

export interface SaveSharedResourceResult {
  shortcutId: string;
  shortcutType: ResourceType;
  name: string;
  targetFolderId: string;
}

export interface InheritedFromInfo {
  resourceId: string;
  resourceName: string;
}

export interface PermissionDetail {
  resourceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  role: AccessRole;
  isInherited: boolean;
  inheritedFrom?: InheritedFromInfo;
}

export interface ResourcePermissionInfo {
  owner: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  } | null;
  permissions: PermissionDetail[];
  shareLinks: ShareLinkInfo[];
}

export interface GetResourceByTokenResult {
  resourceId: string;
  resourceType: ResourceType;
  name: string;
  role: AccessRole;
  allowDownload: boolean;
  hasPassword: boolean;
  // File specific
  mimeType?: string;
  size?: number;
  extension?: string;
}

// 用于下载/预览的文件详情（包含 S3 key）
export interface SharedFileForDownload {
  fileId: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  key: string; // S3 存储 key
  allowDownload: boolean;
}

// 分享文件夹内容条目 - 文件夹
export interface SharedFolderItem {
  id: string;
  name: string;
  color?: string;
  type: "Folder";
  updatedAt: Date;
}

// 分享文件夹内容条目 - 文件
export interface SharedFileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  extension: string;
  originalName: string;
  type: "File";
  updatedAt: Date;
}

// 分享文件夹内容
export interface SharedFolderContent {
  currentFolder: {
    id: string;
    name: string;
    color?: string;
  } | null;
  folders: SharedFolderItem[];
  files: SharedFileItem[];
  shareToken: string;
}

// 分享文件夹路径条目
export interface SharedFolderPathItem {
  id: string;
  name: string;
}
