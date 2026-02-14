import { useMutation, useQueryClient } from "@tanstack/react-query";
import { shareService } from "@/services/share.service";
import { queryKeys } from "@/lib/queryClient";
import { toast } from "sonner";
import type {
  ShareResourceRequest,
  ChangePermissionRequest,
  CreateShareLinkRequest,
  UpdateShareLinkRequest,
  ResourceType,
} from "@/types/share.types";

// Hook for sharing a resource with users
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

// Hook for removing a user's permission from a resource
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

// Hook for changing a user's permission role
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

// Hook for creating a share link
export const useCreateShareLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      resourceId,
      data,
    }: {
      resourceId: string;
      data: CreateShareLinkRequest;
    }) => shareService.createShareLink(resourceId, data),
    onSuccess: (_data, variables) => {
      toast.success("Share link created");
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to create share link";
      toast.error(message);
    },
  });
};

// Hook for updating share link settings
export const useUpdateShareLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      linkId,
      data,
    }: {
      linkId: string;
      resourceId: string;
      data: UpdateShareLinkRequest;
    }) => shareService.updateShareLink(linkId, data),
    onSuccess: (_data, variables) => {
      toast.success("Share link updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to update share link";
      toast.error(message);
    },
  });
};

// Hook for rotating share link token
export const useRotateShareLinkToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ linkId }: { linkId: string; resourceId: string }) =>
      shareService.rotateShareLinkToken(linkId),
    onSuccess: (_data, variables) => {
      toast.success("Link token rotated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to rotate token";
      toast.error(message);
    },
  });
};

// Hook for revoking a share link
export const useRevokeShareLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ linkId }: { linkId: string; resourceId: string }) =>
      shareService.revokeShareLink(linkId),
    onSuccess: (_data, variables) => {
      toast.success("Share link revoked");
      queryClient.invalidateQueries({
        queryKey: queryKeys.share.permissions(variables.resourceId),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to revoke link";
      toast.error(message);
    },
  });
};

// Hook for copying share link to clipboard
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
