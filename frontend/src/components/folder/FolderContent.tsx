import { useFolderUIStore } from "@/stores/useFolderUIStore";
import { useFolderContent } from "@/hooks/queries/useFolderQueries";
import { FolderGridView } from "./FolderGridView";
import { FolderListView } from "./FolderListView";
import { Empty } from "@/components/ui/empty";
import { FolderOpen } from "lucide-react";

export const FolderContent = () => {
  // UI state from Zustand
  const { viewMode, currentFolderId } = useFolderUIStore();

  // Data from React Query
  const { data, isLoading } = useFolderContent(currentFolderId);
  const folders = data?.folders ?? [];
  const files = data?.files ?? [];

  const isEmpty = folders.length === 0 && files.length === 0;

  if (isEmpty && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Empty
          icon={<FolderOpen className="size-12" />}
          title="This folder is empty"
          description="Upload files or create folders to get started"
        />
      </div>
    );
  }

  return viewMode === "grid" ? <FolderGridView /> : <FolderListView />;
};
