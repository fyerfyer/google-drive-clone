import { useEffect } from "react";
import { useFolder } from "@/hooks/folder/useFolder";
import { FolderToolbar } from "./FolderToolbar";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { FolderContent } from "./FolderContent";
import { Spinner } from "@/components/ui/spinner";

interface FolderBrowserProps {
  initialFolderId: string;
}

export const FolderBrowser = ({ initialFolderId }: FolderBrowserProps) => {
  const { loadFolderContent, isLoading, error } = useFolder();

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
    <div className="flex flex-col gap-4 p-4 lg:p-6 w-full max-w-[1920px] mx-auto">
      <FolderBreadcrumb />
      <FolderToolbar />
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      <FolderContent />
    </div>
  );
};
