import { useState, useCallback } from "react";
import type { Folder } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";

type DialogType =
  | "create-folder"
  | "rename-folder"
  | "rename-file"
  | "move"
  | "delete"
  | "share"
  | null;

interface DialogState {
  type: DialogType;
  item?: Folder | IFile;
}

export const useFolderDialog = () => {
  const [dialogState, setDialogState] = useState<DialogState>({
    type: null,
  });

  const openCreateFolderDialog = useCallback(() => {
    setDialogState({ type: "create-folder" });
  }, []);

  const openRenameFolderDialog = useCallback((folder: Folder) => {
    setDialogState({ type: "rename-folder", item: folder });
  }, []);

  const openRenameFileDialog = useCallback((file: IFile) => {
    setDialogState({ type: "rename-file", item: file });
  }, []);

  const openMoveDialog = useCallback((item: Folder | IFile) => {
    setDialogState({ type: "move", item });
  }, []);

  const openDeleteDialog = useCallback((item: Folder | IFile) => {
    setDialogState({ type: "delete", item });
  }, []);

  const openShareDialog = useCallback((item: Folder | IFile) => {
    setDialogState({ type: "share", item });
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState({ type: null });
  }, []);

  return {
    dialogState,
    isOpen: dialogState.type !== null,
    openCreateFolderDialog,
    openRenameFolderDialog,
    openRenameFileDialog,
    openMoveDialog,
    openDeleteDialog,
    openShareDialog,
    closeDialog,
  };
};
