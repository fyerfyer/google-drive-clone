import { useEffect } from "react";
import { useFolder } from "@/hooks/folder/useFolder";
import { FolderToolbar } from "./FolderToolbar";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { FolderContent } from "./FolderContent";
import { Spinner } from "@/components/ui/spinner";
import { useDragDrop } from "@/hooks/shared/useDragDrop";
import { useFolderOperations } from "@/hooks/folder/useFolderOperations";
import { useFileOperations } from "@/hooks/folder/useFileOperations";
import { useFileUpload } from "@/hooks/folder/useFileUpload";
import { Upload } from "lucide-react";

interface FolderBrowserProps {
  initialFolderId: string;
}

export const FolderBrowser = ({ initialFolderId }: FolderBrowserProps) => {
  const { loadFolderContent, isLoading, error, folders, files } = useFolder();
  const folderOps = useFolderOperations();
  const fileOps = useFileOperations();
  const { uploadFiles: uploadFilesService } = useFileUpload();

  const handleMove = (itemId: string, targetFolderId: string) => {
    const allItems = [...folders, ...files];
    const item = allItems.find((item) => item.id === itemId);

    if (!item) return;

    if (item.type === "folder") {
      folderOps.moveFolder(itemId, targetFolderId);
    } else {
      fileOps.moveFile(itemId, targetFolderId);
    }
  };

  const handleFileUpload = async (filesToUpload: File[], folderId: string) => {
    await uploadFilesService(filesToUpload, folderId);
  };

  const {
    DndContext,
    DragOverlay,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    collisionDetection,
    activeItem,
    isFileDragging,
    dropZoneRef,
  } = useDragDrop({
    onMove: handleMove,
    onFileUpload: handleFileUpload,
    currentFolderId: initialFolderId,
  });

  useEffect(() => {
    loadFolderContent(initialFolderId);
  }, [initialFolderId, loadFolderContent]);

  if (isLoading && !error) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={dropZoneRef}
        className="flex flex-col gap-4 p-4 lg:p-6 w-full max-w-[1920px] mx-auto relative"
      >
        {/* Drop zone overlay for file uploads */}
        {isFileDragging && (
          <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary rounded-lg flex items-center justify-center backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 text-primary">
              <Upload className="size-16" />
              <p className="text-xl font-semibold">Drop files here to upload</p>
            </div>
          </div>
        )}

        <FolderBreadcrumb />
        <FolderToolbar />
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        <FolderContent />
      </div>

      <DragOverlay>
        {activeItem && (
          <div className="bg-card border-2 border-primary rounded-lg p-4 shadow-lg opacity-90">
            <div className="flex items-center gap-2">
              <span className="font-medium">{activeItem.name}</span>
              <span className="text-xs text-muted-foreground">
                ({activeItem.type})
              </span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};
