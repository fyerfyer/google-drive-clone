import { api, apiClient } from "@/services/api";
import type {
  ShareResourceRequest,
  ShareResourceResponse,
  ResourcePermissionsResponse,
  RemovePermissionResponse,
  ChangePermissionRequest,
  ChangePermissionResponse,
  CreateShareLinkRequest,
  CreateShareLinkResponse,
  UpdateShareLinkRequest,
  UpdateShareLinkResponse,
  SharedWithMeResponse,
  ListSharedWithMeParams,
  ResourceType,
  SaveSharedResourceRequest,
  SaveSharedResourceResponse,
  SharedResourcePublicInfo,
} from "@/types/share.types";

const SHARE_API_BASE = "/api/share";

export const shareService = {
  /**
   * 分享资源给指定用户
   */
  shareResource: async (req: ShareResourceRequest): Promise<void> => {
    const response = await api.post<
      ShareResourceResponse,
      ShareResourceRequest
    >(`${SHARE_API_BASE}/resource`, req);
    if (!response.success) {
      throw new Error(response.message || "Failed to share resource");
    }
  },

  /**
   * 获取资源的权限详情
   */
  getResourcePermissions: async (
    resourceId: string,
    resourceType: ResourceType,
  ): Promise<ResourcePermissionsResponse> => {
    const response = await api.get<ResourcePermissionsResponse>(
      `${SHARE_API_BASE}/${resourceId}/permissions?resourceType=${resourceType}`,
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to get resource permissions");
  },

  /**
   * 移除用户对资源的权限
   */
  removePermission: async (
    resourceId: string,
    targetUserId: string,
    resourceType: ResourceType,
  ): Promise<void> => {
    const response = await api.delete<RemovePermissionResponse>(
      `${SHARE_API_BASE}/${resourceId}/permissions/${targetUserId}?resourceType=${resourceType}`,
    );
    if (!response.success) {
      throw new Error(response.message || "Failed to remove permission");
    }
  },

  /**
   * 更改用户对资源的权限角色
   */
  changePermission: async (
    resourceId: string,
    targetUserId: string,
    req: ChangePermissionRequest,
  ): Promise<void> => {
    const response = await api.patch<
      ChangePermissionResponse,
      ChangePermissionRequest
    >(`${SHARE_API_BASE}/${resourceId}/permissions/${targetUserId}`, req);
    if (!response.success) {
      throw new Error(response.message || "Failed to change permission");
    }
  },

  /**
   * 创建分享链接
   */
  createShareLink: async (
    resourceId: string,
    req: CreateShareLinkRequest,
  ): Promise<CreateShareLinkResponse> => {
    const response = await api.post<
      CreateShareLinkResponse,
      CreateShareLinkRequest
    >(`${SHARE_API_BASE}/${resourceId}/links`, req);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to create share link");
  },

  /**
   * 更新资源的链接分享配置
   */
  updateShareLink: async (
    linkId: string,
    req: UpdateShareLinkRequest,
  ): Promise<UpdateShareLinkResponse> => {
    const response = await api.patch<
      UpdateShareLinkResponse,
      UpdateShareLinkRequest
    >(`${SHARE_API_BASE}/links/${linkId}`, req);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to update share link");
  },

  /**
   * 重置分享链接Token
   */
  rotateShareLinkToken: async (
    linkId: string,
  ): Promise<{ shareLink: { id: string; token: string } }> => {
    const response = await api.post<
      { shareLink: { id: string; token: string } },
      Record<string, never>
    >(`${SHARE_API_BASE}/links/${linkId}/rotate`, {});
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to rotate share link token");
  },

  /**
   * 撤销/删除分享链接
   */
  revokeShareLink: async (linkId: string): Promise<void> => {
    const response = await api.delete(`${SHARE_API_BASE}/links/${linkId}`);
    if (!response.success) {
      throw new Error(response.message || "Failed to revoke share link");
    }
  },

  /**
   * 获取"与我共享"的资源列表
   */
  listSharedWithMe: async (
    params: ListSharedWithMeParams = {},
  ): Promise<SharedWithMeResponse> => {
    const { page = 1, limit = 20, resourceType } = params;

    let url = `${SHARE_API_BASE}/shared-with-me?page=${page}&limit=${limit}`;
    if (resourceType) {
      url += `&resourceType=${resourceType}`;
    }

    const response = await api.get<SharedWithMeResponse>(url);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to get shared with me list");
  },

  /**
   * 生成分享链接URL
   */
  generateShareLink: (token: string, resourceType: ResourceType): string => {
    const baseUrl = window.location.origin;
    const type = resourceType.toLowerCase();
    return `${baseUrl}/share/${type}/${token}`;
  },

  /**
   * 复制分享链接到剪贴板
   */
  copyShareLink: async (
    token: string,
    resourceType: ResourceType,
  ): Promise<void> => {
    const link = shareService.generateShareLink(token, resourceType);
    await navigator.clipboard.writeText(link);
  },

  /**
   * 保存共享资源到我的网盘
   */
  saveSharedResource: async (
    token: string,
    resourceType: ResourceType,
    req: SaveSharedResourceRequest,
  ): Promise<SaveSharedResourceResponse> => {
    const response = await api.post<
      SaveSharedResourceResponse,
      SaveSharedResourceRequest
    >(`${SHARE_API_BASE}/public/${resourceType}/${token}/save`, req);

    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to save shared resource");
  },

  /**
   * 通过分享链接token获取共享资源信息（公开API，不需要认证）
   */
  getSharedResourceByToken: async (
    token: string,
    resourceType: string,
    password?: string,
  ): Promise<SharedResourcePublicInfo> => {
    let url = `${SHARE_API_BASE}/public/${resourceType}/${token}`;
    if (password) {
      url += `?password=${encodeURIComponent(password)}`;
    }

    const response = await apiClient.get(url);
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(
      response.data.message || "Failed to access shared resource",
    );
  },

  /**
   * 通过分享token获取文件预览URL（公开API，不需要认证）
   */
  getSharedFilePreviewUrl: async (
    token: string,
    password?: string,
  ): Promise<{
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
    expiresIn: number;
  }> => {
    let url = `${SHARE_API_BASE}/public/file/${token}/preview-url`;
    if (password) {
      url += `?password=${encodeURIComponent(password)}`;
    }

    const response = await apiClient.get(url);
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(response.data.message || "Failed to get preview URL");
  },

  /**
   * 通过分享token获取文件下载信息（公开API，不需要认证）
   */
  getSharedFileDownloadInfo: async (
    token: string,
    password?: string,
  ): Promise<{
    downloadUrl: string;
    fileName: string;
    mimeType: string;
    size: number;
    expiresIn: number;
  }> => {
    let url = `${SHARE_API_BASE}/public/file/${token}/download`;
    if (password) {
      url += `?password=${encodeURIComponent(password)}`;
    }

    const response = await apiClient.get(url);
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(response.data.message || "Failed to get download URL");
  },

  /**
   * 通过分享token获取文件夹内容（公开API，不需要认证）
   */
  getSharedFolderContent: async (
    token: string,
    subfolderId?: string,
    password?: string,
  ): Promise<{
    currentFolder: { id: string; name: string; color?: string } | null;
    folders: Array<{
      id: string;
      name: string;
      color?: string;
      type: "Folder";
      updatedAt: string;
    }>;
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      size: number;
      extension: string;
      originalName: string;
      type: "File";
      updatedAt: string;
    }>;
    shareToken: string;
  }> => {
    let url = `${SHARE_API_BASE}/public/folder/${token}/content`;
    const params = new URLSearchParams();
    if (subfolderId && subfolderId !== "root") {
      params.append("subfolderId", subfolderId);
    }
    if (password) {
      params.append("password", password);
    }
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await apiClient.get(url);
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(
      response.data.message || "Failed to get shared folder content",
    );
  },

  /**
   * 通过分享token获取文件夹路径（公开API，不需要认证）
   */
  getSharedFolderPath: async (
    token: string,
    folderId: string,
    password?: string,
  ): Promise<Array<{ id: string; name: string }>> => {
    let url = `${SHARE_API_BASE}/public/folder/${token}/path/${folderId}`;
    if (password) {
      url += `?password=${encodeURIComponent(password)}`;
    }

    const response = await apiClient.get(url);
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(
      response.data.message || "Failed to get shared folder path",
    );
  },
};
