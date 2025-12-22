import { Schema } from "mongoose";
import { AccessRole, LinkShareScope } from "../types/model.types";

export interface ILinkShareConfig {
  enableLinkSharing: boolean; // 是否开启链接分享
  token: string | null; // 链接分享的令牌
  role: AccessRole; // 链接分享的访问角色
  password?: string; // 链接分享的密码
  expiresAt?: Date; // 链接分享的过期时间
  allowDownload: boolean; // 是否允许下载（Viewer）
  scope: LinkShareScope; // 分享范围
}

export const linkShareConfigSchema = new Schema<ILinkShareConfig>(
  {
    enableLinkSharing: { type: Boolean, default: false },
    token: { type: String, sparse: true, index: true },
    role: {
      type: String,
      enum: ["viewer", "owner", "editor", "commenter"],
      default: "viewer",
    },
    password: { type: String, select: false },
    expiresAt: { type: Date },
    allowDownload: { type: Boolean, default: true },
    scope: {
      type: String,
      enum: ["anyone", "domain", "none"],
      default: "anyone",
    },
  },
  { _id: false }
);
