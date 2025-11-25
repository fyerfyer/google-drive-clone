import mongoose, { Schema, Document, HydratedDocument } from "mongoose";

export interface IFileShare {
  user: mongoose.Types.ObjectId;
  role: "viewer" | "editor";
}

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
  folder: mongoose.Types.ObjectId;

  isStarred: boolean;
  isTrashed: boolean;
  trashedAt?: Date;

  isPublic: boolean;
  sharedWith: IFileShare[];

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
    extension: { type: String, required: true },

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
      required: true,
      index: true,
    },

    isStarred: { type: Boolean, required: true, index: true },
    isTrashed: { type: Boolean, required: true, index: true },

    isPublic: { type: Boolean, default: false },
    sharedWith: [
      {
        _id: false,
        user: { type: Schema.Types.ObjectId, ref: "User" },
        role: { type: String, enum: ["viewer", "editor"], default: "viewer" },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc: HydratedDocument<IFile>, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
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
fileSchema.index({ user: 1, folder: 1, isTrashed: 1 });

// 类型筛选
fileSchema.index({ user: 1, mimeType: 1 });
fileSchema.set("autoIndex", false);

const File = mongoose.model<IFile>("File", fileSchema);
export default File;
