import { useFolder } from "@/hooks/folder/useFolder";
import { fileService } from "@/services/file.service";
import type { UploadFileProgress } from "@/types/file.types";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export const useFileUpload = () => {
  const { refreshContent } = useFolder();
  const [uploadProgress, setUploadProgress] = useState<
    Map<string, UploadFileProgress>
  >(new Map());
  const [isUploading, setIsUploading] = useState(false);

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
        await refreshContent();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload files";
        toast.error(message);
      } finally {
        setIsUploading(false);
      }
    },
    [handleProgress, refreshContent]
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
