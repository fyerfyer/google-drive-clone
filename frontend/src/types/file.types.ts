import {
  type BaseItem,
  type UserBasic,
  type ShareInfo,
} from "@/types/common.types";
import z from "zod";

export interface IFile extends BaseItem {
  type: "file";
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  folder: string;
  extension: string;
  user: UserBasic;
  isPublic: boolean;
  sharedWith: ShareInfo[];
  trashedAt?: string;
}

export interface UploadFileProgress {
  file: File;
  fileId: string; // 临时ID，用于标识上传中的文件
  progress: number; // 上传进度百分比
  status: "pending" | "hashing" | "uploading" | "success" | "error";
  message?: string;
}

export interface UploadFileRequest {
  file: File;
  folderId: string;
  hash: string;
}

// Note: fileId is now a path parameter, not in request body
export interface RenameFileRequest {
  newName: string;
}

export interface MoveFileRequest {
  destinationId: string;
}

// TrashFileRequest and RestoreFileRequest don't need body data
// fileId is passed as path parameter

export interface FileDownloadResponse {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  expiresIn: number;
}

export interface FileUploadResponse {
  file: IFile;
}

export interface FileResponse {
  file: IFile;
}

// 表单校验
const FORBIDDEN_CHARS = /[<>:"/\\|?*]/;
const FORBIDDEN_MSG = 'Name cannot contain < > : " / \\ | ? *';

export const uploadFileSchema = z.object({
  originalName: z
    .string()
    .min(1, "File name must be at least 1 character")
    .max(255, "File name cannot be more than 255 characters")
    .regex(/^[^.][^]*$/, "Name cannot start with a dot")
    .refine((val) => !FORBIDDEN_CHARS.test(val), {
      message: FORBIDDEN_MSG,
    })
    .trim(),

  folderId: z.string().min(1, "Folder ID is required"),
  file: z
    .instanceof(File, { message: "Please select a valid file to upload" })
    .refine((file) => file.size > 0, { message: "File cannot be empty" }),
  hash: z.string().min(1, "File hash calculation failed"),
});

export const renameFileSchema = z.object({
  newName: z
    .string()
    .min(1, "File name must be at least 1 character")
    .max(255, "File name cannot be more than 255 characters")
    .regex(/^[^.][^]*$/, "Name cannot start with a dot")
    .refine((val) => !FORBIDDEN_CHARS.test(val), {
      message: FORBIDDEN_MSG,
    })
    .refine((val) => val.trim().length > 0, {
      message: "File name cannot be empty or whitespace only",
    }),
});

export type UploadFileFormData = z.infer<typeof uploadFileSchema>;
export type RenameFileFormData = z.infer<typeof renameFileSchema>;
