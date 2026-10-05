import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, AlertCircle, AlertTriangle, Info, CheckCircle2, Archive, Inbox, RefreshCw } from "lucide-react";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
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
  id: string;
  user_id: string | null;
  recipient_id: string | null;
  target_role: string | null;
  type: string | null;
  notification_type: string | null;
  title: string | null;
  message: string | null;
  is_read: boolean | null;
  priority: string | null;
  link: string | null;
  action_url: string | null;
  created_at: string | null;
}

const priorityIcon = (p?: string | null) => {
  if (p === "critical" || p === "urgent" || p === "high") return AlertCircle;
  if (p === "medium" || p === "warning") return AlertTriangle;
  if (p === "success" || p === "low") return CheckCircle2;
  return Info;
};
const priorityTone = (p?: string | null) => {
  if (p === "critical" || p === "urgent" || p === "high") return "text-rose-500";
  if (p === "medium" || p === "warning") return "text-amber-500";
  if (p === "success") return "text-brand-primary";
  return "text-slate-400 dark:text-slate-500";
};

function CleaningNotificationsPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Command-centre standard: a failed primary read must render a
  // recovery card with Retry, never a quiet toast over an empty state.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");
  // Row-level mark-read in flight (blocks a double tap on the same row).
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Bulk action in flight (mark all / clear stale share one lane).
  const [bulkBusy, setBulkBusy] = useState<"markAll" | "clearStale" | null>(null);
  // Bumped by the realtime subscription so new notifications surface
  // without a manual refresh (admin + client portals already do this).
  const [refreshKey, setRefreshKey] = useState(0);

  // Slug-aware open: notification links are stored without the tenant slug,
  // so a bare href 404s. Marks the row read on the way out.
  const openLink = (n: Notification) => {
    const raw = n.link ?? n.action_url;
    if (!raw) return;
    if (!n.is_read) void markRead(n.id);
    window.location.href = /^https?:\/\//i.test(raw) ? raw : withSlug(raw);
  };

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.company_id, tab, refreshKey]);

  useEffect(() => {
    if (!user?.company_id) return;
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`cleaning-notifications-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `company_id=eq.${user.company_id}` },
        () => setRefreshKey((k) => k + 1),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.id || !user?.company_id) return;
    // Skeleton only before the first successful load; realtime-driven
    // refreshes swap the data in place without blanking the list.
    if (!loaded) setLoading(true);
    try {
      // Scope role-targeted broadcasts to what the VIEWER may see: a plain
      // cleaner must not receive manager-only dispatches. Managers/admins
      // oversee the crew so they see both role streams.
      const viewerRole = String((user as { role?: string }).role || "");
      const roleTargets =
        viewerRole === "cleaning_staff"
          ? ["cleaning_staff"]
          : ["cleaning_manager", "cleaning_staff"];
      const orClause = [
        `recipient_id.eq.${user.id}`,
        `user_id.eq.${user.id}`,
        ...roleTargets.map((r) => `target_role.eq.${r}`),
      ].join(",");
      let q = supabase
        .from("notifications")
        .select("*")
        .eq("company_id", user.company_id)
        .or(orClause)
        .order("created_at", { ascending: false })
        .limit(100);
      if (tab === "unread") q = q.eq("is_read", false);
      const { data, error } = await q.returns<Notification[]>();
      if (error) throw error;
      setNotifs(data || []);
      setLoadError(null);
      setLoaded(true);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "We couldn't reach the server. Check your connection and retry.");
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
    if (bulkBusy) return;
    const ids = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    if (!user?.company_id) return;
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

  // Wave 24: stale notification cleanup - mirrors the driver +
  // kitchen pattern. One-tap delete of anything older than the
  // shared STALE_NOTIFICATION_DAYS threshold.
  const staleCount = useMemo(
    () => visible.filter((n) => isStaleNotification(n.created_at)).length,
    [visible],
  );
  const onClearStale = async () => {
    if (staleCount === 0 || bulkBusy) return;
    if (!window.confirm(`Delete ${staleCount} notification${staleCount === 1 ? "" : "s"} older than ${STALE_NOTIFICATION_DAYS} days?`)) return;
    const stale = notifs.filter((n) => isStaleNotification(n.created_at));
    const ids = stale.map((n) => n.id);
    if (ids.length === 0) return;
    if (!user?.company_id) return;
    setBulkBusy("clearStale");
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("company_id", user.company_id)
        .in("id", ids);
      if (error) throw error;
      setNotifs((p) => p.filter((n) => !isStaleNotification(n.created_at)));
      toast({ title: `${stale.length} stale notification${stale.length === 1 ? "" : "s"} cleared` });
    } catch {
      toast({ title: "Could not clear stale notifications", variant: "destructive" });
    } finally {
      setBulkBusy(null);
    }
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <CleaningPageShell
      pageTitle="Cleaning notifications - CateringMS"
      heading="Notifications"
      subheading={
        chipsReady
          ? unread > 0
            ? `${unread} unread alert${unread === 1 ? "" : "s"} waiting for the cleaning team.`
            : "You're all caught up, nothing unread."
          : "Cleaning alerts, equipment returns, missing items."
      }
      icon={Bell}
      headerAction={
        <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      }
      meta={
        chipsReady ? (
          <>
            <span className={CLEANING_HERO_CHIP}>
              <span className={cn("h-1.5 w-1.5 rounded-full", unread > 0 ? "bg-rose-400" : "bg-emerald-400")} />
              {unread > 0 ? `${unread} unread` : "All read"}
            </span>
            <span className={CLEANING_HERO_CHIP}>
              <Inbox className="h-3 w-3" />
              {visible.length} in your inbox
            </span>
            {staleCount > 0 && (
              <span className={CLEANING_HERO_CHIP}>
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
          <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load your notifications</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
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

      <div className="flex gap-2 mb-4">
        <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")} className={tab === "all" ? "bg-brand-primary hover:bg-brand-primary/90" : ""}>All</Button>
        <Button variant={tab === "unread" ? "default" : "outline"} size="sm" onClick={() => setTab("unread")} className={tab === "unread" ? "bg-brand-primary hover:bg-brand-primary/90" : ""}>
          Unread {unread > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded text-[10px] tabular-nums">{unread}</span>}
        </Button>
      </div>

      <PortalCard padded={false}>
        {showSkeleton ? (
          <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading notifications">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse motion-reduce:animate-none flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                  <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError && visible.length === 0 ? (
          // The recovery card above owns this state; keep the card body quiet.
          <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Your alerts are unavailable right now. Use Retry above to reload them.
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 px-6 text-slate-500 dark:text-slate-400">
            <Bell className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="font-medium text-slate-900 dark:text-white">{tab === "unread" ? "No unread notifications" : "No notifications yet"}</p>
            <p className="text-sm mt-1">New alerts for you or the cleaning team will land here.</p>
            {tab === "unread" && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setTab("all")}>
                View all
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((n) => {
              // Wave 24: degrade displayed priority on stale rows.
              const displayedPriority = effectivePriority(n.priority, n.created_at);
              const Icon = priorityIcon(displayedPriority);
              const tone = priorityTone(displayedPriority);
              return (
                <li key={n.id} className={`p-4 flex items-start gap-3 ${n.is_read ? "bg-white dark:bg-transparent" : "bg-amber-50/50 dark:bg-amber-950/20"}`}>
                  <Icon className={`h-5 w-5 ${tone} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-slate-900 dark:text-white">{n.title ?? "Notification"}</div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0">{n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ""}</span>
                    </div>
                    {n.message && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {(n.type || n.notification_type) && (
                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{n.type ?? n.notification_type}</Badge>
                      )}
                      {!n.is_read && (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={pendingIds.has(n.id)} onClick={() => markRead(n.id)}>
                          <Check className="h-3 w-3 mr-1" />
                          {pendingIds.has(n.id) ? "Marking..." : "Mark read"}
                        </Button>
                      )}
                      {(n.link || n.action_url) && (
                        <button type="button" onClick={() => openLink(n)} className="text-[11px] text-brand-primary dark:text-brand-primary hover:underline">Open</button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PortalCard>
    </CleaningPageShell>
  );
}

export default function CleaningNotificationsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_MANAGER,
        UserRole.CLEANING_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CleaningNotificationsPageInner />
    </ProtectedRoute>
  );
}
