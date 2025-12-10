import { useState, useCallback } from "react";
import { uploadService } from "@/services/upload.service";
import { userService } from "@/services/user.service";
import type { User } from "@/types/user.types";

export interface AvatarUploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
}

export interface UseAvatarUploadReturn {
  uploadState: AvatarUploadState;
  uploadAvatar: (file: File) => Promise<User | string | undefined>; // Returns user when autoUpdate=true, avatar key otherwise
  reset: () => void;
}

export interface UseAvatarUploadOptions {
  /**
   * If true, automatically call updateAvatar API after upload
   * If false, just upload to MinIO and return the key
   * Default: true
   */
  autoUpdate?: boolean;
}

/**
 * Hook for uploading avatar using presigned URL flow
 *
 * Flow:
 * 1. Get presigned URL from backend
 * 2. Upload file directly to MinIO
 * 3. (Optional) Call backend to process avatar and update user
 *
 * @param options.autoUpdate - Whether to automatically update user profile after upload
 */
export function useAvatarUpload(
  options: UseAvatarUploadOptions = {}
): UseAvatarUploadReturn {
  const { autoUpdate = true } = options;
  const [uploadState, setUploadState] = useState<AvatarUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    success: false,
  });

  const reset = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
      success: false,
    });
  }, []);

  const uploadAvatar = useCallback(
    async (file: File) => {
      // Validate file
      if (!file.type.startsWith("image/")) {
        const error = "Please select an image file";
        setUploadState({
          isUploading: false,
          progress: 0,
          error,
          success: false,
        });
        throw new Error(error);
      }

      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      if (file.size > MAX_SIZE) {
        const error = "Avatar must be smaller than 5MB";
        setUploadState({
          isUploading: false,
          progress: 0,
          error,
          success: false,
        });
        throw new Error(error);
      }

      try {
        setUploadState({
          isUploading: true,
          progress: 0,
          error: null,
          success: false,
        });

        // Step 1: Get presigned URL
        const presignedData = await uploadService.getPresignedAvatarUrl({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });

        // Step 2: Upload to MinIO
        await uploadService.uploadToPresignedUrl(
          presignedData.url,
          file,
          presignedData.headers,
          (progress) => {
            setUploadState((prev) => ({
              ...prev,
              progress: Math.round(progress * 0.9), // Reserve 10% for backend processing
            }));
          }
        );

        setUploadState((prev) => ({
          ...prev,
          progress: 95,
        }));

        // Step 3: Update user avatar (backend will process and generate thumbnail)
        // Only if autoUpdate is enabled
        let updatedUser: User | undefined;
        if (autoUpdate) {
          const response = await userService.updateAvatar(presignedData.key);
          updatedUser = response.user;
        }

        setUploadState({
          isUploading: false,
          progress: 100,
          error: null,
          success: true,
        });

        // Return updated user (auto update) or avatar key (manual update)
        return autoUpdate ? updatedUser : presignedData.key;
      } catch (error) {
        console.error("Avatar upload failed:", error);
        setUploadState({
          isUploading: false,
          progress: 0,
          error: error instanceof Error ? error.message : "Upload failed",
          success: false,
        });
        throw error;
      }
    },
    [autoUpdate]
  );

  return {
    uploadState,
    uploadAvatar,
    reset,
  };
}
