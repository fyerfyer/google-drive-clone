import {
  useCreateFolder,
  useRenameFolder,
  useMoveFolder,
  useTrashFolder,
  useRestoreFolder,
  useDeleteFolder,
  useStarFolder,
  useUnstarFolder,
} from "@/hooks/mutations/useFolderMutations";
import { useCallback } from "react";

/**
 * Hook providing folder operations using React Query mutations
 * This replaces the old manual dispatch-based approach
 */
export const useFolderOperations = () => {
  const createFolderMutation = useCreateFolder();
  const renameFolderMutation = useRenameFolder();
  const moveFolderMutation = useMoveFolder();
  const trashFolderMutation = useTrashFolder();
  const restoreFolderMutation = useRestoreFolder();
  const deleteFolderMutation = useDeleteFolder();
  const starFolderMutation = useStarFolder();
  const unstarFolderMutation = useUnstarFolder();

  const createFolder = useCallback(
    async (parentId: string, name: string) => {
      return createFolderMutation.mutateAsync({ parentId, name });
    },
    [createFolderMutation],
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      return renameFolderMutation.mutateAsync({ folderId, newName: name });
    },
    [renameFolderMutation],
  );

  const moveFolder = useCallback(
    async (folderId: string, destinationId: string) => {
      return moveFolderMutation.mutateAsync({ folderId, destinationId });
    },
    [moveFolderMutation],
  );

  const trashFolder = useCallback(
    async (folderId: string) => {
      return trashFolderMutation.mutateAsync(folderId);
    },
    [trashFolderMutation],
  );

  const restoreFolder = useCallback(
    async (folderId: string) => {
      return restoreFolderMutation.mutateAsync(folderId);
    },
    [restoreFolderMutation],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      return deleteFolderMutation.mutateAsync(folderId);
    },
    [deleteFolderMutation],
  );

  const starFolder = useCallback(
    async (folderId: string) => {
      return starFolderMutation.mutateAsync(folderId);
    },
    [starFolderMutation],
  );

  const unstarFolder = useCallback(
    async (folderId: string) => {
      return unstarFolderMutation.mutateAsync(folderId);
    },
    [unstarFolderMutation],
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
    // Expose mutation states for loading indicators
    isCreating: createFolderMutation.isPending,
    isRenaming: renameFolderMutation.isPending,
    isMoving: moveFolderMutation.isPending,
    isTrashing: trashFolderMutation.isPending,
    isRestoring: restoreFolderMutation.isPending,
    isDeleting: deleteFolderMutation.isPending,
    isStarring: starFolderMutation.isPending,
    isUnstarring: unstarFolderMutation.isPending,
  };
};
