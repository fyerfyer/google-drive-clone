import { useCallback } from "react";
import { useShareDialogStore } from "@/stores/useShareDialogStore";
import {
  useShareResource,
  useRemovePermission,
  useChangePermission,
  useCreateShareLink,
  useUpdateShareLink,
  useRotateShareLinkToken,
  useCopyShareLink,
  useRevokeShareLink,
} from "@/hooks/mutations/useShareMutations";
import { useResourcePermissions } from "@/hooks/queries/useShareQueries";
import type {
  ResourceType,
  CreateShareLinkOptions,
  UpdateShareLinkOptions,
} from "@/types/share.types";
import type { AccessRole } from "@/types/common.types";

/**
 * High-level hook that combines all share-related functionality
 */
export const useShare = () => {
  const { dialog, openShareDialog, closeShareDialog } = useShareDialogStore();

  const shareResourceMutation = useShareResource();
  const removePermissionMutation = useRemovePermission();
  const changePermissionMutation = useChangePermission();
  const createShareLinkMutation = useCreateShareLink();
  const updateShareLinkMutation = useUpdateShareLink();
  const rotateShareLinkMutation = useRotateShareLinkToken();
  const revokeShareLinkMutation = useRevokeShareLink();
  const copyShareLinkMutation = useCopyShareLink();

  // Open share dialog for a resource
  const openShare = useCallback(
    (resourceId: string, resourceType: ResourceType, resourceName: string) => {
      openShareDialog(resourceId, resourceType, resourceName);
    },
    [openShareDialog],
  );

  // Share resource with users
  const shareWithUsers = useCallback(
    async (
      resourceId: string,
      resourceType: ResourceType,
      resourceName: string,
      targetUserIds: string[],
      role: AccessRole,
      expiresAt?: string,
    ) => {
      await shareResourceMutation.mutateAsync({
        resourceId,
        resourceType,
        resourceName,
        targetUserIds,
        role,
        expiresAt,
      });
    },
    [shareResourceMutation],
  );

  // Remove permission from a user
  const removeUserPermission = useCallback(
    async (
      resourceId: string,
      targetUserId: string,
      resourceType: ResourceType,
    ) => {
      await removePermissionMutation.mutateAsync({
        resourceId,
        targetUserId,
        resourceType,
      });
    },
    [removePermissionMutation],
  );

  // Change user's permission role
  const changeUserRole = useCallback(
    async (
      resourceId: string,
      targetUserId: string,
      resourceType: ResourceType,
      newRole: AccessRole,
    ) => {
      await changePermissionMutation.mutateAsync({
        resourceId,
        targetUserId,
        data: {
          resourceType,
          newRole,
        },
      });
    },
    [changePermissionMutation],
  );

  // Create a new share link
  const createShareLink = useCallback(
    async (
      resourceId: string,
      resourceType: ResourceType,
      options: CreateShareLinkOptions = {},
    ) => {
      return await createShareLinkMutation.mutateAsync({
        resourceId,
        data: {
          resourceType,
          options,
        },
      });
    },
    [createShareLinkMutation],
  );

  // Update an existing share link
  const updateShareLink = useCallback(
    async (
      resourceId: string, // passed for invalidation
      linkId: string,
      options: UpdateShareLinkOptions,
    ) => {
      return await updateShareLinkMutation.mutateAsync({
        linkId,
        resourceId,
        data: {
          options,
        },
      });
    },
    [updateShareLinkMutation],
  );

  // Rotate share link token
  const rotateShareLinkToken = useCallback(
    async (resourceId: string, linkId: string) => {
      return await rotateShareLinkMutation.mutateAsync({
        linkId,
        resourceId,
      });
    },
    [rotateShareLinkMutation],
  );

  // Revoke share link
  const revokeShareLink = useCallback(
    async (resourceId: string, linkId: string) => {
      return await revokeShareLinkMutation.mutateAsync({
        linkId,
        resourceId,
      });
    },
    [revokeShareLinkMutation],
  );

  // Copy share link to clipboard
  const copyLink = useCallback(
    async (token: string, resourceType: ResourceType) => {
      await copyShareLinkMutation.mutateAsync({ token, resourceType });
    },
    [copyShareLinkMutation],
  );

  return {
    // Dialog state
    dialog,
    openShare,
    closeShare: closeShareDialog,

    // Actions
    shareWithUsers,
    removeUserPermission,
    changeUserRole,
    createShareLink,
    updateShareLink,
    rotateShareLinkToken,
    revokeShareLink,
    copyLink,

    // Loading states
    isSharing: shareResourceMutation.isPending,
    isRemovingPermission: removePermissionMutation.isPending,
    isChangingPermission: changePermissionMutation.isPending,
    isCreatingLink: createShareLinkMutation.isPending,
    isUpdatingLink: updateShareLinkMutation.isPending,
    isRotatingToken: rotateShareLinkMutation.isPending,
    isCopyingLink: copyShareLinkMutation.isPending,
  };
};

/**
 * Hook for managing a specific resource's permissions
 */
export const useResourceShare = (
  resourceId: string,
  resourceType: ResourceType,
  enabled: boolean = true,
) => {
  const {
    data: permissions,
    isLoading,
    error,
    refetch,
  } = useResourcePermissions(resourceId, resourceType, enabled);

  const share = useShare();

  // For the UI, we just take the first active share link if available
  const activeShareLink = permissions?.shareLinks?.[0] || null;

  return {
    // Data
    owner: permissions?.owner ?? null,
    permissions: permissions?.permissions ?? [],
    activeShareLink,

    // Loading state
    isLoading,
    error,
    refetch,

    // Actions bound to this resource
    shareWithUsers: (
      resourceName: string,
      targetUserIds: string[],
      role: AccessRole,
      expiresAt?: string,
    ) =>
      share.shareWithUsers(
        resourceId,
        resourceType,
        resourceName,
        targetUserIds,
        role,
        expiresAt,
      ),

    removeUserPermission: (targetUserId: string) =>
      share.removeUserPermission(resourceId, targetUserId, resourceType),

    changeUserRole: (targetUserId: string, newRole: AccessRole) =>
      share.changeUserRole(resourceId, targetUserId, resourceType, newRole),

    // Unified Link Management
    createLink: (options?: CreateShareLinkOptions) =>
      share.createShareLink(resourceId, resourceType, options),

    updateLink: (options: UpdateShareLinkOptions) => {
      if (!activeShareLink) throw new Error("No active share link to update");
      return share.updateShareLink(resourceId, activeShareLink.id, options);
    },

    rotateLink: () => {
      if (!activeShareLink) throw new Error("No active share link to rotate");
      return share.rotateShareLinkToken(resourceId, activeShareLink.id);
    },

    revokeLink: () => {
      if (!activeShareLink) throw new Error("No active share link to revoke");
      return share.revokeShareLink(resourceId, activeShareLink.id);
    },

    copyLink: (token: string) => share.copyLink(token, resourceType),
  };
};
