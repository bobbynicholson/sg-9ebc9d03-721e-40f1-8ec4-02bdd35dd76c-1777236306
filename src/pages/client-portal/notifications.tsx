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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell, CheckCircle2, AlertCircle, Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { PortalShell, PortalHeader, PortalCard, PortalOverview,
  PageWorkbench,
} from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";

// Restrained palette: neutral slate ground with amber as the only accent.
// urgent reads as rose (needs attention), high as amber (the accent),
// normal/low stay slate so nothing competes for the eye.
const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  high: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  normal: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  low: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
};

export default function ClientNotificationsPage() {
  const router = useRouter();
  const { user, activeRole, company } = useAuth() as any;
  const { toast } = useToast();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [actingId, setActingId] = useState<string | null>(null);
  const companyId = company?.id || null;

  useEffect(() => {
    if (!user?.id || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await notificationService.getNotifications(
          user.id,
          tab === "unread",
          activeRole,
          { limit: 100, companyId },
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
  }, [user?.id, companyId, activeRole, tab, toast]);

  // Render-level dedupe by id (matches the admin bell + page guarantee).
  const visible = useMemo(
    () => Array.from(new Map(notifications.map((n) => [n.id, n])).values()),
    [notifications],
  );
  const unreadCount = useMemo(
    () => visible.filter((n) => !n.is_read).length,
    [visible],
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
      await notificationService.markAllAsRead(user.id, activeRole, companyId);
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
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Notifications"
            subtitle="Quote updates, driver alerts, payment confirmations - everything the team has sent you."
            icon={Bell}
            actions={
              unreadCount > 0 ? (
                <Button
                  onClick={onMarkAllRead}
                  className="bg-brand-primary hover:opacity-90 text-white rounded-lg gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark all read
                </Button>
              ) : null
            }
          />
          <PageWorkbench />

          <PortalOverview
            eyebrow="Inbox"
            title={unreadCount > 0 ? "You have updates to read" : "No unread client updates"}
            description="Notifications collect quote updates, payment confirmations, delivery alerts, and messages from the catering team."
            items={[
              { label: "Unread", value: unreadCount, helper: "Needs attention", icon: Bell, tone: unreadCount > 0 ? "warning" : "success" },
              { label: "Visible", value: visible.length, helper: tab === "unread" ? "Unread tab" : "All notifications", icon: CheckCircle2, tone: "neutral" },
              { label: "Filter", value: tab === "unread" ? "Unread" : "All", helper: "Current view", icon: AlertCircle, tone: "neutral" },
              { label: "Clean up", value: "Delete", helper: "Row-level action", icon: Trash2, tone: "neutral" },
            ]}
          />

          <div className="space-y-4">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-1">
              <button
                type="button"
                onClick={() => setTab("all")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${
                  tab === "all"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTab("unread")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 inline-flex items-center gap-2 ${
                  tab === "unread"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${
                    tab === "unread"
                      ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  }`}>
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {loading ? (
              // Skeleton over a centre spinner: the page loads straight into
              // the list shape so the layout doesn't jump when data arrives.
              <div className="space-y-2" aria-busy="true" aria-label="Loading your notifications">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse"
                  />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <PortalCard padded={false}>
                <div className="py-16 px-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">
                    {tab === "unread" ? "Nothing unread" : "No notifications yet"}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    {tab === "unread"
                      ? "You're all caught up. Check back later."
                      : "When the catering team sends you a quote, marks an event, or confirms a payment, it'll land here."}
                  </p>
                </div>
              </PortalCard>
            ) : (
              <ul className="space-y-2">
                {visible.map((n) => {
                  const created = n.created_at ? new Date(n.created_at) : null;
                  const ago = created ? formatDistanceToNow(created, { addSuffix: true }) : "";
                  const tone = PRIORITY_TONE[(n.priority as string) || "normal"] || PRIORITY_TONE.normal;
                  const target = resolveLink(n.link);
                  const isUrgent = n.priority === "urgent" || n.priority === "high";

                  return (
                    <li key={n.id}>
                      <PortalCard
                        padded={false}
                        className={n.is_read ? "" : "border-amber-200 dark:border-amber-900/60"}
                      >
                        <div className="flex items-start gap-3 p-4">
                          {!n.is_read && (
                            <div className="w-2 h-2 mt-2 rounded-full bg-amber-500 flex-shrink-0" aria-label="Unread" />
                          )}
                          <div
                            className={`flex-1 min-w-0 ${target ? "cursor-pointer" : ""}`}
                            onClick={() => target && onClickRow(n)}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {isUrgent && (
                                <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />
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
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{ago}</p>
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            {!n.is_read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                                disabled={actingId === n.id}
                                title="Mark as read"
                                className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
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
                              className="h-7 w-7 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </PortalCard>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PortalShell>
      </div>
    </>
  );
}
