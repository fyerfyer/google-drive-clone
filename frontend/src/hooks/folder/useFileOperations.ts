import { fileService } from "@/services/file.service";
import { useFolder } from "@/hooks/folder/useFolder";
import { useCallback } from "react";
import { toast } from "sonner";

export const useFileOperations = () => {
  const { refreshContent } = useFolder();

  const renameFile = useCallback(
    async (fileId: string, name: string) => {
      try {
        await fileService.renameFile(fileId, name);
        toast.success("File renamed successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to rename file";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
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
    async (fileId: string) => {
      try {
        await fileService.starFile(fileId);
        toast.success("File starred successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to star file";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const unstarFile = useCallback(
    async (fileId: string) => {
      try {
        await fileService.unstarFile(fileId);
        toast.success("File unstarred successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to unstar file";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
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
