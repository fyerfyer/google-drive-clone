import { type ReactNode } from "react";
import { useFolderOperations } from "@/hooks/folder/useFolderOperations";
import { useFileOperations } from "@/hooks/folder/useFileOperations";
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
} from "lucide-react";
import type { Folder } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";

interface ItemContextMenuProps {
  children: ReactNode;
  item: Folder | IFile;
  type: "folder" | "file";
}

export const ItemContextMenu = ({
  children,
  item,
  type,
}: ItemContextMenuProps) => {
  const folderOps = useFolderOperations();
  const fileOps = useFileOperations();

  const handleRename = () => {
    const newName = prompt(`Enter new name for ${item.name}:`, item.name);
    if (newName && newName.trim() !== "") {
      if (type === "folder") {
        folderOps.renameFolder(item.id, newName.trim());
      } else {
        fileOps.renameFile(item.id, newName.trim());
      }
    }
  };

  const handleMove = () => {
    // TODO: Implement move dialog
    console.log("Move:", item.id);
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      if (type === "folder") {
        folderOps.trashFolder(item.id);
      } else {
        fileOps.trashFile(item.id);
      }
    }
  };

  const handleDownload = () => {
    if (type === "file") {
      // TODO: Implement download functionality
      console.log("Download file:", item.id);
    }
  };

  const handleShare = () => {
    // TODO: Implement share dialog
    console.log("Share:", item.id);
  };

  const handleCopy = () => {
    // TODO: Implement copy functionality
    console.log("Copy:", item.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleRename}>
          <Edit className="size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={handleMove}>
          <FolderInput className="size-4" />
          Move to
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopy}>
          <Copy className="size-4" />
          Make a copy
        </ContextMenuItem>
        <ContextMenuSeparator />
        {type === "file" && (
          <>
            <ContextMenuItem onClick={handleDownload}>
              <Download className="size-4" />
              Download
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={handleShare}>
          <Share2 className="size-4" />
          Share
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="size-4" />
          Move to trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
