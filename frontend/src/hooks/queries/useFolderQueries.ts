import { useQuery } from "@tanstack/react-query";
import { folderService } from "@/services/folder.service";
import { fileService } from "@/services/file.service";
import { queryKeys, getSpecialViewQueryKey } from "@/lib/queryClient";
import type { ViewType } from "@/types/common.types";
import type { Folder, BreadcrumbItem } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";

// Hook to fetch folder content (current folder info, subfolders, files, breadcrumbs)
export const useFolderContent = (folderId: string) => {
  return useQuery({
    queryKey: queryKeys.folders.content(folderId),
    queryFn: () => folderService.getFolderContent(folderId),
    enabled: !!folderId,
  });
};

// Hook to fetch folder breadcrumbs/path
export const useFolderBreadcrumbs = (folderId: string) => {
  return useQuery({
    queryKey: queryKeys.folders.breadcrumbs(folderId),
    queryFn: () => folderService.getFolderPath(folderId),
    enabled: !!folderId && folderId !== "root",
  });
};

interface SpecialViewData {
  folders: Folder[];
  files: IFile[];
  filePaths: Map<string, BreadcrumbItem[]>;
}

// Hook to fetch special view data (starred, trashed, recent, files)
export const useSpecialView = (viewType: Exclude<ViewType, "folder">) => {
  return useQuery({
    queryKey: getSpecialViewQueryKey(viewType),
    queryFn: async (): Promise<SpecialViewData> => {
      let folders: Folder[] = [];
      let files: IFile[] = [];
      const filePaths = new Map<string, BreadcrumbItem[]>();

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

          // Load file paths in parallel
          await Promise.all(
            allFiles.map(async (file) => {
              if (file.folder && file.folder !== "root") {
                try {
                  const path = await folderService.getFolderPath(file.folder);
                  filePaths.set(file.id, path);
                } catch {
                  // Silently ignore path loading errors
                }
              }
            }),
          );
          break;
        }
      }

      return { folders, files, filePaths };
    },
  });
};

// Hook to fetch starred folders
export const useStarredFolders = () => {
  return useQuery({
    queryKey: queryKeys.folders.starred(),
    queryFn: () => folderService.getStarredFolders(),
  });
};

// Hook to fetch trashed folders
export const useTrashedFolders = () => {
  return useQuery({
    queryKey: queryKeys.folders.trashed(),
    queryFn: () => folderService.getTrashedFolders(),
  });
};

// Hook to fetch recent folders
export const useRecentFolders = (limit?: number) => {
  return useQuery({
    queryKey: queryKeys.folders.recent(),
    queryFn: () => folderService.getRecentFolders(limit),
  });
};
