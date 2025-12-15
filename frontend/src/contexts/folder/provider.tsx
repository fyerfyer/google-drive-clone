import {
  FolderContext,
  type FolderContextType,
  type FolderState,
} from "@/contexts/folder/context";
import { type ViewType } from "@/contexts/folder/context";
import { fileService } from "@/services/file.service";
import { folderService } from "@/services/folder.service";
import type { IFile } from "@/types/file.types";
import type {
  BreadcrumbItem,
  Folder,
  FolderContent,
} from "@/types/folder.types";
import { useCallback, useMemo, useReducer, type ReactNode } from "react";
import { toast } from "sonner";

// TODO: LOAD_SUCCESS 为了不动原本的类型设计直接用 && 拓展了，之后可能需要重构。
type FolderAction =
  | { type: "LOAD_START"; payload: { viewType: ViewType } }
  | {
      type: "LOAD_SUCCESS";
      payload: Partial<
        FolderContent & {
          viewType: ViewType;
          filePaths: Map<string, BreadcrumbItem[]>;
        }
      >;
    }
  | { type: "LOAD_FAILURE"; payload: string }
  | { type: "TOGGLE_SELECTION"; payload: string }
  | { type: "SELECT_ALL"; payload: string[] }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_VIEW_MODE"; payload: "grid" | "list" }
  | {
      type: "UPDATE_ITEM";
      payload: { id: string; changes: Partial<Folder | IFile> };
    };

const initState: FolderState = {
  currentFolder: null,
  folders: [],
  files: [],
  filePaths: new Map<string, BreadcrumbItem[]>(),
  breadcrumbs: [],
  isLoading: false,
  error: null,
  selectedItems: new Set(),
  viewMode: "grid",
  viewType: "folder",
};

interface FolderProviderProps {
  children: ReactNode;
}

const folderReducer = (
  state: FolderState,
  action: FolderAction
): FolderState => {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, isLoading: true, error: null };

    case "LOAD_SUCCESS":
      return {
        ...state,
        currentFolder: null,
        breadcrumbs: [],
        folders: [],
        files: [],
        ...action.payload, // 覆盖现有状态，因为 special view 中可能是空的
        isLoading: false,
        error: null,
      };

    case "LOAD_FAILURE":
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    case "TOGGLE_SELECTION": {
      const newSelected: Set<string> = new Set(state.selectedItems);
      if (newSelected.has(action.payload)) {
        newSelected.delete(action.payload);
      } else {
        newSelected.add(action.payload);
      }
      return { ...state, selectedItems: newSelected };
    }

    case "CLEAR_SELECTION":
      return { ...state, selectedItems: new Set() };

    case "SELECT_ALL":
      return { ...state, selectedItems: new Set(action.payload) };

    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };

    case "UPDATE_ITEM": {
      const { id, changes } = action.payload;
      return {
        ...state,
        folders: state.folders.map((folder) =>
          folder.id === id ? ({ ...folder, ...changes } as Folder) : folder
        ),

        files: state.files.map((file) =>
          file.id === id ? ({ ...file, ...changes } as IFile) : file
        ),

        currentFolder:
          state.currentFolder?.id === id
            ? ({ ...state.currentFolder, ...changes } as Folder)
            : state.currentFolder,
      };
    }

    default:
      return state;
  }
};

export const FolderProvider = ({ children }: FolderProviderProps) => {
  const [state, dispatch] = useReducer(folderReducer, initState);

  const loadFolderContent = useCallback(async (folderId: string) => {
    try {
      dispatch({ type: "LOAD_START", payload: { viewType: "folder" } });
      const content = await folderService.getFolderContent(folderId);
      dispatch({ type: "LOAD_SUCCESS", payload: { ...content } });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load folder";
      dispatch({ type: "LOAD_FAILURE", payload: message });
      toast.error(message);
    }
  }, []);

  const loadSpecialView = useCallback(
    async (viewType: Exclude<ViewType, "folder">) => {
      try {
        dispatch({ type: "LOAD_START", payload: { viewType: viewType } });
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
            await Promise.all(
              allFiles.map(async (file) => {
                if (file.folder && file.folder !== "root") {
                  try {
                    const path = await folderService.getFolderPath(file.folder);
                    newFilePaths.set(file.id, path);
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : `Failed to get folder path for file: ${file.name}`
                    );
                  }
                }
              })
            );

            break;
          }
        }

        dispatch({
          type: "LOAD_SUCCESS",
          payload: {
            folders,
            files,
            breadcrumbs: [],
            currentFolder: undefined,
            filePaths: newFilePaths,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load special view";
        dispatch({ type: "LOAD_FAILURE", payload: message });
        toast.error(message);
      }
    },
    []
  );

  const refreshContent = useCallback(async () => {
    if (state.viewType === "folder" && state.currentFolder) {
      await loadFolderContent(state.currentFolder.id);
    } else if (state.viewType !== "folder") {
      await loadSpecialView(state.viewType);
    }
  }, [state.viewType, state.currentFolder, loadFolderContent, loadSpecialView]);

  const updateItem = useCallback(
    (id: string, changes: Partial<Folder | IFile>) => {
      dispatch({ type: "UPDATE_ITEM", payload: { id, changes } });
    },
    []
  );

  // UI 交互
  const toggleSelection = useCallback((itemId: string) => {
    dispatch({ type: "TOGGLE_SELECTION", payload: itemId });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: "CLEAR_SELECTION" });
  }, []);

  const setViewMode = useCallback((mode: "grid" | "list") => {
    dispatch({ type: "SET_VIEW_MODE", payload: mode });
  }, []);

  const selectAll = useCallback((itemIds: string[]) => {
    dispatch({ type: "SELECT_ALL", payload: itemIds });
  }, []);

  const value: FolderContextType = useMemo(
    () => ({
      ...state,
      loadFolderContent,
      refreshContent,
      toggleSelection,
      clearSelection,
      loadSpecialView,
      updateItem,
      setViewMode,
      selectAll,
    }),
    [
      state,
      loadFolderContent,
      refreshContent,
      toggleSelection,
      clearSelection,
      loadSpecialView,
      updateItem,
      setViewMode,
      selectAll,
    ]
  );

  return (
    <FolderContext.Provider value={value}>{children}</FolderContext.Provider>
  );
};
