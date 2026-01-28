import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { ViewType, ViewMode } from "@/types/common.types";
import type { IFile } from "@/types/file.types";
import type { Folder, BreadcrumbItem } from "@/types/folder.types";
import { fileService } from "@/services/file.service";
import { folderService } from "@/services/folder.service";
import { toast } from "sonner";

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

export interface FolderActions {
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

export type FolderStore = FolderState & FolderActions;

export const useFolderStore = create<FolderStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentFolder: null,
      folders: [],
      files: [],
      filePaths: new Map<string, BreadcrumbItem[]>(),
      breadcrumbs: [],
      isLoading: false,
      error: null,
      selectedItems: new Set<string>(),
      viewMode: "grid",
      viewType: "folder",

      // Load folder content
      loadFolderContent: async (folderId: string) => {
        try {
          set(
            { isLoading: true, error: null, viewType: "folder" },
            false,
            "folder/load-start",
          );
          const content = await folderService.getFolderContent(folderId);
          set(
            {
              currentFolder: content.currentFolder,
              folders: content.folders,
              files: content.files,
              breadcrumbs: content.breadcrumbs,
              isLoading: false,
              error: null,
            },
            false,
            "folder/load-success",
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to load folder";
          set(
            { isLoading: false, error: message },
            false,
            "folder/load-failure",
          );
          toast.error(message);
        }
      },

      // Load special view
      loadSpecialView: async (viewType: Exclude<ViewType, "folder">) => {
        try {
          set(
            { isLoading: true, error: null, viewType },
            false,
            "folder/load-special-start",
          );

          let folders: Folder[] = [];
          let files: IFile[] = [];
          const newFilePaths = new Map<string, BreadcrumbItem[]>();

          switch (viewType) {
            case "starred": {
              const [starredFolders, starredFiles] = await Promise.all([
                folderService.getStarredFolders(),
                fileService.getStarredFiles(),
              ]);
              folders = starredFolders;
              files = starredFiles;
              break;
            }

            case "trash": {
              const [trashedFolders, trashedFiles] = await Promise.all([
                folderService.getTrashedFolders(),
                fileService.getTrashedFiles(),
              ]);
              folders = trashedFolders;
              files = trashedFiles;
              break;
            }

            case "recent": {
              const [recentFolders, recentFiles] = await Promise.all([
                folderService.getRecentFolders(),
                fileService.getRecentFiles(),
              ]);
              folders = recentFolders;
              files = recentFiles;
              break;
            }

            case "files": {
              const allFiles = await fileService.getAllUserFiles();
              files = allFiles;

              // Load file paths
              await Promise.all(
                allFiles.map(async (file) => {
                  if (file.folder && file.folder !== "root") {
                    try {
                      const path = await folderService.getFolderPath(
                        file.folder,
                      );
                      newFilePaths.set(file.id, path);
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : `Failed to get folder path for file: ${file.name}`,
                      );
                    }
                  }
                }),
              );
              break;
            }
          }

          set(
            {
              folders,
              files,
              filePaths: newFilePaths,
              breadcrumbs: [],
              currentFolder: null,
              isLoading: false,
              error: null,
            },
            false,
            "folder/load-special-success",
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to load special view";
          set(
            { isLoading: false, error: message },
            false,
            "folder/load-special-failure",
          );
          toast.error(message);
        }
      },

      // Refresh content
      refreshContent: async () => {
        const state = get();
        if (state.viewType === "folder" && state.currentFolder) {
          await get().loadFolderContent(state.currentFolder.id);
        } else if (state.viewType !== "folder") {
          await get().loadSpecialView(state.viewType);
        }
      },

      // Update item
      updateItem: (id: string, changes: Partial<Folder | IFile>) => {
        set(
          (state) => ({
            folders: state.folders.map((folder) =>
              folder.id === id ? ({ ...folder, ...changes } as Folder) : folder,
            ),
            files: state.files.map((file) =>
              file.id === id ? ({ ...file, ...changes } as IFile) : file,
            ),
            currentFolder:
              state.currentFolder?.id === id
                ? ({ ...state.currentFolder, ...changes } as Folder)
                : state.currentFolder,
          }),
          false,
          "folder/update-item",
        );
      },

      // Toggle selection
      toggleSelection: (itemId: string) => {
        set(
          (state) => {
            const newSelected = new Set(state.selectedItems);
            if (newSelected.has(itemId)) {
              newSelected.delete(itemId);
            } else {
              newSelected.add(itemId);
            }
            return { selectedItems: newSelected };
          },
          false,
          "folder/toggle-selection",
        );
      },

      // Select all
      selectAll: (itemIds: string[]) => {
        set({ selectedItems: new Set(itemIds) }, false, "folder/select-all");
      },

      // Clear selection
      clearSelection: () => {
        set({ selectedItems: new Set() }, false, "folder/clear-selection");
      },

      // Set view mode
      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode }, false, "folder/set-view-mode");
      },
    }),
    { name: "FolderStore" },
  ),
);
