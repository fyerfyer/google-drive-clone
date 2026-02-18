import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

// ApiKey MCP 外部客户端认证用的 API Key
// - 用户在 Web UI 生成 API Key
// - 数据库存储 key 的 SHA-256 hash（明文只在创建时返回一次）
// - MCP 客户端设置 MCP_API_KEY=gdrive_xxxxx 即可自动认证

export interface IApiKey extends Document {
  user: mongoose.Types.ObjectId;
  name: string; // 人类可读名称，如 "VSCode MCP"
  keyPrefix: string; // 前 8 位，用于在 UI 中辨识
  keyHash: string; // SHA-256 hash
  lastUsedAt: Date | null;
  expiresAt: Date | null; // null = 永不过期
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    keyPrefix: {
      type: String,
      required: true,
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete (ret as Record<string, unknown>)._id;
        delete (ret as Record<string, unknown>).__v;
        // 永远不暴露 keyHash
        delete (ret as Record<string, unknown>).keyHash;
        return ret;
      },
    },
  },
);

// keyHash 查找
apiKeySchema.index({ keyHash: 1 });
// 快速查询用户的活跃 key
apiKeySchema.index({ user: 1, isActive: 1 });

export function generateApiKey(): {
  raw: string;
  prefix: string;
  hash: string;
} {
  const random = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const raw = `gdrive_${random}`;
  const prefix = raw.slice(0, 15); // "gdrive_" + 前8位
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const ApiKey = mongoose.model<IApiKey>("ApiKey", apiKeySchema);
export default ApiKey;
