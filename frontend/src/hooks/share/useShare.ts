import { useCallback } from "react";
import { useShareDialogStore } from "@/stores/useShareDialogStore";
import {
  useShareResource,
  useRemovePermission,
  useChangePermission,
  useUpdateLinkShare,
  useCopyShareLink,
} from "@/hooks/mutations/useShareMutations";
import { useResourcePermissions } from "@/hooks/queries/useShareQueries";
import type { ResourceType, LinkShareConfig } from "@/types/share.types";
import type { AccessRole } from "@/types/common.types";

/**
 * High-level hook that combines all share-related functionality
 */
export const useShare = () => {
  const { dialog, openShareDialog, closeShareDialog } = useShareDialogStore();

  const shareResourceMutation = useShareResource();
  const removePermissionMutation = useRemovePermission();
  const changePermissionMutation = useChangePermission();
  const updateLinkShareMutation = useUpdateLinkShare();
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

  // Update link share settings
  const updateLinkSettings = useCallback(
    async (
      resourceId: string,
      resourceType: ResourceType,
      linkShareConfig: Partial<LinkShareConfig>,
    ) => {
      return await updateLinkShareMutation.mutateAsync({
        resourceId,
        data: {
          resourceType,
          linkShareConfig,
        },
      });
    },
    [updateLinkShareMutation],
  );

  // Enable link sharing
  const enableLinkShare = useCallback(
    async (
      resourceId: string,
      resourceType: ResourceType,
      role: AccessRole = "viewer",
    ) => {
      return await updateLinkSettings(resourceId, resourceType, {
        enableLinkSharing: true,
        role,
      });
    },
    [updateLinkSettings],
  );

  // Disable link sharing
  const disableLinkShare = useCallback(
    async (resourceId: string, resourceType: ResourceType) => {
      return await updateLinkSettings(resourceId, resourceType, {
        enableLinkSharing: false,
      });
    },
    [updateLinkSettings],
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
    updateLinkSettings,
    enableLinkShare,
    disableLinkShare,
    copyLink,

    // Loading states
    isSharing: shareResourceMutation.isPending,
    isRemovingPermission: removePermissionMutation.isPending,
    isChangingPermission: changePermissionMutation.isPending,
    isUpdatingLinkShare: updateLinkShareMutation.isPending,
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

  return {
    // Data
    owner: permissions?.owner ?? null,
    permissions: permissions?.permissions ?? [],
    linkShare: permissions?.linkShare ?? null,

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

    updateLinkSettings: (linkShareConfig: Partial<LinkShareConfig>) =>
      share.updateLinkSettings(resourceId, resourceType, linkShareConfig),

    enableLinkShare: (role?: AccessRole) =>
      share.enableLinkShare(resourceId, resourceType, role),

    disableLinkShare: () => share.disableLinkShare(resourceId, resourceType),

    copyLink: (token: string) => share.copyLink(token, resourceType),
  };
};
