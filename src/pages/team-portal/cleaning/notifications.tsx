import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, AlertCircle, AlertTriangle, Info, CheckCircle2, Archive } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { effectivePriority, isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";
import { useTenantHref } from "@/lib/tenantUrl";

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
  if (p === "success") return "text-emerald-500";
  return "text-slate-400 dark:text-slate-500";
};

export default function CleaningNotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // Slug-aware open: notification links are stored without the tenant slug,
  // so a bare href 404s. Marks the row read on the way out.
  const openLink = (n: Notification) => {
    const raw = n.link ?? n.action_url;
    if (!raw) return;
    if (!n.is_read) void markRead(n.id);
    window.location.href = /^https?:\/\//i.test(raw) ? raw : withSlug(raw);
  };

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  // Bumped by the realtime subscription so new notifications surface
  // without a manual refresh (admin + client portals already do this).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id, tab, refreshKey]);

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
        .or(`recipient_id.eq.${user.id},user_id.eq.${user.id},target_role.eq.cleaning_staff`)
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
    } catch {
      toast({ title: "Could not mark read", variant: "destructive" });
    }
  };
  const markAllRead = async () => {
    const ids = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    try {
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", ids);
      setNotifs((p) => p.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All marked as read" });
    } catch {
      toast({ title: "Could not mark all read", variant: "destructive" });
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
      <Head><title>Cleaning notifications - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Cleaning notifications"
            subtitle="Cleaning alerts, equipment returns, missing items"
            icon={Bell}
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                {staleCount > 0 && (
                  <Button variant="outline" size="sm" onClick={onClearStale} title={`Delete notifications older than ${STALE_NOTIFICATION_DAYS} days`}>
                    <Archive className="h-4 w-4 mr-2" />
                    Clear stale ({staleCount})
                  </Button>
                )}
                {unread > 0 && (
                  <Button variant="outline" size="sm" onClick={markAllRead}>
                    <Check className="h-4 w-4 mr-2" />Mark all read
                  </Button>
                )}
              </div>
            }
          />

          <div className="flex gap-2 mb-4">
            <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")} className={tab === "all" ? "bg-amber-600 hover:bg-amber-700" : ""}>All</Button>
            <Button variant={tab === "unread" ? "default" : "outline"} size="sm" onClick={() => setTab("unread")} className={tab === "unread" ? "bg-amber-600 hover:bg-amber-700" : ""}>
              Unread {unread > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded text-[10px] tabular-nums">{unread}</span>}
            </Button>
          </div>

          <PortalCard padded={false}>
            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading notifications">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-2/5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                      <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <Bell className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="font-medium">{tab === "unread" ? "No unread" : "No notifications yet"}</p>
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
                        <div className="flex items-center gap-2 mt-2">
                          {(n.type || n.notification_type) && (
                            <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{n.type ?? n.notification_type}</Badge>
                          )}
                          {!n.is_read && (
                            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => markRead(n.id)}>
                              <Check className="h-3 w-3 mr-1" />Mark read
                            </Button>
                          )}
                          {(n.link || n.action_url) && (
                            <button type="button" onClick={() => openLink(n)} className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline">Open</button>
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
