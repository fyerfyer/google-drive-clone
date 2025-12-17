import { useFolder } from "@/hooks/folder/useFolder";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFileActions } from "@/hooks/folder/useFileActions";
import { FileTableRow } from "./FileTableRow";
import { FilePreviewModal } from "./FilePreviewModal";
import { RenameDialog } from "./RenameDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { MoveDialog } from "./MoveDialog";
import { useFolderOperations } from "@/hooks/folder/useFolderOperations";
import { useFileOperations } from "@/hooks/folder/useFileOperations";
import type { IFile } from "@/types/file.types";
import type { Folder } from "@/types/folder.types";

export const FolderListView = () => {
  const { folders, files, toggleSelection, selectedItems } = useFolder();
  const { handleAction, navigateToFolder, modalState } = useFileActions();
  const folderOps = useFolderOperations();
  const fileOps = useFileOperations();

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

  return (
    <>
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                {/* TODO: Select All Checkbox*/}
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last Modified</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* 渲染文件夹 */}
            {folders.map((folder) => (
              <FileTableRow
                key={folder.id}
                item={folder}
                isSelected={selectedItems.has(folder.id)}
                onSelect={toggleSelection}
                onNavigate={navigateToFolder}
                onAction={handleAction}
              />
            ))}

            {/* 渲染文件 */}
            {files.map((file) => (
              <FileTableRow
                key={file.id}
                item={file}
                isSelected={selectedItems.has(file.id)}
                onSelect={toggleSelection}
                onNavigate={navigateToFolder}
                onAction={handleAction}
              />
            ))}

            {folders.length === 0 && files.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No files or folders found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
    </>
  );
};
