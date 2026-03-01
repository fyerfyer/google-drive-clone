import { api } from "./api";
import type {
  NotificationListResponse,
  INotification,
  UnreadCountResponse,
} from "@/types/notification.types";

const NOTIFICATION_API_BASE = "/api/notifications";

export const notificationService = {
  /**
   * 获取通知列表
   */
  async getNotifications(options?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<NotificationListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.set("page", String(options.page));
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.unreadOnly) params.set("unreadOnly", "true");

    const queryString = params.toString();
    const url = queryString
      ? `${NOTIFICATION_API_BASE}?${queryString}`
      : NOTIFICATION_API_BASE;

    const response = await api.get<NotificationListResponse>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || "Failed to fetch notifications");
    }
    return response.data;
  },

  /**
   * 获取未读通知数
   */
  async getUnreadCount(): Promise<number> {
    const response = await api.get<UnreadCountResponse>(
      `${NOTIFICATION_API_BASE}/unread-count`,
    );
    if (!response.success || !response.data) return 0;
    return response.data.count;
  },

  /**
   * 标记单条通知为已读
   */
  async markAsRead(notificationId: string): Promise<INotification> {
    const response = await api.patch<{ notification: INotification }, object>(
      `${NOTIFICATION_API_BASE}/${notificationId}/read`,
      {},
    );
    if (!response.success || !response.data) {
      throw new Error(
        response.message || "Failed to mark notification as read",
      );
    }
    return response.data.notification;
  },

  /**
   * 标记所有通知为已读
   */
  async markAllAsRead(): Promise<void> {
    const response = await api.patch(`${NOTIFICATION_API_BASE}/read-all`, {});
    if (!response.success) {
      throw new Error(response.message || "Failed to mark all as read");
    }
  },

  /**
   * 删除单条通知
   */
  async deleteNotification(notificationId: string): Promise<void> {
    const response = await api.delete(
      `${NOTIFICATION_API_BASE}/${notificationId}`,
    );
    if (!response.success) {
      throw new Error(response.message || "Failed to delete notification");
    }
  },

  /**
   * 清空所有通知
   */
  async clearAllNotifications(): Promise<void> {
    const response = await api.delete(NOTIFICATION_API_BASE);
    if (!response.success) {
      throw new Error(response.message || "Failed to clear notifications");
    }
  },
};
