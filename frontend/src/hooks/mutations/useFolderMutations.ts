import { useMutation, useQueryClient } from "@tanstack/react-query";
import { folderService } from "@/services/folder.service";
import { queryKeys } from "@/lib/queryClient";
import { toast } from "sonner";
import type { CreateFolderRequest } from "@/types/folder.types";

// Hook for creating a new folder
export const useCreateFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFolderRequest) => folderService.createFolder(data),
    onSuccess: (_data, variables) => {
      toast.success("Folder created successfully");
      // Invalidate the parent folder content
      const parentId = variables.parentId || "root";
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.content(parentId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to create folder";
      toast.error(message);
    },
  });
};

// Hook for renaming a folder
export const useRenameFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      folderId,
      newName,
    }: {
      folderId: string;
      newName: string;
    }) => folderService.renameFolder(folderId, newName),
    onSuccess: () => {
      toast.success("Folder renamed successfully");
      // Invalidate all folder queries since the rename affects many places
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.recent(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to rename folder";
      toast.error(message);
    },
  });
};

// Hook for moving a folder
export const useMoveFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      folderId,
      destinationId,
    }: {
      folderId: string;
      destinationId: string;
    }) => folderService.moveFolder(folderId, destinationId),
    onSuccess: () => {
      toast.success("Folder moved successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to move folder";
      toast.error(message);
    },
  });
};

// Hook for trashing a folder
export const useTrashFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) => folderService.trashFolder(folderId),
    onSuccess: () => {
      toast.success("Folder moved to trash successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.trashed(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.recent(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to move folder to trash";
      toast.error(message);
    },
  });
};

// Hook for restoring a folder from trash
export const useRestoreFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) => folderService.restoreFolder(folderId),
    onSuccess: () => {
      toast.success("Folder restored successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.trashed(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to restore folder";
      toast.error(message);
    },
  });
};

// Hook for permanently deleting a folder
export const useDeleteFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) => folderService.deleteFolder(folderId),
    onSuccess: () => {
      toast.success("Folder deleted permanently");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.trashed(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete folder";
      toast.error(message);
    },
  });
};

// Hook for starring a folder
export const useStarFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) => folderService.starFolder(folderId),
    onMutate: async (folderId) => {
      // Optimistic update - cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: queryKeys.folders.all });

      // Snapshot previous value for rollback
      const previousData = queryClient.getQueriesData({
        queryKey: queryKeys.folders.all,
      });

      // Optimistically update to the new value
      queryClient.setQueriesData(
        { queryKey: queryKeys.folders.all },
        (oldData: unknown) => {
          if (!oldData) return oldData;
          // Update isStarred to true for the folder
          return updateFolderInCache(oldData, folderId, { isStarred: true });
        },
      );

      return { previousData };
    },
    onSuccess: () => {
      toast.success("Folder starred successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
    },
    onError: (error, _folderId, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      const message =
        error instanceof Error ? error.message : "Failed to star folder";
      toast.error(message);
    },
  });
};

// Hook for unstarring a folder
export const useUnstarFolder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) => folderService.unstarFolder(folderId),
    onMutate: async (folderId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.folders.all });

      const previousData = queryClient.getQueriesData({
        queryKey: queryKeys.folders.all,
      });

      queryClient.setQueriesData(
        { queryKey: queryKeys.folders.all },
        (oldData: unknown) => {
          if (!oldData) return oldData;
          return updateFolderInCache(oldData, folderId, { isStarred: false });
        },
      );

      return { previousData };
    },
    onSuccess: () => {
      toast.success("Folder unstarred successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
    },
    onError: (error, _folderId, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      const message =
        error instanceof Error ? error.message : "Failed to unstar folder";
      toast.error(message);
    },
  });
};

// Helper function to update folder in cache
function updateFolderInCache(
  data: unknown,
  folderId: string,
  updates: Record<string, unknown>,
): unknown {
  if (!data || typeof data !== "object") return data;

  const obj = data as Record<string, unknown>;

  // Handle folder content response
  if ("folders" in obj && Array.isArray(obj.folders)) {
    return {
      ...obj,
      folders: obj.folders.map((folder) =>
        folder &&
        typeof folder === "object" &&
        "id" in folder &&
        folder.id === folderId
          ? { ...folder, ...updates }
          : folder,
      ),
    };
  }

  // Handle array of folders
  if (Array.isArray(data)) {
    return data.map((folder) =>
      folder &&
      typeof folder === "object" &&
      "id" in folder &&
      folder.id === folderId
        ? { ...folder, ...updates }
        : folder,
    );
  }

  return data;
}
