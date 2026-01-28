import {
  useRenameFile,
  useMoveFile,
  useTrashFile,
  useRestoreFile,
  useDeleteFile,
  useStarFile,
  useUnstarFile,
} from "@/hooks/mutations/useFileMutations";
import { useCallback } from "react";

/**
 * Hook providing file operations using React Query mutations
 * This replaces the old manual dispatch-based approach
 */
export const useFileOperations = () => {
  const renameFileMutation = useRenameFile();
  const moveFileMutation = useMoveFile();
  const trashFileMutation = useTrashFile();
  const restoreFileMutation = useRestoreFile();
  const deleteFileMutation = useDeleteFile();
  const starFileMutation = useStarFile();
  const unstarFileMutation = useUnstarFile();

  const renameFile = useCallback(
    async (fileId: string, name: string) => {
      return renameFileMutation.mutateAsync({ fileId, newName: name });
    },
    [renameFileMutation],
  );

  const moveFile = useCallback(
    async (fileId: string, destinationId: string) => {
      return moveFileMutation.mutateAsync({ fileId, destinationId });
    },
    [moveFileMutation],
  );

  const trashFile = useCallback(
    async (fileId: string) => {
      return trashFileMutation.mutateAsync(fileId);
    },
    [trashFileMutation],
  );

  const restoreFile = useCallback(
    async (fileId: string) => {
      return restoreFileMutation.mutateAsync(fileId);
    },
    [restoreFileMutation],
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      return deleteFileMutation.mutateAsync(fileId);
    },
    [deleteFileMutation],
  );

  const starFile = useCallback(
    async (fileId: string) => {
      return starFileMutation.mutateAsync(fileId);
    },
    [starFileMutation],
  );

  const unstarFile = useCallback(
    async (fileId: string) => {
      return unstarFileMutation.mutateAsync(fileId);
    },
    [unstarFileMutation],
  );

  return {
    renameFile,
    moveFile,
    trashFile,
    restoreFile,
    deleteFile,
    starFile,
    unstarFile,
    // Expose mutation states for loading indicators
    isRenaming: renameFileMutation.isPending,
    isMoving: moveFileMutation.isPending,
    isTrashing: trashFileMutation.isPending,
    isRestoring: restoreFileMutation.isPending,
    isDeleting: deleteFileMutation.isPending,
    isStarring: starFileMutation.isPending,
    isUnstarring: unstarFileMutation.isPending,
  };
};
