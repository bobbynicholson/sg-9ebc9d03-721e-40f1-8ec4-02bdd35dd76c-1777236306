import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Loader2, AlertCircle, AlertTriangle, Info, CheckCircle2, Archive } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
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
  return "text-emerald-500";
};

export default function ShoppingNotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");

  useEffect(() => { if (user?.id) load(); }, [user?.id, tab]);

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

  // Wave 24: stale notification cleanup -- mirrors the driver,
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
      <Head><title>Shopping Notifications - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-3">
                <Bell className="h-7 w-7 text-emerald-600" />
                Shopping Notifications
                <InfoTooltip content="Alerts sent to you directly, plus anything addressed to the shopping team as a whole." />
              </h1>
              <p className="text-sm text-slate-600 mt-1">Stock alerts, supplier updates, purchase requests</p>
            </div>
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
          </div>

          <div className="flex gap-2 mb-4">
            <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")} className={tab === "all" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>All</Button>
            <Button variant={tab === "unread" ? "default" : "outline"} size="sm" onClick={() => setTab("unread")} className={tab === "unread" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
              Unread {unread > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded text-[10px] tabular-nums">{unread}</span>}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : notifs.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Bell className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">{tab === "unread" ? "No unread" : "No notifications yet"}</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notifs.map((n) => {
                    // Wave 24: degrade displayed priority on stale rows.
                    const displayedPriority = effectivePriority(n.priority, n.created_at);
                    const Icon = priorityIcon(displayedPriority);
                    const tone = priorityTone(displayedPriority);
                    return (
                      <li key={n.id} className={`p-4 flex items-start gap-3 ${n.is_read ? "bg-white" : "bg-emerald-50/50"}`}>
                        <Icon className={`h-5 w-5 ${tone} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-slate-900">{n.title ?? "Notification"}</div>
                            <span className="text-[11px] text-slate-500 flex-shrink-0">{n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ""}</span>
                          </div>
                          {n.message && <p className="text-sm text-slate-600 mt-1">{n.message}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            {(n.type || n.notification_type) && (
                              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">{n.type ?? n.notification_type}</Badge>
                            )}
                            {!n.is_read && (
                              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => markRead(n.id)}>
                                <Check className="h-3 w-3 mr-1" />Mark read
                              </Button>
                            )}
                            {(n.link || n.action_url) && (
                              <a href={n.link ?? n.action_url ?? "#"} className="text-[11px] text-emerald-600 hover:underline">Open</a>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
