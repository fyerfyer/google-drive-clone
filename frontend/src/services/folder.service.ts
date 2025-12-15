import type {
  Folder,
  FolderCreateResponse,
  FolderContentResponse,
  CreateFolderRequest,
  BreadcrumbItem,
} from "@/types/folder.types";
import { api } from "@/services/api";

const FOLDER_API_BASE = "/api/folders";

export const folderService = {
  createFolder: async (req: CreateFolderRequest): Promise<Folder> => {
    try {
      const response = await api.post<
        FolderCreateResponse,
        CreateFolderRequest
      >(`${FOLDER_API_BASE}/create`, req);
      if (response.success && response.data) {
        return response.data.folder;
      }
      throw new Error(response.message || "Failed to create folder");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to create folder"
      );
    }
  },

  getFolderContent: async (
    folderId: string
  ): Promise<FolderContentResponse> => {
    try {
      const response = await api.get<FolderContentResponse>(
        `${FOLDER_API_BASE}/${folderId}/content`
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to get folder content");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to get folder content"
      );
    }
  },

  moveFolder: async (
    folderId: string,
    destinationId: string
  ): Promise<void> => {
    try {
      const response = await api.patch<void, { destinationId: string }>(
        `${FOLDER_API_BASE}/${folderId}/move`,
        { destinationId }
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to move folder");
      }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to move folder"
      );
    }
  },

  trashFolder: async (folderId: string): Promise<void> => {
    try {
      const response = await api.post<void, undefined>(
        `${FOLDER_API_BASE}/${folderId}/trash`,
        undefined
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to trash folder");
      }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to trash folder"
      );
    }
  },

  renameFolder: async (folderId: string, newName: string): Promise<void> => {
    try {
      const response = await api.patch<void, { newName: string }>(
        `${FOLDER_API_BASE}/${folderId}/rename`,
        { newName }
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to rename folder");
      }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to rename folder"
      );
    }
  },

  restoreFolder: async (folderId: string): Promise<void> => {
    try {
      const response = await api.post<void, undefined>(
        `${FOLDER_API_BASE}/${folderId}/restore`,
        undefined
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to restore folder");
      }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to restore folder"
      );
    }
  },

  deleteFolder: async (folderId: string): Promise<void> => {
    try {
      const response = await api.delete<void>(`${FOLDER_API_BASE}/${folderId}`);
      if (!response.success) {
        throw new Error(response.message || "Failed to delete folder");
      }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to delete folder"
      );
    }
  },

  starFolder: async (folderId: string): Promise<void> => {
    try {
      const response = await api.patch<void, undefined>(
        `${FOLDER_API_BASE}/${folderId}/star`,
        undefined
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to star folder");
      }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to star folder"
      );
    }
  },

  unstarFolder: async (folderId: string): Promise<void> => {
    try {
      const response = await api.patch<void, undefined>(
        `${FOLDER_API_BASE}/${folderId}/unstar`,
        undefined
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to unstar folder");
      }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to unstar folder"
      );
    }
  },

  getStarredFolders: async (): Promise<Folder[]> => {
    try {
      const response = await api.get<Folder[]>(
        `${FOLDER_API_BASE}/view/starred`
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to get starred folders");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to get starred folders"
      );
    }
  },

  getTrashedFolders: async (): Promise<Folder[]> => {
    try {
      const response = await api.get<Folder[]>(
        `${FOLDER_API_BASE}/view/trashed`
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to get trashed folders");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to get trashed folders"
      );
    }
  },

  getRecentFolders: async (limit?: number): Promise<Folder[]> => {
    try {
      const url = limit
        ? `${FOLDER_API_BASE}/view/recent?limit=${limit}`
        : `${FOLDER_API_BASE}/view/recent`;
      const response = await api.get<Folder[]>(url);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to get recent folders");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to get recent folders"
      );
    }
  },

  getFolderPath: async (folderId: string): Promise<BreadcrumbItem[]> => {
    try {
      const response = await api.get<{ breadcrumbs: BreadcrumbItem[] }>(
        `${FOLDER_API_BASE}/${folderId}/path`
      );
      if (response.success && response.data) {
        return response.data.breadcrumbs;
      }
      throw new Error(response.message || "Failed to get folder path");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to get folder path"
      );
    }
  },
};
