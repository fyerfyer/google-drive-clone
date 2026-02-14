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
import {
  Folder as FolderIcon,
  ChevronRight,
  Home,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFolderPicker } from "@/hooks/folder/useFolderPicker";

interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (folderId: string) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  isLoading?: boolean;
}

export const FolderPicker = ({
  open,
  onOpenChange,
  onSelect,
  title = "Select Folder",
  description = "Choose a destination folder",
  actionLabel = "Select",
  isLoading: externalLoading = false,
}: FolderPickerProps) => {
  const {
    currentFolderId,
    folders,
    breadcrumbs,
    loading,
    selectedFolderId,
    navigateToFolder,
    navigateToBreadcrumb,
    navigateBack,
    selectFolder,
  } = useFolderPicker({ isOpen: open });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b pb-2 mb-2 text-sm text-muted-foreground overflow-hidden">
          {breadcrumbs.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={navigateBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap mask-linear-fade">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center">
                {index > 0 && (
                  <ChevronRight className="h-4 w-4 mx-1 opacity-50" />
                )}
                <button
                  className={cn(
                    "hover:text-foreground transition-colors",
                    index === breadcrumbs.length - 1 &&
                      "font-medium text-foreground",
                  )}
                  onClick={() => navigateToBreadcrumb(index)}
                >
                  {index === 0 ? <Home className="h-4 w-4" /> : crumb.name}
                </button>
              </div>
            ))}
          </div>
        </div>

        <ScrollArea className="h-[300px] border rounded-md p-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <FolderIcon className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No folders found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedFolderId === folder.id &&
                      "bg-accent text-accent-foreground hover:bg-accent",
                  )}
                  onClick={() => selectFolder(folder.id)}
                  onDoubleClick={() => navigateToFolder(folder)}
                >
                  <FolderIcon
                    className={cn(
                      "h-5 w-5 fill-sky-200 text-sky-500",
                      selectedFolderId === folder.id &&
                        "fill-current text-current",
                    )}
                  />
                  <span className="flex-1 text-sm truncate">{folder.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToFolder(folder);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <div className="text-xs text-muted-foreground">
            {selectedFolderId
              ? `Selected: ${folders.find((f) => f.id === selectedFolderId)?.name}`
              : `Current: ${breadcrumbs[breadcrumbs.length - 1].name}`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => onSelect(selectedFolderId || currentFolderId)}
              disabled={externalLoading || loading}
            >
              {externalLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {actionLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
