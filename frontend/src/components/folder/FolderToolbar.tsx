import { useState } from "react";
import { useFolder } from "@/hooks/folder/useFolder";
import { useFolderDialog } from "@/hooks/folder/useFolderDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FolderPlus, Upload, Grid3x3, List, RefreshCw } from "lucide-react";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { FileUploadDialog } from "./FileUploadDialog";

export const FolderToolbar = () => {
  const { viewMode, setViewMode, refreshContent, currentFolder } = useFolder();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const handleCreateFolder = () => {
    setShowCreateDialog(true);
  };

  const handleUploadFile = () => {
    setShowUploadDialog(true);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
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
    </>
  );
};
