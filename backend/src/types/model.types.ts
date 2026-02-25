import { IFile } from "../models/File.model";
import { IFolder } from "../models/Folder.model";

export const ACCESS_ROLES = {
  VIEWER: "viewer",
  EDITOR: "editor",
  COMMENTER: "commenter", // TODO: 未来预留
  OWNER: "owner",
} as const;

export type AccessRole = (typeof ACCESS_ROLES)[keyof typeof ACCESS_ROLES];

export type LinkAccessStatus = AccessRole | "none";

export type LinkShareScope = "anyone" | "domain" | "none"; // none 表示关闭链接分享

export const RESOURCE_TYPES = {
  FOLDER: "Folder",
  FILE: "File",
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];

export type ResourceItem = IFolder | IFile;

export const NOTIFICATION_TYPES = {
  FILE_SHARED: "FILE_SHARED",
  FOLDER_SHARED: "FOLDER_SHARED",
  ACCESS_REVOKED: "ACCESS_REVOKED",
  STORAGE_WARNING: "STORAGE_WARNING",
  SYSTEM_ANNOUNCEMENT: "SYSTEM_ANNOUNCEMENT",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const QUEUE_NAMES = {
  NOTIFICATIONS: "notifications",
  FILE_PROCESSING: "file-processing",
  MAINTAINANCE: "maintenance",
  AGENT_TASKS: "agent-tasks",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_TASKS = {
  SEND_SHARE: "send-share-notification",
  CLEANUP_TRASH: "cleanup-trash",
  CLEANUP_TEMP_FILES: "cleanup-temp-files",
  AGENT_CHAT: "agent-chat",
} as const;

export type QueueTaskType = (typeof QUEUE_TASKS)[keyof typeof QUEUE_TASKS];

export const QUEUE_ACTIONS = {
  EMPTY_TRASH: "empty-trash",
};
