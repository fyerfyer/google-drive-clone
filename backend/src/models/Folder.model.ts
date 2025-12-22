import mongoose, { Schema, Document, HydratedDocument } from "mongoose";
import { LinkAccessStatus } from "../types/model.types";
import {
  ILinkShareConfig,
  linkShareConfigSchema,
} from "./LinkShareConfig.schema";

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

  // 权限管理
  linkShare: ILinkShareConfig;

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
      index: true, // 用户经常要查询，建索引可以快一些
    },

    parent: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true, // 父文件夹下面的内容也经常要查
    },

    ancestors: [{ type: Schema.Types.ObjectId, ref: "Folder" }],

    color: { type: String, default: "#5F6368" },

    description: { type: String, maxLength: 1000 },

    isStarred: {
      type: Boolean,
      default: false,
      index: true, // 要查询加星的文件
    },

    isTrashed: {
      type: Boolean,
      default: false,
      index: true,
    },

    trashedAt: { type: Date, default: null },

    linkShare: linkShareConfigSchema,
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
  }
);

// 唯一性约束，注意回收站不满足
folderSchema.index(
  { user: 1, parent: 1, name: 1 },
  { unique: true, partialFilterExpression: { isTrashed: false } }
);

// 查询优化：子文件夹
folderSchema.index({ user: 1, parent: 1, isTrashed: 1 });

// 查询优化：搜索子树
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
