import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadService } from "@/services/upload.service";
import { fileService } from "@/services/file.service";
import { queryKeys } from "@/lib/queryClient";
import { useFolderUIStore } from "@/stores/useFolderUIStore";
import type { IFile } from "@/types/file.types";
import { toast } from "sonner";

export interface FileUploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: "pending" | "uploading" | "processing" | "success" | "error";
  error?: string;
}

export interface UseFileUploadReturn {
  uploads: Map<string, FileUploadProgress>;
  uploadFile: (file: File, folderId: string) => Promise<IFile>;
  uploadFiles: (files: File[], folderId: string) => Promise<IFile[]>;
  cancelUpload: (fileId: string) => void;
  clearCompleted: () => void;
}

const SMALL_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per part

export function useFileUpload(): UseFileUploadReturn {
  const queryClient = useQueryClient();
  const { currentFolderId, viewType } = useFolderUIStore();

  const [uploads, setUploads] = useState<Map<string, FileUploadProgress>>(
    new Map(),
  );

  // Invalidate relevant queries after successful upload
  const invalidateQueries = useCallback(
    (folderId: string) => {
      // Invalidate the target folder content
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.content(folderId),
      });

      // Also invalidate current view if different
      if (viewType === "folder" && currentFolderId !== folderId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.folders.content(currentFolderId),
        });
      }

      // Invalidate special views that might show the new file
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.recent(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.files(),
      });
    },
    [queryClient, currentFolderId, viewType],
  );

  const updateUploadProgress = useCallback(
    (
      fileId: string,
      updates: Partial<Omit<FileUploadProgress, "fileId" | "fileName">>,
    ) => {
      setUploads((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(fileId);
        if (existing) {
          newMap.set(fileId, { ...existing, ...updates });
        }
        return newMap;
      });
    },
    [],
  );

  const uploadSmallFile = useCallback(
    async (file: File, folderId: string, fileId: string): Promise<IFile> => {
      try {
        updateUploadProgress(fileId, {
          status: "uploading",
          progress: 0,
        });

        // Get presigned URL
        const presignedData = await uploadService.getPresignedFileUrl({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });

        // Upload to MinIO
        await uploadService.uploadToPresignedUrl(
          presignedData.url,
          file,
          presignedData.headers,
          (progress) => {
            updateUploadProgress(fileId, {
              progress: Math.round(progress * 0.95),
            });
          },
        );

        updateUploadProgress(fileId, {
          status: "processing",
          progress: 95,
        });

        // Calculate hash for deduplication
        const hash = await fileService.calculateHash(file);

        // Create file record in database
        const createdFile = await fileService.createFileRecord({
          folderId,
          key: presignedData.key,
          size: file.size,
          mimeType: file.type,
          originalName: file.name,
          hash,
        });

        updateUploadProgress(fileId, {
          status: "success",
          progress: 100,
        });

        return createdFile;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        updateUploadProgress(fileId, {
          status: "error",
          progress: 0,
          error: errorMessage,
        });
        throw error;
      }
    },
    [updateUploadProgress],
  );

  /**
   * Upload large file (≥ 100MB) using multipart upload
   */
  const uploadLargeFile = useCallback(
    async (file: File, folderId: string, fileId: string): Promise<IFile> => {
      let uploadId: string | null = null;
      let key: string | null = null;

      try {
        updateUploadProgress(fileId, {
          status: "uploading",
          progress: 0,
        });

        // Step 1: Create multipart upload
        const multipartData = await uploadService.createMultipartUpload({
          filename: file.name,
          type: file.type,
          metadata: { size: file.size },
        });

        uploadId = multipartData.uploadId;
        key = multipartData.key;

        // Step 2: Upload parts
        const totalParts = Math.ceil(file.size / CHUNK_SIZE);
        const uploadedParts: Array<{ PartNumber: number; ETag: string }> = [];

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          const start = (partNumber - 1) * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          // Get presigned URL for this part
          const partUrl = await uploadService.getPartSignedUrl(
            uploadId,
            key,
            partNumber,
          );

          // Upload part
          const etag = await uploadService.uploadPart(partUrl, chunk, () => {
            const partProgress = ((partNumber - 1) / totalParts) * 100;
            const chunkProgress = ((end - start) / file.size) * 100;
            updateUploadProgress(fileId, {
              progress: Math.round(partProgress + chunkProgress * 0.95),
            });
          });

          uploadedParts.push({
            PartNumber: partNumber,
            ETag: etag,
          });
        }

        updateUploadProgress(fileId, {
          status: "processing",
          progress: 95,
        });

        // Step 3: Complete multipart upload
        await uploadService.completeMultipartUpload(uploadId, {
          key,
          parts: uploadedParts,
        });

        // Step 4: Calculate hash
        const hash = await fileService.calculateHash(file);

        // Step 5: Create file record
        const createdFile = await fileService.createFileRecord({
          folderId,
          key,
          size: file.size,
          mimeType: file.type,
          originalName: file.name,
          hash,
        });

        updateUploadProgress(fileId, {
          status: "success",
          progress: 100,
        });

        return createdFile;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        // Abort multipart upload on error
        if (uploadId && key) {
          try {
            await uploadService.abortMultipartUpload(uploadId, key);
          } catch (abortError) {
            console.error("Failed to abort multipart upload:", abortError);
          }
        }

        updateUploadProgress(fileId, {
          status: "error",
          progress: 0,
          error: errorMessage,
        });
        throw error;
      }
    },
    [updateUploadProgress],
  );

  /**
   * Upload a single file with React Query cache invalidation
   */
  const uploadFile = useCallback(
    async (
      file: File,
      folderId: string,
      options?: { skipInvalidation?: boolean },
    ): Promise<IFile> => {
      const fileId = crypto.randomUUID();

      // Initialize upload state
      setUploads((prev) => {
        const newMap = new Map(prev);
        newMap.set(fileId, {
          fileId,
          fileName: file.name,
          progress: 0,
          status: "pending",
        });
        return newMap;
      });

      // Choose upload strategy based on file size
      let result: IFile;
      if (file.size < SMALL_FILE_THRESHOLD) {
        result = await uploadSmallFile(file, folderId, fileId);
      } else {
        result = await uploadLargeFile(file, folderId, fileId);
      }

      // Invalidate queries unless explicitly skipped (for batch uploads)
      if (!options?.skipInvalidation) {
        invalidateQueries(folderId);
      }

      return result;
    },
    [uploadSmallFile, uploadLargeFile, invalidateQueries],
  );

  /**
   * Upload multiple files with React Query cache invalidation
   */
  const uploadFiles = useCallback(
    async (files: File[], folderId: string): Promise<IFile[]> => {
      const results: IFile[] = [];
      const errors: Error[] = [];

      // Upload files sequentially to avoid overwhelming the server
      // Skip individual invalidations, we'll do it once at the end
      for (const file of files) {
        try {
          const result = await uploadFile(file, folderId, {
            skipInvalidation: true,
          });
          results.push(result);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error("Upload failed"),
          );
        }
      }

      // Invalidate queries after all uploads complete
      if (results.length > 0) {
        invalidateQueries(folderId);
      }

      // Show summary toast
      if (errors.length === 0) {
        toast.success(
          `Successfully uploaded ${results.length} file${results.length > 1 ? "s" : ""}`,
        );
      } else if (results.length > 0) {
        toast.warning(
          `Uploaded ${results.length} file${results.length > 1 ? "s" : ""}, ${errors.length} failed`,
        );
      } else {
        toast.error("All uploads failed");
      }

      return results;
    },
    [uploadFile, invalidateQueries],
  );

  /**
   * Cancel an upload (for multipart uploads)
   */
  const cancelUpload = useCallback((fileId: string) => {
    // TODO: Implement cancellation logic
    // This would require tracking uploadId and key per file
    setUploads((prev) => {
      const newMap = new Map(prev);
      newMap.delete(fileId);
      return newMap;
    });
  }, []);

  /**
   * Clear completed uploads from state
   */
  const clearCompleted = useCallback(() => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      for (const [fileId, upload] of newMap.entries()) {
        if (upload.status === "success" || upload.status === "error") {
          newMap.delete(fileId);
        }
      }
      return newMap;
    });
  }, []);

  return {
    uploads,
    uploadFile,
    uploadFiles,
    cancelUpload,
    clearCompleted,
  };
}
