import { api } from "@/services/api";

export interface BatchItemRequest {
  id: string;
  type: "file" | "folder";
}

export interface BatchOperationResult {
  id: string;
  type: "file" | "folder";
  success: boolean;
  error?: string;
}

export interface BatchOperationResponse {
  results: BatchOperationResult[];
  successCount: number;
  failureCount: number;
}

const BATCH_API_BASE = "/api/batch";

export const batchService = {
  async batchTrash(items: BatchItemRequest[]): Promise<BatchOperationResponse> {
    try {
      const response = await api.post<
        BatchOperationResponse,
        { items: BatchItemRequest[] }
      >(`${BATCH_API_BASE}/trash`, { items });

      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to batch trash items");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to batch trash items"
      );
    }
  },

  async batchRestore(
    items: BatchItemRequest[]
  ): Promise<BatchOperationResponse> {
    try {
      const response = await api.post<
        BatchOperationResponse,
        { items: BatchItemRequest[] }
      >(`${BATCH_API_BASE}/restore`, { items });

      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to batch restore items");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to batch restore items"
      );
    }
  },

  async batchDelete(
    items: BatchItemRequest[]
  ): Promise<BatchOperationResponse> {
    try {
      const response = await api.delete<
        BatchOperationResponse,
        { items: BatchItemRequest[] }
      >(`${BATCH_API_BASE}/delete`, { items });

      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to batch delete items");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to batch delete items"
      );
    }
  },

  async batchMove(
    items: BatchItemRequest[],
    destinationId: string
  ): Promise<BatchOperationResponse> {
    try {
      const response = await api.post<
        BatchOperationResponse,
        { items: BatchItemRequest[]; destinationId: string }
      >(`${BATCH_API_BASE}/move`, { items, destinationId });

      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to batch move items");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to batch move items"
      );
    }
  },

  async batchStar(
    items: BatchItemRequest[],
    star: boolean
  ): Promise<BatchOperationResponse> {
    try {
      const response = await api.post<
        BatchOperationResponse,
        { items: BatchItemRequest[]; star: boolean }
      >(`${BATCH_API_BASE}/star`, { items, star });

      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(
        response.message || `Failed to batch ${star ? "star" : "unstar"} items`
      );
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : `Failed to batch ${star ? "star" : "unstar"} items`
      );
    }
  },
};
