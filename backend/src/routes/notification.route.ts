import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import { NotificationController } from "../controllers/notification.controller";

export function createNotificationRouter(
  notificationController: NotificationController,
) {
  const router = Router();
  router.use(jwtAuth);

  router.get(
    "/",
    notificationController.listNotifications.bind(notificationController),
  );

  router.get(
    "/unread-count",
    notificationController.getUnreadCount.bind(notificationController),
  );

  router.patch(
    "/read-all",
    notificationController.markAllAsRead.bind(notificationController),
  );

  router.delete(
    "/",
    notificationController.clearAllNotifications.bind(notificationController),
  );

  router.patch(
    "/:notificationId/read",
    notificationController.markAsRead.bind(notificationController),
  );

  router.delete(
    "/:notificationId",
    notificationController.deleteNotification.bind(notificationController),
  );

  return router;
}
