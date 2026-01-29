import { type ReactNode, useState } from "react";
import { useFolderOperations } from "@/hooks/folder/useFolderOperations";
import { useFileOperations } from "@/hooks/folder/useFileOperations";
import { useShareDialogStore } from "@/stores/useShareDialogStore";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Download,
  Edit,
  Trash2,
  Share2,
  FolderInput,
  Copy,
  Eye,
  Star,
  StarOff,
} from "lucide-react";
import type { Folder } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";
import { RenameDialog } from "./RenameDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { MoveDialog } from "./MoveDialog";
import { fileService } from "@/services/file.service";
import { toast } from "sonner";

interface ItemContextMenuProps {
  children: ReactNode;
  item: Folder | IFile;
  type: "folder" | "file";
  viewType?: "normal" | "trash" | "starred";
}

export const ItemContextMenu = ({
  children,
  item,
  type,
  viewType = "normal",
}: ItemContextMenuProps) => {
  const folderOps = useFolderOperations();
  const fileOps = useFileOperations();
  const { openShareDialog } = useShareDialogStore();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const handleRename = (newName: string) => {
    if (type === "folder") {
      folderOps.renameFolder(item.id, newName);
    } else {
      fileOps.renameFile(item.id, newName);
    }
  };

  const handleMove = (destinationId: string) => {
    if (type === "folder") {
      folderOps.moveFolder(item.id, destinationId);
    } else {
      fileOps.moveFile(item.id, destinationId);
    }
  };

  const handleDelete = () => {
    if (type === "folder") {
      folderOps.trashFolder(item.id);
    } else {
      fileOps.trashFile(item.id);
    }
  };

  const handleDownload = async () => {
    if (type === "file") {
      try {
        const file = item as IFile;
        const downloadInfo = await fileService.getDownloadInfo(file.id);

        const link = document.createElement("a");
        link.href = downloadInfo.downloadUrl;
        link.download = downloadInfo.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success(`Downloading ${file.name}`);
      } catch (error) {
        toast.error("Failed to download file");
        console.error("Download error:", error);
      }
    }
  };

  const handlePreview = async () => {
    if (type === "file") {
      try {
        const file = item as IFile;
        const url = await fileService.getPreviewUrl(file.id);

        // Open preview in new tab
        window.open(url, "_blank");

        toast.success(`Opening preview for ${file.name}`);
      } catch (error) {
        toast.error("Failed to preview file");
        console.error("Preview error:", error);
      }
    }
  };

  const handleShare = () => {
    const resourceType = type === "folder" ? "Folder" : "File";
    openShareDialog(item.id, resourceType, item.name);
  };

  const handleCopy = () => {
    // TODO: Implement copy functionality
    toast.info("Copy functionality coming soon");
  };

  const handleToggleStar = () => {
    if (type === "folder") {
      if (item.isStarred) {
        folderOps.unstarFolder(item.id);
      } else {
        folderOps.starFolder(item.id);
      }
    } else {
      if (item.isStarred) {
        fileOps.unstarFile(item.id);
      } else {
        fileOps.starFile(item.id);
      }
    }
  };

  const handleRestore = () => {
    if (type === "folder") {
      folderOps.restoreFolder(item.id);
    } else {
      fileOps.restoreFile(item.id);
    }
  };

  const handlePermanentDelete = () => {
    if (type === "folder") {
      folderOps.deleteFolder(item.id);
    } else {
      fileOps.deleteFile(item.id);
    }
  };

  // Render different menus based on view type
  if (viewType === "trash") {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onClick={handleRestore}>Restore</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={handlePermanentDelete}
              className="text-destructive"
            >
              <Trash2 className="size-4" />
              Delete permanently
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </>
    );
  }

  if (viewType === "starred") {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            {type === "file" && (
              <>
                <ContextMenuItem onClick={handlePreview}>
                  <Eye className="size-4" />
                  Preview
                </ContextMenuItem>
                <ContextMenuItem onClick={handleDownload}>
                  <Download className="size-4" />
                  Download
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onClick={() => setShowRenameDialog(true)}>
              <Edit className="size-4" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowMoveDialog(true)}>
              <FolderInput className="size-4" />
              Move to
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleToggleStar}>
              <StarOff className="size-4" />
              Remove from starred
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive"
            >
              <Trash2 className="size-4" />
              Move to trash
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <RenameDialog
          open={showRenameDialog}
          onOpenChange={setShowRenameDialog}
          currentName={item.name}
          onRename={handleRename}
          type={type}
        />

        <DeleteConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          itemName={item.name}
        />
        <MoveDialog
          open={showMoveDialog}
          onOpenChange={setShowMoveDialog}
          onMove={handleMove}
          itemType={type}
          currentFolderId={
            (item as Folder).parent || (item as IFile).folder || undefined
          }
        />
      </>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {type === "file" && (
            <>
              <ContextMenuItem onClick={handlePreview}>
                <Eye className="size-4" />
                Preview
              </ContextMenuItem>
              <ContextMenuItem onClick={handleDownload}>
                <Download className="size-4" />
                Download
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={() => setShowRenameDialog(true)}>
            <Edit className="size-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setShowMoveDialog(true)}>
            <FolderInput className="size-4" />
            Move to
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="size-4" />
            Make a copy
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleToggleStar}>
            {item.isStarred ? (
              <>
                <StarOff className="size-4" />
                Remove from starred
              </>
            ) : (
              <>
                <Star className="size-4" />
                Add to starred
              </>
            )}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleShare}>
            <Share2 className="size-4" />
            Share
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive"
          >
            <Trash2 className="size-4" />
            Move to trash
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <RenameDialog
        open={showRenameDialog}
        onOpenChange={setShowRenameDialog}
        currentName={item.name}
        onRename={handleRename}
        type={type}
      />

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        itemName={item.name}
      />
      <MoveDialog
        open={showMoveDialog}
        onOpenChange={setShowMoveDialog}
        onMove={handleMove}
        itemType={type}
        currentFolderId={
          (item as Folder).parent || (item as IFile).folder || undefined
        }
      />
    </>
  );
};
