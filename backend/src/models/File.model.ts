import mongoose, { Schema, Document, HydratedDocument } from "mongoose";
import { LinkAccessStatus } from "../types/model.types";
import {
  ILinkShareConfig,
  linkShareConfigSchema,
} from "./LinkShareConfig.schema";

export interface IFile extends Document {
  name: string;
  originalName: string; // 用于追溯原始信息
  extension: string; // 用于前端显示图标
  mimeType: string;
  size: number;
  hash?: string; // 秒传去重

  // MinIO
  key: string;
  thumbnailKey: string;

  user: mongoose.Types.ObjectId;
  folder: mongoose.Types.ObjectId | null;

  // 存储祖先 ID，方便查询与权限继承
  ancestors: mongoose.Types.ObjectId[];

  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;

  // 权限管理
  linkShare: ILinkShareConfig;

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
    thumbnailKey: { type: String, select: false },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    folder: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      required: false,
      default: null,
      index: true,
    },

    ancestors: [{ type: Schema.Types.ObjectId, ref: "Folder" }],

    isStarred: { type: Boolean, required: true, index: true },
    isTrashed: { type: Boolean, required: true, index: true },
    trashedAt: { type: Date, default: null },

    linkShare: linkShareConfigSchema,
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
  }
);

// 唯一性约束
fileSchema.index(
  { user: 1, folder: 1, name: 1 },
  { unique: true, partialFilterExpression: { isTrashed: false } }
);

// 搜索优化
fileSchema.index({ user: 1, folder: 1, isTrashed: 1, createdAt: -1 });

// 搜索子树（基于祖先）
fileSchema.index({ ancestors: 1 });

// 类型筛选
fileSchema.index({ user: 1, mimeType: 1 });

// 快传索引
fileSchema.index({ hash: 1 });

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
