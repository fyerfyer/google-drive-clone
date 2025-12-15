import { useFolder } from "@/hooks/folder/useFolder";
import { folderService } from "@/services/folder.service";
import { useCallback } from "react";
import { toast } from "sonner";

export const useFolderOperations = () => {
  const { refreshContent, updateItem } = useFolder();

  const createFolder = useCallback(
    async (parentId: string, name: string) => {
      try {
        const folder = await folderService.createFolder({ parentId, name });
        toast.success("Folder created successfully");
        await refreshContent();
        return folder;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create folder";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      try {
        await folderService.renameFolder(folderId, name);
        updateItem(folderId, { name });
        toast.success("Folder renamed successfully");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to rename folder";
        toast.error(message);
        throw error;
      }
    },
    [updateItem]
  );

  const moveFolder = useCallback(
    async (folderId: string, newParentId: string) => {
      try {
        await folderService.moveFolder(folderId, newParentId);
        toast.success("Folder moved successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to move folder";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const trashFolder = useCallback(
    async (folderId: string) => {
      try {
        await folderService.trashFolder(folderId);
        toast.success("Folder moved to trash successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to move folder to trash";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const restoreFolder = useCallback(
    async (folderId: string) => {
      try {
        await folderService.restoreFolder(folderId);
        toast.success("Folder restored successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to restore folder";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await folderService.deleteFolder(folderId);
        toast.success("Folder deleted successfully");
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete folder";
        toast.error(message);
        throw error;
      }
    },
    [refreshContent]
  );

  const starFolder = useCallback(
    async (folderId: string) => {
      updateItem(folderId, { isStarred: true });
      try {
        await folderService.starFolder(folderId);
        toast.success("Folder starred successfully");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to star folder";
        toast.error(message);
        throw error;
      }
    },
    [updateItem]
  );

  const unstarFolder = useCallback(
    async (folderId: string) => {
      updateItem(folderId, { isStarred: false });
      try {
        await folderService.unstarFolder(folderId);
        toast.success("Folder unstarred successfully");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to unstar folder";
        toast.error(message);
        throw error;
      }
    },
    [updateItem]
  );

  return {
    createFolder,
    renameFolder,
    moveFolder,
    trashFolder,
    restoreFolder,
    deleteFolder,
    starFolder,
    unstarFolder,
  };
};
