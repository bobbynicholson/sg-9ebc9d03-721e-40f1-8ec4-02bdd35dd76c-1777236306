/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Archive, Bell, Check, CheckCircle2, ChevronDown, Inbox, Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { notificationService, type Notification } from "@/services/notificationService";
import { WaiterPageShell, WAITER_HERO_CHIP } from "@/components/waiter/WaiterPageShell";
import { PortalCard, PortalOverview } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function WaiterNotificationsInner() {
  const router = useRouter();
  const { user, activeRole } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  // First successful load done: gates the hero chips and keeps the
  // last-good list on screen when a realtime refresh or retry fails.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [actingId, setActingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Alerts older than the stale cut-off fold away (closed by default) so
  // the recent ones are what the waiter sees first.
  const [showOlder, setShowOlder] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // throwOnError: the service swallows failures into an empty
        // array by default, which would paint a failed load as an
        // empty inbox. We want the recovery card instead.
        const rows = await notificationService.getNotifications(
          user.id,
          tab === "unread",
          activeRole,
          { limit: 100, throwOnError: true },
        );
        if (!cancelled) {
          setNotifications(rows);
          setLoadError(null);
          setLoaded(true);
        }
      } catch (e: any) {
        // Surface the failure as a recovery card below; never dress a
        // failed load up as an empty inbox.
        if (!cancelled) {
          setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, activeRole, tab, refreshKey]);

  useEffect(() => {
    if (!user?.id) return;
    // Service-owned channel: unique suffix + removeChannel cleanup live
    // inside subscribeToNotifications, this just returns its teardown.
    return notificationService.subscribeToNotifications(
      user.id,
      () => setRefreshKey((k) => k + 1),
      activeRole,
    );
  }, [user?.id, activeRole]);

  const visible = useMemo(
    () => Array.from(new Map(notifications.map((n) => [n.id, n])).values()),
    [notifications],
  );
  const unreadCount = visible.filter((n) => !n.is_read).length;
  const urgentUnreadCount = visible.filter((n) => {
    if (n.is_read) return false;
    const p = effectivePriority(n.priority ?? null, n.created_at);
    return p === "urgent" || p === "high";
  }).length;
  const recent = visible.filter((n) => !isStaleNotification(n.created_at));
  const older = visible.filter((n) => isStaleNotification(n.created_at));
  const staleCount = older.length;
  const olderUnread = older.filter((n) => !n.is_read).length;
  const chipsReady = loaded && !loadError;

  const openNotification = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await notificationService.markAsRead(n.id);
        setNotifications((prev) => prev.map((row) => row.id === n.id ? { ...row, is_read: true } : row));
      } catch { /* non-fatal, still open the link */ }
    }
    if (n.link) router.push(/^https?:\/\//i.test(n.link) ? n.link : withSlug(n.link));
  };

  const markRead = async (id: string) => {
    if (actingId) return;
    setActingId(id);
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch (e: any) {
      toast({ title: "Could not mark as read", description: e?.message, variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const deleteRow = async (id: string) => {
    if (actingId) return;
    setActingId(id);
    try {
      await notificationService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e: any) {
      toast({ title: "Could not delete notification", description: e?.message, variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const markAllRead = async () => {
    if (!user?.id || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      // No companyId filter: the page's own load isn't company-scoped,
      // so scoping the bulk write would leave the counts disagreeing.
      await notificationService.markAllAsRead(user.id, activeRole);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All marked as read" });
    } catch (e: any) {
      toast({ title: "Could not mark all as read", description: e?.message, variant: "destructive" });
    } finally {
      setMarkingAll(false);
    }
  };

  const renderRow = (n: Notification) => {
    const created = n.created_at ? new Date(n.created_at) : null;
    const ago = created ? formatDistanceToNow(created, { addSuffix: true }) : "";
    // Stale rows are downgraded, so an old "High" ping stops shouting.
    const priority = effectivePriority(n.priority ?? null, n.created_at);
    return (
      <li key={n.id}>
        <PortalCard
          padded={false}
          className={cn("p-4", !n.is_read && "border-l-4 border-l-brand-primary")}
        >
          <div className="flex items-start gap-3">
            {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-primary" />}
            <button
              type="button"
              onClick={() => openNotification(n)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={cn("text-sm text-slate-900 dark:text-white", n.is_read ? "font-medium" : "font-semibold")}>
                  {n.title}
                </h3>
                {(priority === "high" || priority === "urgent") && (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                    {priority}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{n.message}</p>
              <p className="mt-2 text-xs text-slate-400">{ago}</p>
            </button>
            <div className="flex shrink-0 flex-col gap-1">
              {!n.is_read && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => markRead(n.id)}
                  disabled={actingId === n.id}
                  className="h-7 w-7 text-slate-500"
                  title="Mark as read"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteRow(n.id)}
                disabled={actingId === n.id}
                className="h-7 w-7 text-rose-600"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </PortalCard>
      </li>
    );
  };

  return (
    <WaiterPageShell
      pageTitle="Notifications - Waiter Portal - CateringMS"
      heading="Notifications"
      subheading={
        chipsReady
          ? unreadCount > 0
            ? `${unreadCount} unread service update${unreadCount === 1 ? "" : "s"} waiting for you.`
            : "You're all caught up, nothing unread."
          : "Service assignments, event changes, and dispatch updates."
      }
      icon={Bell}
      headerAction={
        chipsReady && unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={markingAll}>
            <Check className="h-4 w-4 mr-2" />
            {markingAll ? "Marking..." : "Mark all read"}
          </Button>
        ) : undefined
      }
      meta={
        chipsReady ? (
          <>
            <span className={WAITER_HERO_CHIP}>
              <span className={cn("h-1.5 w-1.5 rounded-full", unreadCount > 0 ? "bg-rose-400" : "bg-emerald-400")} />
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </span>
            <span className={WAITER_HERO_CHIP}>
              <Inbox className="h-3 w-3" />
              {visible.length} loaded{tab === "unread" ? " (unread tab)" : ""}
            </span>
          </>
        ) : undefined
      }
      overview={
        loadError && !loaded ? undefined : (
          // Same inbox summary band as the kitchen and shopping portals.
          <PortalOverview
            eyebrow="Service inbox"
            title={
              loading && !loaded
                ? "Loading your alerts"
                : unreadCount > 0
                  ? "Start with the unread alerts, newest first"
                  : "Inbox clear, nothing needs a look"
            }
            description="New assignments and order changes for service staff land here. Open the linked order brief before you travel to the venue."
            items={[
              { label: "Unread", value: unreadCount, helper: unreadCount > 0 ? "Needs a look" : "All clear", icon: Bell, tone: unreadCount > 0 ? "danger" : "success" },
              { label: "Urgent", value: urgentUnreadCount, helper: "High-priority unread", icon: AlertCircle, tone: urgentUnreadCount > 0 ? "warning" : "neutral" },
              { label: "In inbox", value: visible.length, helper: tab === "unread" ? "Unread tab" : "Loaded alerts", icon: Inbox, tone: "neutral" },
              { label: "Stale", value: staleCount, helper: `Older than ${STALE_NOTIFICATION_DAYS} days`, icon: Archive, tone: "neutral" },
            ]}
            actions={
              <Button asChild size="sm" variant="outline">
                <Link href={withSlug("/team-portal/waiter/dashboard")}>Service today</Link>
              </Button>
            }
            splitCards
          />
        )
      }
    >
      <div className="space-y-4">
        {/* Recovery card: the load failed. Keep any last-good list
            below, but never render the empty state over a failure. */}
        {loadError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/60 dark:bg-rose-950/40">
            <h2 className="mb-1 text-base font-bold text-rose-900 dark:text-rose-200">Couldn&apos;t load your notifications</h2>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
            <Button
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
              className="bg-brand-primary text-white hover:opacity-90"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
              Retry
            </Button>
          </div>
        )}

        <div className="flex w-full gap-1 overflow-x-auto">
          <Button
            variant={tab === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("all")}
            className={cn("flex-1 justify-center min-w-[120px]", tab === "all" && "bg-brand-primary text-white hover:opacity-90")}
          >
            All
          </Button>
          <Button
            variant={tab === "unread" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("unread")}
            className={cn("flex-1 justify-center min-w-[120px]", tab === "unread" && "bg-brand-primary text-white hover:opacity-90")}
          >
            Unread
            {unreadCount > 0 && <span className="ml-1.5 rounded bg-white/20 px-1.5 text-[10px] tabular-nums">{unreadCount}</span>}
          </Button>
        </div>

        {loading ? (
          <PortalCard className="py-12 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
            <p className="mt-3 text-sm text-slate-500">Loading...</p>
          </PortalCard>
        ) : loadError && visible.length === 0 ? (
          // The recovery card above owns this state; keep the body quiet.
          <PortalCard className="py-10 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your alerts are unavailable right now. Use Retry above to reload them.
            </p>
          </PortalCard>
        ) : visible.length === 0 ? (
          <PortalCard className="py-12 text-center">
            <Bell className="mx-auto h-8 w-8 text-slate-300" />
            <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
              {tab === "unread" ? "Nothing unread" : "No notifications yet"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {tab === "unread" ? "You're all caught up." : "New service assignments and changes will appear here."}
            </p>
            {tab === "unread" && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setTab("all")}>
                  View all notifications
                </Button>
              </div>
            )}
          </PortalCard>
        ) : (
          <>
            {recent.length > 0 ? (
              <ul className="space-y-2">{recent.map(renderRow)}</ul>
            ) : (
              <PortalCard className="py-6 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nothing in the last {STALE_NOTIFICATION_DAYS} days.
                </p>
              </PortalCard>
            )}
            {older.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowOlder((v) => !v)}
                  aria-expanded={showOlder}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Archive className="h-4 w-4 text-slate-400" />
                    Older than {STALE_NOTIFICATION_DAYS} days ({older.length})
                    {olderUnread > 0 && (
                      <span className="text-xs font-medium text-slate-500">{olderUnread} unread</span>
                    )}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", showOlder && "rotate-180")} />
                </button>
                {showOlder && <ul className="space-y-2">{older.map(renderRow)}</ul>}
              </div>
            )}
          </>
        )}
      </div>
    </WaiterPageShell>
  );
}

export default function WaiterNotificationsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.WAITER,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <WaiterNotificationsInner />
    </ProtectedRoute>
  );
}
