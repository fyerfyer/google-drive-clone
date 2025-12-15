import type { IFile } from "@/types/file.types";
import type { BreadcrumbItem, Folder } from "@/types/folder.types";
import { createContext } from "react";

export type ViewMode = "grid" | "list";
export type ViewType = "folder" | "recent" | "starred" | "trash" | "files";

export interface FolderState {
  currentFolder: Folder | null;
  folders: Folder[];
  files: IFile[];
  filePaths: Map<string, BreadcrumbItem[]>;
  breadcrumbs: BreadcrumbItem[];
  isLoading: boolean;
  error: string | null;
  selectedItems: Set<string>;
  viewMode: ViewMode;
  viewType: ViewType;
}

export interface FolderContextType extends FolderState {
  // 文件夹操作
  loadFolderContent: (folderId: string) => Promise<void>;
  refreshContent: () => Promise<void>;

  // 更新操作
  updateItem: (id: string, changes: Partial<Folder | IFile>) => void;

  // UI 交互
  toggleSelection: (itemId: string) => void;
  selectAll: (itemIds: string[]) => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
  loadSpecialView: (view: Exclude<ViewType, "folder">) => void;
}

export const FolderContext = createContext<FolderContextType | undefined>(
  undefined
);
