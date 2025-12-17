/* eslint-disable react-hooks/rules-of-hooks */
import { useFolder } from "@/hooks/folder/useFolder";
import { Card, CardContent } from "@/components/ui/card";
import { FolderIcon, FileIcon, MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Folder } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";
import { ItemContextMenu } from "./ItemContextMenu";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useFileActions } from "@/hooks/folder/useFileActions";
import { FilePreviewModal } from "./FilePreviewModal";
import { RenameDialog } from "./RenameDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { MoveDialog } from "./MoveDialog";
import { useFolderOperations } from "@/hooks/folder/useFolderOperations";
import { useFileOperations } from "@/hooks/folder/useFileOperations";

export const FolderGridView = () => {
  const { folders, files, toggleSelection, selectedItems } = useFolder();
  const { handleAction, navigateToFolder, modalState } = useFileActions();
  const folderOps = useFolderOperations();
  const fileOps = useFileOperations();

  const handleFolderClick = (folderId: string) => {
    navigateToFolder(folderId);
  };

  const handleFileClick = (file: IFile) => {
    handleAction("preview", file);
  };

  const handleRename = (newName: string) => {
    const item = modalState.renamedItem;
    if (!item) return;

    if (item.type === "folder") {
      folderOps.renameFolder(item.id, newName);
    } else {
      fileOps.renameFile(item.id, newName);
    }
  };

  const handleMove = (destinationId: string) => {
    const item = modalState.movedItem;
    if (!item) return;

    if (item.type === "folder") {
      folderOps.moveFolder(item.id, destinationId);
    } else {
      fileOps.moveFile(item.id, destinationId);
    }
  };

  const handleDelete = () => {
    const item = modalState.deletedItem;
    if (!item) return;

    if (item.type === "folder") {
      folderOps.trashFolder(item.id);
    } else {
      fileOps.trashFile(item.id);
    }
  };

  const renderFolderCard = (folder: Folder) => {
    const isSelected = selectedItems.has(folder.id);

    // Make folders both draggable and droppable
    const {
      attributes,
      listeners,
      setNodeRef: setDraggableRef,
      isDragging,
    } = useDraggable({
      id: folder.id,
      data: folder,
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
      id: folder.id,
      data: folder,
    });

    // Combine refs
    const setRefs = (node: HTMLDivElement | null) => {
      setDraggableRef(node);
      setDroppableRef(node);
    };

    return (
      <ItemContextMenu key={folder.id} item={folder} type="folder">
        <div ref={setRefs}>
          <Card
            {...attributes}
            {...listeners}
            className={`cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${
              isSelected ? "ring-2 ring-primary" : ""
            } ${isDragging ? "opacity-50" : ""} ${
              isOver
                ? "ring-2 ring-green-500 bg-green-50 dark:bg-green-950"
                : ""
            }`}
            onClick={() => handleFolderClick(folder.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FolderIcon
                    className="size-10 shrink-0"
                    style={{ color: folder.color || "#6366f1" }}
                    fill="currentColor"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-2">
                      {folder.name}
                    </p>
                    {folder.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                        {folder.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(folder.updatedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
                <button
                  className="p-1 hover:bg-muted rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(folder.id);
                  }}
                >
                  <MoreVertical className="size-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ItemContextMenu>
    );
  };

  const renderFileCard = (file: IFile) => {
    const isSelected = selectedItems.has(file.id);

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: file.id,
      data: file,
    });

    return (
      <ItemContextMenu key={file.id} item={file} type="file">
        <div ref={setNodeRef}>
          <Card
            {...attributes}
            {...listeners}
            className={`cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${
              isSelected ? "ring-2 ring-primary" : ""
            } ${isDragging ? "opacity-50" : ""}`}
            onClick={() => handleFileClick(file)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileIcon className="size-10 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-2">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(file.updatedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
                <button
                  className="p-1 hover:bg-muted rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(file.id);
                  }}
                >
                  <MoreVertical className="size-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ItemContextMenu>
    );
  };

  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
            Folders
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {folders.map(renderFolderCard)}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
            Files
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {files.map(renderFileCard)}
          </div>
        </div>
      )}

      {/* Modals */}
      <FilePreviewModal
        isOpen={!!modalState.previewedFile}
        onClose={() => modalState.setPreviewedFile(null)}
        file={modalState.previewedFile}
      />

      <RenameDialog
        open={!!modalState.renamedItem}
        onOpenChange={(open) => !open && modalState.setRenamedItem(null)}
        currentName={modalState.renamedItem?.name || ""}
        onRename={handleRename}
        type={modalState.renamedItem?.type || "file"}
      />

      <DeleteConfirmDialog
        open={!!modalState.deletedItem}
        onOpenChange={(open) => !open && modalState.setDeletedItem(null)}
        onConfirm={handleDelete}
        itemName={modalState.deletedItem?.name || ""}
      />

      <MoveDialog
        open={!!modalState.movedItem}
        onOpenChange={(open) => !open && modalState.setMovedItem(null)}
        onMove={handleMove}
        itemType={modalState.movedItem?.type || "file"}
        currentFolderId={
          (modalState.movedItem as Folder)?.parent ||
          (modalState.movedItem as IFile)?.folder ||
          undefined
        }
      />
    </div>
  );
};
