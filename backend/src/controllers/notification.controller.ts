import { Request, Response, NextFunction } from "express";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { NotificationService } from "../services/notification.service";
import { ResponseHelper } from "../utils/response.util";
import { extractParam } from "../utils/request.util";

export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  async listNotifications(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 20;
    const unreadOnly = req.query.unreadOnly === "true";

    const result = await this.notificationService.listNotifications(userId, {
      page,
      limit,
      unreadOnly,
    });

    return ResponseHelper.ok(res, result);
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const count = await this.notificationService.getUnreadCount(req.user.id);
    return ResponseHelper.ok(res, { count });
  }

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const notificationId = extractParam(req.params.notificationId);
    const notification = await this.notificationService.markAsRead(
      notificationId,
      req.user.id,
    );

    return ResponseHelper.ok(res, { notification });
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await this.notificationService.markAllAsRead(req.user.id);
    return ResponseHelper.message(
      res,
      `Marked ${result.modifiedCount} notifications as read`,
    );
  }

  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const notificationId = extractParam(req.params.notificationId);
    await this.notificationService.deleteNotification(
      notificationId,
      req.user.id,
    );

    return ResponseHelper.message(res, "Notification deleted");
  }

  async clearAllNotifications(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const result = await this.notificationService.clearAllNotifications(
      req.user.id,
    );
    return ResponseHelper.message(
      res,
      `Cleared ${result.deletedCount} notifications`,
    );
  }
}
