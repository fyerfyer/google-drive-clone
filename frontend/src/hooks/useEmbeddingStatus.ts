import { useEffect, useCallback, useRef } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { queryKeys } from "@/lib/queryClient";
import { fileService } from "@/services/file.service";
import { useFolderUIStore } from "@/stores/useFolderUIStore";
import type { EmbeddingStatus } from "@/types/file.types";

interface EmbeddingStatusEvent {
  fileId: string;
  status: EmbeddingStatus;
  error?: string;
  processedChunks?: number;
  totalChunks?: number;
}

/**
 * Listen for real-time embedding status changes via WebSocket.
 * Automatically invalidates folder content queries so the UI stays up-to-date.
 * Uses debounce (1s) to prevent "event storms" when many files are processed.
 */
export function useEmbeddingSocket() {
  const queryClient = useQueryClient();
  const currentFolderId = useFolderUIStore((s) => s.currentFolderId);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidate = useCallback(() => {
    // Invalidate the current folder content to refresh embedding icons
    if (currentFolderId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.content(currentFolderId),
      });
    }
    // Also invalidate special views
    queryClient.invalidateQueries({
      queryKey: queryKeys.specialViews.recent(),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.specialViews.files(),
    });
    // Invalidate the embedding summary query
    queryClient.invalidateQueries({
      queryKey: ["embedding-summary"],
    });
  }, [queryClient, currentFolderId]);

  const debouncedInvalidate = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      invalidate();
      debounceTimer.current = null;
    }, 1000);
  }, [invalidate]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleStatusChanged = (_event: EmbeddingStatusEvent) => {
      debouncedInvalidate();
    };

    socket.on("embedding:status_changed", handleStatusChanged);

    return () => {
      socket.off("embedding:status_changed", handleStatusChanged);
    };
  }, [debouncedInvalidate]);
}

/**
 * Query for the global embedding summary (active indexing tasks).
 */
export function useEmbeddingSummary() {
  return useQuery({
    queryKey: ["embedding-summary"],
    queryFn: () => fileService.getEmbeddingSummary(),
    refetchInterval: (query) => {
      // Poll every 5s while there are active tasks, stop otherwise
      const data = query.state.data;
      return data && data.activeCount > 0 ? 5000 : false;
    },
  });
}
