import { useFolder } from "@/hooks/folder/useFolder";
import { FolderGridView } from "./FolderGridView";
import { FolderListView } from "./FolderListView";
import { Empty } from "@/components/ui/empty";
import { FolderOpen } from "lucide-react";

export const FolderContent = () => {
  const { folders, files, viewMode, isLoading } = useFolder();

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
