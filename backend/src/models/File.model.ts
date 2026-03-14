import mongoose, { Schema, Document, HydratedDocument } from "mongoose";
import {
  RESOURCE_TYPES,
  ResourceType,
  EMBEDDING_STATUS,
  EmbeddingStatus,
} from "../types/model.types";

export interface IFile extends Document {
  name: string;
  originalName: string; // 用于追溯原始信息
  extension: string; // 用于前端显示图标
  mimeType: string;
  size: number;
  hash?: string; // 秒传去重

  // MinIO
  key: string;

  user: mongoose.Types.ObjectId;
  folder: mongoose.Types.ObjectId | null;

  // 存储祖先 ID，方便查询与权限继承
  ancestors: mongoose.Types.ObjectId[];

  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;

  // Embedding 状态
  embeddingStatus?: EmbeddingStatus;
  embeddingError?: string;
  processedChunks?: number;
  totalChunks?: number;

  // Share 快捷方式相关字段
  isShortcut?: boolean;
  shortcutTarget?: {
    targetId: mongoose.Types.ObjectId;
    targetType: ResourceType;
  };

  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    name: {
      type: String,
      required: [true, "File name cannot be empty"],
      trim: true,
      maxLength: 255,
    },

    originalName: { type: String, required: true },
    extension: { type: String, required: false, default: "" },

    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    hash: { type: String, select: false }, // 只有上传校验的时候查询

    key: { type: String, select: false },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    folder: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      required: false,
      default: null,
    },

    ancestors: [{ type: Schema.Types.ObjectId, ref: "Folder" }],

    isStarred: { type: Boolean, required: true },
    isTrashed: { type: Boolean, required: true },
    trashedAt: { type: Date, default: null },

    embeddingStatus: {
      type: String,
      enum: Object.values(EMBEDDING_STATUS),
      default: EMBEDDING_STATUS.NONE,
    },
    embeddingError: { type: String, default: null },
    processedChunks: { type: Number, default: 0 },
    totalChunks: { type: Number, default: 0 },

    isShortcut: { type: Boolean, required: false, default: false },
    shortcutTarget: {
      type: {
        targetId: {
          type: Schema.Types.ObjectId,
          required: true,
        },
        targetType: {
          type: String,
          enum: Object.values(RESOURCE_TYPES),
          required: true,
        },
      },
      required: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc: HydratedDocument<IFile>, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.ancestors;
        return ret;
      },
    },
  },
);

// 同目录下不能有同名未删除文件
fileSchema.index(
  { user: 1, folder: 1, name: 1 },
  { unique: true, partialFilterExpression: { isTrashed: false } },
);

// 目录列表页：按用户 + 目录 + 未删除 + 创建时间倒序
fileSchema.index({ user: 1, folder: 1, isTrashed: 1, createdAt: -1 });

// 最近文件页：按用户 + 未删除 + 更新时间倒序
fileSchema.index({ user: 1, isTrashed: 1, updatedAt: -1 });

// 回收站页：按用户 + 已删除 + 删除时间倒序
fileSchema.index({ user: 1, isTrashed: 1, trashedAt: -1 });

// 星标文件页：按用户 + 星标 + 未删除 + 更新时间倒序
fileSchema.index({ user: 1, isStarred: 1, isTrashed: 1, updatedAt: -1 });

// 子树查询（基于祖先路径）
fileSchema.index({ ancestors: 1 });

// 秒传去重：同一用户同一 hash
fileSchema.index({ user: 1, hash: 1 }, { sparse: true });

// Embedding 状态筛选
fileSchema.index({ user: 1, embeddingStatus: 1 });

// 删除钩子，文件被彻底删除时清理权限表
fileSchema.post("findOneAndDelete", async function (doc: IFile) {
  if (doc) {
    try {
      await mongoose.model("SharedAccess").deleteMany({ resource: doc._id });
      console.log(`Cleaned up shares for file ${doc._id}`);
    } catch (err) {
      console.error("Error cleaning up file shares:", err);
    }
  }
});

const File = mongoose.model<IFile>("File", fileSchema);
export default File;
