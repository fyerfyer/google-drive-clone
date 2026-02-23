import { useEffect, useState, useCallback } from "react";
import { useFolderUIStore } from "@/stores/useFolderUIStore";
import { useFolderContent } from "@/hooks/queries/useFolderQueries";
import { FolderToolbar } from "./FolderToolbar";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { FolderContent } from "./FolderContent";
import { DriveAgentPanel } from "@/components/agent/DriveAgentPanel";
import { Spinner } from "@/components/ui/spinner";
import { useDragDrop } from "@/hooks/shared/useDragDrop";
import { useFolderOperations } from "@/hooks/folder/useFolderOperations";
import { useFileOperations } from "@/hooks/folder/useFileOperations";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useAgentStore } from "@/stores/useAgentStore";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { Upload } from "lucide-react";
import { toast } from "sonner";

interface FolderBrowserProps {
  initialFolderId: string;
}

export const FolderBrowser = ({ initialFolderId }: FolderBrowserProps) => {
  const setCurrentFolderId = useFolderUIStore(
    (state) => state.setCurrentFolderId,
  );
  const queryClient = useQueryClient();
  const newConversation = useAgentStore((s) => s.newConversation);

  // Drive Agent state
  const [showDriveAgent, setShowDriveAgent] = useState(false);

  // React Query for data fetching
  const { data, isLoading, error } = useFolderContent(initialFolderId);
  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const currentFolder = data?.currentFolder ?? null;
  const folderName =
    currentFolder?.name || (initialFolderId === "root" ? "My Drive" : "Folder");

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

  // Sync URL folder ID with store
  useEffect(() => {
    setCurrentFolderId(initialFolderId);
  }, [initialFolderId, setCurrentFolderId]);

  const handleToggleDriveAgent = useCallback(() => {
    if (!showDriveAgent) {
      newConversation();
    }
    setShowDriveAgent(!showDriveAgent);
  }, [showDriveAgent, newConversation]);

  /** Called when the Drive Agent modifies files/folders — refresh folder content */
  const handleDriveUpdate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.folders.content(initialFolderId),
    });
    toast.info("Drive updated by AI Agent");
  }, [queryClient, initialFolderId]);

  if (isLoading) {
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
      <div className="flex flex-1 overflow-hidden">
        <div
          ref={dropZoneRef}
          className="flex flex-col gap-4 p-4 lg:p-6 w-full max-w-[1920px] mx-auto relative flex-1 min-w-0"
        >
          {/* Drop zone overlay for file uploads */}
          {isFileDragging && (
            <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary rounded-lg flex items-center justify-center backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4 text-primary">
                <Upload className="size-16" />
                <p className="text-xl font-semibold">
                  Drop files here to upload
                </p>
              </div>
            </div>
          )}

          <FolderBreadcrumb />
          <FolderToolbar
            showDriveAgent={showDriveAgent}
            onToggleDriveAgent={handleToggleDriveAgent}
          />
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error.message}
            </div>
          )}
          <FolderContent />
        </div>

        {/* Drive Agent Sidebar */}
        {showDriveAgent && (
          <DriveAgentPanel
            folderId={initialFolderId}
            folderName={folderName}
            isOpen={showDriveAgent}
            onClose={() => setShowDriveAgent(false)}
            onDriveUpdate={handleDriveUpdate}
          />
        )}
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
