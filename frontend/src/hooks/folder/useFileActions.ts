import { triggerDownload } from "@/lib/download";
import { fileService } from "@/services/file.service";
import { folderService } from "@/services/folder.service";
import type { IFile } from "@/types/file.types";
import type { Folder } from "@/types/folder.types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useFolderOperations } from "./useFolderOperations";
import { useFileOperations } from "./useFileOperations";
import { useShareDialogStore } from "@/stores/useShareDialogStore";

export type ItemActions =
  | "preview"
  | "edit"
  | "download"
  | "rename"
  | "star"
  | "unstar"
  | "move"
  | "copy"
  | "share"
  | "delete";

export type FolderItem = Folder | IFile;

export const useFileActions = () => {
  const navigate = useNavigate();
  const folderOps = useFolderOperations();
  const fileOps = useFileOperations();
  const { openShareDialog } = useShareDialogStore();
  const [previewedFile, setPreviewedFile] = useState<IFile | null>(null);
  const [renamedItem, setRenamedItem] = useState<FolderItem | null>(null);
  const [deletedItem, setDeletedItem] = useState<FolderItem | null>(null);
  const [movedItem, setMovedItem] = useState<FolderItem | null>(null);
  const [sharedItem, setSharedItem] = useState<FolderItem | null>(null);

  const navigateToFolder = (folderId: string) => {
    navigate(`/files?folder=${folderId}`);
  };

  const handleAction = (action: ItemActions, item: FolderItem) => {
    switch (action) {
      case "preview": {
        if (item.type === "file") {
          setPreviewedFile(item);
        }

        break;
      }

      case "edit": {
        if (item.type === "file") {
          navigate(`/editor?fileId=${item.id}&mode=edit`);
        }
        break;
      }

      case "download": {
        if (item.type === "file") {
          toast.promise(
            fileService.getDownloadInfo(item.id).then((res) => {
              triggerDownload(res.downloadUrl, res.fileName);
            }),
            {
              loading: "Preparing download...",
              success: "Download started",
              error: "Failed to download",
            },
          );
        } else {
          folderService
            .downloadFolderAsZip(item.id, item.name)
            .then(() => {
              toast.success("Folder download started");
            })
            .catch(() => {
              toast.error("Failed to download folder");
            });
        }

        break;
      }

      case "rename":
        setRenamedItem(item);
        break;

      case "move":
        setMovedItem(item);
        break;

      case "delete":
        setDeletedItem(item);
        break;

      case "star":
        if (item.type === "folder") {
          folderOps.starFolder(item.id);
        } else {
          fileOps.starFile(item.id);
        }
        break;

      case "unstar":
        if (item.type === "folder") {
          folderOps.unstarFolder(item.id);
        } else {
          fileOps.unstarFile(item.id);
        }
        break;

      case "share": {
        const resourceType = item.type === "folder" ? "Folder" : "File";
        openShareDialog(item.id, resourceType, item.name);
        break;
      }

      case "copy":
        toast.info("Copy functionality coming soon");
        break;
    }
  };

  return {
    handleAction,
    navigateToFolder,
    modalState: {
      previewedFile,
      setPreviewedFile,
      renamedItem,
      setRenamedItem,
      deletedItem,
      setDeletedItem,
      movedItem,
      setMovedItem,
      sharedItem,
      setSharedItem,
    },
  };
};
