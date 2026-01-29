import { useFolderUIStore } from "@/stores/useFolderUIStore";
import {
  useFolderContent,
  useSpecialView,
} from "@/hooks/queries/useFolderQueries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, getSpecialViewQueryKey } from "@/lib/queryClient";
import type { ViewType } from "@/types/common.types";
import type { Folder, BreadcrumbItem } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";

/**
 * Main hook for folder browsing - combines UI store with React Query data
 * This is a compatibility layer that maintains the old API while using the new architecture
 */
export const useFolder = () => {
  const queryClient = useQueryClient();

  // UI state from Zustand
  const {
    viewType,
    currentFolderId,
    selectedItems,
    viewMode,
    setViewType,
    setCurrentFolderId,
    toggleSelection,
    selectAll,
    clearSelection,
    setViewMode,
  } = useFolderUIStore();

  // Data from React Query
  const folderContentQuery = useFolderContent(currentFolderId);
  const specialViewQuery = useSpecialView(
    viewType !== "folder"
      ? (viewType as Exclude<ViewType, "folder">)
      : "recent",
  );

  // Determine which data source to use
  const isNormalFolderView = viewType === "folder";

  // Get data based on view type
  const currentFolder: Folder | null = isNormalFolderView
    ? (folderContentQuery.data?.currentFolder ?? null)
    : null;

  const folders: Folder[] = isNormalFolderView
    ? (folderContentQuery.data?.folders ?? [])
    : (specialViewQuery.data?.folders ?? []);

  const files: IFile[] = isNormalFolderView
    ? (folderContentQuery.data?.files ?? [])
    : (specialViewQuery.data?.files ?? []);

  const breadcrumbs: BreadcrumbItem[] = isNormalFolderView
    ? (folderContentQuery.data?.breadcrumbs ?? [])
    : [];

  const filePaths: Map<string, BreadcrumbItem[]> = isNormalFolderView
    ? new Map()
    : (specialViewQuery.data?.filePaths ?? new Map());

  const isLoading = isNormalFolderView
    ? folderContentQuery.isLoading
    : specialViewQuery.isLoading;

  const error = isNormalFolderView
    ? (folderContentQuery.error?.message ?? null)
    : (specialViewQuery.error?.message ?? null);

  // Legacy API compatibility methods
  const loadFolderContent = (folderId: string) => {
    setCurrentFolderId(folderId);
  };

  const loadSpecialView = (view: Exclude<ViewType, "folder">) => {
    setViewType(view);
  };

  const refreshContent = () => {
    if (isNormalFolderView) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.content(currentFolderId),
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: getSpecialViewQueryKey(
          viewType as Exclude<ViewType, "folder">,
        ),
      });
    }
  };

  return {
    // Data
    currentFolder,
    folders,
    files,
    breadcrumbs,
    filePaths,
    isLoading,
    error,

    // UI State
    viewType,
    viewMode,
    selectedItems,

    // Actions - Data loading (now triggers React Query)
    loadFolderContent,
    loadSpecialView,
    refreshContent,

    // Actions - UI
    setViewMode,
    toggleSelection,
    selectAll,
    clearSelection,
  };
};
