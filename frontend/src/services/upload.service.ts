import { api } from "./api";

const UPLOAD_API_BASE = "/api/upload";

// ==================== Types ====================

export interface PresignedUrlResponse {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  fields?: Record<string, string>;
  key: string;
}

export interface MultipartUploadResponse {
  uploadId: string;
  key: string;
}

export interface PartSignResponse {
  url: string;
}

export interface PartsListResponse {
  parts: Array<{
    PartNumber: number;
    ETag: string;
    Size: number;
  }>;
}

export interface CompleteMultipartResponse {
  location: string;
  key: string;
}

export interface PresignAvatarRequest {
  filename: string;
  contentType: string;
  size: number;
}

export interface PresignFileRequest {
  filename: string;
  contentType: string;
  size: number;
}

export interface CreateMultipartUploadRequest {
  filename: string;
  type: string;
  metadata?: {
    size: number;
  };
}

export interface CompleteMultipartUploadRequest {
  key: string;
  parts: Array<{
    PartNumber: number;
    ETag: string;
  }>;
}

// ==================== Upload Service ====================

export const uploadService = {
  /**
   * Get presigned URL for avatar upload (small files, < 5MB)
   */
  async getPresignedAvatarUrl(
    request: PresignAvatarRequest
  ): Promise<PresignedUrlResponse> {
    const response = await api.post<PresignedUrlResponse, PresignAvatarRequest>(
      `${UPLOAD_API_BASE}/presign-avatar`,
      request
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get presigned avatar URL");
    }

    return response.data;
  },

  /**
   * Get presigned URL for file upload (< 100MB)
   */
  async getPresignedFileUrl(
    request: PresignFileRequest
  ): Promise<PresignedUrlResponse> {
    const response = await api.post<PresignedUrlResponse, PresignFileRequest>(
      `${UPLOAD_API_BASE}/presign-file`,
      request
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get presigned file URL");
    }

    return response.data;
  },

  /**
   * Upload file directly to S3 using presigned URL
   */
  async uploadToPresignedUrl(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = Math.round((e.loaded * 100) / e.total);
          onProgress(progress);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload aborted"));
      });

      xhr.open("PUT", url);

      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.send(file);
    });
  },

  /**
   * Create multipart upload for large files (≥ 100MB)
   */
  async createMultipartUpload(
    request: CreateMultipartUploadRequest
  ): Promise<MultipartUploadResponse> {
    const response = await api.post<
      MultipartUploadResponse,
      CreateMultipartUploadRequest
    >(`${UPLOAD_API_BASE}/multipart`, request);

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to create multipart upload");
    }

    return response.data;
  },

  /**
   * Get presigned URL for a specific part
   */
  async getPartSignedUrl(
    uploadId: string,
    key: string,
    partNumber: number
  ): Promise<string> {
    const response = await api.get<PartSignResponse>(
      `${UPLOAD_API_BASE}/multipart/${uploadId}/${partNumber}?key=${encodeURIComponent(
        key
      )}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to get part presigned URL");
    }

    return response.data.url;
  },

  /**
   * List uploaded parts
   */
  async listParts(
    uploadId: string,
    key: string
  ): Promise<PartsListResponse["parts"]> {
    const response = await api.get<PartsListResponse>(
      `${UPLOAD_API_BASE}/multipart/${uploadId}/parts?key=${encodeURIComponent(
        key
      )}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to list parts");
    }

    return response.data.parts;
  },

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    uploadId: string,
    request: CompleteMultipartUploadRequest
  ): Promise<CompleteMultipartResponse> {
    const response = await api.post<
      CompleteMultipartResponse,
      CompleteMultipartUploadRequest
    >(`${UPLOAD_API_BASE}/multipart/${uploadId}/complete`, request);

    if (!response.success || !response.data) {
      throw new Error(
        response.message || "Failed to complete multipart upload"
      );
    }

    return response.data;
  },

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(uploadId: string, key: string): Promise<void> {
    const response = await api.delete<void>(
      `${UPLOAD_API_BASE}/multipart/${uploadId}?key=${encodeURIComponent(key)}`
    );

    if (!response.success) {
      throw new Error(response.message || "Failed to abort multipart upload");
    }
  },

  /**
   * Upload part directly to S3
   */
  async uploadPart(
    url: string,
    chunk: Blob,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = Math.round((e.loaded * 100) / e.total);
          onProgress(progress);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader("ETag");
          if (!etag) {
            reject(new Error("No ETag in response"));
            return;
          }
          resolve(etag);
        } else {
          reject(new Error(`Part upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during part upload"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Part upload aborted"));
      });

      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.send(chunk);
    });
  },
};
