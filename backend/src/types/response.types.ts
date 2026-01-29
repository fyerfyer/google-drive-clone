import { IUserPublic } from "../services/user.service";
import { IFilePublic } from "../services/file.service";
import { IFolderPublic, IFolderContent } from "../services/folder.service";
import { ILinkShareConfig } from "../models/LinkShareConfig.schema";
import { AccessRole } from "./model.types";
import { ListSharedWithMeResponse } from "./permission.types";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    code?: string;
    statusCode: number;
  };
}

// ==================== Auth Responses ====================
export interface AuthResponse {
  user: IUserPublic;
  token: string;
}

// ==================== User Responses ====================
export interface UserResponse {
  user: IUserPublic;
}

export interface UsersSearchResponse {
  users: IUserPublic[];
}

// ==================== File Responses ====================
export interface FileUploadResponse {
  file: IFilePublic;
}

export interface FileResponse {
  file: IFilePublic;
}

export interface FilesResponse {
  files: IFilePublic[];
}

// ==================== Folder Responses ====================
export interface FolderCreateResponse {
  folder: IFolderPublic;
}

export interface FolderResponse {
  folder: IFolderPublic;
}

export interface FoldersResponse {
  folders: IFolderPublic[];
}

// 使用 Service 层导出的类型
export interface FolderContentResponse extends IFolderContent {}

// ==================== Batch Operation Responses ====================
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

// ==================== Common Responses ====================
export interface MessageResponse {
  message: string;
}

export interface EmptyResponse {
  // Used for operations that don't return data
}

// ==================== Share & Permission Responses ====================
export interface ShareResourceResponse {
  message: string;
}

export interface ResourcePermission {
  resourceId: string;
  userId: string;
  role: AccessRole;
  isInherited: boolean;
  inheritedFrom?: {
    resourceId: string;
    resourceName: string;
  };
}

export interface ResourcePermissionsResponse {
  owner: {
    name: string;
    email: string;
    avatar?: string;
  } | null;
  permissions: ResourcePermission[];
  linkShare: ILinkShareConfig;
}

export interface RemovePermissionResponse {
  message: string;
}

export interface ChangePermissionResponse {
  message: string;
}

export interface UpdateLinkShareResponse {
  token: string | null;
  linkShareConfig: ILinkShareConfig;
}

export interface SharedWithMeResponse extends ListSharedWithMeResponse {}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
