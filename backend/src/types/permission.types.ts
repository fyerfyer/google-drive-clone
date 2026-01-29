import { AccessRole, ResourceType } from "./model.types";
import { ILinkShareConfig } from "../models/LinkShareConfig.schema";

export interface CheckPermissionRequest {
  userId: string | null;
  resourceId: string;
  resourceType: ResourceType;
  requireRole: AccessRole;
  token?: string;
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

export interface ResourcePermission {
  owner: {
    name: string;
    email: string;
    avatar?: string;
  } | null;
  permissions: PermissionDetail[];
  linkShare: ILinkShareConfig;
}

export interface ShareResourceRequest {
  requesterId: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  targetUserIds: string[];
  role: AccessRole;
  expiresAt?: Date;
}

export interface RemovePermissionRequest {
  requesterId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetUserId: string;
}

export interface ChangePermissionRequest {
  requesterId: string;
  resourceId: string;
  resourceType: ResourceType;
  targetUserId: string;
  newRole: AccessRole;
}

export interface UpdateShareLinkRequest {
  userId: string;
  resourceId: string;
  resourceType: ResourceType;
  linkShareConfig: Partial<ILinkShareConfig>;
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
