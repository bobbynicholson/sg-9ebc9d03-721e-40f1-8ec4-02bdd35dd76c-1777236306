import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Check,
  X,
  Clock,
  AlertCircle,
  Filter,
  Search,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

export default function ProtectedNotificationsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <NotificationsPage />
    </ProtectedRoute>
  );
}

function NotificationsPage() {
  const { user, activeRole } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tab, setTab] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (user?.id) {
      loadNotifications();
    }
  }, [user, activeRole, tab]);

  const loadNotifications = async () => {
    if (!user?.id) return;

    setLoading(true);
    const data = await notificationService.getNotifications(
      user.id,
      tab === "unread",
      activeRole,
      { limit: 100 }
    );
    setNotifications(data);
    setLoading(false);
  };

  const handleMarkAsRead = async (notificationId: string) => {
    await notificationService.markAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, is_read: true } : n
      )
    );
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    await notificationService.markAllAsRead(user.id, activeRole);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleDelete = async (notificationId: string) => {
    await notificationService.deleteNotification(notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const handleDeleteAll = async () => {
    if (!user?.id || !window.confirm("Delete all read notifications?")) return;

    const readNotifications = notifications.filter(n => n.is_read);
    for (const notification of readNotifications) {
      await notificationService.deleteNotification(notification.id);
    }
    setNotifications((prev) => prev.filter((n) => !n.is_read));
  };

  const getPriorityIcon = (priority: string | null) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "high":
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case "medium":
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "urgent":
        return "bg-red-50 border-red-200 hover:border-red-300";
      case "high":
        return "bg-orange-50 border-orange-200 hover:border-orange-300";
      case "medium":
        return "bg-blue-50 border-blue-200 hover:border-blue-300";
      default:
        return "bg-gray-50 border-gray-200 hover:border-gray-300";
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === "all" || n.priority === priorityFilter;
    const matchesType = typeFilter === "all" || n.notification_type === typeFilter;
    return matchesSearch && matchesPriority && matchesType;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
      <AdminNav />
      <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-3">
                <Bell className="h-8 w-8 text-blue-600" />
                Notifications
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-1">
                Manage your system alerts and updates
              </p>
            </div>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-lg px-4 py-2">
                {unreadCount} unread
              </Badge>
            )}
          </div>

          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search notifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="stock_low">Low Stock</SelectItem>
                <SelectItem value="delivery_update">Delivery</SelectItem>
                <SelectItem value="system_alert">System</SelectItem>
                <SelectItem value="order_update">Orders</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")} className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
              <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark All Read
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteAll}
                disabled={notifications.filter(n => n.is_read).length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Read
              </Button>
            </div>
          </div>

          <TabsContent value={tab} className="mt-0">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="p-8 text-center text-slate-600">
                      Loading notifications...
                    </div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="p-12 text-center">
                      <Bell className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                      <p className="text-slate-600 font-medium mb-2">No notifications found</p>
                      <p className="text-sm text-slate-500">
                        {searchTerm || priorityFilter !== "all" || typeFilter !== "all"
                          ? "Try adjusting your filters"
                          : "You're all caught up!"}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {filteredNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 sm:p-6 transition-colors ${
                            !notification.is_read ? "bg-blue-50/50" : ""
                          } ${getPriorityColor(notification.priority)}`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="mt-1 flex-shrink-0">
                              {getPriorityIcon(notification.priority)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-slate-900 leading-tight">
                                    {notification.title}
                                  </h3>
                                  {!notification.is_read && (
                                    <Badge variant="secondary" className="text-xs mt-1">
                                      New
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {!notification.is_read && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleMarkAsRead(notification.id)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleDelete(notification.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-sm text-slate-700 mb-3 leading-relaxed">
                                {notification.message}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(
                                    new Date(notification.created_at || ""),
                                    { addSuffix: true }
                                  )}
                                </div>
                                {notification.notification_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {notification.notification_type.replace(/_/g, " ")}
                                  </Badge>
                                )}
                              </div>
                              {notification.link && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 mt-3 text-blue-600"
                                  onClick={() => {
                                    window.location.href = notification.link!;
                                  }}
                                >
                                  View Details →
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}