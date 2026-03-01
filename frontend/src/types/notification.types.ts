export type NotificationType =
  | "FILE_SHARED"
  | "FOLDER_SHARED"
  | "ACCESS_REVOKED"
  | "STORAGE_WARNING"
  | "SYSTEM_ANNOUNCEMENT"
  | "AGENT_TASK_COMPLETE"
  | "FILE_UPLOAD_COMPLETE"
  | "STORAGE_QUOTA_WARNING";

export interface UserBasicInfo {
  _id: string;
  name: string;
  email: string;
  avatar?: { thumbnail?: string };
}

export interface INotification {
  _id: string;
  id?: string;
  recipient: string;
  sender?: UserBasicInfo | string | null;
  type: NotificationType;
  data: {
    title?: string;
    body?: string;
    resourceId?: string;
    resourceType?: "File" | "Folder";
    resourceName?: string;
    actionUrl?: string;
    usedBytes?: number;
    quotaBytes?: number;
    usedPercent?: number;
    [key: string]: unknown;
  };
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  notifications: INotification[];
  total: number;
  unreadCount: number;
}

export interface UnreadCountResponse {
  count: number;
}
