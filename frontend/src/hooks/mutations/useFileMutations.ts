import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fileService } from "@/services/file.service";
import { queryKeys } from "@/lib/queryClient";
import { toast } from "sonner";


// Hook for renaming a file
export const useRenameFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fileId, newName }: { fileId: string; newName: string }) =>
      fileService.renameFile(fileId, newName),
    onSuccess: () => {
      toast.success("File renamed successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.recent(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.files(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to rename file";
      toast.error(message);
    },
  });
};

// Hook for moving a file
export const useMoveFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fileId,
      destinationId,
    }: {
      fileId: string;
      destinationId: string;
    }) => fileService.moveFile(fileId, destinationId),
    onSuccess: () => {
      toast.success("File moved successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.files(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to move file";
      toast.error(message);
    },
  });
};

// Hook for trashing a file
export const useTrashFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => fileService.trashFile(fileId),
    onSuccess: () => {
      toast.success("File moved to trash successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.trashed(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.recent(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.files(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to trash file";
      toast.error(message);
    },
  });
};

// Hook for restoring a file from trash
export const useRestoreFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => fileService.restoreFile(fileId),
    onSuccess: () => {
      toast.success("File restored successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.trashed(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to restore file";
      toast.error(message);
    },
  });
};

// Hook for permanently deleting a file
export const useDeleteFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => fileService.deleteFile(fileId),
    onSuccess: () => {
      toast.success("File deleted permanently");
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.trashed(),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete file";
      toast.error(message);
    },
  });
};

// Hook for starring a file
export const useStarFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => fileService.starFile(fileId),
    onMutate: async (fileId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.folders.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.files.all });

      const previousFolderData = queryClient.getQueriesData({
        queryKey: queryKeys.folders.all,
      });
      const previousFileData = queryClient.getQueriesData({
        queryKey: queryKeys.files.all,
      });

      // Optimistically update
      queryClient.setQueriesData(
        { queryKey: queryKeys.folders.all },
        (oldData: unknown) => {
          if (!oldData) return oldData;
          return updateFileInCache(oldData, fileId, { isStarred: true });
        },
      );

      return { previousFolderData, previousFileData };
    },
    onSuccess: () => {
      toast.success("File starred successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
    },
    onError: (error, _fileId, context) => {
      // Rollback
      if (context?.previousFolderData) {
        context.previousFolderData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      if (context?.previousFileData) {
        context.previousFileData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      const message =
        error instanceof Error ? error.message : "Failed to star file";
      toast.error(message);
    },
  });
};

// Hook for unstarring a file
export const useUnstarFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) => fileService.unstarFile(fileId),
    onMutate: async (fileId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.folders.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.files.all });

      const previousFolderData = queryClient.getQueriesData({
        queryKey: queryKeys.folders.all,
      });
      const previousFileData = queryClient.getQueriesData({
        queryKey: queryKeys.files.all,
      });

      queryClient.setQueriesData(
        { queryKey: queryKeys.folders.all },
        (oldData: unknown) => {
          if (!oldData) return oldData;
          return updateFileInCache(oldData, fileId, { isStarred: false });
        },
      );

      return { previousFolderData, previousFileData };
    },
    onSuccess: () => {
      toast.success("File unstarred successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.starred(),
      });
    },
    onError: (error, _fileId, context) => {
      if (context?.previousFolderData) {
        context.previousFolderData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      if (context?.previousFileData) {
        context.previousFileData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
      const message =
        error instanceof Error ? error.message : "Failed to unstar file";
      toast.error(message);
    },
  });
};

// Helper function to update file in cache
const updateFileInCache = (
  data: unknown,
  fileId: string,
  updates: Record<string, unknown>,
): unknown => {
  if (!data || typeof data !== "object") return data;

  const obj = data as Record<string, unknown>;

  // Handle folder content response
  if ("files" in obj && Array.isArray(obj.files)) {
    return {
      ...obj,
      files: obj.files.map((file) =>
        file && typeof file === "object" && "id" in file && file.id === fileId
          ? { ...file, ...updates }
          : file,
      ),
    };
  }

  // Handle array of files
  if (Array.isArray(data)) {
    return data.map((file) =>
      file && typeof file === "object" && "id" in file && file.id === fileId
        ? { ...file, ...updates }
        : file,
    );
  }

  return data;
}
