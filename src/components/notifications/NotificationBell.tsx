import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Bell, Check, X, Clock, AlertCircle, CheckCircle, ChevronRight } from "lucide-react";
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

  // Soft tinted icon chip per priority - replaces the old heavy
  // left-border bar. Each row gets a rounded icon "coin" whose tint
  // signals urgency without shouting.
  const getPriorityIcon = (priority: string | null) => {
    switch (priority) {
      case "urgent":
      case "high":
        return <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />;
      case "medium":
        return <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      default:
        return <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400" />;
    }
  };

  const getPriorityIconBg = (priority: string | null) => {
    switch (priority) {
      case "urgent":
      case "high":
        return "bg-rose-50 dark:bg-rose-950/40";
      case "medium":
        return "bg-amber-50 dark:bg-amber-950/40";
      default:
        return "bg-slate-100 dark:bg-slate-800";
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
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-brand-primary text-white text-xs border-transparent"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        collisionPadding={12}
        avoidCollisions
        className={cn(
          // Opens to the RIGHT of the bell so it sits clear of the sidebar.
          // Strong shadow + rounded corners + ring so it reads as a distinct
          // floating panel hovering above the dashboard, not something laid
          // flat over the content. overflow-hidden keeps the rounded corners
          // clean against the header / footer fills.
          "w-[calc(100vw-1.5rem)] max-w-[420px] sm:w-[420px] p-0 overflow-hidden",
          "rounded-2xl border border-slate-200/80 dark:border-slate-700/70",
          "shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
        )}
        sideOffset={10}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10">
              <Bell className="h-4 w-4 text-brand-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-none">
                Notifications
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                {unreadCount > 0
                  ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
                  : "You're all caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-7 flex-shrink-0 text-xs text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <ScrollArea className="h-[420px] bg-slate-50/60 dark:bg-slate-950/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Clock className="h-7 w-7 mb-3 animate-pulse text-slate-400" />
              <p className="text-sm">Loading notifications...</p>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10 mb-4">
                <Bell className="h-7 w-7 text-brand-primary" />
              </div>
              <p className="font-semibold text-slate-900 dark:text-white mb-1">No notifications</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">You're all caught up.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
                    "group relative flex gap-3 px-4 py-3.5 cursor-pointer transition-colors",
                    !notification.is_read
                      ? "bg-white hover:bg-brand-primary/[0.04] dark:bg-slate-900 dark:hover:bg-brand-primary/10"
                      : "hover:bg-white dark:hover:bg-slate-900/60",
                  )}
                >
                  {/* Unread accent rail */}
                  {!notification.is_read && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-primary" />
                  )}

                  {/* Priority icon coin */}
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                      getPriorityIconBg(displayedPriority),
                    )}
                  >
                    {getPriorityIcon(displayedPriority)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        className={cn(
                          "text-[13px] leading-snug pr-1",
                          !notification.is_read
                            ? "font-semibold text-slate-900 dark:text-white"
                            : "font-medium text-slate-600 dark:text-slate-300",
                        )}
                      >
                        {notification.title}
                      </h4>
                      {/* Row actions - hidden until hover so the row stays calm */}
                      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Mark as read"
                            className="h-6 w-6 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/10"
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Dismiss"
                          className="h-6 w-6 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          onClick={(e) => handleDelete(notification.id, e)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {notification.message}
                    </p>

                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span className="whitespace-nowrap">
                        {formatDistanceToNow(new Date(notification.created_at || ""), {
                          addSuffix: true,
                        })}
                      </span>
                      {notification.notification_type && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 capitalize truncate">
                          {notification.notification_type.replace(/_/g, " ")}
                        </span>
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
          <div className="border-t border-slate-100 dark:border-slate-800 p-2 bg-white dark:bg-slate-950">
            <Button
              variant="ghost"
              className="w-full h-9 text-sm font-medium text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary"
              onClick={handleViewAll}
            >
              View all notifications
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
