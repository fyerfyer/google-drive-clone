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
