import type {
  IFile,
  UploadFileProgress,
  FileUploadResponse,
  FileDownloadResponse,
} from "@/types/file.types";
import { api, apiClient } from "@/services/api";
import type { AxiosProgressEvent } from "axios";

const FILE_API_BASE = "/api/files";

export const fileService = {
  async calculateHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  },

  async uploadFile(
    file: File,
    folderId: string,
    onProgress?: (progress: UploadFileProgress) => void
  ): Promise<IFile> {
    const hash = await this.calculateHash(file);
    const uniqueFileId = crypto.randomUUID();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderId", folderId);
    formData.append("hash", hash);

    try {
      // 这里需要使用 apiClient 来使用 onProgress
      const response = await apiClient.post<{
        success: boolean;
        data?: FileUploadResponse;
        message?: string;
      }>(`${FILE_API_BASE}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent?: AxiosProgressEvent) => {
          if (onProgress && progressEvent?.total && progressEvent?.loaded) {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress({
              file,
              fileId: uniqueFileId,
              progress,
              status: "uploading",
            });
          }
        },
      });

      if (!response.data.success || !response.data.data?.file) {
        throw new Error(response.data.message || "File upload failed");
      }
      onProgress?.({
        file,
        fileId: uniqueFileId,
        progress: 100,
        status: "success",
      });
      return response.data.data.file;
    } catch (error) {
      let message = "An unknown error occurred during file upload.";
      if (error instanceof Error) {
        message = error.message;
      }
      onProgress?.({
        file,
        fileId: uniqueFileId,
        progress: 0,
        status: "error",
        message: message,
      });
      throw error;
    }
  },

  async uploadFiles(
    files: File[],
    folderId: string,
    onProgress?: (progress: UploadFileProgress) => void
  ): Promise<IFile[]> {
    const uploadPromises = files.map((file) => {
      return this.uploadFile(file, folderId, onProgress);
    });

    const results = await Promise.all(uploadPromises);
    return results;
  },

  downloadFile: async (fileId: string): Promise<void> => {
    const response = await api.get<FileDownloadResponse>(
      `${FILE_API_BASE}/${fileId}/download`
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to get download URL");
    }

    if (!response.data) {
      throw new Error("No download data received");
    }

    const { downloadUrl, fileName } = response.data;

    // 使用预签名 URL 触发下载
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    link.target = "_blank"; // 在新窗口打开，避免阻塞当前页面
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  triggerDownload: (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  },

  getPreviewUrl: async (fileId: string): Promise<string> => {
    const response = await api.get<{ url: string }>(
      `${FILE_API_BASE}/${fileId}/preview-url`
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get preview URL");
    }

    return response.data.url;
  },

  getDownloadUrl: async (fileId: string): Promise<string> => {
    const response = await api.get<FileDownloadResponse>(
      `${FILE_API_BASE}/${fileId}/download`
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get download URL");
    }

    return response.data.downloadUrl;
  },

  async renameFile(fileId: string, newName: string): Promise<void> {
    const response = await api.patch<void, { newName: string }>(
      `${FILE_API_BASE}/${fileId}/rename`,
      { newName }
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to rename file");
    }
  },

  async moveFile(fileId: string, destinationId: string): Promise<void> {
    const response = await api.patch<void, { destinationId: string }>(
      `${FILE_API_BASE}/${fileId}/move`,
      { destinationId }
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to move file");
    }
  },

  async trashFile(fileId: string): Promise<void> {
    const response = await api.post<void, undefined>(
      `${FILE_API_BASE}/${fileId}/trash`,
      undefined
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to trash file");
    }
  },

  async restoreFile(fileId: string): Promise<void> {
    const response = await api.post<void, undefined>(
      `${FILE_API_BASE}/${fileId}/restore`,
      undefined
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
      undefined
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to star file");
    }
  },

  async unstarFile(fileId: string): Promise<void> {
    const response = await api.patch<void, undefined>(
      `${FILE_API_BASE}/${fileId}/unstar`,
      undefined
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

    return response.data;
  },

  async getTrashedFiles(): Promise<IFile[]> {
    const response = await api.get<IFile[]>(`${FILE_API_BASE}/view/trashed`);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get trashed files");
    }

    return response.data;
  },

  async getRecentFiles(limit?: number): Promise<IFile[]> {
    const url = limit
      ? `${FILE_API_BASE}/view/recent?limit=${limit}`
      : `${FILE_API_BASE}/view/recent`;
    const response = await api.get<IFile[]>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get recent files");
    }

    return response.data;
  },

  async getAllUserFiles(): Promise<IFile[]> {
    const response = await api.get<IFile[]>(`${FILE_API_BASE}/view/all`);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get all files");
    }

    return response.data;
  },

  /**
   * Create file record after successful upload to MinIO
   * @param data - File metadata including key, size, mimeType, etc.
   */
  async createFileRecord(data: {
    folderId: string;
    key: string;
    size: number;
    mimeType: string;
    originalName: string;
    hash?: string;
  }): Promise<IFile> {
    const response = await api.post<FileUploadResponse, typeof data>(
      FILE_API_BASE,
      data
    );

    if (!response.success || !response.data?.file) {
      throw new Error(response.message || "Failed to create file record");
    }

    return response.data.file;
  },
};
