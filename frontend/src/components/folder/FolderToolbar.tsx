import { useState } from "react";
import { useFolder } from "@/hooks/folder/useFolder";
import { useBatchOperations } from "@/hooks/folder/useBatchOperations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  FolderPlus,
  Upload,
  Grid3x3,
  List,
  RefreshCw,
  Trash2,
  Star,
  X,
} from "lucide-react";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { FileUploadDialog } from "./FileUploadDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export const FolderToolbar = () => {
  const {
    viewMode,
    setViewMode,
    refreshContent,
    currentFolder,
    selectedItems,
    clearSelection,
  } = useFolder();
  const { batchTrash, batchStar } = useBatchOperations();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const hasSelection = selectedItems.size > 0;

  const handleCreateFolder = () => {
    setShowCreateDialog(true);
  };

  const handleUploadFile = () => {
    setShowUploadDialog(true);
  };

  const handleBatchTrash = async () => {
    await batchTrash();
  };

  const handleBatchStar = async () => {
    await batchStar(true);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {hasSelection ? (
            <>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                <X className="size-4" />
                Clear ({selectedItems.size})
              </Button>
              <Button variant="outline" size="sm" onClick={handleBatchStar}>
                <Star className="size-4" />
                Star
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Trash
              </Button>
            </>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <FolderPlus className="size-4" />
                    New
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleCreateFolder}>
                    <FolderPlus className="size-4" />
                    New Folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleUploadFile}>
                    <Upload className="size-4" />
                    Upload Files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" size="icon" onClick={refreshContent}>
                <RefreshCw className="size-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
          >
            <Grid3x3 className="size-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      <CreateFolderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        parentId={currentFolder?.id || null}
      />
      <FileUploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        folderId={currentFolder?.id || "root"}
      />
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleBatchTrash}
        itemName=""
        itemCount={selectedItems.size}
      />
    </>
  );
};
