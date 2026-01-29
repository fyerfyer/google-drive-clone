import type { AccessRole } from "@/types/common.types";
export type { AccessRole };

// ==================== 资源类型 ====================
export type ResourceType = "File" | "Folder";

export type LinkShareScope = "anyone" | "domain" | "none";

// ==================== 链接分享配置 ====================
export interface LinkShareConfig {
  enableLinkSharing: boolean;
  token: string | null;
  role: AccessRole;
  password?: string;
  expiresAt?: string;
  allowDownload: boolean;
  scope: LinkShareScope;
}

// ==================== 权限详情 ====================
export interface InheritedFromInfo {
  resourceId: string;
  resourceName: string;
}

export interface PermissionDetail {
  resourceId: string;
  userId: string;
  role: AccessRole;
  isInherited: boolean;
  inheritedFrom?: InheritedFromInfo;
}

// ==================== 资源权限 ====================
export interface ResourcePermission {
  resourceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  role: AccessRole;
  isInherited: boolean;
  inheritedFrom?: InheritedFromInfo;
}

// ==================== 共享资源摘要 ====================
export interface SharedResourceSummary {
  _id: string;
  name: string;
  isStarred: boolean;
  isTrashed: boolean;
  createdAt: string;
  updatedAt: string;
  // Folder specific
  color?: string;
  // File specific
  extension?: string;
  mimeType?: string;
  size?: number;
}

// ==================== 共享给我的项目 ====================
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
  createdAt: string;
  updatedAt: string;
}

// ==================== 用户基础信息（带id兼容） ====================
export interface ShareUserInfo {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  avatar?: string;
}

// ==================== Request Types ====================
export interface ShareResourceRequest {
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  targetUserIds: string[];
  role: AccessRole;
  expiresAt?: string;
}

export interface ChangePermissionRequest {
  resourceType: ResourceType;
  newRole: AccessRole;
}

export interface UpdateLinkShareRequest {
  resourceType: ResourceType;
  linkShareConfig: Partial<LinkShareConfig>;
}

export interface ListSharedWithMeParams {
  page?: number;
  limit?: number;
  resourceType?: ResourceType;
}

// ==================== Response Types ====================
export interface ShareResourceResponse {
  message: string;
}

export interface ResourcePermissionsResponse {
  owner: {
    name: string;
    email: string;
    avatar?: string;
  } | null;
  permissions: ResourcePermission[];
  linkShare: LinkShareConfig;
}

export interface RemovePermissionResponse {
  message: string;
}

export interface ChangePermissionResponse {
  message: string;
}

export interface UpdateLinkShareResponse {
  token: string | null;
  linkShareConfig: LinkShareConfig;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SharedWithMeResponse {
  items: SharedWithMeItem[];
  total: number;
  pagination: PaginationMeta;
}

// ==================== UI辅助类型 ====================
export interface ShareDialogUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: AccessRole;
  isInherited: boolean;
  inheritedFrom?: InheritedFromInfo;
}

export interface ShareDialogState {
  isOpen: boolean;
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
}
