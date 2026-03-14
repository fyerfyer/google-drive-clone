import mongoose, { Schema, Document, HydratedDocument } from "mongoose";
import { RESOURCE_TYPES, ResourceType } from "../types/model.types";

export interface IFolder extends Document {
  name: string;
  user: mongoose.Types.ObjectId;
  parent: mongoose.Types.ObjectId;

  // 存储祖先 ID，方便查询
  ancestors: mongoose.Types.ObjectId[];

  color: string;
  description?: string;
  isStarred: boolean;
  isTrashed: boolean;
  // 用于自动清理
  trashedAt?: Date;

  // Share 快捷方式相关字段
  isShortcut?: boolean;
  shortcutTarget?: {
    targetId: mongoose.Types.ObjectId;
    targetType: ResourceType;
  };

  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
  {
    name: {
      type: String,
      required: [true, "Folder name cannot be empty"],
      trim: true,
      maxLength: 255,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    parent: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },

    ancestors: [{ type: Schema.Types.ObjectId, ref: "Folder" }],

    color: { type: String, default: "#5F6368" },

    description: { type: String, maxLength: 1000 },

    isStarred: {
      type: Boolean,
      default: false,
    },

    isTrashed: {
      type: Boolean,
      default: false,
    },

    trashedAt: { type: Date, default: null },

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
      transform: function (doc: HydratedDocument<IFolder>, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.ancestors;
        return ret;
      },
    },
  },
);

// 唯一性约束：同目录下不能有同名未删除文件夹
folderSchema.index(
  { user: 1, parent: 1, name: 1 },
  { unique: true, partialFilterExpression: { isTrashed: false } },
);

// 目录列表页：按用户 + 父目录 + 未删除 + 创建时间倒序
folderSchema.index({ user: 1, parent: 1, isTrashed: 1, createdAt: -1 });

// 最近文件夹页：按用户 + 未删除 + 更新时间倒序
folderSchema.index({ user: 1, isTrashed: 1, updatedAt: -1 });

// 回收站页：按用户 + 已删除 + 删除时间倒序
folderSchema.index({ user: 1, isTrashed: 1, trashedAt: -1 });

// 星标文件夹页：按用户 + 星标 + 未删除 + 更新时间倒序
folderSchema.index({ user: 1, isStarred: 1, isTrashed: 1, updatedAt: -1 });

// 子树查询（基于祖先路径）
folderSchema.index({ ancestors: 1 });

folderSchema.post("findOneAndDelete", async function (doc: IFolder) {
  if (doc) {
    // 删除钩子，文件夹被彻底删除时清理权限表
    try {
      await mongoose
        .model("SharedAccess")
        .deleteMany({ resourceType: "Folder", resource: doc._id });
    } catch (err) {
      console.error("Error cleaning up folder shares:", err);
    }
  }
});

const Folder = mongoose.model<IFolder>("Folder", folderSchema);
export default Folder;
