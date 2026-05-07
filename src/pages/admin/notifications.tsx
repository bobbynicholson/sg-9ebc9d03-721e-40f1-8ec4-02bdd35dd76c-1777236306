import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
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
import { Bell, Check, X, Clock, AlertCircle, Search, Trash2, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronUp, Eye, Edit3, ExternalLink } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

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
  // Tracks which notifications have their detail accordion expanded.
  // Set rather than single-id so an admin can pin several open at
  // once while triaging a busy inbox.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  const preFilteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const matchesPriority = priorityFilter === "all" || n.priority === priorityFilter;
      const matchesType = typeFilter === "all" || n.notification_type === typeFilter;
      return matchesPriority && matchesType;
    });
  }, [notifications, priorityFilter, typeFilter]);

  const filteredNotifications = useFuzzyItems(
    preFilteredNotifications,
    searchTerm,
    [
      { key: "title" as any, weight: 3 },
      { key: "message" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
      <AdminNav />
      <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-12 max-w-5xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-3">
                <Bell className="h-8 w-8 text-blue-600" />
                Notifications
                <InfoTooltip content={"Your inbox of system alerts: low stock, delivery updates, order changes and other events that need your attention."} />
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-1">
                System alerts inbox. Low stock warnings, delivery updates, order changes, payment confirmations, and anything else flagged automatically by the platform. Open a row for details or jump straight to the source page.
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
              <InfoTooltip content={"All shows every notification for your role. Unread narrows it down to the ones you have not read yet."} className="ml-2" />
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
                              {/* Full message, never truncated. The
                                  message column is text and we store
                                  the client's full request text on
                                  request-edits so admin reads what was
                                  asked without bouncing to the quote
                                  page first. */}
                              <p className="text-sm text-slate-700 mb-3 leading-relaxed whitespace-pre-wrap break-words">
                                {notification.message}
                              </p>

                              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
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

                              {/* Action row -- View Details toggles the
                                  accordion below, primary action button
                                  varies by related entity. Quote
                                  notifications get a dedicated Edit
                                  Quote button that lands directly on
                                  the editable form. Other entity types
                                  fall back to the generic link. */}
                              {(() => {
                                const isExpanded = expandedIds.has(notification.id);
                                const isQuote =
                                  notification.related_entity_type === "quote" &&
                                  !!notification.related_entity_id;
                                // Order-type notifications (amendment /
                                // cancellation / postponement requests) get
                                // their own primary CTA. Without this, the
                                // amendment_requested row only shows a
                                // generic "Open" -- yesterday's quote-edit
                                // notifications had a coloured "Edit quote"
                                // button and Bobby noticed the regression.
                                //
                                // Fallback path: rows inserted before
                                // related_entity_* was wired up still match
                                // by notification_type so the CTA shows on
                                // historical amendment/cancellation rows.
                                const orderType = (notification.notification_type || "").toString();
                                const isOrderType =
                                  orderType === "amendment_requested" ||
                                  orderType === "cancellation_requested" ||
                                  orderType === "postponement_requested";
                                const isOrder =
                                  (notification.related_entity_type === "order" &&
                                    !!notification.related_entity_id) ||
                                  (isOrderType && !!notification.link);
                                const orderCtaLabel =
                                  orderType === "amendment_requested" ? "Review change" :
                                  orderType === "cancellation_requested" ? "Review cancellation" :
                                  orderType === "postponement_requested" ? "Review postponement" :
                                  "Open order";
                                return (
                                  <>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setExpandedIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(notification.id)) next.delete(notification.id);
                                            else next.add(notification.id);
                                            return next;
                                          });
                                        }}
                                      >
                                        {isExpanded ? (
                                          <><ChevronUp className="h-4 w-4 mr-1" /> Hide details</>
                                        ) : (
                                          <><ChevronDown className="h-4 w-4 mr-1" /> View details</>
                                        )}
                                      </Button>
                                      {isQuote && (
                                        <Button
                                          size="sm"
                                          className="bg-orange-600 hover:bg-orange-700"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            window.location.href =
                                              `/admin/quotes/new?fromQuoteId=${encodeURIComponent(notification.related_entity_id!)}`;
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          Edit quote
                                        </Button>
                                      )}
                                      {isOrder && (
                                        <Button
                                          size="sm"
                                          className="bg-orange-600 hover:bg-orange-700"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            // Prefer the deep link on the
                                            // notification (it carries the
                                            // amendment / cancellation
                                            // request id), fall back to the
                                            // bare order page when we only
                                            // have the related_entity_id.
                                            const fallback = notification.related_entity_id
                                              ? `/admin/orders?orderId=${encodeURIComponent(notification.related_entity_id)}`
                                              : "/admin/orders";
                                            window.location.href = notification.link || fallback;
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          {orderCtaLabel}
                                        </Button>
                                      )}
                                      {notification.link && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            window.location.href = notification.link!;
                                          }}
                                        >
                                          {isQuote ? (
                                            <><Eye className="h-4 w-4 mr-1" /> Open in list</>
                                          ) : isOrder ? (
                                            <><Eye className="h-4 w-4 mr-1" /> Open in list</>
                                          ) : (
                                            <><ExternalLink className="h-4 w-4 mr-1" /> Open</>
                                          )}
                                        </Button>
                                      )}
                                    </div>

                                    {/* Accordion intentionally does NOT
                                        repeat the message or the type --
                                        both are already visible above.
                                        It only surfaces the precise
                                        meta the inline header omits:
                                        full timestamp, full priority
                                        word, related-entity link. */}
                                    {isExpanded && (
                                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-slate-700">
                                          <div className="flex justify-between sm:block">
                                            <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                              Received
                                              <InfoTooltip content={"When the system created this notification. Shown in your local timezone, so the time matches what your clock said when the event happened."} />
                                            </dt>
                                            <dd className="font-medium sm:mt-0.5">
                                              {notification.created_at
                                                ? new Date(notification.created_at).toLocaleString("en-ZA", {
                                                    day: "2-digit", month: "short", year: "numeric",
                                                    hour: "2-digit", minute: "2-digit",
                                                  })
                                                : "Unknown"}
                                            </dd>
                                          </div>
                                          <div className="flex justify-between sm:block">
                                            <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                              Priority
                                              <InfoTooltip content={"How urgent the trigger flagged this when it fired.\n\n• Urgent: drop what you're doing, act now (e.g. driver replacement needed).\n• High: act soon. A client is waiting for a response.\n• Medium / Normal: informational, no immediate action required.\n• Low: background context.\n\nSet automatically by the rule that created the row, not manually editable here."} />
                                            </dt>
                                            <dd className="font-medium capitalize sm:mt-0.5">
                                              {notification.priority || "normal"}
                                            </dd>
                                          </div>
                                          {notification.related_entity_type && (
                                            <div className="flex justify-between sm:block">
                                              <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                                Related to
                                                <InfoTooltip content={"The kind of record this notification is about (quote, invoice, order, payment, etc.). Use the action buttons above (Edit quote / Open in list) to jump straight to the source record without searching for it."} />
                                              </dt>
                                              <dd className="font-medium capitalize sm:mt-0.5">
                                                {notification.related_entity_type}
                                              </dd>
                                            </div>
                                          )}
                                          <div className="flex justify-between sm:block">
                                            <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                              Status
                                              <InfoTooltip content={"Whether you've marked this notification as read. Read items stay in the list (so you don't lose context) but stop counting toward the bell's unread badge. Use the tick icon on the row, or 'Mark all read' at the top, to clear them."} />
                                            </dt>
                                            <dd className="font-medium sm:mt-0.5">
                                              {notification.is_read ? "Read" : "Unread"}
                                            </dd>
                                          </div>
                                        </dl>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
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