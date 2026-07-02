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
import { useRouter } from "next/router";
import { PortalCard, PortalOverview } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, AlertCircle, Trash2, Loader2, ExternalLink, Archive, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  high: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  normal: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  low: "bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-800",
};

function DriverNotificationsInner() {
  const router = useRouter();
  const { user, activeRole } = useAuth() as any;
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  // Kept alongside the toast so a failed fetch renders a Retry card in
  // the list area instead of masquerading as an empty inbox.
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError(null);
      try {
        const data = await notificationService.getNotifications(
          user.id,
          tab === "unread",
          activeRole,
          { limit: 100, throwOnError: true },
        );
        if (!cancelled) setNotifications(data);
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(e?.message || "Something went wrong fetching your notifications.");
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
    const staleIds = notifications
      .filter((n) => isStaleNotification(n.created_at))
      .map((n) => n.id);
    setActingId("__bulk__");
    try {
      // Single batched round trip (was a sequential await-per-row loop).
      // The helper returns the count Postgres actually deleted, so a
      // partial clear (RLS-blocked rows) is reported honestly instead
      // of pretending everything went.
      const deleted = await notificationService.deleteNotifications(staleIds);
      const failed = staleIds.length - deleted;
      if (failed > 0) {
        toast({
          title: `${deleted} cleared, ${failed} failed`,
          description: "Refreshing the list to match what's still stored.",
          variant: "destructive",
        });
        // Refetch the truth rather than guessing which rows survived.
        setRefreshKey((k) => k + 1);
      } else {
        const removed = new Set(staleIds);
        setNotifications((prev) => prev.filter((n) => !removed.has(n.id)));
        toast({ title: `${deleted} stale notification${deleted === 1 ? "" : "s"} cleared` });
      }
    } catch (e: any) {
      toast({
        title: "Couldn't clear stale notifications",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
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
      meta={
        !loading && !loadError ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              {unreadCount > 0 ? (
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75 motion-reduce:hidden" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              )}
              {unreadCount} unread
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              {visible.length} {tab === "unread" ? "unread shown" : `notification${visible.length === 1 ? "" : "s"}`}
            </span>
            {staleCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                {staleCount} stale
              </span>
            )}
          </>
        ) : undefined
      }
      overview={
        loadError ? undefined : (
        <PortalOverview
          eyebrow="Inbox"
          title={unreadCount > 0 ? "Handle unread dispatch updates first" : "No unread driver alerts"}
          description="This inbox is for dispatch changes, route updates, and customer-related alerts. Stale rows can be cleared so new day-of work stays visible."
          items={[
            { label: "Unread", value: unreadCount, helper: "Needs attention", icon: Bell, tone: unreadCount > 0 ? "danger" : "success" },
            { label: "Visible", value: visible.length, helper: tab === "unread" ? "Unread tab" : "All notifications", icon: ExternalLink, tone: "neutral" },
            { label: "Stale", value: staleCount, helper: `Older than ${STALE_NOTIFICATION_DAYS} days`, icon: Archive, tone: staleCount > 0 ? "warning" : "success" },
            { label: "Filter", value: tab === "unread" ? "Unread" : "All", helper: "Current view", icon: CheckCircle2, tone: "neutral" },
          ]}
        />
        )
      }
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
          ) : loadError ? (
            // Surfaced fetch failure with Retry; a failed load must not
            // masquerade as an empty inbox (same treatment as
            // /admin/driver-settlement's drivers-list recovery card).
            <div className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-500/30 dark:bg-slate-900">
              <h2 className="text-base font-bold text-rose-900 dark:text-rose-300 mb-1">Couldn&apos;t load notifications</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
              <Button
                onClick={() => setRefreshKey((k) => k + 1)}
                size="sm"
                className="bg-brand-primary hover:opacity-90 text-white"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <PortalCard className="py-12 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
                {tab === "unread" ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <Bell className="w-6 h-6" />}
              </span>
              <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
                {tab === "unread" ? "Nothing unread" : "No notifications yet"}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {tab === "unread"
                  ? "You're all caught up. Anything you've already read stays on the All tab."
                  : "When dispatch assigns a route, a delivery changes or a customer replies, it'll land here."}
              </p>
              {tab === "unread" && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setTab("all")}>
                  View all notifications
                </Button>
              )}
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
                          : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
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

// Defense-in-depth, matching every other page in the audit programme:
// the page previously relied purely on `useAuth().user` for fetching,
// so a logged-in non-driver hitting the URL rendered an empty inbox
// instead of getting bounced. Admin roles are admitted for support /
// cross-tenant troubleshooting (same allow-list as the driver dashboard).
export default function DriverNotificationsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.DRIVER, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DriverNotificationsInner />
    </ProtectedRoute>
  );
}
