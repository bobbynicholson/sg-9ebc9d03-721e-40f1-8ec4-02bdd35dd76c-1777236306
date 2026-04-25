import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Bell, Check, X, Clock, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const router = useRouter();
  const { user, activeRole } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadNotifications();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user, activeRole]);

  const loadNotifications = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Get unread notifications + 5 most recent read ones
      const unreadNotifs = await notificationService.getNotifications(
        user.id,
        true,
        activeRole,
        { limit: 50 }
      );
      
      const readNotifs = await notificationService.getNotifications(
        user.id,
        false,
        activeRole,
        { limit: 5 }
      );
      
      // Combine and sort by date
      const combined = [...unreadNotifs, ...readNotifs].sort(
        (a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime()
      );
      
      setNotifications(combined);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.markAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id) return;
    await notificationService.markAllAsRead(user.id, activeRole);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleDelete = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.deleteNotification(notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      notificationService.markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
    }
    
    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  };

  const handleViewAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    
    // Route to appropriate notifications page based on role
    if (activeRole === "admin" || activeRole === "super_admin") {
      router.push("/admin/notifications");
    } else if (activeRole === "driver") {
      router.push("/team-portal/driver/notifications");
    } else if (activeRole === "kitchen") {
      router.push("/team-portal/kitchen/notifications");
    } else if (activeRole === "shopping") {
      router.push("/team-portal/shopping/notifications");
    } else if (activeRole === "cleaning") {
      router.push("/team-portal/cleaning/notifications");
    } else {
      router.push("/client-portal/notifications");
    }
  };

  const getPriorityIcon = (priority: string | null) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "high":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "medium":
        return <Bell className="h-4 w-4 text-blue-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "urgent":
        return "border-l-red-500";
      case "high":
        return "border-l-orange-500";
      case "medium":
        return "border-l-blue-500";
      default:
        return "border-l-gray-300";
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (!user) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[380px] sm:w-[420px] p-0"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="h-7 text-xs"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-600">
              <div className="text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                <p className="text-sm">Loading notifications...</p>
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-600">
              <div className="text-center">
                <Bell className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium mb-1">No notifications</p>
                <p className="text-sm text-slate-500">You're all caught up!</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "relative px-4 py-3 transition-colors border-l-4 cursor-pointer",
                    !notification.is_read
                      ? "bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800",
                    getPriorityColor(notification.priority)
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      {getPriorityIcon(notification.priority)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4
                          className={cn(
                            "text-sm font-medium leading-tight",
                            !notification.is_read
                              ? "text-slate-900 dark:text-white"
                              : "text-slate-700 dark:text-slate-300"
                          )}
                        >
                          {notification.title}
                        </h4>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!notification.is_read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-blue-200 dark:hover:bg-blue-800"
                              onClick={(e) => handleMarkAsRead(notification.id, e)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
                            onClick={(e) => handleDelete(notification.id, e)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-2 line-clamp-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDistanceToNow(new Date(notification.created_at || ""), {
                            addSuffix: true,
                          })}
                        </span>
                        {notification.notification_type && (
                          <>
                            <span>•</span>
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              {notification.notification_type.replace(/_/g, " ")}
                            </Badge>
                          </>
                        )}
                      </div>
                      
                      {!notification.is_read && (
                        <div className="absolute top-3 right-3 w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t p-2 bg-slate-50 dark:bg-slate-900">
            <Button
              variant="ghost"
              className="w-full text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
              onClick={handleViewAll}
            >
              View all notifications
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}