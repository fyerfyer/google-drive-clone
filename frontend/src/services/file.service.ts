import type {
  IFile,
  FileUploadResponse,
  FileDownloadResponse,
} from "@/types/file.types";
import { api } from "@/services/api";
import { normalizeFile, normalizeFiles } from "@/lib/type-guards";
import HashWorker from "@/workers/hash.worker?worker";

const FILE_API_BASE = "/api/files";

export const fileService = {
  calculateHash(
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = new HashWorker();

      worker.onmessage = (
        e: MessageEvent<
          { hash: string } | { error: string } | { progress: number }
        >,
      ) => {
        if ("hash" in e.data) {
          worker.terminate();
          resolve(e.data.hash);
        } else if ("error" in e.data) {
          worker.terminate();
          reject(new Error(e.data.error));
        } else if ("progress" in e.data) {
          onProgress?.(e.data.progress);
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(new Error(err.message || "Hash worker error"));
      };

      worker.postMessage({ file });
    });
  },

  getDownloadInfo: async (
    fileId: string,
  ): Promise<{ downloadUrl: string; fileName: string }> => {
    const response = await api.get<FileDownloadResponse>(
      `${FILE_API_BASE}/${fileId}/download`,
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get download info");
    }
    return response.data;
  },

  getPreviewUrl: async (fileId: string): Promise<string> => {
    const response = await api.get<{ url: string }>(
      `${FILE_API_BASE}/${fileId}/preview-url`,
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get preview URL");
    }

    return response.data.url;
  },

  async renameFile(fileId: string, newName: string): Promise<void> {
    const response = await api.patch<void, { newName: string }>(
      `${FILE_API_BASE}/${fileId}/rename`,
      { newName },
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to rename file");
    }
  },

  async moveFile(fileId: string, destinationId: string): Promise<void> {
    const response = await api.patch<void, { destinationId: string }>(
      `${FILE_API_BASE}/${fileId}/move`,
      { destinationId },
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to move file");
    }
  },

  async trashFile(fileId: string): Promise<void> {
    const response = await api.post<void, undefined>(
      `${FILE_API_BASE}/${fileId}/trash`,
      undefined,
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to trash file");
    }
  },

  async restoreFile(fileId: string): Promise<void> {
    const response = await api.post<void, undefined>(
      `${FILE_API_BASE}/${fileId}/restore`,
      undefined,
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to restore file");
    }
  },

  async deleteFile(fileId: string): Promise<void> {
    const response = await api.delete<void>(`${FILE_API_BASE}/${fileId}`);

    if (!response.success) {
      throw new Error(response.message || "Failed to delete file");
    }
  },

  async starFile(fileId: string): Promise<void> {
    const response = await api.patch<void, undefined>(
      `${FILE_API_BASE}/${fileId}/star`,
      undefined,
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to star file");
    }
  },

  async unstarFile(fileId: string): Promise<void> {
    const response = await api.patch<void, undefined>(
      `${FILE_API_BASE}/${fileId}/unstar`,
      undefined,
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to unstar file");
    }
  },

  async getStarredFiles(): Promise<IFile[]> {
    const response = await api.get<IFile[]>(`${FILE_API_BASE}/view/starred`);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get starred files");
    }

    return normalizeFiles(response.data);
  },

  async getTrashedFiles(): Promise<IFile[]> {
    const response = await api.get<IFile[]>(`${FILE_API_BASE}/view/trashed`);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get trashed files");
    }

    return normalizeFiles(response.data);
  },

  async getRecentFiles(limit?: number): Promise<IFile[]> {
    const url = limit
      ? `${FILE_API_BASE}/view/recent?limit=${limit}`
      : `${FILE_API_BASE}/view/recent`;
    const response = await api.get<IFile[]>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get recent files");
    }

    return normalizeFiles(response.data);
  },

  async getAllUserFiles(): Promise<IFile[]> {
    const response = await api.get<IFile[]>(`${FILE_API_BASE}/view/all`);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get all files");
    }

    return normalizeFiles(response.data);
  },

  /**
   * Check if a file with the given hash already exists (秒传 / instant upload dedup).
   * If it exists, the backend creates a new DB record pointing to the same MinIO key
   * and returns the new file record so the client can skip the actual upload.
   */
  async checkFileByHash(params: {
    hash: string;
    folderId: string;
    originalName: string;
    mimeType: string;
    size: number;
  }): Promise<{ exists: boolean; file?: IFile }> {
    const query = new URLSearchParams({
      hash: params.hash,
      folderId: params.folderId,
      originalName: params.originalName,
      mimeType: params.mimeType,
      size: String(params.size),
    });

    const response = await api.get<{ exists: boolean; file?: IFile }>(
      `${FILE_API_BASE}/check?${query.toString()}`,
    );

    if (!response.success || response.data === undefined) {
      throw new Error(response.message || "Failed to check file hash");
    }

    const result = response.data;
    return {
      exists: result.exists,
      file: result.file ? normalizeFile(result.file) : undefined,
    };
  },

  /**
   * Create a blank file directly in the drive
   */
  async createBlankFile(data: {
    folderId: string;
    fileName: string;
    content?: string;
  }): Promise<IFile> {
    const response = await api.post<FileUploadResponse, typeof data>(
      `${FILE_API_BASE}/create`,
      data,
    );

    if (!response.success || !response.data?.file) {
      throw new Error(response.message || "Failed to create file");
    }

    return normalizeFile(response.data.file);
  },

  /**
   * Get text content of a file for editing
   */
  async getFileContent(
    fileId: string,
  ): Promise<{ content: string; file: IFile }> {
    const response = await api.get<{ content: string; file: IFile }>(
      `${FILE_API_BASE}/${fileId}/content`,
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get file content");
    }

    return {
      content: response.data.content,
      file: normalizeFile(response.data.file),
    };
  },

  /**
   * Update text content of a file
   */
  async updateFileContent(fileId: string, content: string): Promise<IFile> {
    const response = await api.put<{ file: IFile }, { content: string }>(
      `${FILE_API_BASE}/${fileId}/content`,
      { content },
    );

    if (!response.success || !response.data?.file) {
      throw new Error(response.message || "Failed to update file content");
    }

    return normalizeFile(response.data.file);
  },

  /**
   * Get OnlyOffice configuration including URL and JWT token.
   * Returns the complete configuration needed for OnlyOffice Document Server.
   */
  async getOfficeContentUrl(fileId: string): Promise<{
    url: string;
    token?: string;
    config?: any;
  }> {
    const response = await api.get<{
      url: string;
      token?: string;
      config?: any;
    }>(`${FILE_API_BASE}/${fileId}/office-url`);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get office content URL");
    }

    return response.data;
  },

  async getEmbeddingSummary(): Promise<{
    activeCount: number;
    files: Array<{
      fileId: string;
      fileName: string;
      status: string;
      processedChunks: number;
      totalChunks: number;
    }>;
  }> {
    const response = await api.get<{
      activeCount: number;
      files: Array<{
        fileId: string;
        fileName: string;
        status: string;
        processedChunks: number;
        totalChunks: number;
      }>;
    }>(`${FILE_API_BASE}/view/embedding-summary`);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get embedding summary");
    }

    return response.data;
  },
};
