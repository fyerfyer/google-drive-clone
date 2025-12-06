import {
  type BaseItem,
  type UserBasic,
  type ShareInfo,
} from "@/types/common.types";
import type { IFile } from "@/types/file.types";
import z from "zod";

export interface Folder extends BaseItem {
  type: "folder";
  parent: string | null;
  user: UserBasic;
  color: string;
  description?: string;
  isPublic: boolean;
  sharedWith: ShareInfo[];
  trashedAt?: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  user?: UserBasic;
}

export interface FolderContent {
  currentFolder: Folder;
  breadcrumbs: BreadcrumbItem[];
  folders: Folder[];
  files: IFile[];
}

export interface FolderTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderTreeNode[];
  isExpanded: boolean;
}

// folderId 通过路径参数传递
export interface MoveFolderRequest {
  destinationId: string | null;
}

export interface FolderContentResponse {
  currentFolder: Folder;
  breadcrumbs: BreadcrumbItem[];
  folders: Folder[];
  files: IFile[];
}

export interface FolderCreateResponse {
  folder: Folder;
}

export interface FolderResponse {
  folder: Folder;
}

// 表单校验
const FORBIDDEN_CHARS = /[<>:"/\\|?*]/;
const FORBIDDEN_MSG = 'Name cannot contain < > : " / \\ | ? *';

export const createFolderSchema = z.object({
  name: z
    .string()
    .min(1, "Folder name must be at least 1 character")
    .max(255, "Folder name cannot be more than 255 characters")
    .regex(/^[^.][^]*$/, "Name cannot start with a dot")
    .refine((val) => !FORBIDDEN_CHARS.test(val), {
      message: FORBIDDEN_MSG,
    })
    .refine((val) => val.trim().length > 0, {
      message: "Folder name cannot be empty or whitespace only",
    })
    .trim(),
  parentId: z.string().optional().nullable(),
  description: z
    .string()
    .max(500, "Description cannot be more than 500 characters")
    .optional(),
});

export const renameFolderSchema = z.object({
  newName: z
    .string()
    .min(1, "Folder name must be at least 1 character")
    .max(255, "Folder name cannot be more than 255 characters")
    .regex(/^[^.][^]*$/, "Name cannot start with a dot")
    .refine((val) => !FORBIDDEN_CHARS.test(val), {
      message: FORBIDDEN_MSG,
    })
    .refine((val) => val.trim().length > 0, {
      message: "Folder name cannot be empty or whitespace only",
    })
    .trim(),
});

export type CreateFolderRequest = z.infer<typeof createFolderSchema>;
export type RenameFolderRequest = z.infer<typeof renameFolderSchema>;
