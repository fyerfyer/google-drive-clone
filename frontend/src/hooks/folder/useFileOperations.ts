import { fileService } from "@/services/file.service";
import { useFolder } from "@/hooks/folder/useFolder";
import { useCallback } from "react";
import { toast } from "sonner";

export const useFileOperations = () => {
  const { updateItem, refreshContent } = useFolder();

  const renameFile = useCallback(
    async (fileId: string, name: string) => {
      try {
        await fileService.renameFile(fileId, name);
        updateItem(fileId, { name });
        toast.success("File renamed successfully");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to rename file";
        toast.error(message);
        throw error;
      }
    },
    [updateItem]
  );

  const moveFile = useCallback(
    async (fileId: string, newParentId: string) => {
      try {
        await fileService.moveFile(fileId, newParentId);
        toast.success("File moved successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to move file";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const trashFile = useCallback(
    async (fileId: string) => {
      try {
        await fileService.trashFile(fileId);
        toast.success("File moved to trash successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to trash file";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const restoreFile = useCallback(
    async (fileId: string) => {
      try {
        await fileService.restoreFile(fileId);
        toast.success("File restored successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to restore file";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      try {
        await fileService.deleteFile(fileId);
        toast.success("File deleted successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete file";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const starFile = useCallback(
    // 这个用乐观更新，让用户立即看到UI变化
    async (fileId: string) => {
      updateItem(fileId, { isStarred: true });
      try {
        await fileService.starFile(fileId);
        toast.success("File starred successfully");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to star file";
        toast.error(message);
        throw error;
      }
    },
    [updateItem]
  );

  const unstarFile = useCallback(
    async (fileId: string) => {
      updateItem(fileId, { isStarred: false });
      try {
        await fileService.unstarFile(fileId);
        toast.success("File unstarred successfully");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to unstar file";
        toast.error(message);
        throw error;
      }
    },
    [updateItem]
  );

  return {
    renameFile,
    moveFile,
    trashFile,
    restoreFile,
    deleteFile,
    starFile,
    unstarFile,
  };
};
