import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Bell, Check, X, Clock, AlertCircle, CheckCircle } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { effectivePriority } from "@/lib/notificationDisplay";
import { useTenantHref } from "@/lib/tenantUrl";

/** Phase 7 #5: short emoji-free chime so an urgent notification
 *  doesn't get lost while the operator is heads-down in another
 *  tab. WebAudio so we don't ship an MP3 asset. Stays silent if
 *  the AudioContext can't be constructed (older Safari, locked
 *  autoplay policy) - toast still fires either way. */
function chime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 400);
  } catch {
    // Best-effort - silent failure is fine.
  }
}

// Module-level guard shared across every mounted NotificationBell. The
// responsive layout (PortalSidebar) mounts the bell up to THREE times
// (desktop / collapsed / mobile slots); each instance independently
// subscribes to realtime and would fire its own toast + chime for the
// same row, so one notification looked like it arrived two or three
// times. First instance to see an id toasts and records it here; the
// others skip. Short TTL so a genuinely re-sent id can alert again later.
const recentlyToasted = new Map<string, number>();
function claimToast(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentlyToasted) if (now - t > 30000) recentlyToasted.delete(k);
  if (recentlyToasted.has(id)) return false;
  recentlyToasted.set(id, now);
  return true;
}

export function NotificationBell() {
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { user, activeRole } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadNotifications();

    // Realtime: server pushes new rows targeting this recipient.
    // notificationService.subscribeToNotifications already handles the
    // role filter, so we just prepend the new row when it arrives.
    const unsubscribe = notificationService.subscribeToNotifications(
      user.id,
      (notification) => {
        setNotifications((prev) => {
          // Guard against the realtime channel re-firing the same row
          // (rare but happens on reconnects).
          if (prev.some((n) => n.id === notification.id)) return prev;
          return [notification, ...prev];
        });
        // Phase 7 #5: surface high-signal notifications immediately
        // so an admin watching another tab still notices a new urgent
        // item land. Medium / low stay quiet - the bell badge is
        // enough for those.
        const priority = (notification.priority || "").toLowerCase();
        if ((priority === "urgent" || priority === "high") && claimToast(notification.id)) {
          chime();
          toast({
            title: notification.title || "New notification",
            description: notification.message || undefined,
            variant: priority === "urgent" ? "destructive" : "default",
          });
        }
      },
      activeRole,
    );

    // Safety net: if a network blip drops the realtime channel, a slow
    // poll still catches up. 5 minutes is rare enough not to be costly,
    // frequent enough that no notification stays hidden for long.
    const interval = setInterval(loadNotifications, 5 * 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      
      // Combine, DEDUPE, then sort by date. getNotifications(userId, false)
      // returns ALL notifications (read + unread), not just read - so every
      // unread row also lands in readNotifs and would render twice. Keep the
      // first occurrence per id (unread list is first, so its copy wins).
      const seen = new Set<string>();
      const combined = [...unreadNotifs, ...readNotifs]
        .filter((n) => {
          if (!n.id) return true;
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        })
        .sort(
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
      // Links are stored WITHOUT the tenant slug (e.g.
      // "/team-portal/kitchen/prep-list", "/admin/quotes/{id}"). On a
      // slug-routed tenant a bare push lands on a non-tenant path that
      // 404s / bounces, so the click appeared to "do nothing". Route
      // through withSlug (no-op for absolute http links / already-slugged
      // paths) so every notification opens its target page.
      const href = notification.link;
      router.push(/^https?:\/\//i.test(href) ? href : withSlug(href));
    }
  };

  const handleViewAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);

    // Route to the right notifications page based on the actual
    // user_role enum values, not invented short forms. Previously
    // every admin variant except literal 'admin' (e.g. company_admin,
    // region_admin, sales_admin) and every team-portal staff role
    // (kitchen_staff, shopping_staff, cleaning_staff) fell through
    // to the client-portal default - which is why Bobby got bounced
    // to /client-portal/notifications when he clicked View all from
    // /admin/quotes. Match the canonical enum values:
    //   super_admin / company_admin / admin / region_admin / sales_admin → /admin
    //   kitchen_staff → /team-portal/kitchen
    //   shopping_staff → /team-portal/shopping
    //   cleaning_staff → /team-portal/cleaning
    //   driver        → /team-portal/driver
    //   anything else (client, undefined) → /client-portal
    const role = activeRole as string | null | undefined;
    const ADMIN_ROLES = new Set([
      "super_admin", "company_admin", "admin", "region_admin", "sales_admin",
    ]);
    if (role && ADMIN_ROLES.has(role)) {
      router.push(withSlug("/admin/notifications"));
    } else if (role === "driver") {
      router.push("/team-portal/driver/notifications");
    } else if (role === "kitchen_staff") {
      router.push("/team-portal/kitchen/notifications");
    } else if (role === "shopping_staff") {
      router.push("/team-portal/shopping/notifications");
    } else if (role === "cleaning_staff") {
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

  // Final safety net: render each id at most once, no matter how the
  // list got built (stale cached bundle, double fetch, realtime re-fire).
  // This is what actually guarantees the dropdown never shows a row twice.
  const visibleNotifications = Array.from(
    new Map(notifications.map((n) => [n.id, n])).values(),
  );
  const unreadCount = visibleNotifications.filter((n) => !n.is_read).length;

  if (!user) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
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
          ) : visibleNotifications.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-600">
              <div className="text-center">
                <Bell className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium mb-1">No notifications</p>
                <p className="text-sm text-slate-500">You're all caught up!</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {visibleNotifications.map((notification) => {
                // Wave 24: degrade displayed priority on stale rows so a
                // 19-day-old "URGENT" doesn't keep glowing red in the
                // dropdown header. Same shared helper the per-portal
                // notification pages use.
                const displayedPriority = effectivePriority(
                  notification.priority,
                  notification.created_at,
                );
                return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "relative px-4 py-3 transition-colors border-l-4 cursor-pointer",
                    !notification.is_read
                      ? "bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800",
                    getPriorityColor(displayedPriority)
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      {getPriorityIcon(displayedPriority)}
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
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {visibleNotifications.length > 0 && (
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
