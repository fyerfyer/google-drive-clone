import type { IFile } from "@/types/file.types";
import type { BreadcrumbItem, Folder } from "@/types/folder.types";
import { createContext } from "react";

export interface FolderState {
  currentFolder: Folder | null;
  folders: Folder[];
  files: IFile[];
  breadcrumbs: BreadcrumbItem[];
  isLoading: boolean;
  error: string | null;
  selectedItems: Set<string>;
  viewMode: "grid" | "list";
}

export interface FolderContextType extends FolderState {
  // 文件夹操作
  loadFolderContent: (folderId: string) => Promise<void>;
  refreshContent: () => Promise<void>;

  // UI 交互
  toggleSelection: (itemId: string) => void;
  clearSelection: () => void;
  setViewMode: (mode: "grid" | "list") => void;
}

export const FolderContext = createContext<FolderContextType | undefined>(
  undefined
);
