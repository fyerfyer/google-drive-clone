import mongoose from "mongoose";

export interface ISharedAccess {
  resourceType: "Folder" | "File";
  resource: mongoose.Types.ObjectId;
  sharedBy: mongoose.Types.ObjectId;
  sharedWith: mongoose.Types.ObjectId;
  role: "viewer" | "editor";
  createdAt: Date;
  updatedAt: Date;
}

const sharedAccessSchema = new mongoose.Schema<ISharedAccess>(
  {
    resourceType: {
      type: String,
      enum: ["Folder", "File"],
      required: true,
      index: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "resourceType",
    },
    sharedWith: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // 与我共享的资源
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["viewer", "editor"],
    },
  },
  {
    timestamps: true,
  }
);

// 确保一个人对一个资源只有一种权限
// 同时加速查询
sharedAccessSchema.index({ resource: 1, sharedWith: 1 }, { unique: true });

// 与我共享索引
sharedAccessSchema.index({ sharedWith: 1, resourceType: 1, createdAt: -1 });

export const SharedAccess = mongoose.model<ISharedAccess>(
  "SharedAccess",
  sharedAccessSchema
);
