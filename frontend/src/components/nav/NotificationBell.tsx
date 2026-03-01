import { useEffect, useRef, useState } from "react";
import {
  IconBell,
  IconBellFilled,
  IconCheck,
  IconTrash,
  IconShare,
  IconUserX,
  IconAlertTriangle,
  IconSpeakerphone,
  IconRobot,
  IconUpload,
  IconInfoCircle,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type {
  INotification,
  NotificationType,
} from "@/types/notification.types";
import { cn } from "@/lib/utils";

function notificationMeta(type: NotificationType): {
  label: string;
  className: string;
  iconClassName: string;
  Icon: typeof IconInfoCircle;
} {
  switch (type) {
    case "FILE_SHARED":
    case "FOLDER_SHARED":
      return {
        label: "Shared With You",
        className: "bg-blue-500/10 text-blue-600",
        iconClassName: "text-blue-500 bg-blue-500/10",
        Icon: IconShare,
      };
    case "ACCESS_REVOKED":
      return {
        label: "Access Removed",
        className: "bg-red-500/10 text-red-600",
        iconClassName: "text-red-500 bg-red-500/10",
        Icon: IconUserX,
      };
    case "STORAGE_WARNING":
    case "STORAGE_QUOTA_WARNING":
      return {
        label: "Storage Alert",
        className: "bg-amber-500/10 text-amber-600",
        iconClassName: "text-amber-500 bg-amber-500/10",
        Icon: IconAlertTriangle,
      };
    case "SYSTEM_ANNOUNCEMENT":
      return {
        label: "Announcement",
        className: "bg-indigo-500/10 text-indigo-600",
        iconClassName: "text-indigo-500 bg-indigo-500/10",
        Icon: IconSpeakerphone,
      };
    case "AGENT_TASK_COMPLETE":
      return {
        label: "Agent Update",
        className: "bg-emerald-500/10 text-emerald-600",
        iconClassName: "text-emerald-500 bg-emerald-500/10",
        Icon: IconRobot,
      };
    case "FILE_UPLOAD_COMPLETE":
      return {
        label: "Upload Complete",
        className: "bg-emerald-500/10 text-emerald-600",
        iconClassName: "text-emerald-500 bg-emerald-500/10",
        Icon: IconUpload,
      };
    default:
      return {
        label: "Notification",
        className: "bg-muted text-foreground",
        iconClassName: "text-muted-foreground bg-muted",
        Icon: IconInfoCircle,
      };
  }
}

function resolveNotificationBody(notification: INotification): string {
  if (typeof notification.data?.body === "string" && notification.data.body) {
    return notification.data.body;
  }

  const senderName =
    notification.sender &&
    typeof notification.sender === "object" &&
    "name" in notification.sender
      ? notification.sender.name
      : "Someone";

  const resourceName =
    typeof notification.data?.resourceName === "string"
      ? notification.data.resourceName
      : "a resource";

  if (
    notification.type === "FILE_SHARED" ||
    notification.type === "FOLDER_SHARED"
  ) {
    return `${senderName} shared "${resourceName}" with you.`;
  }

  if (notification.type === "ACCESS_REVOKED") {
    return `Your access to "${resourceName}" was removed or the resource was deleted.`;
  }

  return "";
}

function NotificationItem({
  notification,
  onRead,
  onDelete,
}: {
  notification: INotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const title =
    notification.data?.title ||
    notification.type.replace(/_/g, " ").toLowerCase();
  const body = resolveNotificationBody(notification);
  const actionUrl = notification.data?.actionUrl;
  const meta = notificationMeta(notification.type);

  const handleClick = () => {
    if (!notification.isRead) {
      onRead(notification._id);
    }
    if (actionUrl) {
      navigate(actionUrl);
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/60",
        !notification.isRead && "bg-muted/40 border-primary/20",
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          meta.iconClassName,
        )}
      >
        <meta.Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Badge className={cn("text-[10px] h-5 px-2", meta.className)}>
            {meta.label}
          </Badge>
          {!notification.isRead && (
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <p
            className={cn(
              "text-sm truncate",
              !notification.isRead && "font-semibold",
            )}
          >
            {title}
          </p>
        </div>
        {body && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {body}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {!notification.isRead && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onRead(notification._id);
            }}
            title="Mark as read"
          >
            <IconCheck className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification._id);
          }}
          title="Delete"
        >
          <IconTrash className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  } = useNotificationStore();

  // Initial load and periodic unread count refresh
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch notifications when popover opens
  useEffect(() => {
    if (open) {
      fetchNotifications(true);
    }
  }, [open, fetchNotifications]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (
      !isLoading &&
      hasMore &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 40
    ) {
      fetchNotifications(false);
    }
  };

  const hasUnread = unreadCount > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          {hasUnread ? (
            <IconBellFilled className="h-5 w-5" />
          ) : (
            <IconBell className="h-5 w-5" />
          )}
          {hasUnread && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] font-bold flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {hasUnread && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasUnread && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => markAllAsRead()}
              >
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2 text-muted-foreground"
                onClick={() => clearAllNotifications()}
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <ScrollArea
          className="h-[400px]"
          ref={scrollRef}
          onScrollCapture={handleScroll}
        >
          {notifications.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
              <IconBell className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="p-2 pr-4 flex flex-col gap-0.5">
              {notifications.map(
                (notification: INotification, index: number) => (
                  <div key={notification._id}>
                    <NotificationItem
                      notification={notification}
                      onRead={markAsRead}
                      onDelete={deleteNotification}
                    />
                    {index < notifications.length - 1 && (
                      <Separator className="my-0.5 opacity-50" />
                    )}
                  </div>
                ),
              )}
              {isLoading && (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  Loading...
                </div>
              )}
              {!hasMore && notifications.length > 0 && (
                <div className="text-center py-3 text-xs text-muted-foreground">
                  You&apos;ve seen all notifications
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
