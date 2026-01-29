import { useMutation, useQueryClient } from "@tanstack/react-query";
import { shareService } from "@/services/share.service";
import { queryKeys } from "@/lib/queryClient";
import { toast } from "sonner";
import type {
  ShareResourceRequest,
  ChangePermissionRequest,
  UpdateLinkShareRequest,
  ResourceType,
} from "@/types/share.types";

/**
 * Hook for sharing a resource with users
 */
export const useShareResource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ShareResourceRequest) =>
      shareService.shareResource(data),
    onSuccess: (_data, variables) => {
      toast.success("Resource shared successfully");
      // Invalidate the permissions query for this resource
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to share resource";
      toast.error(message);
    },
  });
};

/**
 * Hook for removing a user's permission from a resource
 */
export const useRemovePermission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      resourceId,
      targetUserId,
      resourceType,
    }: {
      resourceId: string;
      targetUserId: string;
      resourceType: ResourceType;
    }) => shareService.removePermission(resourceId, targetUserId, resourceType),
    onSuccess: (_data, variables) => {
      toast.success("Permission removed successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to remove permission";
      toast.error(message);
    },
  });
};

/**
 * Hook for changing a user's permission role
 */
export const useChangePermission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      resourceId,
      targetUserId,
      data,
    }: {
      resourceId: string;
      targetUserId: string;
      data: ChangePermissionRequest;
    }) => shareService.changePermission(resourceId, targetUserId, data),
    onSuccess: (_data, variables) => {
      toast.success("Permission updated successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to change permission";
      toast.error(message);
    },
  });
};

/**
 * Hook for updating link share settings
 */
export const useUpdateLinkShare = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      resourceId,
      data,
    }: {
      resourceId: string;
      data: UpdateLinkShareRequest;
    }) => shareService.updateLinkShare(resourceId, data),
    onSuccess: (data, variables) => {
      if (data.linkShareConfig.enableLinkSharing) {
        toast.success("Link sharing enabled");
      } else {
        toast.success("Link sharing disabled");
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update link share settings";
      toast.error(message);
    },
  });
};

/**
 * Hook for copying share link to clipboard
 */
export const useCopyShareLink = () => {
  return useMutation({
    mutationFn: ({
      token,
      resourceType,
    }: {
      token: string;
      resourceType: ResourceType;
    }) => shareService.copyShareLink(token, resourceType),
    onSuccess: () => {
      toast.success("Link copied to clipboard");
    },
    onError: () => {
      toast.error("Failed to copy link");
    },
  });
};
