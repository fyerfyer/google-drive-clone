import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderIcon, Home, ChevronRight } from "lucide-react";
import { folderService } from "@/services/folder.service";
import type { Folder } from "@/types/folder.types";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (destinationId: string) => void;
  itemType: "folder" | "file";
  currentFolderId?: string;
}

export const MoveDialog = ({
  open,
  onOpenChange,
  onMove,
  itemType,
  currentFolderId,
}: MoveDialogProps) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    "root"
  );
  const [breadcrumbs, setBreadcrumbs] = useState<
    { id: string; name: string }[]
  >([{ id: "root", name: "My Drive" }]);

  const loadFolders = async (folderId: string) => {
    setIsLoading(true);
    try {
      const content = await folderService.getFolderContent(folderId);
      setFolders(content.folders);
      setBreadcrumbs(
        folderId === "root"
          ? [{ id: "root", name: "My Drive" }]
          : [
              { id: "root", name: "My Drive" },
              ...content.breadcrumbs.map((b) => ({ id: b.id, name: b.name })),
            ]
      );
    } catch (error) {
      console.error("Failed to load folders:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadFolders("root");
      setSelectedFolderId("root");
    }
  }, [open]);

  const handleFolderClick = (folderId: string) => {
    setSelectedFolderId(folderId);
  };

  const handleFolderDoubleClick = (folderId: string) => {
    loadFolders(folderId);
  };

  const handleBreadcrumbClick = (folderId: string) => {
    loadFolders(folderId);
    setSelectedFolderId(folderId);
  };

  const handleMove = () => {
    if (selectedFolderId && selectedFolderId !== currentFolderId) {
      onMove(selectedFolderId);
      onOpenChange(false);
    }
  };

  const canMove = selectedFolderId && selectedFolderId !== currentFolderId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Move {itemType}</DialogTitle>
          <DialogDescription>
            Select a destination folder to move this {itemType} to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center gap-1 shrink-0">
                {index > 0 && <ChevronRight className="size-4" />}
                <button
                  onClick={() => handleBreadcrumbClick(crumb.id)}
                  className="hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted"
                >
                  {index === 0 ? <Home className="size-4" /> : crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* Folder List */}
          <ScrollArea className="h-[300px] rounded-lg border bg-muted/30">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Spinner className="size-6" />
              </div>
            ) : folders.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No folders in this location
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => handleFolderClick(folder.id)}
                    onDoubleClick={() => handleFolderDoubleClick(folder.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                      selectedFolderId === folder.id
                        ? "bg-primary/10 border-2 border-primary"
                        : "hover:bg-muted border-2 border-transparent"
                    )}
                  >
                    <FolderIcon className="size-5 text-blue-500" />
                    <span className="font-medium">{folder.name}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <p className="text-xs text-muted-foreground">
            Tip: Double-click a folder to open it
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleMove} disabled={!canMove}>
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
