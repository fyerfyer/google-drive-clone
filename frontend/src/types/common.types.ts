export interface BaseItem {
  id: string;
  name: string;
  isStarred: boolean;
  isTrashed: boolean;
  createdAt: string;
  updatedAt: string;
}

// 用户基础信息（用于所有者和共享者）
export interface UserBasic {
  id: string;
  name: string;
  email: string;
  avatar: {
    thumbnail: string;
  };
}

// 共享信息
export interface ShareInfo {
  user: UserBasic;
  role: "viewer" | "editor";
}

export type AccessRole = "viewer" | "editor" | "commenter" | "owner";
export type LinkAccessStatus = AccessRole | "none";

export type ViewMode = "grid" | "list";
export type ViewType =
  | "folder"
  | "recent"
  | "starred"
  | "trash"
  | "files"
  | "shared";
export type SortField = "name" | "createdAt" | "updatedAt" | "size";
export type SortOrder = "asc" | "desc";
