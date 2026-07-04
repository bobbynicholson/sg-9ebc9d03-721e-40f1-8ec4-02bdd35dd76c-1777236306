import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCircle2, Archive, Inbox, RefreshCw } from "lucide-react";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";
import { useTenantHref } from "@/lib/tenantUrl";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

interface Notification {
  id: string; user_id: string | null; recipient_id: string | null; target_role: string | null;
  type: string | null; notification_type: string | null; title: string | null; message: string | null;
  is_read: boolean | null; priority: string | null; link: string | null; action_url: string | null;
  created_at: string | null;
}

// Restrained palette: the row icon is always a neutral slate bell. Severity
// is carried by one small dot, and only where it's genuinely meaningful
// (critical / warning / success). Anything informational stays neutral -
// no decorative blue, no rainbow of tinted halos. priorityTone drives just
// that small dot.
const priorityTone = (p?: string | null) => {
  if (p === "critical" || p === "urgent" || p === "high") return "bg-rose-500";
  if (p === "medium" || p === "warning") return "bg-amber-500";
  if (p === "success") return "bg-brand-primary";
  return null; // informational, no dot, stays neutral
};

function ShoppingNotificationsPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");
  // Row-level mark-read in flight (blocks a double tap on the same row).
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Bulk action in flight (mark all / clear stale share one lane).
  const [bulkBusy, setBulkBusy] = useState<"markAll" | "clearStale" | null>(null);
  // Bumped by the realtime subscription so new notifications surface
  // without a manual refresh (admin + client portals already do this).
  const [refreshKey, setRefreshKey] = useState(0);

  // Slug-aware open: links are stored without the tenant slug, so a bare
  // href 404s. Marks the row read on the way out and waits for the write
  // so navigation can't cancel it mid-flight.
  const openLink = async (n: Notification) => {
    const raw = n.link ?? n.action_url;
    if (!raw) return;
    if (!n.is_read) await markRead(n.id);
    window.location.href = /^https?:\/\//i.test(raw) ? raw : withSlug(raw);
  };

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.company_id, tab, refreshKey]);

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    // The list shows rows matched by recipient_id OR user_id OR
    // target_role=shopping_staff (see load()), but the sub previously
    // only fired on recipient_id inserts - so a role-targeted or
    // user_id-targeted notification (the common case for team broadcasts)
    // never refreshed live. Subscribe on company_id instead: every
    // notification for this company nudges a refresh and load() re-applies
    // the who-can-see-it filter. Unique per-mount suffix per the repo's
    // channel-reuse rule.
    const channel = supabase
      .channel(`notif-page-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `company_id=eq.${user.company_id}` },
        () => setRefreshKey((k) => k + 1),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, user?.company_id]);

  const load = async () => {
    if (!user?.id || !user?.company_id) return;
    // Skeleton only before the first successful load; tab switches and
    // realtime refreshes swap the data in place without blanking the list.
    if (!loaded) setLoading(true);
    try {
      let q = supabase
        .from("notifications")
        .select("*")
        .eq("company_id", user.company_id)
        .or(`recipient_id.eq.${user.id},user_id.eq.${user.id},target_role.eq.shopping_staff`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (tab === "unread") q = q.eq("is_read", false);
      const { data, error } = await q.returns<Notification[]>();
      if (error) throw error;
      setNotifs(data || []);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Surface the failure as a recovery card; never render the
      // "all caught up" empty state over a failed load.
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    if (!user?.company_id || pendingIds.has(id)) return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", user.company_id);
      if (error) throw error;
      setNotifs((p) => p.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch {
      toast({ title: "Could not mark read", variant: "destructive" });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const markAllRead = async () => {
    if (!user?.company_id || bulkBusy) return;
    const ids = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    setBulkBusy("markAll");
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("company_id", user.company_id)
        .in("id", ids);
      if (error) throw error;
      setNotifs((p) => p.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All marked as read" });
    } catch {
      toast({ title: "Could not mark all read", variant: "destructive" });
    } finally {
      setBulkBusy(null);
    }
  };

  // Render-level dedupe by id (matches the admin bell + page guarantee).
  const visible = useMemo(
    () => Array.from(new Map(notifs.map((n) => [n.id, n])).values()),
    [notifs],
  );
  const unread = useMemo(() => visible.filter((n) => !n.is_read).length, [visible]);

  // Wave 24: stale notification cleanup - mirrors the driver,
  // kitchen and cleaning portals.
  const staleCount = useMemo(
    () => notifs.filter((n) => isStaleNotification(n.created_at)).length,
    [notifs],
  );
  const onClearStale = async () => {
    if (staleCount === 0 || bulkBusy || !user?.company_id) return;
    if (!window.confirm(`Delete ${staleCount} notification${staleCount === 1 ? "" : "s"} older than ${STALE_NOTIFICATION_DAYS} days?`)) return;
    const ids = notifs.filter((n) => isStaleNotification(n.created_at)).map((n) => n.id);
    if (ids.length === 0) return;
    setBulkBusy("clearStale");
    try {
      // Server first, then prune local state: a delete is not worth an
      // optimistic flash that has to be rolled back.
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("company_id", user.company_id)
        .in("id", ids);
      if (error) throw error;
      const idSet = new Set(ids);
      setNotifs((p) => p.filter((n) => !idSet.has(n.id)));
      toast({ title: `${ids.length} stale notification${ids.length === 1 ? "" : "s"} cleared` });
    } catch {
      toast({ title: "Could not clear stale notifications", variant: "destructive" });
    } finally {
      setBulkBusy(null);
    }
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <ShoppingPageShell
      pageTitle="Shopping notifications - CateringMS"
      heading="Notifications"
      subheading={
        chipsReady
          ? unread > 0
            ? `${unread} unread alert${unread === 1 ? "" : "s"} waiting for the shopping team.`
            : "You're all caught up, nothing unread."
          : "Stock alerts, supplier updates and purchase requests."
      }
      icon={Bell}
      headerAction={
        <>
          {chipsReady && staleCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearStale}
              disabled={bulkBusy !== null}
              title={`Delete notifications older than ${STALE_NOTIFICATION_DAYS} days`}
            >
              <Archive className="h-4 w-4 mr-2" />
              {bulkBusy === "clearStale" ? "Clearing..." : `Clear stale (${staleCount})`}
            </Button>
          )}
          {chipsReady && unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={bulkBusy !== null}>
              <Check className="h-4 w-4 mr-2" />
              {bulkBusy === "markAll" ? "Marking..." : "Mark all read"}
            </Button>
          )}
        </>
      }
      meta={
        chipsReady ? (
          <>
            <span className={SHOPPING_HERO_CHIP}>
              <span className={cn("h-1.5 w-1.5 rounded-full", unread > 0 ? "bg-rose-400" : "bg-emerald-400")} />
              {unread > 0 ? `${unread} unread` : "All read"}
            </span>
            <span className={SHOPPING_HERO_CHIP}>
              <Inbox className="h-3 w-3" />
              {visible.length} in view
            </span>
            {staleCount > 0 && (
              <span className={SHOPPING_HERO_CHIP}>
                <Archive className="h-3 w-3" />
                {staleCount} stale
              </span>
            )}
          </>
        ) : undefined
      }
    >
      {/* Recovery card: the load failed. Keep any last-good list below,
          but never dress a failure up as an empty inbox. */}
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
          <h2 className="mb-1 text-base font-bold text-rose-900 dark:text-rose-200">Couldn&apos;t load your notifications</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
          <Button
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="bg-brand-primary hover:opacity-90 text-white"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
            Retry
          </Button>
        </div>
      )}

      {/* Filter pills: amber fill marks the active tab (selection state),
          everything else stays neutral. The unread count rides the pill. */}
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Filter notifications">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          onClick={() => setTab("all")}
          className={`h-8 px-3.5 rounded-lg text-sm font-medium transition-[color,background-color,border-color] duration-150 ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
            tab === "all"
              ? "bg-brand-primary text-white"
              : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "unread"}
          onClick={() => setTab("unread")}
          className={`h-8 px-3.5 rounded-lg text-sm font-medium inline-flex items-center transition-[color,background-color,border-color] duration-150 ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
            tab === "unread"
              ? "bg-brand-primary text-white"
              : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          Unread
          {unread > 0 && (
            <span
              className={`ml-1.5 px-1.5 rounded text-[10px] tabular-nums ${
                tab === "unread" ? "bg-white/20 text-white" : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
              }`}
            >
              {unread}
            </span>
          )}
        </button>
      </div>

      <PortalCard padded={false} className="overflow-hidden">
        {showSkeleton ? (
          // Skeleton rows, not a spinner: the layout holds its shape while
          // data loads. Opacity-only pulse is reduced-motion safe.
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="p-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="h-3.5 w-1/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                    <div className="h-3 w-12 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                  </div>
                  <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                </div>
              </li>
            ))}
          </ul>
        ) : loadError && visible.length === 0 ? (
          // The recovery card above owns this state; keep the card body quiet.
          <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Your alerts are unavailable right now. Use Retry above to reload them.
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center px-6 py-16">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {tab === "unread" ? "You're all caught up" : "No notifications yet"}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              {tab === "unread"
                ? "Every alert has been read. New stock, supplier and purchase alerts will land here."
                : "Stock alerts, supplier updates and purchase requests for the shopping team will appear here."}
            </p>
            {tab === "unread" && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setTab("all")}>
                  View all
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((n) => {
              // Wave 24: degrade displayed priority on stale rows.
              const displayedPriority = effectivePriority(n.priority, n.created_at);
              const dot = priorityTone(displayedPriority);
              return (
                <li
                  key={n.id}
                  className={`relative p-4 sm:p-5 flex items-start gap-3 transition-colors duration-150 ${
                    n.is_read
                      ? "bg-white dark:bg-slate-900"
                      : "bg-amber-50/60 dark:bg-amber-500/[0.06]"
                  }`}
                >
                  {/* Unread marker: a single amber dot, not a heavy fill. */}
                  {!n.is_read && (
                    <span
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-amber-500"
                      aria-label="Unread"
                    />
                  )}
                  {/* Neutral icon tile - no per-severity tinted halo. */}
                  <div className="relative h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center flex-shrink-0">
                    <Bell className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    {/* Severity dot only where it's genuinely meaningful. */}
                    {dot && (
                      <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${dot}`} aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{n.title ?? "Notification"}</div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0 tabular-nums">{n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ""}</span>
                    </div>
                    {n.message && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      {(n.type || n.notification_type) && (
                        <span className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">{n.type ?? n.notification_type}</span>
                      )}
                      {!n.is_read && (
                        <button
                          type="button"
                          onClick={() => void markRead(n.id)}
                          disabled={pendingIds.has(n.id)}
                          className="inline-flex items-center text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors duration-150 disabled:opacity-60"
                        >
                          <Check className="h-3 w-3 mr-1" />{pendingIds.has(n.id) ? "Marking..." : "Mark read"}
                        </button>
                      )}
                      {(n.link || n.action_url) && (
                        <button
                          type="button"
                          onClick={() => void openLink(n)}
                          disabled={pendingIds.has(n.id)}
                          className="text-[11px] font-medium text-brand-primary dark:text-brand-primary hover:text-brand-primary/80 dark:hover:text-brand-primary/80 transition-colors duration-150 disabled:opacity-60"
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PortalCard>
    </ShoppingPageShell>
  );
}

export default function ShoppingNotificationsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ShoppingNotificationsPageInner />
    </ProtectedRoute>
  );
}
