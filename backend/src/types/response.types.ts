import { IUserPublic } from "../services/user.service";
import { IFilePublic } from "../services/file.service";
import { IFolderPublic, IFolderContent } from "../services/folder.service";

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

// ==================== Common Responses ====================
export interface MessageResponse {
  message: string;
}

export interface EmptyResponse {
  // Used for operations that don't return data
}
