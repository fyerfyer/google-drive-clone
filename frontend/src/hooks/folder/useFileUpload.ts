import { useFolderUIStore } from "@/stores/useFolderUIStore";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { fileService } from "@/services/file.service";
import type { UploadFileProgress } from "@/types/file.types";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export const useFileUpload = () => {
  const queryClient = useQueryClient();
  const { currentFolderId, viewType } = useFolderUIStore();

  const [uploadProgress, setUploadProgress] = useState<
    Map<string, UploadFileProgress>
  >(new Map());
  const [isUploading, setIsUploading] = useState(false);

  const refreshContent = useCallback(() => {
    if (viewType === "folder") {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.content(currentFolderId),
      });
    } else {
      queryClient.invalidateQueries({
        queryKey:
          queryKeys.specialViews[
            viewType as Exclude<typeof viewType, "folder">
          ](),
      });
    }
  }, [queryClient, currentFolderId, viewType]);

  const handleProgress = useCallback((progress: UploadFileProgress) => {
    setUploadProgress((prev) => {
      const newMap = new Map(prev);
      newMap.set(progress.fileId, progress);
      return newMap;
    });
  }, []);

  const uploadFiles = useCallback(
    async (files: File[], folderId: string) => {
      if (files.length === 0) return;

      setIsUploading(true);
      setUploadProgress(new Map());

      try {
        await fileService.uploadFiles(files, folderId, handleProgress);
        toast.success("Files uploaded successfully");
        refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload files";
        toast.error(message);
      } finally {
        setIsUploading(false);
      }
    },
    [handleProgress, refreshContent],
  );

  const clearUploadProgress = useCallback(() => {
    setUploadProgress(new Map());
  }, []);

  return {
    uploadFiles,
    uploadProgress,
    isUploading,
    clearUploadProgress,
  };
};
