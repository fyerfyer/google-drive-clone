export const ACCESS_ROLES = {
  VIEWER: "viewer",
  EDITOR: "editor",
  COMMENTER: "commenter", // TODO: 未来预留
  OWNER: "owner",
} as const;

export type AccessRole = (typeof ACCESS_ROLES)[keyof typeof ACCESS_ROLES];

export type LinkAccessStatus = AccessRole | "none";

export const RESOURCE_TYPES = {
  FOLDER: "Folder",
  FILE: "File",
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];
