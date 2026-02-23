import { useState } from "react";
import { useFolderUIStore } from "@/stores/useFolderUIStore";
import { useFolderContent } from "@/hooks/queries/useFolderQueries";
import { useBatchOperations } from "@/hooks/folder/useBatchOperations";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
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
  FilePlus,
  Bot,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { FileUploadDialog } from "./FileUploadDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CreateFileDialog } from "./CreateFileDialog";

interface FolderToolbarProps {
  showDriveAgent?: boolean;
  onToggleDriveAgent?: () => void;
}

export const FolderToolbar = ({
  showDriveAgent,
  onToggleDriveAgent,
}: FolderToolbarProps = {}) => {
  const queryClient = useQueryClient();

  // UI state from Zustand
  const {
    viewMode,
    setViewMode,
    currentFolderId,
    selectedItems,
    clearSelection,
  } = useFolderUIStore();

  // Data from React Query
  const { data } = useFolderContent(currentFolderId);
  const currentFolder = data?.currentFolder ?? null;

  const { batchTrash, batchStar } = useBatchOperations();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateFileDialog, setShowCreateFileDialog] = useState(false);

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

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.folders.content(currentFolderId),
    });
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
                  <DropdownMenuItem
                    onClick={() => setShowCreateFileDialog(true)}
                  >
                    <FilePlus className="size-4" />
                    New File
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleUploadFile}>
                    <Upload className="size-4" />
                    Upload Files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" size="icon" onClick={handleRefresh}>
                <RefreshCw className="size-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleDriveAgent && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDriveAgent ? "default" : "outline"}
                    size="sm"
                    onClick={onToggleDriveAgent}
                  >
                    <Bot className="h-4 w-4 mr-1" />
                    AI Assist
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showDriveAgent
                      ? "Close Drive AI assistant"
                      : "Open Drive AI assistant"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
      <CreateFileDialog
        open={showCreateFileDialog}
        onOpenChange={setShowCreateFileDialog}
        folderId={currentFolder?.id || "root"}
      />
    </>
  );
};
