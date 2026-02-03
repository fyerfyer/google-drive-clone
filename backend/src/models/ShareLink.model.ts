import mongoose, { Document, Schema } from "mongoose";
import { AccessRole, ResourceType } from "../types/model.types";

export interface IShareLinkPolicy {
  role: AccessRole;
  requireLogin: boolean;
  allowedUsers: mongoose.Types.ObjectId[];
  allowedDomains: string[];
  allowDownload: boolean;
  expiresAt?: Date;
  maxAccessCount?: number;
  passwordHash?: string;
}

export interface IShareLink extends Document {
  resourceId: mongoose.Types.ObjectId;
  resourceType: ResourceType;
  token: string;
  policy: IShareLinkPolicy;
  createdBy: mongoose.Types.ObjectId;
  accessCount: number;
  isRevoked: boolean;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shareLinkPolicySchema = new Schema<IShareLinkPolicy>(
  {
    role: {
      type: String,
      enum: ["viewer", "commenter", "editor", "owner"],
      default: "viewer",
    },
    requireLogin: {
      type: Boolean,
      default: false,
    },
    allowedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    allowedDomains: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    allowDownload: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    maxAccessCount: {
      type: Number,
      default: 0, // 0 means unlimited
      min: 0,
    },
    passwordHash: {
      type: String,
      select: false, // 默认不返回
    },
  },
  { _id: false },
);

const shareLinkSchema = new Schema<IShareLink>(
  {
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ["File", "Folder"],
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    policy: {
      type: shareLinkPolicySchema,
      required: true,
      default: () => ({
        role: "viewer",
        requireLogin: false,
        allowedUsers: [],
        allowedDomains: [],
        allowDownload: true,
      }),
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accessCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret: Record<string, unknown>) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        if (ret.policy && typeof ret.policy === "object") {
          const policy = ret.policy as Record<string, unknown>;
          delete policy.passwordHash;
        }
        return ret;
      },
    },
  },
);

// 按资源和创建者查询
shareLinkSchema.index({ resourceId: 1, resourceType: 1, createdBy: 1 });

// 按资源和状态查询
shareLinkSchema.index({ resourceId: 1, resourceType: 1, isRevoked: 1 });

// 过期清理索引
shareLinkSchema.index({ "policy.expiresAt": 1 }, { sparse: true });

// 检查链接是否有效
shareLinkSchema.methods.isValid = function (): boolean {
  if (this.isRevoked) return false;
  if (this.policy.expiresAt && new Date() > this.policy.expiresAt) return false;
  if (
    this.policy.maxAccessCount > 0 &&
    this.accessCount >= this.policy.maxAccessCount
  )
    return false;
  return true;
};

// 增加访问计数
shareLinkSchema.methods.incrementAccessCount =
  async function (): Promise<void> {
    this.accessCount += 1;
    await this.save();
  };

// 根据 token 查找有效链接
shareLinkSchema.statics.findValidByToken = function (
  token: string,
): Promise<IShareLink | null> {
  return this.findOne({
    token,
    isRevoked: false,
    $or: [
      { "policy.expiresAt": null },
      { "policy.expiresAt": { $gt: new Date() } },
    ],
  });
};

// 根据资源查找所有链接
shareLinkSchema.statics.findByResource = function (
  resourceId: string,
  resourceType: ResourceType,
  includeRevoked = false,
): Promise<IShareLink[]> {
  const query: any = { resourceId, resourceType };
  if (!includeRevoked) {
    query.isRevoked = false;
  }
  return this.find(query).sort({ createdAt: -1 });
};

// 类型扩展
interface IShareLinkModel extends mongoose.Model<IShareLink> {
  findValidByToken(token: string): Promise<IShareLink | null>;
  findByResource(
    resourceId: string,
    resourceType: ResourceType,
    includeRevoked?: boolean,
  ): Promise<IShareLink[]>;
}

export const ShareLink = mongoose.model<IShareLink, IShareLinkModel>(
  "ShareLink",
  shareLinkSchema,
);
