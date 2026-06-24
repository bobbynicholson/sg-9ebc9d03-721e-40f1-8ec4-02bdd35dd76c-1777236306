import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Loader2, AlertCircle, AlertTriangle, Info, CheckCircle2, Archive } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
import { useTenantHref } from "@/lib/tenantUrl";
import { cn } from "@/lib/utils";

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

const priorityIcon = (p?: string | null) => {
  if (p === "critical" || p === "urgent" || p === "high") return AlertCircle;
  if (p === "medium" || p === "warning") return AlertTriangle;
  if (p === "success" || p === "low") return CheckCircle2;
  return Info;
};
const priorityTone = (p?: string | null) => {
  if (p === "critical" || p === "urgent" || p === "high") return "text-rose-500";
  if (p === "medium" || p === "warning") return "text-rose-500";
  if (p === "success") return "text-emerald-500";
  return "text-slate-400 dark:text-slate-500";
};

export default function KitchenNotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // Tenant-slug aware link opener. Notification links are stored without
  // the slug (e.g. "/team-portal/kitchen/prep-list"); a bare href lands on
  // a non-tenant path that 404s. Marks the row read on the way out.
  const openLink = (n: Notification) => {
    const raw = n.link ?? n.action_url;
    if (!raw) return;
    if (!n.is_read) void markRead(n.id);
    const href = /^https?:\/\//i.test(raw) ? raw : withSlug(raw);
    window.location.href = href;
  };

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  // Bumped by the realtime subscription so new notifications surface
  // without a manual refresh (admin + client portals already do this).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    load();
  }, [user?.id, user?.company_id, tab, refreshKey]);

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
    if (!user?.id || !user?.company_id) return;
    setLoading(true);
    try {
      let q = supabase
        .from("notifications")
        .select("*")
        .eq("company_id", user.company_id)
        .or(`recipient_id.eq.${user.id},user_id.eq.${user.id},target_role.eq.kitchen_staff`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (tab === "unread") q = q.eq("is_read", false);
      const { data, error } = await q.returns<Notification[]>();
      if (error) throw error;
      setNotifs(data || []);
    } catch (e) {
      toast({ title: "Could not load notifications", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    try {
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      toast({ title: "Could not mark as read", variant: "destructive" });
    }
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    try {
      const ids = notifs.filter((n) => !n.is_read).map((n) => n.id);
      if (ids.length === 0) return;
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", ids);
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All marked as read" });
    } catch (e) {
      toast({ title: "Could not mark all as read", variant: "destructive" });
    }
  };

  // Render-level dedupe by id (same guarantee the admin bell + page use):
  // the .or(recipient_id, user_id, target_role) query can surface the same
  // row twice on some PostgREST paths, and a realtime re-fire can prepend a
  // copy. Collapse to one row per id so a single alert never shows twice.
  const visible = useMemo(
    () => Array.from(new Map(notifs.map((n) => [n.id, n])).values()),
    [notifs],
  );
  const unreadCount = useMemo(() => visible.filter((n) => !n.is_read).length, [visible]);

  // Wave 24: bulk-clear stale notifications (older than the shared
  // STALE_NOTIFICATION_DAYS threshold). Same pattern as the driver
  // portal - live tenants accumulate test rows that never get
  // triaged, training the kitchen team to ignore real urgents too.
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
      setNotifs((prev) => prev.filter((n) => !isStaleNotification(n.created_at)));
      toast({ title: `${stale.length} stale notification${stale.length === 1 ? "" : "s"} cleared` });
    } catch (e) {
      toast({ title: "Could not clear stale notifications", variant: "destructive" });
    }
  };

  return (
    <>
      <Head><title>Kitchen notifications - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title={
              <span className="flex items-center gap-2">
                Notifications
                <InfoTooltip content="Your last 100 alerts.\n\nIncludes anything sent to you personally or to the kitchen team." />
              </span>
            }
            subtitle="Dispatch alerts, prep updates and orders coming in"
            icon={Bell}
            actions={
              <>
                {staleCount > 0 && (
                  <Button variant="outline" size="sm" onClick={onClearStale} title={`Delete notifications older than ${STALE_NOTIFICATION_DAYS} days`}>
                    <Archive className="h-4 w-4 mr-2" />
                    Clear stale ({staleCount})
                  </Button>
                )}
                {unreadCount > 0 && (
                  <Button variant="outline" size="sm" onClick={markAllRead}>
                    <Check className="h-4 w-4 mr-2" />Mark all read
                  </Button>
                )}
              </>
            }
          />

          <div className="flex w-full gap-1 overflow-x-auto mb-4">
            <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")} className={cn("flex-1 justify-center min-w-[120px] whitespace-nowrap", tab === "all" && "bg-brand-primary hover:opacity-90 text-white")}>
              All
            </Button>
            <Button variant={tab === "unread" ? "default" : "outline"} size="sm" onClick={() => setTab("unread")} className={cn("flex-1 justify-center min-w-[120px] whitespace-nowrap", tab === "unread" && "bg-brand-primary hover:opacity-90 text-white")}>
              Unread {unreadCount > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded text-[10px] tabular-nums">{unreadCount}</span>}
            </Button>
          </div>

          <PortalCard padded={false}>
              {loading ? (
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
              ) : visible.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <Bell className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">{tab === "unread" ? "No unread notifications" : "No notifications yet"}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">You're all caught up. New alerts for you or the kitchen team will land here.</p>
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
                          <div className="flex items-center gap-2 mt-2">
                            {(n.type || n.notification_type) && (
                              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                {n.type ?? n.notification_type}
                              </Badge>
                            )}
                            {!n.is_read && (
                              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => markRead(n.id)}>
                                <Check className="h-3 w-3 mr-1" />Mark read
                              </Button>
                            )}
                            {(n.link || n.action_url) && (
                              <button
                                type="button"
                                onClick={() => openLink(n)}
                                className="text-[11px] text-brand-primary hover:opacity-80 hover:underline underline-offset-2"
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
        </PortalShell>
      </main>
    </>
  );
}
