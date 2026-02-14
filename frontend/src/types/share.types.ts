import type { ResourceType } from "./common.types";

export type { ResourceType };

export const PERMISSION_SOURCE_MAP = {
  OWNER: "owner",
  DIRECT_ACL: "direct_acl",
  INHERITED_ACL: "inherited_acl",
  SHARE_LINK: "share_link",
  PUBLIC: "public",
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

export type AccessRole = "viewer" | "commenter" | "editor" | "owner";

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

// Re-export common types that might be used elsewhere
export interface PermissionDetail {
  resourceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  role: AccessRole;
  isInherited: boolean;
  inheritedFrom?: {
    resourceId: string;
    resourceName: string;
  };
}

export interface ResourcePermissionsResponse {
  owner: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  } | null;
  permissions: PermissionDetail[];
  shareLinks: ShareLinkInfo[];
}

export interface ShareLinkInfo {
  id: string;
  token: string;
  role: AccessRole;
  requireLogin: boolean;
  allowDownload: boolean;
  expiresAt?: string; // ISO Date string
  maxAccessCount?: number;
  accessCount: number;
  hasPassword: boolean;
  createdAt: string; // ISO Date string
}

export interface CreateShareLinkOptions {
  role?: AccessRole;
  requireLogin?: boolean;
  allowedUsers?: string[];
  allowedDomains?: string[];
  allowDownload?: boolean;
  expiresAt?: Date | string;
  maxAccessCount?: number;
  password?: string;
}

export interface CreateShareLinkRequest {
  resourceType: ResourceType;
  options?: CreateShareLinkOptions;
}

export interface CreateShareLinkResponse {
  shareLink: {
    id: string;
    token: string;
    role: AccessRole;
    requireLogin: boolean;
    allowDownload: boolean;
    expiresAt?: string;
    maxAccessCount?: number;
    createdAt: string;
  };
}

export interface UpdateShareLinkOptions {
  role?: AccessRole;
  requireLogin?: boolean;
  allowedUsers?: string[];
  allowedDomains?: string[];
  allowDownload?: boolean;
  expiresAt?: Date | string | null;
  maxAccessCount?: number | null;
  password?: string | null;
}

export interface UpdateShareLinkRequest {
  options: UpdateShareLinkOptions;
}

export interface UpdateShareLinkResponse {
  shareLink: {
    id: string;
    token: string;
    role: AccessRole;
    requireLogin: boolean;
    allowDownload: boolean;
    expiresAt?: string;
    maxAccessCount?: number;
  };
}

export interface ShareResourceRequest {
  resourceId: string;
  resourceType: ResourceType;
  resourceName?: string;
  targetUserIds: string[];
  role: AccessRole;
  expiresAt?: Date | string;
  notifyUsers?: boolean;
}

export interface ShareResourceResponse {
  message: string;
}

export interface ChangePermissionRequest {
  resourceType: ResourceType;
  newRole: AccessRole;
}

export interface ChangePermissionResponse {
  message: string;
}

export interface RemovePermissionResponse {
  message: string;
}

// Shared With Me Types
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

export interface SharedWithMeResponse {
  items: SharedWithMeItem[];
  total: number;
}

export interface ListSharedWithMeParams {
  page?: number;
  limit?: number;
  resourceType?: ResourceType;
}

export interface SaveSharedResourceRequest {
  targetFolderId?: string;
  password?: string;
}

export interface SaveSharedResourceResponse {
  message: string;
  shortcut: {
    shortcutId: string;
    shortcutType: ResourceType;
    name: string;
    targetFolderId: string;
  };
}

export interface SharedResourcePublicInfo {
  resourceId: string;
  resourceType: ResourceType;
  name: string;
  role: AccessRole;
  allowDownload: boolean;
  hasPassword: boolean;
  mimeType?: string;
  size?: number;
  extension?: string;
}
