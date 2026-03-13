import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadService } from "@/services/upload.service";
import { fileService } from "@/services/file.service";
import { queryKeys } from "@/lib/queryClient";
import { useFolderUIStore } from "@/stores/useFolderUIStore";
import {
  uploadStateStore,
  type UploadPartState,
} from "@/services/uploadState.service";
import type { IFile } from "@/types/file.types";
import { toast } from "sonner";

export interface FileUploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status:
    | "pending"
    | "hashing"
    | "uploading"
    | "processing"
    | "success"
    | "error";
  error?: string;
}

export interface UseFileUploadReturn {
  uploads: Map<string, FileUploadProgress>;
  uploadFile: (file: File, folderId: string) => Promise<IFile>;
  uploadFiles: (files: File[], folderId: string) => Promise<IFile[]>;
  cancelUpload: (fileId: string) => void;
  clearCompleted: () => void;
}

/** Metadata tracked for an in-flight multipart upload so we can abort it. */
interface ActiveMultipart {
  uploadId: string;
  key: string;
  hash: string;
}

const SMALL_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
const CHUNK_SIZE = 25 * 1024 * 1024; // 25MB per part

// Retry configuration
const MAX_PART_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1 s → 2 s → 4 s

// Dynamic concurrency (TCP slow-start inspired)
const INITIAL_CONCURRENCY = 2;
const MAX_CONCURRENCY = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a single part with exponential-backoff retry.
 * Propagates AbortError immediately without retrying.
 */
async function uploadPartWithRetry(
  url: string,
  chunk: Blob,
  signal?: AbortSignal,
  maxRetries = MAX_PART_RETRIES,
): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Upload cancelled", "AbortError");
    }
    try {
      return await uploadService.uploadPart(url, chunk, () => {}, signal);
    } catch (err) {
      // Don't retry on abort errors
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }
  throw lastError ?? new Error("Upload part failed after retries");
}

export function useFileUpload(): UseFileUploadReturn {
  const queryClient = useQueryClient();
  const { currentFolderId, viewType } = useFolderUIStore();

  const [uploads, setUploads] = useState<Map<string, FileUploadProgress>>(
    new Map(),
  );

  // Per-upload AbortController (keyed by fileId)
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Multipart info for in-flight large uploads (needed to abort server-side)
  const activeMultipartRef = useRef<Map<string, ActiveMultipart>>(new Map());

  // Invalidate relevant queries after successful upload
  const invalidateQueries = useCallback(
    (folderId: string) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.content(folderId),
      });

      if (viewType === "folder" && currentFolderId !== folderId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.folders.content(currentFolderId),
        });
      }

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

  // ── Small-file upload (< 100 MB, single presigned PUT) ────────────────
  // Hash is already computed by the caller.
  const uploadSmallFile = useCallback(
    async (
      file: File,
      folderId: string,
      fileId: string,
      hash: string,
      signal?: AbortSignal,
    ): Promise<IFile> => {
      try {
        updateUploadProgress(fileId, { status: "uploading", progress: 10 });

        const presignedData = await uploadService.getPresignedFileUrl({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });

        await uploadService.uploadToPresignedUrl(
          presignedData.url,
          file,
          presignedData.headers,
          (progress) => {
            // 10-95 % is the upload range
            updateUploadProgress(fileId, {
              progress: 10 + Math.round(progress * 0.85),
            });
          },
          signal,
        );

        updateUploadProgress(fileId, { status: "processing", progress: 95 });

        const createdFile = await uploadService.confirmSimpleUpload({
          folderId,
          key: presignedData.key,
          size: file.size,
          mimeType: file.type,
          originalName: file.name,
          hash,
        });

        updateUploadProgress(fileId, { status: "success", progress: 100 });
        return createdFile;
      } catch (error) {
        // If cancelled externally, cancelUpload() already cleaned up UI — skip re-setting error
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
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

  // Features: resumable (IndexedDB), per-part retry, dynamic concurrency.
  // Hash is already computed by the caller.
  const uploadLargeFile = useCallback(
    async (
      file: File,
      folderId: string,
      fileId: string,
      hash: string,
      signal?: AbortSignal,
    ): Promise<IFile> => {
      let uploadId: string | null = null;
      let key: string | null = null;

      try {
        updateUploadProgress(fileId, { status: "uploading", progress: 10 });

        const totalParts = Math.ceil(file.size / CHUNK_SIZE);
        const uploadedParts: Array<UploadPartState | null> = new Array(
          totalParts,
        ).fill(null);
        let completedCount = 0;

        const savedState = await uploadStateStore.get(hash);
        if (
          savedState &&
          savedState.folderId === folderId &&
          savedState.totalParts === totalParts
        ) {
          try {
            await uploadService.listParts(savedState.uploadId, savedState.key);
            uploadId = savedState.uploadId;
            key = savedState.key;
            for (let i = 0; i < totalParts; i++) {
              if (savedState.finishedParts[i]) {
                uploadedParts[i] = savedState.finishedParts[i];
                completedCount++;
              }
            }
          } catch {
            // Stale / invalid — start fresh
            await uploadStateStore.remove(hash);
          }
        }

        if (!uploadId || !key) {
          const multipartData = await uploadService.createMultipartUpload({
            filename: file.name,
            type: file.type,
            metadata: { size: file.size },
          });
          uploadId = multipartData.uploadId;
          key = multipartData.key;

          await uploadStateStore.save(hash, {
            uploadId,
            key,
            fileSize: file.size,
            mimeType: file.type,
            originalName: file.name,
            folderId,
            totalParts,
            chunkSize: CHUNK_SIZE,
            finishedParts: new Array(totalParts).fill(null),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }

        // Register multipart info so cancelUpload() can abort it server-side
        activeMultipartRef.current.set(fileId, { uploadId, key, hash });

        const remainingIndices: number[] = [];
        for (let i = 0; i < totalParts; i++) {
          if (!uploadedParts[i]) remainingIndices.push(i);
        }

        if (remainingIndices.length > 0) {
          const partNumbers = remainingIndices.map((i) => i + 1);
          const signedUrls = await uploadService.getPartSignedUrls(
            uploadId,
            key,
            partNumbers,
          );

          let concurrency = INITIAL_CONCURRENCY;
          let nextQueueIdx = 0;
          let inFlight = 0;
          const totalRemaining = remainingIndices.length;

          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const onSettled = (err?: Error) => {
              if (settled) return;
              settled = true;
              if (err) reject(err);
              else resolve();
            };

            const drain = () => {
              if (settled) return;
              // Stop dispatching new parts if cancelled
              if (signal?.aborted) {
                onSettled(new DOMException("Upload cancelled", "AbortError"));
                return;
              }
              while (inFlight < concurrency && nextQueueIdx < totalRemaining) {
                const qIdx = nextQueueIdx++;
                const partIdx = remainingIndices[qIdx];
                const partNumber = partIdx + 1;
                const start = partIdx * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
                const partUrl = signedUrls[partNumber];

                inFlight++;

                uploadPartWithRetry(partUrl, chunk, signal)
                  .then((etag) => {
                    const part: UploadPartState = {
                      PartNumber: partNumber,
                      ETag: etag,
                    };
                    uploadedParts[partIdx] = part;
                    completedCount++;
                    inFlight--;

                    // Slow-start: grow concurrency on success
                    concurrency = Math.min(concurrency + 1, MAX_CONCURRENCY);

                    // Persist for resume
                    uploadStateStore.updatePart(hash, partIdx, part);

                    updateUploadProgress(fileId, {
                      progress:
                        10 + Math.round((completedCount / totalParts) * 85),
                    });

                    if (completedCount === totalParts) {
                      onSettled();
                    } else {
                      drain();
                    }
                  })
                  .catch((err) => {
                    concurrency = Math.max(Math.ceil(concurrency / 2), 1);
                    onSettled(
                      err instanceof Error ? err : new Error(String(err)),
                    );
                  });
              }
            };

            drain();
          });
        }

        updateUploadProgress(fileId, { status: "processing", progress: 95 });

        const finalParts = uploadedParts.filter(
          (p): p is UploadPartState => p !== null,
        );
        const completeResult = await uploadService.completeMultipartUpload(
          uploadId,
          {
            key,
            parts: finalParts,
            folderId,
            size: file.size,
            mimeType: file.type,
            originalName: file.name,
            hash,
          },
        );

        // The backend creates the file record atomically in the complete endpoint
        const createdFile = completeResult.file!;

        await uploadStateStore.remove(hash);
        activeMultipartRef.current.delete(fileId);

        updateUploadProgress(fileId, { status: "success", progress: 100 });
        return createdFile;
      } catch (error) {
        activeMultipartRef.current.delete(fileId);

        // If cancelled externally, cancelUpload() already cleaned up UI and IndexedDB
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        // Keep IndexedDB state so the user can resume by re-uploading the
        // same file. The 7-day TTL in uploadStateStore handles cleanup for
        // truly abandoned uploads.

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

  // Flow: hash → dedup check (秒传) → actual upload if needed
  const uploadFile = useCallback(
    async (
      file: File,
      folderId: string,
      options?: { skipInvalidation?: boolean },
    ): Promise<IFile> => {
      const fileId = crypto.randomUUID();

      // Create an AbortController so cancelUpload() can stop this upload
      const controller = new AbortController();
      uploadControllersRef.current.set(fileId, controller);
      const { signal } = controller;

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

      try {
        // Step 1: Hash (off main thread via Web Worker) — 0-10 %
        updateUploadProgress(fileId, { status: "hashing", progress: 0 });

        const hash = await fileService.calculateHash(file, (p) => {
          updateUploadProgress(fileId, { progress: Math.round(p * 10) });
        });

        // Step 2: Dedup check (秒传) — works for ALL file sizes now
        updateUploadProgress(fileId, { status: "uploading", progress: 10 });

        const dedupResult = await fileService.checkFileByHash({
          hash,
          folderId,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });

        if (dedupResult.exists && dedupResult.file) {
          // Instant upload — no bytes transferred
          updateUploadProgress(fileId, { status: "success", progress: 100 });
          if (!options?.skipInvalidation) invalidateQueries(folderId);
          return dedupResult.file;
        }

        // Step 3: Actual upload — 10-100 %
        let result: IFile;

        if (file.size < SMALL_FILE_THRESHOLD) {
          result = await uploadSmallFile(file, folderId, fileId, hash, signal);
        } else {
          result = await uploadLargeFile(file, folderId, fileId, hash, signal);
        }

        if (!options?.skipInvalidation) invalidateQueries(folderId);
        uploadControllersRef.current.delete(fileId);
        return result;
      } catch (error) {
        uploadControllersRef.current.delete(fileId);

        // If cancelled externally, cancelUpload() already cleaned up the progress map
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
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
    [uploadSmallFile, uploadLargeFile, invalidateQueries, updateUploadProgress],
  );

  /**
   * Upload multiple files in parallel with React Query cache invalidation
   */
  const uploadFiles = useCallback(
    async (files: File[], folderId: string): Promise<IFile[]> => {
      const MAX_CONCURRENT = 3;
      const results: IFile[] = [];
      const errors: Error[] = [];

      for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
        const batch = files.slice(i, i + MAX_CONCURRENT);
        const settled = await Promise.allSettled(
          batch.map((file) =>
            uploadFile(file, folderId, { skipInvalidation: true }),
          ),
        );

        for (const result of settled) {
          if (result.status === "fulfilled") {
            results.push(result.value);
          } else {
            errors.push(
              result.reason instanceof Error
                ? result.reason
                : new Error("Upload failed"),
            );
          }
        }
      }

      if (results.length > 0) invalidateQueries(folderId);

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

  const cancelUpload = useCallback((fileId: string) => {
    // 1. Abort in-flight XHR requests
    const controller = uploadControllersRef.current.get(fileId);
    if (controller) {
      controller.abort();
      uploadControllersRef.current.delete(fileId);
    }

    // 2. Abort server-side multipart upload and clean IndexedDB state
    const multipart = activeMultipartRef.current.get(fileId);
    if (multipart) {
      uploadService
        .abortMultipartUpload(multipart.uploadId, multipart.key)
        .catch(() => {
          // Best-effort — MinIO cleans up incomplete multiparts on its own schedule
        });
      uploadStateStore.remove(multipart.hash).catch(() => {});
      activeMultipartRef.current.delete(fileId);
    }

    // 3. Remove from progress map
    setUploads((prev) => {
      const newMap = new Map(prev);
      newMap.delete(fileId);
      return newMap;
    });
  }, []);

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
