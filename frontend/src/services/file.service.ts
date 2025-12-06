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

  getPreviewUrl: (fileId: string): string => {
    return `${FILE_API_BASE}/${fileId}/preview`;
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
};
