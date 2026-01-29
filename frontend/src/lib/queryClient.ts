import { QueryClient } from "@tanstack/react-query";
import type { ViewType } from "@/types/common.types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Query keys factory for consistent key management
export const queryKeys = {
  folders: {
    all: ["folders"] as const,
    content: (folderId: string) => ["folders", "content", folderId] as const,
    breadcrumbs: (folderId: string) =>
      ["folders", "breadcrumbs", folderId] as const,
    starred: () => ["folders", "starred"] as const,
    trashed: () => ["folders", "trashed"] as const,
    recent: () => ["folders", "recent"] as const,
  },
  files: {
    all: ["files"] as const,
    starred: () => ["files", "starred"] as const,
    trashed: () => ["files", "trashed"] as const,
    recent: () => ["files", "recent"] as const,
    userFiles: () => ["files", "user-files"] as const,
  },
  specialViews: {
    starred: () => ["special-view", "starred"] as const,
    trashed: () => ["special-view", "trashed"] as const,
    trash: () => ["special-view", "trashed"] as const, // Alias for "trashed" to match ViewType
    recent: () => ["special-view", "recent"] as const,
    files: () => ["special-view", "files"] as const,
    sharedWithMe: () => ["special-view", "shared-with-me"] as const,
  },
  share: {
    all: ["share"] as const,
    permissions: (resourceId: string) =>
      ["share", "permissions", resourceId] as const,
    sharedWithMe: (page?: number, resourceType?: string) =>
      ["share", "shared-with-me", { page, resourceType }] as const,
  },
};

// Helper function to map ViewType to special view query keys
// Handles ViewType -> queryKeys mapping (e.g., "shared" -> "sharedWithMe", "trash" -> "trashed")
export const getSpecialViewQueryKey = (
  viewType: Exclude<ViewType, "folder">,
): readonly string[] => {
  const keyMap: Record<Exclude<ViewType, "folder">, () => readonly string[]> = {
    starred: queryKeys.specialViews.starred,
    trash: queryKeys.specialViews.trash,
    recent: queryKeys.specialViews.recent,
    files: queryKeys.specialViews.files,
    shared: queryKeys.specialViews.sharedWithMe,
  };
  return keyMap[viewType]();
};
