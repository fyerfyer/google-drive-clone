import { useQuery } from "@tanstack/react-query";
import { shareService } from "@/services/share.service";
import { queryKeys } from "@/lib/queryClient";
import type { ResourceType, ListSharedWithMeParams } from "@/types/share.types";

/**
 * Hook to fetch resource permissions (owner, permissions list, link share config)
 */
export const useResourcePermissions = (
  resourceId: string,
  resourceType: ResourceType,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: queryKeys.share.permissions(resourceId),
    queryFn: () =>
      shareService.getResourcePermissions(resourceId, resourceType),
    enabled: enabled && !!resourceId,
  });
};

/**
 * Hook to fetch "Shared with Me" items with pagination
 */
export const useSharedWithMe = (params: ListSharedWithMeParams = {}) => {
  const { page = 1, resourceType } = params;

  return useQuery({
    queryKey: queryKeys.share.sharedWithMe(page, resourceType),
    queryFn: () => shareService.listSharedWithMe(params),
  });
};

/**
 * Hook to fetch "Shared with Me" items for special view (compatible with useSpecialView pattern)
 */
export const useSharedWithMeView = () => {
  return useQuery({
    queryKey: queryKeys.specialViews.sharedWithMe(),
    queryFn: async () => {
      const result = await shareService.listSharedWithMe({ limit: 100 });
      return result;
    },
  });
};
