/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /team-portal/driver/notifications
 *
 * The bell -> "View all" target for drivers. Was a static placeholder
 * card; now lists the real notifications a driver receives - shift
 * confirms, route changes, dispatch nudges, customer-replied alerts.
 *
 * Same notificationService as the other portals so the bell badge
 * count and this list never disagree. Click a row to mark it read +
 * navigate to the linked entity (assignment, route, message thread).
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { PortalCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, AlertCircle, Trash2, Loader2, ExternalLink, Archive } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { useTenantHref } from "@/lib/tenantUrl";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  high: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  normal: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  low: "bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-800",
};

export default function DriverNotificationsPage() {
  const router = useRouter();
  const { user, activeRole } = useAuth() as any;
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [actingId, setActingId] = useState<string | null>(null);
  // Bumped by the realtime subscription so new notifications surface
  // without a manual refresh (admin + client portals already do this).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await notificationService.getNotifications(
          user.id,
          tab === "unread",
          activeRole,
          { limit: 100 },
        );
        if (!cancelled) setNotifications(data);
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: "Couldn't load notifications",
            description: e?.message || "Try again in a moment.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, activeRole, tab, toast, refreshKey]);

  // Realtime: re-fetch when a notification lands for this driver.
  useEffect(() => {
    if (!user?.id) return;
    const unsub = notificationService.subscribeToNotifications(
      user.id,
      () => setRefreshKey((k) => k + 1),
      activeRole,
    );
    return unsub;
  }, [user?.id, activeRole]);

  // Render-level dedupe by id (matches the admin bell + page guarantee).
  const visible = useMemo(
    () => Array.from(new Map(notifications.map((n) => [n.id, n])).values()),
    [notifications],
  );
  const unreadCount = useMemo(
    () => visible.filter((n) => !n.is_read).length,
    [visible],
  );

  const onClickRow = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await notificationService.markAsRead(n.id);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
        );
      } catch { /* non-fatal */ }
    }
    if (n.link) router.push(/^https?:\/\//i.test(n.link) ? n.link : withSlug(n.link));
  };

  const onMarkRead = async (id: string) => {
    setActingId(id);
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } finally { setActingId(null); }
  };

  const onDelete = async (id: string) => {
    setActingId(id);
    try {
      await notificationService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } finally { setActingId(null); }
  };

  const onMarkAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    try {
      await notificationService.markAllAsRead(user.id, activeRole);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All caught up" });
    } catch (e: any) {
      toast({
        title: "Couldn't mark all read",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  // Wave 24: bulk-clear stale notifications (older than the shared
  // STALE_NOTIFICATION_DAYS threshold). Live tenants accumulate test /
  // one-off rows that never get triaged - the inbox fills with
  // months-old urgents that the driver ignores, which trains them to
  // ignore real ones too. One-tap archive keeps the bell honest.
  const staleCount = useMemo(
    () => notifications.filter((n) => isStaleNotification(n.created_at)).length,
    [notifications],
  );

  const onClearStale = async () => {
    if (staleCount === 0) return;
    if (!window.confirm(`Delete ${staleCount} notification${staleCount === 1 ? "" : "s"} older than ${STALE_NOTIFICATION_DAYS} days?`)) return;
    const stale = notifications.filter((n) => isStaleNotification(n.created_at));
    setActingId("__bulk__");
    try {
      for (const n of stale) {
        try { await notificationService.deleteNotification(n.id); } catch { /* keep going */ }
      }
      setNotifications((prev) => prev.filter((n) => !isStaleNotification(n.created_at)));
      toast({ title: `${stale.length} stale notification${stale.length === 1 ? "" : "s"} cleared` });
    } finally {
      setActingId(null);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {staleCount > 0 && (
        <Button
          variant="outline"
          onClick={onClearStale}
          size="sm"
          disabled={actingId === "__bulk__"}
          title="Delete notifications older than 14 days"
        >
          <Archive className="w-4 h-4 mr-2" />
          Clear stale ({staleCount})
        </Button>
      )}
      {unreadCount > 0 && (
        <Button variant="outline" onClick={onMarkAllRead} size="sm">
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Mark all read
        </Button>
      )}
    </div>
  );

  return (
    <DriverPageShell
      pageTitle="Notifications - Driver Portal"
      heading="Notifications"
      subheading="Dispatch alerts, route changes, customer messages."
      icon={Bell}
      width="full"
      headerAction={headerActions}
    >
      <div className="space-y-4">
          <div className="flex w-full gap-1 overflow-x-auto mb-4">
            <Button
              variant={tab === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("all")}
              className={cn("flex-1 justify-center min-w-[120px] whitespace-nowrap", tab === "all" && "bg-brand-primary hover:opacity-90 text-white")}
            >
              All
            </Button>
            <Button
              variant={tab === "unread" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("unread")}
              className={cn("flex-1 justify-center min-w-[120px] whitespace-nowrap", tab === "unread" && "bg-brand-primary hover:opacity-90 text-white")}
            >
              Unread
              {unreadCount > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded text-[10px] tabular-nums">{unreadCount}</span>}
            </Button>
          </div>

          {loading ? (
            <PortalCard className="py-12 text-center">
              <Loader2 className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">Loading...</p>
            </PortalCard>
          ) : visible.length === 0 ? (
            <PortalCard className="py-12 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                <Bell className="w-6 h-6" />
              </span>
              <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
                {tab === "unread" ? "Nothing unread" : "No notifications yet"}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {tab === "unread"
                  ? "You're all caught up."
                  : "When dispatch assigns a route or a customer messages, it'll land here."}
              </p>
            </PortalCard>
          ) : (
            <ul className="space-y-2">
              {visible.map((n) => {
                const created = n.created_at ? new Date(n.created_at) : null;
                const ago = created ? formatDistanceToNow(created, { addSuffix: true }) : "";
                // Wave 24: degrade displayed priority on stale rows so
                // a 19-day-old "URGENT" doesn't keep shouting.
                const displayedPriority = effectivePriority(n.priority as string | null, n.created_at);
                const tone = PRIORITY_TONE[displayedPriority] || PRIORITY_TONE.normal;
                const isUrgent = displayedPriority === "urgent" || displayedPriority === "high";
                return (
                  <li key={n.id}>
                    <PortalCard
                      padded={false}
                      className={`w-full p-4 ${
                        n.is_read
                          ? ""
                          : "border-brand-primary/40 bg-brand-primary/5 dark:bg-brand-primary/10"
                      }`}
                    >
                        <div className="flex items-start gap-3">
                          {!n.is_read && (
                            <div className="w-2 h-2 mt-2 rounded-full bg-brand-primary flex-shrink-0" />
                          )}
                          <div
                            className={`flex-1 min-w-0 ${n.link ? "cursor-pointer" : ""}`}
                            onClick={() => onClickRow(n)}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {isUrgent && <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />}
                              <h3 className={`text-sm sm:text-base text-slate-900 dark:text-white ${
                                n.is_read ? "font-medium" : "font-semibold"
                              }`}>{n.title}</h3>
                              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${tone}`}>
                                {displayedPriority}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <p className="text-xs text-slate-400 dark:text-slate-500">{ago}</p>
                              {n.link && (
                                <span className="text-xs text-brand-primary hover:opacity-80 inline-flex items-center gap-1 font-medium">
                                  <ExternalLink className="w-3 h-3" />
                                  Tap to open
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            {!n.is_read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                                disabled={actingId === n.id}
                                title="Mark as read"
                                className="h-7 w-7 text-slate-500 dark:text-slate-400"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                              disabled={actingId === n.id}
                              title="Delete"
                              className="h-7 w-7 text-rose-600 hover:text-rose-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                    </PortalCard>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </DriverPageShell>
  );
}
