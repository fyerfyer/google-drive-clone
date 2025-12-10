import { useCallback } from "react";
import { toast } from "sonner";
import { useFolder } from "@/hooks/folder/useFolder";
import {
  batchService,
  type BatchItemRequest,
  type BatchOperationResponse,
} from "@/services/batch.service";

export const useBatchOperations = () => {
  const { refreshContent, selectedItems, folders, files, clearSelection } =
    useFolder();

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
          `Successfully ${operation} ${result.successCount} item(s)`
        );
      } else if (result.successCount === 0) {
        toast.error(`Failed to ${operation} all items`);
      } else {
        toast.warning(
          `${operation}: ${result.successCount} succeeded, ${result.failureCount} failed`
        );
      }
    },
    []
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
      await refreshContent();
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
      await refreshContent();
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
      await refreshContent();
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
        await refreshContent();
        clearSelection();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to move items";
        toast.error(message);
        throw error;
      }
    },
    [getSelectedItemsAsBatch, refreshContent, clearSelection, showBatchResult]
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
        await refreshContent();
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
    [getSelectedItemsAsBatch, refreshContent, clearSelection, showBatchResult]
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
