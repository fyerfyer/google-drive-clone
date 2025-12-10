import { useState, useCallback } from "react";
import { uploadService } from "@/services/upload.service";
import { fileService } from "@/services/file.service";
import type { IFile } from "@/types/file.types";

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

/**
 * Hook for uploading files using presigned URL flow
 *
 * Supports two modes:
 * - Small files (< 100MB): Simple presigned URL upload
 * - Large files (≥ 100MB): Multipart upload
 */
export function useFileUpload(): UseFileUploadReturn {
  const [uploads, setUploads] = useState<Map<string, FileUploadProgress>>(
    new Map()
  );

  const updateUploadProgress = useCallback(
    (
      fileId: string,
      updates: Partial<Omit<FileUploadProgress, "fileId" | "fileName">>
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
    []
  );

  /**
   * Upload small file (< 100MB)
   */
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
          }
        );

        updateUploadProgress(fileId, {
          status: "processing",
          progress: 95,
        });

        // Calculate hash for deduplication (optional)
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
    [updateUploadProgress]
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
            partNumber
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
    [updateUploadProgress]
  );

  /**
   * Upload a single file
   */
  const uploadFile = useCallback(
    async (file: File, folderId: string): Promise<IFile> => {
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
      if (file.size < SMALL_FILE_THRESHOLD) {
        return uploadSmallFile(file, folderId, fileId);
      } else {
        return uploadLargeFile(file, folderId, fileId);
      }
    },
    [uploadSmallFile, uploadLargeFile]
  );

  /**
   * Upload multiple files
   */
  const uploadFiles = useCallback(
    async (files: File[], folderId: string): Promise<IFile[]> => {
      const uploadPromises = files.map((file) => uploadFile(file, folderId));
      return Promise.all(uploadPromises);
    },
    [uploadFile]
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
