import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { Notification, INotification } from "../models/Notification.model";
import { notificationQueue } from "../lib/queue/queue";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";
import {
  NotificationType,
  NOTIFICATION_TYPES,
  QUEUE_TASKS,
} from "../types/model.types";

export interface NotificationListResult {
  notifications: INotification[];
  total: number;
  unreadCount: number;
}

export interface SendNotificationDTO {
  recipientId: string;
  senderId?: string;
  type: NotificationType;
  // 通知正文
  data: {
    title?: string;
    body?: string;
    resourceId?: string;
    resourceType?: "File" | "Folder";
    resourceName?: string;
    actionUrl?: string;
    [key: string]: unknown;
  };
}

export class NotificationService {
  async listNotifications(
    userId: string,
    options: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ): Promise<NotificationListResult> {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const filter: Record<string, unknown> = { recipient: userObjectId };
    if (unreadOnly) {
      filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("sender", "name email avatar")
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        recipient: userObjectId,
        isRead: false,
      }),
    ]);

    return {
      notifications: notifications as unknown as INotification[],
      total,
      unreadCount,
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    return Notification.countDocuments({
      recipient: userObjectId,
      isRead: false,
    });
  }

  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<INotification> {
    const notificationObjectId = new mongoose.Types.ObjectId(notificationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationObjectId, recipient: userObjectId },
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    if (!notification) {
      throw new AppError(StatusCodes.NOT_FOUND, "Notification not found");
    }

    return notification;
  }

  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const result = await Notification.updateMany(
      { recipient: userObjectId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    return { modifiedCount: result.modifiedCount };
  }

  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    const notificationObjectId = new mongoose.Types.ObjectId(notificationId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const result = await Notification.deleteOne({
      _id: notificationObjectId,
      recipient: userObjectId,
    });

    if (result.deletedCount === 0) {
      throw new AppError(StatusCodes.NOT_FOUND, "Notification not found");
    }
  }

  async clearAllNotifications(
    userId: string,
  ): Promise<{ deletedCount: number }> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const result = await Notification.deleteMany({ recipient: userObjectId });
    return { deletedCount: result.deletedCount };
  }

  async sendNotification(dto: SendNotificationDTO): Promise<void> {
    await notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
      type: dto.type,
      recipientId: dto.recipientId,
      senderId: dto.senderId || null,
      data: dto.data,
    });

    logger.debug(
      { type: dto.type, recipientId: dto.recipientId },
      "Notification queued",
    );
  }

  async notifyAgentTaskComplete(
    userId: string,
    taskTitle: string,
    resultSummary?: string,
  ): Promise<void> {
    await this.sendNotification({
      recipientId: userId,
      type: NOTIFICATION_TYPES.AGENT_TASK_COMPLETE,
      data: {
        title: `AI Agent: ${taskTitle}`,
        body: resultSummary || "Task completed successfully.",
        actionUrl: "/agent",
      },
    });
  }

  async notifyStorageQuotaWarning(
    userId: string,
    usedBytes: number,
    quotaBytes: number,
  ): Promise<void> {
    const usedPercent = Math.round((usedBytes / quotaBytes) * 100);
    await this.sendNotification({
      recipientId: userId,
      type: NOTIFICATION_TYPES.STORAGE_QUOTA_WARNING,
      data: {
        title: "Storage Almost Full",
        body: `You are using ${usedPercent}% of your storage quota.`,
        usedBytes,
        quotaBytes,
        usedPercent,
        actionUrl: "/profile",
      },
    });
  }

  async notifyFileUploadComplete(
    userId: string,
    fileName: string,
    fileId: string,
  ): Promise<void> {
    await this.sendNotification({
      recipientId: userId,
      type: NOTIFICATION_TYPES.FILE_UPLOAD_COMPLETE,
      data: {
        title: "Upload Complete",
        body: `"${fileName}" has been uploaded successfully.`,
        resourceId: fileId,
        resourceType: "File",
        resourceName: fileName,
      },
    });
  }
}
