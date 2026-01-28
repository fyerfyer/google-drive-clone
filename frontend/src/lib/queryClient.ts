import { QueryClient } from "@tanstack/react-query";

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
  },
};
