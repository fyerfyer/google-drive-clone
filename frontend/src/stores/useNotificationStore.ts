import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { INotification } from "@/types/notification.types";
import { notificationService } from "@/services/notification.service";
import { toast } from "sonner";

interface NotificationState {
  notifications: INotification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  currentPage: number;
}

interface NotificationActions {
  fetchNotifications: (reset?: boolean) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  /** Push a notification received from socket into the store */
  addNotification: (notification: INotification) => void;
}

export type NotificationStore = NotificationState & NotificationActions;

const PAGE_SIZE = 20;

export const useNotificationStore = create<NotificationStore>()(
  devtools(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      hasMore: true,
      currentPage: 1,

      fetchNotifications: async (reset = false) => {
        const { currentPage, isLoading, hasMore } = get();
        if (isLoading || (!reset && !hasMore)) return;

        const page = reset ? 1 : currentPage;

        set({ isLoading: true }, false, "notifications/fetch-start");

        try {
          const result = await notificationService.getNotifications({
            page,
            limit: PAGE_SIZE,
          });
          set(
            (state) => ({
              notifications: reset
                ? result.notifications
                : [...state.notifications, ...result.notifications],
              unreadCount: result.unreadCount,
              currentPage: page + 1,
              hasMore: result.notifications.length === PAGE_SIZE,
              isLoading: false,
            }),
            false,
            "notifications/fetch-success",
          );
        } catch {
          set({ isLoading: false }, false, "notifications/fetch-error");
        }
      },

      fetchUnreadCount: async () => {
        try {
          const count = await notificationService.getUnreadCount();
          set({ unreadCount: count }, false, "notifications/unread-count");
        } catch {
          // fail silently
        }
      },

      markAsRead: async (notificationId: string) => {
        try {
          await notificationService.markAsRead(notificationId);
          set(
            (state) => ({
              notifications: state.notifications.map((n) =>
                n._id === notificationId ? { ...n, isRead: true } : n,
              ),
              unreadCount: Math.max(0, state.unreadCount - 1),
            }),
            false,
            "notifications/mark-read",
          );
        } catch {
          // fail silently
        }
      },

      markAllAsRead: async () => {
        try {
          await notificationService.markAllAsRead();
          set(
            (state) => ({
              notifications: state.notifications.map((n) => ({
                ...n,
                isRead: true,
              })),
              unreadCount: 0,
            }),
            false,
            "notifications/mark-all-read",
          );
        } catch (error) {
          toast.error("Failed to mark all as read");
        }
      },

      deleteNotification: async (notificationId: string) => {
        try {
          await notificationService.deleteNotification(notificationId);
          set(
            (state) => ({
              notifications: state.notifications.filter(
                (n) => n._id !== notificationId,
              ),
              unreadCount: state.notifications.find(
                (n) => n._id === notificationId && !n.isRead,
              )
                ? Math.max(0, state.unreadCount - 1)
                : state.unreadCount,
            }),
            false,
            "notifications/delete",
          );
        } catch {
          toast.error("Failed to delete notification");
        }
      },

      clearAllNotifications: async () => {
        try {
          await notificationService.clearAllNotifications();
          set(
            {
              notifications: [],
              unreadCount: 0,
              hasMore: false,
              currentPage: 1,
            },
            false,
            "notifications/clear-all",
          );
        } catch {
          toast.error("Failed to clear notifications");
        }
      },

      addNotification: (notification: INotification) => {
        set(
          (state) => ({
            notifications: [notification, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          }),
          false,
          "notifications/add",
        );
      },
    }),
    { name: "NotificationStore" },
  ),
);
