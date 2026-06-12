/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /client-portal/notifications
 *
 * The "View all notifications" target from the bell. Lists every
 * in-app notification the signed-in client has received - payment
 * confirmations, quote updates, driver-on-the-way nudges, status
 * changes the catering team triggered.
 *
 * Pulls from the same notificationService the rest of the app uses
 * so the bell badge + this page never disagree. Tapping a row marks
 * it read, then navigates to the linked entity (invoice / quote /
 * order) when the notification has a `link` set.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell, CheckCircle2, AlertCircle, Trash2, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ClientPageHeader } from "@/components/client-portal/ClientPageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-800 border-rose-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  low: "bg-slate-50 text-slate-600 border-slate-100",
};

export default function ClientNotificationsPage() {
  const router = useRouter();
  const { user, activeRole, company } = useAuth() as any;
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

  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    (user as any)?.user_metadata?.last_company_slug ||
    company?.slug ||
    "";

  // Translate the link the notifications writer stored against the row
  // into a tenant-prefixed client portal route. Bobby's policy is
  // every page a client touches lives under /{slug}/...; the bare path
  // forms get rewritten by middleware but routing through the right
  // form keeps the address bar consistent.
  const resolveLink = (link: string | null | undefined): string | null => {
    if (!link) return null;
    if (resolvedSlug && link.startsWith("/client-portal")) {
      return `/${resolvedSlug}${link}`;
    }
    return link;
  };

  const onClickRow = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await notificationService.markAsRead(n.id);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
        );
      } catch {
        /* non-fatal - still navigate */
      }
    }
    const target = resolveLink(n.link);
    if (target) router.push(target);
  };

  const onMarkRead = async (id: string) => {
    setActingId(id);
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
    } finally {
      setActingId(null);
    }
  };

  const onDelete = async (id: string) => {
    setActingId(id);
    try {
      await notificationService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setActingId(null);
    }
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

  return (
    <>
      <NoIndexMeta />
      <Head><title>Notifications | {company?.company_name || "Your portal"}</title></Head>
      <ClientNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <ClientPageHeader
          title="Notifications"
          subtitle="Quote updates, driver alerts, payment confirmations - everything the team has sent you."
          rightSlot={
            unreadCount > 0 ? (
              <Button
                variant="outline"
                onClick={onMarkAllRead}
                className="bg-white/15 border-white/30 text-white hover:bg-white/25 hover:text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark all read
              </Button>
            ) : null
          }
        />

        <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 space-y-4">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-1">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                tab === "all"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTab("unread")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition inline-flex items-center gap-2 ${
                tab === "unread"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  tab === "unread" ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                }`}>
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {loading ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 mt-3">Loading your notifications...</p>
              </CardContent>
            </Card>
          ) : notifications.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center space-y-2">
                <Bell className="w-10 h-10 mx-auto text-slate-300" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {tab === "unread" ? "Nothing unread" : "No notifications yet"}
                </h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  {tab === "unread"
                    ? "You're all caught up. Check back later."
                    : "When the catering team sends you a quote, marks an event, or confirms a payment, it'll land here."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const created = n.created_at ? new Date(n.created_at) : null;
                const ago = created ? formatDistanceToNow(created, { addSuffix: true }) : "";
                const tone = PRIORITY_TONE[(n.priority as string) || "normal"] || PRIORITY_TONE.normal;
                const target = resolveLink(n.link);
                const isUrgent = n.priority === "urgent" || n.priority === "high";

                return (
                  <li key={n.id}>
                    <Card className={`w-full border ${
                      n.is_read
                        ? "border-slate-200 dark:border-slate-700"
                        : "border-slate-300 dark:border-slate-600 shadow-sm"
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {!n.is_read && (
                            <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 flex-shrink-0" aria-label="Unread" />
                          )}
                          <div
                            className={`flex-1 min-w-0 ${target ? "cursor-pointer" : ""}`}
                            onClick={() => target && onClickRow(n)}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {isUrgent && (
                                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                              )}
                              <h3 className={`text-sm sm:text-base text-slate-900 dark:text-white ${
                                n.is_read ? "font-medium" : "font-semibold"
                              }`}>
                                {n.title}
                              </h3>
                              <Badge variant="outline" className={`text-[10px] capitalize ${tone}`}>
                                {n.priority || "normal"}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                              {n.message}
                            </p>
                            <p className="text-xs text-slate-400 mt-2">{ago}</p>
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
        </main>
      </div>
    </>
  );
}
