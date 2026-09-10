import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, AlertCircle, Info, CheckCircle2, Archive, Inbox, RefreshCw } from "lucide-react";
import { KitchenPageShell, KITCHEN_HERO_CHIP } from "@/components/kitchen/KitchenPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS, type DisplayPriority } from "@/lib/notificationDisplay";
import { PortalCard, PortalOverview } from "@/components/portal/ui";
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
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string | null;
}

// effectivePriority only ever returns urgent/high/normal/low, so the
// icon + tone maps stay on that domain. Status colours are semantic
// (rose = needs a look now), never tenant-brand.
const priorityIcon = (p: DisplayPriority) => {
  if (p === "urgent" || p === "high") return AlertCircle;
  if (p === "low") return CheckCircle2;
  return Info;
};
const priorityTone = (p: DisplayPriority) => {
  if (p === "urgent" || p === "high") return "text-rose-500";
  if (p === "low") return "text-slate-300 dark:text-slate-600";
  return "text-slate-400 dark:text-slate-500";
};

// Same audience filter as useKitchenLiveCounts (the nav badge): rows
// addressed to me directly (recipient_id is the RLS column, user_id is
// the legacy addressee) or broadcast to the kitchen roles. Keep the two
// in lockstep or the badge and this page disagree.
const kitchenAudienceFilter = (userId: string) =>
  `recipient_id.eq.${userId},user_id.eq.${userId},target_role.eq.kitchen_staff,target_role.eq.kitchen_manager`;

function KitchenNotificationsPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  // Two windows, one load: the latest 100 rows (the inbox) plus the
  // latest 100 unread rows. The second query exists so an unread alert
  // that has scrolled past the newest-100 window still surfaces here
  // and the unread count stays honest against the nav badge, which
  // counts ALL unread (useKitchenLiveCounts). Everything the page
  // renders (list, tabs, chips, overview tiles) derives from the merge
  // of these two arrays, so no number on this page can drift from the
  // list below it.
  const [rows, setRows] = useState<Notification[]>([]);
  const [unreadRows, setUnreadRows] = useState<Notification[]>([]);
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

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    void load();
    // Tab switches are client-side filters over the loaded arrays, so
    // `tab` is deliberately not a dependency (no refetch per toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.company_id, refreshKey]);

  useEffect(() => {
    if (!user?.company_id) return;
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`kitchen-notifications-${user.company_id}-${Math.random().toString(36).slice(2)}`)
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
    const uid = user.id;
    const companyId = user.company_id;
    // Skeleton only before the first successful load; realtime-driven
    // refreshes swap the data in place without blanking the list.
    if (!loaded) setLoading(true);
    try {
      const base = () =>
        supabase
          .from("notifications")
          .select("*")
          .eq("company_id", companyId)
          .or(kitchenAudienceFilter(uid))
          .order("created_at", { ascending: false })
          .limit(100);
      const [allRes, unreadRes] = await Promise.all([
        base().returns<Notification[]>(),
        base().eq("is_read", false).returns<Notification[]>(),
      ]);
      if (allRes.error) throw allRes.error;
      if (unreadRes.error) throw unreadRes.error;
      setRows(allRes.data || []);
      setUnreadRows(unreadRes.data || []);
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

  // Flip is_read on a set of ids in both windows. Used for the
  // optimistic apply AND the rollback, so the two can never diverge.
  const applyReadState = (ids: string[], isRead: boolean) => {
    const idSet = new Set(ids);
    const flip = (list: Notification[]) => list.map((n) => (idSet.has(n.id) ? { ...n, is_read: isRead } : n));
    setRows(flip);
    setUnreadRows(flip);
  };

  const markRead = async (id: string) => {
    if (!user?.company_id || pendingIds.has(id)) return;
    setPendingIds((prev) => new Set(prev).add(id));
    // Optimistic: paint it read immediately, roll back if the write fails.
    applyReadState([id], true);
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", user.company_id);
      if (error) throw error;
    } catch (e) {
      applyReadState([id], false);
      toast({ title: "Could not mark as read", variant: "destructive" });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Tenant-slug aware link opener. Notification links are stored without
  // the slug (e.g. "/team-portal/kitchen/prep-list"); a bare href lands on
  // a non-tenant path that 404s. Marks the row read on the way out and
  // waits for the write so navigation can't cancel it mid-flight.
  const openLink = async (n: Notification) => {
    const raw = n.link ?? n.action_url;
    if (!raw) return;
    if (!n.is_read) await markRead(n.id);
    const href = /^https?:\/\//i.test(raw) ? raw : withSlug(raw);
    window.location.href = href;
  };

  const markAllRead = async () => {
    if (!user?.id || !user?.company_id || bulkBusy) return;
    const ids = merged.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    setBulkBusy("markAll");
    applyReadState(ids, true);
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("company_id", user.company_id)
        .in("id", ids);
      if (error) throw error;
      toast({ title: "All marked as read" });
    } catch (e) {
      applyReadState(ids, false);
      toast({ title: "Could not mark all as read", variant: "destructive" });
    } finally {
      setBulkBusy(null);
    }
  };

  // Merge the two windows, dedupe by id (the .or(recipient_id, user_id,
  // target_role) query can surface the same row twice on some PostgREST
  // paths, and a realtime re-fire can prepend a copy), newest first.
  const merged = useMemo(() => {
    const map = new Map<string, Notification>();
    for (const n of [...rows, ...unreadRows]) if (!map.has(n.id)) map.set(n.id, n);
    return Array.from(map.values()).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [rows, unreadRows]);
  const unread = useMemo(() => merged.filter((n) => !n.is_read), [merged]);
  const unreadCount = unread.length;
  const urgentUnreadCount = useMemo(
    () => unread.filter((n) => {
      const p = effectivePriority(n.priority, n.created_at);
      return p === "urgent" || p === "high";
    }).length,
    [unread],
  );
  const visible = tab === "unread" ? unread : merged;

  // Wave 24: bulk-clear stale notifications (older than the shared
  // STALE_NOTIFICATION_DAYS threshold). Same pattern as the driver
  // portal - live tenants accumulate test rows that never get
  // triaged, training the kitchen team to ignore real urgents too.
  const staleCount = useMemo(
    () => merged.filter((n) => isStaleNotification(n.created_at)).length,
    [merged],
  );
  const onClearStale = async () => {
    if (staleCount === 0 || bulkBusy || !user?.company_id) return;
    if (!window.confirm(`Delete ${staleCount} notification${staleCount === 1 ? "" : "s"} older than ${STALE_NOTIFICATION_DAYS} days?`)) return;
    const ids = merged.filter((n) => isStaleNotification(n.created_at)).map((n) => n.id);
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
      setRows((prev) => prev.filter((n) => !idSet.has(n.id)));
      setUnreadRows((prev) => prev.filter((n) => !idSet.has(n.id)));
      toast({ title: `${ids.length} stale notification${ids.length === 1 ? "" : "s"} cleared` });
    } catch (e) {
      toast({ title: "Could not clear stale notifications", variant: "destructive" });
    } finally {
      setBulkBusy(null);
    }
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <KitchenPageShell
      pageTitle="Kitchen notifications - CateringMS"
      heading="Notifications"
      subheading={
        chipsReady
          ? unreadCount > 0
            ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"} waiting for the kitchen.`
            : "You're all caught up, nothing unread."
          : "Dispatch alerts, prep updates and orders coming in."
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
          {chipsReady && unreadCount > 0 && (
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
            <span className={KITCHEN_HERO_CHIP}>
              <span className={cn("h-1.5 w-1.5 rounded-full", unreadCount > 0 ? "bg-rose-400" : "bg-emerald-400")} />
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </span>
            <span className={KITCHEN_HERO_CHIP}>
              <Inbox className="h-3 w-3" />
              {merged.length} in your inbox
            </span>
            {urgentUnreadCount > 0 && (
              <span className={KITCHEN_HERO_CHIP}>
                <AlertCircle className="h-3 w-3" />
                {urgentUnreadCount} urgent
              </span>
            )}
          </>
        ) : undefined
      }
      overview={
        loadError && !loaded ? undefined : (
          <PortalOverview
            eyebrow="Kitchen inbox"
            title={
              showSkeleton
                ? "Loading your alerts"
                : unreadCount > 0
                  ? "Start with the unread alerts, newest first"
                  : "Inbox clear, nothing needs a look"
            }
            description="Anything sent to you personally or broadcast to the kitchen team lands here: dispatch handovers, prep changes and new orders coming in. The list shows your latest 100 alerts plus any older unread ones."
            items={[
              { label: "Unread", value: unreadCount, helper: unreadCount > 0 ? "Needs a look" : "All clear", icon: Bell, tone: unreadCount > 0 ? "danger" : "success" },
              { label: "Urgent", value: urgentUnreadCount, helper: "High-priority unread", icon: AlertCircle, tone: urgentUnreadCount > 0 ? "warning" : "neutral" },
              { label: "In inbox", value: merged.length, helper: "Loaded alerts", icon: Inbox, tone: "neutral" },
              { label: "Stale", value: staleCount, helper: `Older than ${STALE_NOTIFICATION_DAYS} days`, icon: Archive, tone: "neutral" },
            ]}
            actions={
              <Button asChild size="sm" variant="outline">
                <Link href={withSlug("/team-portal/kitchen/today")}>Kitchen today</Link>
              </Button>
            }
          />
        )
      }
    >
      {/* Recovery card: the load failed. Keep any last-good list below,
          but never dress a failure up as an empty inbox. */}
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-slate-900">
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

      {/* Toolbar: the All / Unread toggle. Tabs filter the already
          loaded arrays client-side, so the counts always agree with
          the list below. */}
      <PortalCard className="mb-4 p-2">
        <div className="flex w-full gap-1 overflow-x-auto">
          <Button
            variant={tab === "all" ? "default" : "outline"}
            onClick={() => setTab("all")}
            className={cn("h-10 flex-1 justify-center min-w-[120px] whitespace-nowrap", tab === "all" && "bg-brand-primary hover:opacity-90 text-white")}
          >
            All {chipsReady && <span className={cn("ml-1.5 px-1.5 rounded text-[10px] tabular-nums", tab === "all" ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800")}>{merged.length}</span>}
          </Button>
          <Button
            variant={tab === "unread" ? "default" : "outline"}
            onClick={() => setTab("unread")}
            className={cn("h-10 flex-1 justify-center min-w-[120px] whitespace-nowrap", tab === "unread" && "bg-brand-primary hover:opacity-90 text-white")}
          >
            Unread {chipsReady && unreadCount > 0 && <span className={cn("ml-1.5 px-1.5 rounded text-[10px] tabular-nums", tab === "unread" ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800")}>{unreadCount}</span>}
          </Button>
        </div>
      </PortalCard>

      <PortalCard padded={false}>
        {showSkeleton ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-label="Loading notifications">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-start gap-3 p-4">
                <div className="h-5 w-5 shrink-0 rounded animate-pulse motion-reduce:animate-none bg-slate-200 dark:bg-slate-800" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-40 max-w-[50%] rounded animate-pulse motion-reduce:animate-none bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-64 max-w-[80%] rounded animate-pulse motion-reduce:animate-none bg-slate-100 dark:bg-slate-800/60" />
                </div>
              </li>
            ))}
          </ul>
        ) : loadError && merged.length === 0 ? (
          // The recovery card above owns this state; keep the card body quiet.
          <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Your alerts are unavailable right now. Use Retry above to reload them.
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <Bell className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="font-semibold text-slate-900 dark:text-white">{tab === "unread" ? "No unread notifications" : "No notifications yet"}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">You're all caught up. New alerts for you or the kitchen team will land here.</p>
            <div className="mt-4 flex justify-center">
              {tab === "unread" && merged.length > 0 ? (
                <Button variant="outline" size="sm" className="h-10" onClick={() => setTab("all")}>
                  View all {merged.length}
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm" className="h-10">
                  <Link href={withSlug("/team-portal/kitchen/today")}>Go to kitchen today</Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((n) => {
              // Wave 24: degrade displayed priority on stale rows.
              const displayedPriority = effectivePriority(n.priority, n.created_at);
              const Icon = priorityIcon(displayedPriority);
              const tone = priorityTone(displayedPriority);
              return (
                <li key={n.id} className={`p-4 flex items-start gap-3 ${n.is_read ? "bg-white dark:bg-slate-900" : "bg-brand-primary/5 dark:bg-brand-primary/10"}`}>
                  <Icon className={`h-5 w-5 ${tone} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-slate-900 dark:text-white">{n.title ?? "Notification"}</div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0 tabular-nums">
                        {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ""}
                      </span>
                    </div>
                    {n.message && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {(n.type || n.notification_type) && (
                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                          {n.type ?? n.notification_type}
                        </Badge>
                      )}
                      {!n.is_read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-10 px-3 text-xs"
                          disabled={pendingIds.has(n.id)}
                          onClick={() => markRead(n.id)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {pendingIds.has(n.id) ? "Marking..." : "Mark read"}
                        </Button>
                      )}
                      {(n.link || n.action_url) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-10 px-3 text-xs text-brand-primary hover:text-brand-primary"
                          disabled={pendingIds.has(n.id)}
                          onClick={() => void openLink(n)}
                        >
                          Open
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PortalCard>
    </KitchenPageShell>
  );
}

export default function KitchenNotificationsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.KITCHEN_MANAGER,
        UserRole.KITCHEN_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <KitchenNotificationsPageInner />
    </ProtectedRoute>
  );
}
