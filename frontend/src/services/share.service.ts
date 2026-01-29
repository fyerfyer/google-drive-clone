import { api, apiClient } from "@/services/api";
import type {
  ShareResourceRequest,
  ShareResourceResponse,
  ResourcePermissionsResponse,
  RemovePermissionResponse,
  ChangePermissionRequest,
  ChangePermissionResponse,
  UpdateLinkShareRequest,
  UpdateLinkShareResponse,
  SharedWithMeResponse,
  ListSharedWithMeParams,
  ResourceType,
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
   * 更新资源的链接分享配置
   */
  updateLinkShare: async (
    resourceId: string,
    req: UpdateLinkShareRequest,
  ): Promise<UpdateLinkShareResponse> => {
    const response = await api.patch<
      UpdateLinkShareResponse,
      UpdateLinkShareRequest
    >(`${SHARE_API_BASE}/${resourceId}/link`, req);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || "Failed to update link share settings");
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
   * 通过分享链接token获取共享资源信息（公开API，不需要认证）
   */
  getSharedResourceByToken: async (
    token: string,
    resourceType: string,
  ): Promise<{
    resourceId: string;
    resourceType: ResourceType;
    name: string;
    role: string;
    allowDownload: boolean;
  }> => {
    // This endpoint doesn't require authentication, so we call it directly
    const response = await apiClient.get(
      `${SHARE_API_BASE}/public/${resourceType}/${token}`,
    );
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
  ): Promise<{
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
    expiresIn: number;
  }> => {
    const response = await apiClient.get(
      `${SHARE_API_BASE}/public/file/${token}/preview-url`,
    );
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
  ): Promise<{
    downloadUrl: string;
    fileName: string;
    mimeType: string;
    size: number;
    expiresIn: number;
  }> => {
    const response = await apiClient.get(
      `${SHARE_API_BASE}/public/file/${token}/download`,
    );
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
  ): Promise<{
    currentFolder: { id: string; name: string; color?: string } | null;
    folders: Array<{
      id: string;
      name: string;
      color?: string;
      type: string;
      updatedAt: string;
    }>;
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      size: number;
      type: string;
      updatedAt: string;
    }>;
    shareToken: string;
  }> => {
    let url = `${SHARE_API_BASE}/public/folder/${token}/content`;
    if (subfolderId && subfolderId !== "root") {
      url += `?subfolderId=${subfolderId}`;
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
  ): Promise<Array<{ id: string; name: string }>> => {
    const response = await apiClient.get(
      `${SHARE_API_BASE}/public/folder/${token}/path/${folderId}`,
    );
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(
      response.data.message || "Failed to get shared folder path",
    );
  },
};
