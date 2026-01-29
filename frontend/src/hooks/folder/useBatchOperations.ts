import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useFolderUIStore } from "@/stores/useFolderUIStore";
import { useFolderContent } from "@/hooks/queries/useFolderQueries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, getSpecialViewQueryKey } from "@/lib/queryClient";
import {
  batchService,
  type BatchItemRequest,
  type BatchOperationResponse,
} from "@/services/batch.service";
import type { ViewType } from "@/types/common.types";

export const useBatchOperations = () => {
  const queryClient = useQueryClient();

  // UI state from Zustand
  const { selectedItems, clearSelection, currentFolderId, viewType } =
    useFolderUIStore();

  // Data from React Query
  const { data } = useFolderContent(currentFolderId);

  // Memoize to prevent dependency changes on every render
  const folders = useMemo(() => data?.folders ?? [], [data?.folders]);
  const files = useMemo(() => data?.files ?? [], [data?.files]);

  const refreshContent = useCallback(() => {
    if (viewType === "folder") {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.content(currentFolderId),
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: getSpecialViewQueryKey(
          viewType as Exclude<ViewType, "folder">,
        ),
      });
    }
  }, [queryClient, currentFolderId, viewType]);

  // 将选中的项目转换为 BatchItemRequest 格式
  const getSelectedItemsAsBatch = useCallback((): BatchItemRequest[] => {
    const items: BatchItemRequest[] = [];

    selectedItems.forEach((itemId) => {
      // 先检查是否是文件夹
      const folder = folders.find((f) => f.id === itemId);
      if (folder) {
        items.push({ id: itemId, type: "folder" });
        return;
      }

      // 检查是否是文件
      const file = files.find((f) => f.id === itemId);
      if (file) {
        items.push({ id: itemId, type: "file" });
      }
    });

    return items;
  }, [selectedItems, folders, files]);

  const showBatchResult = useCallback(
    (result: BatchOperationResponse, operation: string) => {
      if (result.failureCount === 0) {
        toast.success(
          `Successfully ${operation} ${result.successCount} item(s)`,
        );
      } else if (result.successCount === 0) {
        toast.error(`Failed to ${operation} all items`);
      } else {
        toast.warning(
          `${operation}: ${result.successCount} succeeded, ${result.failureCount} failed`,
        );
      }
    },
    [],
  );

  const batchTrash = useCallback(async () => {
    const items = getSelectedItemsAsBatch();

    if (items.length === 0) {
      toast.error("No items selected");
      return;
    }

    try {
      const result = await batchService.batchTrash(items);
      showBatchResult(result, "trashed");
      refreshContent();
      clearSelection();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to trash items";
      toast.error(message);
      throw error;
    }
  }, [
    getSelectedItemsAsBatch,
    refreshContent,
    clearSelection,
    showBatchResult,
  ]);

  const batchRestore = useCallback(async () => {
    const items = getSelectedItemsAsBatch();

    if (items.length === 0) {
      toast.error("No items selected");
      return;
    }

    try {
      const result = await batchService.batchRestore(items);
      showBatchResult(result, "restored");
      refreshContent();
      clearSelection();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to restore items";
      toast.error(message);
      throw error;
    }
  }, [
    getSelectedItemsAsBatch,
    refreshContent,
    clearSelection,
    showBatchResult,
  ]);

  const batchDelete = useCallback(async () => {
    const items = getSelectedItemsAsBatch();

    if (items.length === 0) {
      toast.error("No items selected");
      return;
    }

    try {
      const result = await batchService.batchDelete(items);
      showBatchResult(result, "deleted");
      refreshContent();
      clearSelection();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete items";
      toast.error(message);
      throw error;
    }
  }, [
    getSelectedItemsAsBatch,
    refreshContent,
    clearSelection,
    showBatchResult,
  ]);

  const batchMove = useCallback(
    async (destinationId: string) => {
      const items = getSelectedItemsAsBatch();

      if (items.length === 0) {
        toast.error("No items selected");
        return;
      }

      try {
        const result = await batchService.batchMove(items, destinationId);
        showBatchResult(result, "moved");
        refreshContent();
        clearSelection();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to move items";
        toast.error(message);
        throw error;
      }
    },
    [getSelectedItemsAsBatch, refreshContent, clearSelection, showBatchResult],
  );

  const batchStar = useCallback(
    async (star: boolean) => {
      const items = getSelectedItemsAsBatch();

      if (items.length === 0) {
        toast.error("No items selected");
        return;
      }

      try {
        const result = await batchService.batchStar(items, star);
        showBatchResult(result, star ? "starred" : "unstarred");
        refreshContent();
        clearSelection();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Failed to ${star ? "star" : "unstar"} items`;
        toast.error(message);
        throw error;
      }
    },
    [getSelectedItemsAsBatch, refreshContent, clearSelection, showBatchResult],
  );

  return {
    batchTrash,
    batchRestore,
    batchDelete,
    batchMove,
    batchStar,
    getSelectedItemsAsBatch,
  };
};
