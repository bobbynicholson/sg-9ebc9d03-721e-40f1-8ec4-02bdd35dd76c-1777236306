import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Mail, MapPin, Star, Truck } from "lucide-react";
import { Notification } from "@/types/tracking";
import { notificationService } from "@/lib/notificationService";

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = () => {
    const allNotifications = notificationService.getNotifications();
    setNotifications(allNotifications);
    setUnreadCount(allNotifications.filter((n) => !n.read).length);
  };

  const handleMarkAsRead = (notificationId: string) => {
    notificationService.markAsRead(notificationId);
    loadNotifications();
  };

  const handleMarkAllAsRead = () => {
    notifications.forEach((n) => {
      if (!n.read) {
        notificationService.markAsRead(n.id);
      }
    });
    loadNotifications();
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "driver_logged_in":
        return <Truck className="w-4 h-4 text-blue-600" />;
      case "food_collected":
        return <Check className="w-4 h-4 text-green-600" />;
      case "driver_arrived":
        return <MapPin className="w-4 h-4 text-orange-600" />;
      case "delivery_complete":
        return <Check className="w-4 h-4 text-green-600" />;
      case "review_request":
        return <Star className="w-4 h-4 text-amber-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-600" />;
    }
  };

  const getNotificationColor = (type: Notification["type"]) => {
    switch (type) {
      case "driver_logged_in":
        return "bg-blue-50 border-blue-200";
      case "food_collected":
        return "bg-green-50 border-green-200";
      case "driver_arrived":
        return "bg-orange-50 border-orange-200";
      case "delivery_complete":
        return "bg-green-50 border-green-200";
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
              <Badge className="bg-red-500 text-white ml-2">
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
                    notification.read ? "opacity-60" : ""
                  } ${getNotificationColor(notification.type)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 mb-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
                        {!notification.read && (
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
