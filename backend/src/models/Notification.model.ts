import mongoose, { Document } from "mongoose";
import { NotificationType, ResourceType } from "../types/model.types";

export interface INotificationAttrs {
  kind: ResourceType;
  resourceId: mongoose.Types.ObjectId;
}

export interface INotificationSnapshot {
  resourceId: string;
  kind: ResourceType;
}

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  sender?: mongoose.Types.ObjectId;
  type: NotificationType;
  resources?: INotificationAttrs[];

  // 存储快照，防止资源被删除后无法展示通知内容
  data: {
    title?: string;
    items?: INotificationSnapshot[];
    [key: string]: any;
  };

  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new mongoose.Schema<INotification>(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "FILE_SHARED",
        "FOLDER_SHARED",
        "ACCESS_REVOKED",
        "STORAGE_WARNING",
        "SYSTEM_ANNOUNCEMENT",
      ],
      required: true,
      index: true,
    },

    resources: [
      {
        kind: {
          type: String,
          enum: ["Folder", "File"],
          required: true,
        },
        resourceId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
      },
    ],

    data: {
      title: {
        type: String,
        optional: true,
      },
      items: [
        {
          resourceId: {
            type: String,
            required: true,
          },
          kind: {
            type: String,
            enum: ["Folder", "File"],
            required: true,
          },
        },
      ],

      type: mongoose.Schema.Types.Mixed,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema
);
