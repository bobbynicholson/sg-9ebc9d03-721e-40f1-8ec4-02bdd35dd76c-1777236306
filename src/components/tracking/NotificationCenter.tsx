import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, MapPin, Star, Truck } from "lucide-react";
import { notificationService, Notification } from "@/services/notificationService";
import { useAuth } from "@/contexts/AuthContext";

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user?.id) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadNotifications = async () => {
    if (!user?.id) return;
    
    const allNotifications = await notificationService.getNotifications(user.id);
    setNotifications(allNotifications);
    setUnreadCount(allNotifications.filter((n) => !n.is_read).length);
  };

  const handleMarkAsRead = async (notificationId: string) => {
    await notificationService.markAsRead(notificationId);
    loadNotifications();
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    await notificationService.markAllAsRead(user.id);
    loadNotifications();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "driver_logged_in":
        return <Truck className="w-4 h-4 text-blue-600" />;
      case "food_collected":
        return <Check className="w-4 h-4 text-brand-primary" />;
      case "driver_arrived":
        return <MapPin className="w-4 h-4 text-orange-600" />;
      case "delivery_complete":
        return <Check className="w-4 h-4 text-brand-primary" />;
      case "review_request":
        return <Star className="w-4 h-4 text-amber-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-600" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "driver_logged_in":
        return "bg-blue-50 border-blue-200";
      case "food_collected":
        return "bg-brand-primary/10 border-brand-primary/20";
      case "driver_arrived":
        return "bg-orange-50 border-orange-200";
      case "delivery_complete":
        return "bg-brand-primary/10 border-brand-primary/20";
      case "review_request":
        return "bg-amber-50 border-amber-200";
      default:
        return "bg-slate-50 border-slate-200";
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-rose-500 text-white ml-2">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="text-blue-600 hover:text-blue-700"
            >
              Mark all as read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {notifications
              .slice()
              .reverse()
              .map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg border transition-all ${
                    notification.is_read ? "opacity-60" : ""
                  } ${getNotificationColor(notification.notification_type || "")}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getNotificationIcon(notification.notification_type || "")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 mb-1">
                        {notification.title}
                      </p>
                      <p className="text-sm text-slate-700 mb-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          {new Date(notification.created_at || "").toLocaleString()}
                        </p>
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="h-6 px-2 text-xs"
                          >
                            Mark as read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
