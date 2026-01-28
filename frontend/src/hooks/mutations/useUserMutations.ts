import { useMutation } from "@tanstack/react-query";
import { userService } from "@/services/user.service";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";
import type { User } from "@/types/user.types";

// Hook for updating user profile (name, email)
export const useUpdateProfile = () => {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: (data: { name?: string; email?: string }) =>
      userService.updateUser(data),
    onSuccess: (response) => {
      setUser(response.user);
      toast.success(response.message || "Profile updated successfully");
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to update profile";
      toast.error(message);
    },
  });
};

// Hook for updating user avatar
export const useUpdateAvatar = () => {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: (key: string) => userService.updateAvatar(key),
    onSuccess: (response) => {
      setUser(response.user);
      toast.success("Avatar updated successfully");
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to update avatar";
      toast.error(message);
    },
  });
};

/**
 * Combined hook for profile operations using React Query mutations
 * This provides a clean API for profile updates with automatic auth store sync
 */
export const useProfileOperations = () => {
  const updateProfileMutation = useUpdateProfile();
  const updateAvatarMutation = useUpdateAvatar();

  return {
    // Mutations
    updateProfile: updateProfileMutation.mutateAsync,
    updateAvatar: updateAvatarMutation.mutateAsync,
    // Loading states
    isUpdatingProfile: updateProfileMutation.isPending,
    isUpdatingAvatar: updateAvatarMutation.isPending,
    // Error states
    profileError: updateProfileMutation.error,
    avatarError: updateAvatarMutation.error,
    // Reset functions
    resetProfileError: updateProfileMutation.reset,
    resetAvatarError: updateAvatarMutation.reset,
  };
};

/**
 * Hook specifically for avatar upload with presigned URL flow
 * Combines file upload with avatar update mutation
 */
export interface UseAvatarUploadWithMutationReturn {
  uploadAvatar: (file: File) => Promise<User | undefined>;
  isUploading: boolean;
  progress: number;
  error: string | null;
  reset: () => void;
}
