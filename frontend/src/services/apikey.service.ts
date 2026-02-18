import { api } from "./api";

// =========================================================================
// API Key Service — 管理 MCP 认证用的 API Key
// =========================================================================

const API_BASE = "/api/apikeys";

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKeyInfo;
  rawKey: string;
}

export interface ListApiKeysResponse {
  apiKeys: ApiKeyInfo[];
}

export const apiKeyService = {
  /**
   * 创建新 API Key
   */
  create: async (
    name: string,
    expiresAt?: string,
  ): Promise<CreateApiKeyResponse> => {
    const body: { name: string; expiresAt?: string } = { name };
    if (expiresAt) body.expiresAt = expiresAt;

    const response = await api.post<CreateApiKeyResponse, typeof body>(
      API_BASE,
      body,
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to create API key");
  },

  /**
   * 列出所有 API Key
   */
  list: async (): Promise<ApiKeyInfo[]> => {
    const response = await api.get<ListApiKeysResponse>(API_BASE);
    if (response.success && response.data) {
      return response.data.apiKeys;
    }
    throw new Error(response.message || "Failed to list API keys");
  },

  /**
   * 吊销 API Key
   */
  revoke: async (keyId: string): Promise<void> => {
    const response = await api.delete(`${API_BASE}/${keyId}`);
    if (!response.success) {
      throw new Error(response.message || "Failed to revoke API key");
    }
  },

  /**
   * 永久删除 API Key
   */
  deletePermanent: async (keyId: string): Promise<void> => {
    await api.delete(`${API_BASE}/${keyId}/permanent`);
  },
};
