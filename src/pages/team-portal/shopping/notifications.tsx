import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCircle2, Archive } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";

interface Notification {
  id: string; user_id: string | null; recipient_id: string | null; target_role: string | null;
  type: string | null; notification_type: string | null; title: string | null; message: string | null;
  is_read: boolean | null; priority: string | null; link: string | null; action_url: string | null;
  created_at: string | null;
}

// Restrained palette: the row icon is always a neutral slate bell. Severity
// is carried by one small dot, and only where it's genuinely meaningful
// (critical / warning / success). Anything informational stays neutral -
// no decorative blue, no rainbow of tinted halos. priorityTone is kept (the
// brief asks to preserve it) and now drives just that small dot.
const priorityTone = (p?: string | null) => {
  if (p === "critical" || p === "urgent" || p === "high") return "bg-rose-500";
  if (p === "medium" || p === "warning") return "bg-amber-500";
  if (p === "success") return "bg-emerald-500";
  return null; // informational → no dot, stays neutral
};

export default function ShoppingNotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  // Bumped by the realtime subscription so new notifications surface
  // without a manual refresh (admin + client portals already do this).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { if (user?.id) load(); }, [user?.id, tab, refreshKey]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-page-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => setRefreshKey((k) => k + 1),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id]);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let q = supabase
        .from("notifications")
        .select("*")
        .or(`recipient_id.eq.${user.id},user_id.eq.${user.id},target_role.eq.shopping_staff`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (tab === "unread") q = q.eq("is_read", false);
      const { data, error } = await q.returns<Notification[]>();
      if (error) throw error;
      setNotifs(data || []);
    } catch {
      toast({ title: "Could not load notifications", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
      setNotifs((p) => p.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch { toast({ title: "Could not mark read", variant: "destructive" }); }
  };
  const markAllRead = async () => {
    const ids = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    try {
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", ids);
      setNotifs((p) => p.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All marked as read" });
    } catch { toast({ title: "Could not mark all read", variant: "destructive" }); }
  };

  const unread = useMemo(() => notifs.filter((n) => !n.is_read).length, [notifs]);

  // Wave 24: stale notification cleanup - mirrors the driver,
  // kitchen and cleaning portals.
  const staleCount = useMemo(
    () => notifs.filter((n) => isStaleNotification(n.created_at)).length,
    [notifs],
  );
  const onClearStale = async () => {
    if (staleCount === 0) return;
    if (!window.confirm(`Delete ${staleCount} notification${staleCount === 1 ? "" : "s"} older than ${STALE_NOTIFICATION_DAYS} days?`)) return;
    const stale = notifs.filter((n) => isStaleNotification(n.created_at));
    try {
      const ids = stale.map((n) => n.id);
      if (ids.length === 0) return;
      await supabase.from("notifications").delete().in("id", ids);
      setNotifs((p) => p.filter((n) => !isStaleNotification(n.created_at)));
      toast({ title: `${stale.length} stale notification${stale.length === 1 ? "" : "s"} cleared` });
    } catch {
      toast({ title: "Could not clear stale notifications", variant: "destructive" });
    }
  };

  return (
    <>
      <Head><title>Shopping notifications - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            icon={Bell}
            title={
              <span className="inline-flex items-center gap-2">
                Shopping notifications
                <InfoTooltip content="Alerts sent to you directly, plus anything addressed to the shopping team as a whole." />
              </span>
            }
            subtitle="Stock alerts, supplier updates, purchase requests"
            actions={
              <>
                {staleCount > 0 && (
                  <Button variant="outline" size="sm" onClick={onClearStale} title={`Delete notifications older than ${STALE_NOTIFICATION_DAYS} days`} className="rounded-lg">
                    <Archive className="h-4 w-4 mr-2" />
                    Clear stale ({staleCount})
                  </Button>
                )}
                {unread > 0 && (
                  <Button onClick={markAllRead} size="sm" className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white">
                    <Check className="h-4 w-4 mr-2" />Mark all read
                  </Button>
                )}
              </>
            }
          />

          {/* Filter pills: amber fill marks the active tab (selection state),
              everything else stays neutral. The unread count rides the pill. */}
          <div className="flex gap-2 mb-4" role="tablist" aria-label="Filter notifications">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "all"}
              onClick={() => setTab("all")}
              className={`h-8 px-3.5 rounded-lg text-sm font-medium transition-[color,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
                tab === "all"
                  ? "bg-amber-600 text-white"
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
              className={`h-8 px-3.5 rounded-lg text-sm font-medium inline-flex items-center transition-[color,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
                tab === "unread"
                  ? "bg-amber-600 text-white"
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
            {loading ? (
              // Skeleton rows, not a spinner: the layout holds its shape while
              // data loads. Opacity-only pulse is reduced-motion safe.
              <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="p-4 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-3.5 w-1/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        <div className="h-3 w-12 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                      </div>
                      <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : notifs.length === 0 ? (
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
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {notifs.map((n) => {
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
                              onClick={() => markRead(n.id)}
                              className="inline-flex items-center text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors duration-150"
                            >
                              <Check className="h-3 w-3 mr-1" />Mark read
                            </button>
                          )}
                          {(n.link || n.action_url) && (
                            <a href={n.link ?? n.action_url ?? "#"} className="text-[11px] font-medium text-amber-700 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 transition-colors duration-150">Open</a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </PortalCard>
        </PortalShell>
      </div>
    </>
  );
}
