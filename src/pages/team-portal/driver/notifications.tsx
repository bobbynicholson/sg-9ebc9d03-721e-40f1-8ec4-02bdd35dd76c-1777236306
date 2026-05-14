/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /team-portal/driver/notifications
 *
 * The bell -> "View all" target for drivers. Was a static placeholder
 * card; now lists the real notifications a driver receives -- shift
 * confirms, route changes, dispatch nudges, customer-replied alerts.
 *
 * Same notificationService as the other portals so the bell badge
 * count and this list never disagree. Click a row to mark it read +
 * navigate to the linked entity (assignment, route, message thread).
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, AlertCircle, Trash2, Loader2, ExternalLink, Archive } from "lucide-react";
import { formatDistanceToNow, differenceInDays } from "date-fns";

// Wave 24: stale-priority degradation. A notification fired 19 days
// ago shouldn't still wear the "URGENT" badge -- it muddies the
// driver's signal. The badge auto-degrades by age:
//   urgent / high  -> normal after 3 days
//   normal         -> low    after 14 days
// The underlying DB row is unchanged; this is purely display logic
// so reports + audit_logs still see the original priority. The
// Urgent icon also drops at 3 days for the same reason.
function effectivePriority(rawPriority: string | null | undefined, createdAt: string | null): string {
  const raw = (rawPriority || "normal").toLowerCase();
  if (!createdAt) return raw;
  const age = differenceInDays(new Date(), new Date(createdAt));
  if (raw === "urgent" || raw === "high") {
    if (age >= 3) return "normal";
    return raw;
  }
  if (raw === "normal" && age >= 14) return "low";
  return raw;
}
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { DriverNav } from "@/components/navigation/DriverNav";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-800 border-rose-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  low: "bg-slate-50 text-slate-600 border-slate-100",
};

export default function DriverNotificationsPage() {
  const router = useRouter();
  const { user, activeRole } = useAuth() as any;
  const { toast } = useToast();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [actingId, setActingId] = useState<string | null>(null);

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
  }, [user?.id, activeRole, tab, toast]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
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
    if (n.link) router.push(n.link);
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

  // Wave 24: bulk-clear stale notifications (>14 days old). Live
  // tenants accumulate test / one-off rows that never get triaged --
  // the inbox fills with months-old urgents that the driver
  // ignores, which trains them to ignore real ones too. One-tap
  // archive of anything older than 14 days keeps the bell honest.
  const staleCount = useMemo(
    () => notifications.filter((n) => {
      if (!n.created_at) return false;
      return differenceInDays(new Date(), new Date(n.created_at)) >= 14;
    }).length,
    [notifications],
  );

  const onClearStale = async () => {
    if (staleCount === 0) return;
    if (!window.confirm(`Delete ${staleCount} notification${staleCount === 1 ? "" : "s"} older than 14 days?`)) return;
    const stale = notifications.filter((n) => {
      if (!n.created_at) return false;
      return differenceInDays(new Date(), new Date(n.created_at)) >= 14;
    });
    setActingId("__bulk__");
    try {
      for (const n of stale) {
        try { await notificationService.deleteNotification(n.id); } catch { /* keep going */ }
      }
      setNotifications((prev) => prev.filter((n) => {
        if (!n.created_at) return true;
        return differenceInDays(new Date(), new Date(n.created_at)) < 14;
      }));
      toast({ title: `${stale.length} stale notification${stale.length === 1 ? "" : "s"} cleared` });
    } finally {
      setActingId(null);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Notifications - Driver Portal</title></Head>
      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-blue-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 max-w-3xl space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Notifications</h1>
                <p className="text-slate-600 mt-0.5 text-sm">
                  Dispatch alerts, route changes, customer messages.
                </p>
              </div>
            </div>
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
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                tab === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTab("unread")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition inline-flex items-center gap-2 ${
                tab === "unread" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  tab === "unread" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                }`}>{unreadCount}</span>
              )}
            </button>
          </div>

          {loading ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 mt-3">Loading...</p>
              </CardContent>
            </Card>
          ) : notifications.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center space-y-2">
                <Bell className="w-10 h-10 mx-auto text-slate-300" />
                <h2 className="text-base font-semibold text-slate-900">
                  {tab === "unread" ? "Nothing unread" : "No notifications yet"}
                </h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  {tab === "unread"
                    ? "You're all caught up."
                    : "When dispatch assigns a route or a customer messages, it'll land here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const created = n.created_at ? new Date(n.created_at) : null;
                const ago = created ? formatDistanceToNow(created, { addSuffix: true }) : "";
                // Wave 24: degrade displayed priority on stale rows so
                // a 19-day-old "URGENT" doesn't keep shouting.
                const displayedPriority = effectivePriority(n.priority as string | null, n.created_at);
                const tone = PRIORITY_TONE[displayedPriority] || PRIORITY_TONE.normal;
                const isUrgent = displayedPriority === "urgent" || displayedPriority === "high";
                return (
                  <li key={n.id}>
                    <Card className={`w-full border ${
                      n.is_read ? "border-slate-200" : "border-slate-300 shadow-sm"
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {!n.is_read && (
                            <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                          <div
                            className={`flex-1 min-w-0 ${n.link ? "cursor-pointer" : ""}`}
                            onClick={() => onClickRow(n)}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {isUrgent && <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />}
                              <h3 className={`text-sm sm:text-base text-slate-900 ${
                                n.is_read ? "font-medium" : "font-semibold"
                              }`}>{n.title}</h3>
                              <Badge variant="outline" className={`text-[10px] capitalize ${tone}`}>
                                {displayedPriority}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <p className="text-xs text-slate-400">{ago}</p>
                              {n.link && (
                                <span className="text-xs text-blue-600 inline-flex items-center gap-1 font-medium">
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
                                className="h-7 w-7"
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
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
