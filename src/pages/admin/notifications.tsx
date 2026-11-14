import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench, PortalCard, StatTile,
} from "@/components/portal/ui";
import { toLocalISO } from "@/lib/localDate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { notificationService, Notification } from "@/services/notificationService";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, X, Clock, AlertCircle, Search, Trash2, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronUp, Eye, Edit3, ExternalLink, Download, RefreshCw, Archive } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { isStaleNotification, STALE_NOTIFICATION_DAYS } from "@/lib/notificationDisplay";
import { staffOrderHref } from "@/lib/orderUrls";
import { useTenantHref } from "@/lib/tenantUrl";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";
import { useToast } from "@/hooks/use-toast";

type PushDeliveryHealth = {
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: "never_run" | "running" | "ok" | "degraded" | "failed";
  last_error: string | null;
  last_claimed: number;
  last_sent: number;
  last_retried: number;
  last_failed: number;
};

type PushDeliverySnapshot = {
  health: PushDeliveryHealth | null;
  counts: { pending: number; retry: number; processing: number; staleProcessing: number; failed: number; failedShown: number };
  failedJobs: Array<{
    id: string;
    attempts: number;
    manualRetryCount: number;
    lastManualRetryAt: string | null;
    createdAt: string;
    lastError: string | null;
    notificationTitle: string;
    recipientName: string;
  }>;
};

export default function ProtectedNotificationsPage() {
  // The fourth slot was a COMPANY_ADMIN copy-paste duplicate; OWNER is
  // the role that was actually missing (same admit-OWNER regression
  // pattern as company-profile / white-label / email-settings).
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <NotificationsPage />
    </ProtectedRoute>
  );
}

function NotificationsPage() {
  const router = useRouter();
  const { user, activeRole, company, profile } = useAuth() as any;
  const { toast } = useToast();
  // Wave 26.1: tenant-slug wrapper. Every smart-CTA destination
  // (notification.link OR the fallback paths the smart-CTA branches
  // synthesise like /admin/leads?id=...) gets prefixed with the
  // current tenant slug so a tenant on /spit-braai-delivery/admin/...
  // stays inside that namespace when they click through.
  const { withSlug } = useTenantHref();
  const routeTenantSlug = getTenantSlugFromPathname(router.asPath);
  const [redirectingToScopedPage, setRedirectingToScopedPage] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  // Surfaced load failure. The service used to swallow query errors
  // and hand back [], which rendered as a fake "all caught up" inbox.
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const companyId = company?.id || profile?.company_id || user?.company_id || user?.user_metadata?.company_id || null;
  const pushDeliveryUrl = companyId
    ? `/api/admin/pwa-push-delivery?company_id=${encodeURIComponent(companyId)}`
    : null;
  const [pushDelivery, setPushDelivery] = useState<PushDeliverySnapshot | null>(null);
  const [pushDeliveryLoading, setPushDeliveryLoading] = useState(true);
  const [pushDeliveryError, setPushDeliveryError] = useState<string | null>(null);
  const [retryingPushJob, setRetryingPushJob] = useState<string | null>(null);
  const refreshPushDelivery = useCallback(async (quiet = false) => {
    if (!pushDeliveryUrl) return;
    if (!quiet) setPushDeliveryLoading(true);
    try {
      const response = await fetch(pushDeliveryUrl, { headers: { Accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load push delivery status.");
      setPushDelivery(payload);
      setPushDeliveryError(null);
    } catch (error: any) {
      setPushDeliveryError(error?.message || "Could not load push delivery status.");
    } finally {
      setPushDeliveryLoading(false);
    }
  }, [pushDeliveryUrl]);

  useEffect(() => {
    setPushDelivery(null);
    setPushDeliveryError(null);
    setPushDeliveryLoading(true);
    if (!pushDeliveryUrl) {
      setPushDeliveryLoading(false);
      return;
    }
    void refreshPushDelivery();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPushDelivery(true);
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPushDelivery(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pushDeliveryUrl, refreshPushDelivery]);

  const retryPushDelivery = async (queueId: string) => {
    if (!pushDeliveryUrl) return;
    setRetryingPushJob(queueId);
    try {
      const response = await fetch(pushDeliveryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ queueId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not retry this delivery.");
      toast({ title: "Push delivery queued again", description: "The worker will retry it on its next run." });
      await refreshPushDelivery(true);
    } catch (error: any) {
      toast({ title: "Retry could not be queued", description: error?.message || "Please refresh and try again.", variant: "destructive" });
    } finally {
      setRetryingPushJob(null);
    }
  };
  const [searchTerm, setSearchTerm] = useState("");
  // Phase 26 #5: "/" or Cmd-F focuses the search input.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tab, setTab] = useState<"all" | "unread">("all");
  // Tracks which notifications have their detail accordion expanded.
  // Set rather than single-id so an admin can pin several open at
  // once while triaging a busy inbox.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Notifications are tenant-scoped. A platform admin has no company inbox,
  // so the bare legacy URL must not render a default-colour tenant page.
  // Tenant users are canonicalised to the company URL so branding and data
  // context are explicit in the address bar.
  useEffect(() => {
    if (!router.isReady || !user?.id || routeTenantSlug) return;
    const pathname = (router.asPath || "").split(/[?#]/)[0];
    if (pathname !== "/admin/notifications") return;

    const role = String(user.active_role || user.role || "").toLowerCase();
    const destination = role === UserRole.SUPER_ADMIN
      ? "/admin/platform/dashboard"
      : withSlug("/admin/notifications");
    if (destination === "/admin/notifications") return;
    setRedirectingToScopedPage(true);
    void router.replace(destination);
  }, [router, user, routeTenantSlug, withSlug]);

  useEffect(() => {
    loadRequestRef.current += 1;
    if (!user?.id || redirectingToScopedPage) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setNotifications([]);
    setLoading(true);
    setLoadError(null);
    void loadNotifications();

    const unsubscribe = notificationService.subscribeToNotifications(
      user.id,
      (notification, eventType) => {
        setNotifications((current) => {
          if (eventType === "INSERT") {
            return current.some((item) => item.id === notification.id)
              ? current
              : [notification, ...current].slice(0, 100);
          }
          if (eventType === "DELETE") {
            return current.filter((item) => item.id !== notification.id);
          }
          const inCurrentScope =
            (!companyId || notification.company_id === companyId) &&
            (!activeRole || !notification.target_role || notification.target_role === activeRole);
          if (!inCurrentScope) return current.filter((item) => item.id !== notification.id);
          if (current.some((item) => item.id === notification.id)) {
            return current.map((item) => item.id === notification.id ? notification : item);
          }
          return [notification, ...current].slice(0, 100);
        });
      },
      activeRole,
      companyId,
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadNotifications(false);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = setInterval(() => void loadNotifications(false), 5 * 60 * 1000);

    return () => {
      loadRequestRef.current += 1;
      unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeRole, companyId, redirectingToScopedPage]);

  const loadNotifications = async (showSpinner = true) => {
    if (!user?.id) return;

    const requestId = ++loadRequestRef.current;
    if (showSpinner) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      // Audit fix (tab-count inconsistency): the unread tab used to
      // refetch with unreadOnly=true, which replaced the state array
      // with only unread rows - so the "All (n)" tab label suddenly
      // showed the UNREAD count while you sat on the Unread tab. One
      // fetch of the latest rows, both tabs filter client-side, and
      // every count on the page reads off the same array.
      const data = await notificationService.getNotifications(
        user.id,
        false,
        activeRole,
        { limit: 100, companyId, throwOnError: true }
      );
      if (requestId !== loadRequestRef.current) return;
      setNotifications(data);
      setLoadError(null);
    } catch (err: any) {
      if (requestId === loadRequestRef.current) {
        console.error("loadNotifications failed:", err);
        setLoadError(err?.message || "Could not load your notifications.");
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
    } catch (err) {
      console.error("markAsRead failed:", err);
      toast({ title: "Could not mark as read", description: "The change was not saved. Please try again.", variant: "destructive" });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    try {
      await notificationService.markAllAsRead(user.id, activeRole, companyId);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All notifications marked as read" });
    } catch (err) {
      console.error("markAllAsRead failed:", err);
      toast({ title: "Could not mark all as read", description: "The change was not saved. Please try again.", variant: "destructive" });
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (err) {
      console.error("deleteNotification failed:", err);
      toast({ title: "Could not delete notification", description: "It is still in your inbox. Please try again.", variant: "destructive" });
    }
  };

  const handleDeleteAll = async () => {
    if (!user?.id || !window.confirm("Delete all read notifications?")) return;

    const readNotifications = notifications.filter(n => n.is_read);
    const failed: string[] = [];
    for (const notification of readNotifications) {
      try {
        await notificationService.deleteNotification(notification.id);
      } catch (err) {
        console.error("deleteNotification failed:", notification.id, err);
        failed.push(notification.id);
      }
    }
    // Only remove the rows that actually deleted so the list matches the DB.
    setNotifications((prev) => prev.filter((n) => !n.is_read || failed.includes(n.id)));
    if (failed.length > 0) {
      toast({
        title: "Some notifications were not deleted",
        description: `${failed.length} of ${readNotifications.length} could not be deleted. Please try again.`,
        variant: "destructive",
      });
    } else if (readNotifications.length > 0) {
      toast({ title: "Read notifications deleted", description: `${readNotifications.length} removed from your inbox.` });
    }
  };

  // Wave 24: bulk-clear notifications older than the shared stale
  // threshold. Mirrors the team-portal pattern. Distinct from "Delete
  // Read" - this catches anything 14d+ regardless of read status, so
  // an old urgent that was never opened still gets swept up.
  const handleClearStale = async () => {
    const stale = notifications.filter((n) => isStaleNotification(n.created_at));
    if (stale.length === 0) return;
    if (!window.confirm(`Delete ${stale.length} notification${stale.length === 1 ? "" : "s"} older than ${STALE_NOTIFICATION_DAYS} days?`)) return;
    const failed = new Set<string>();
    for (const n of stale) {
      try {
        await notificationService.deleteNotification(n.id);
      } catch (err) {
        console.error("stale delete failed:", n.id, err);
        failed.add(n.id);
      }
    }
    setNotifications((prev) => prev.filter((n) => !isStaleNotification(n.created_at) || failed.has(n.id)));
    if (failed.size > 0) {
      toast({
        title: "Some notifications were not deleted",
        description: `${failed.size} of ${stale.length} stale notifications could not be deleted. Please try again.`,
        variant: "destructive",
      });
    } else {
      toast({ title: "Stale notifications cleared", description: `${stale.length} removed from your inbox.` });
    }
  };

  const getPriorityIcon = (priority: string | null) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-5 w-5 text-rose-500" />;
      case "high":
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case "medium":
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string | null, unread: boolean) => {
    // Keep the inbox on the same neutral card system as the rest of the
    // tenant workspace. Priority remains visible through the icon and a
    // slim semantic edge, while unread/hover states use this company's
    // active brand colour instead of unrelated full-row fills.
    const priorityEdge = (() => {
      switch (priority) {
        case "urgent":
          return "border-l-rose-400";
        case "high":
          return "border-l-amber-400";
        case "medium":
          return "border-l-brand-primary";
        default:
          return "border-l-slate-300";
      }
    })();
    return `border border-slate-200 ${priorityEdge} ${unread ? "bg-brand-primary/[0.045]" : "bg-white"} hover:bg-brand-primary/[0.055] hover:border-brand-primary/25`;
  };

  const preFilteredNotifications = useMemo(() => {
    // Dedupe by id first so a row can never render twice, whatever the
    // fetch/realtime path produced.
    const unique = Array.from(new Map(notifications.map((n) => [n.id, n])).values());
    return unique.filter((n) => {
      const matchesTab = tab === "all" || !n.is_read;
      const matchesPriority = priorityFilter === "all" || n.priority === priorityFilter;
      const matchesType = typeFilter === "all" || n.notification_type === typeFilter;
      return matchesTab && matchesPriority && matchesType;
    });
  }, [notifications, priorityFilter, typeFilter, tab]);

  const filteredNotifications = useFuzzyItems(
    preFilteredNotifications,
    searchTerm,
    [
      { key: "title" as any, weight: 3 },
      { key: "message" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  // Live aggregates for the stat tiles. All derived from the same
  // fetched array the list renders, so the numbers always agree with
  // what is on screen.
  const urgentCount = notifications.filter((n) => n.priority === "urgent" || n.priority === "high").length;
  const staleCount = notifications.filter((n) => isStaleNotification(n.created_at)).length;
  const readCount = notifications.length - unreadCount;
  const hasActiveFilters = !!searchTerm || priorityFilter !== "all" || typeFilter !== "all";
  const pushHealth = pushDelivery?.health || null;
  const pushWorkerTimestamp = pushHealth?.last_status === "running"
    ? pushHealth.last_started_at
    : pushHealth?.last_finished_at;
  const heartbeatIsOverdue = !!pushHealth && pushHealth.last_status !== "never_run" && !!pushWorkerTimestamp
    && Date.now() - new Date(pushWorkerTimestamp).getTime() > 3 * 60 * 1000;
  const pushStatusLabel = heartbeatIsOverdue
    ? "Heartbeat overdue"
    : ({ never_run: "Waiting for worker", running: "Running", ok: "Healthy", degraded: "Needs attention", failed: "Worker failed" }[pushHealth?.last_status || "never_run"]);
  const pushStatusClass = heartbeatIsOverdue || pushHealth?.last_status === "failed"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : pushHealth?.last_status === "degraded"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : pushHealth?.last_status === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  // Phase 18 #5: lightweight CSV export of the currently filtered list so admins
  // can keep an audit trail outside the app (forwarding to ops chats, archival, etc.).
  const exportCsv = () => {
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["Created", "Priority", "Type", "Title", "Message", "Read"];
    const rows = filteredNotifications.map((n: Notification) => [
      n.created_at ? new Date(n.created_at).toISOString() : "",
      n.priority || "",
      n.notification_type || "",
      n.title || "",
      n.message || "",
      n.is_read ? "yes" : "no",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    // UTF-8 BOM so Excel-ZA opens the file as UTF-8 (same fix as the
    // calendar and financial-dashboard exports).
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notifications-${toLocalISO(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (redirectingToScopedPage) return null;

  return (
    <>
      <Head><title>Notifications - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          {/* Command-centre hero: brand-washed dark band with live
              inbox counts. The unread badge moved from actions into
              the meta chip row so it reads on the dark band. */}
          <PortalHeader
            variant="hero"
            title={<span className="flex items-center gap-2">Notifications<InfoTooltip content={"Your inbox of system alerts: low stock, delivery updates, order changes and other events that need your attention."} className="text-white/60 hover:text-white" /></span>}
            icon={Bell}
            subtitle="Review company alerts and open the related order, payment or task."
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {notifications.length} in inbox
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {unreadCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                    {unreadCount} unread
                  </span>
                  {urgentCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {urgentCount} urgent or high
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <>
                {unreadCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark all read
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={filteredNotifications.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeleteAll} disabled={readCount === 0}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete read
                </Button>
                {/* Wave 24: clear stale rows older than 14 days.
                    Catches the unread-and-old case "Delete read"
                    misses. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearStale}
                  disabled={staleCount === 0}
                  title={`Delete notifications older than ${STALE_NOTIFICATION_DAYS} days, regardless of read status`}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Clear stale
                </Button>
              </>
            }
          />
          <PageWorkbench />

          {/* Live inbox aggregates. Derived from the same array the
              list renders so tiles, chips and tab counts always agree. */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200/90 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatTile label="In inbox" value={notifications.length} hint="Latest 100 for your role" icon={Bell} />
              <StatTile label="Unread" value={unreadCount} hint={unreadCount === 0 ? "You are all caught up" : "Waiting for you"} icon={AlertCircle} />
              <StatTile label="Urgent or high" value={urgentCount} hint="Priority items across the inbox" icon={AlertTriangle} />
              <StatTile label="Stale" value={staleCount} hint={`Older than ${STALE_NOTIFICATION_DAYS} days`} icon={Archive} />
            </div>
          )}

          {companyId && (
            <PortalCard className="mb-6 overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary">
                      <Bell className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900">Push delivery</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Delivery is queued in the database and retried automatically. Queue counts are for this company; worker health is shared.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${pushStatusClass}`}>
                      {pushHealth?.last_status === "ok" && !heartbeatIsOverdue && <CheckCircle className="mr-1.5 h-3.5 w-3.5" />}
                      {(heartbeatIsOverdue || pushHealth?.last_status === "failed" || pushHealth?.last_status === "degraded") && <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />}
                      {pushStatusLabel}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void refreshPushDelivery()}
                      disabled={pushDeliveryLoading}
                      aria-label="Refresh push delivery status"
                    >
                      <RefreshCw className={`mr-1.5 h-4 w-4 ${pushDeliveryLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                </div>

                {pushDeliveryError && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{pushDeliveryError}</span>
                  </div>
                )}

                {pushDeliveryLoading && !pushDelivery ? (
                  <p className="text-sm text-slate-500">Loading delivery status…</p>
                ) : pushDelivery ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {[
                        ["Waiting", pushDelivery.counts.pending],
                        ["Retry scheduled", pushDelivery.counts.retry],
                        ["Processing", pushDelivery.counts.processing],
                        ["Stuck over 10 min", pushDelivery.counts.staleProcessing],
                        ["Failed", pushDelivery.counts.failed],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                          <div className="text-xs text-slate-500">{label}</div>
                          <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        {pushHealth?.last_status === "running" ? "Worker started" : "Last completed run"}: {pushWorkerTimestamp
                          ? formatDistanceToNow(new Date(pushWorkerTimestamp), { addSuffix: true })
                          : "No run recorded yet"}
                      </span>
                      {pushHealth && <span>Last worker batch (all companies): {pushHealth.last_sent} sent · {pushHealth.last_retried} retried · {pushHealth.last_failed} failed</span>}
                    </div>
                    {heartbeatIsOverdue && (
                      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        The scheduled worker has not completed a run recently. Queued notifications remain in the database and will be picked up when the worker resumes.
                      </div>
                    )}
                    {pushHealth?.last_status === "failed" && pushHealth.last_error && (
                      <div role="status" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                        Latest worker error: {pushHealth.last_error}
                      </div>
                    )}

                    {pushDelivery.counts.failed > 0 && (
                      <div className="border-t border-slate-200 pt-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">Failed deliveries</h3>
                            <p className="text-xs text-slate-500">
                              Showing the latest {pushDelivery.counts.failedShown} of {pushDelivery.counts.failed}. Retrying resets the attempt counter.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {pushDelivery.failedJobs.map((job) => (
                            <div key={job.id} className="flex flex-col gap-3 rounded-lg border border-rose-100 bg-rose-50/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900">{job.notificationTitle}</div>
                                <div className="mt-0.5 text-xs text-slate-600">
                                  {job.recipientName} · {job.attempts} attempts · {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                                  {job.manualRetryCount > 0 && ` · manually retried ${job.manualRetryCount} ${job.manualRetryCount === 1 ? "time" : "times"}`}
                                </div>
                                {job.lastError && <div className="mt-1 break-words text-xs text-rose-700">{job.lastError}</div>}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0 border-rose-200 text-rose-700 hover:bg-rose-100"
                                onClick={() => void retryPushDelivery(job.id)}
                                disabled={retryingPushJob !== null}
                              >
                                <RefreshCw className={`mr-1.5 h-4 w-4 ${retryingPushJob === job.id ? "animate-spin" : ""}`} />
                                {retryingPushJob === job.id ? "Queueing…" : "Retry delivery"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </PortalCard>
          )}

        {/* Toolbar: search + filters grouped in one card. */}
        <PortalCard className="mb-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                ref={searchRef}
                placeholder="Search notifications... (press /)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10"
              />
              {/* Phase 25 #2: clear-search affordance, matching
                  the sweep across orders / quotes / contacts /
                  invoices / leads. */}
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="stock_low">Low Stock</SelectItem>
                <SelectItem value="delivery_update">Delivery</SelectItem>
                <SelectItem value="system_alert">System</SelectItem>
                <SelectItem value="order_update">Orders</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PortalCard>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <TabsList>
              <TabsTrigger id="notifications-all" data-chat-section="admin.notifications.all" data-chat-section-label="All notifications" value="all">All ({notifications.length})</TabsTrigger>
              <TabsTrigger id="notifications-unread" data-chat-section="admin.notifications.unread" data-chat-section-label="Unread notifications" value="unread">Unread ({unreadCount})</TabsTrigger>
              <InfoTooltip content={"All shows every notification for your role. Unread narrows it down to the ones you have not read yet."} className="ml-2" />
            </TabsList>
          </div>

          <TabsContent value={tab} className="mt-0">
            <PortalCard padded={false}>
              <div>
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="space-y-3 p-6" aria-label="Loading notifications">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
                      ))}
                    </div>
                  ) : loadError ? (
                    <div className="p-12 text-center">
                      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-rose-400" />
                      <p className="text-slate-900 font-medium mb-1">Couldn&apos;t load notifications</p>
                      <p className="text-sm text-slate-600 mb-4">{loadError}</p>
                      <Button variant="outline" onClick={() => void loadNotifications()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                      </Button>
                    </div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="p-12 text-center">
                      <Bell className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                      <p className="text-slate-600 font-medium mb-2">No notifications found</p>
                      <p className="text-sm text-slate-500 mb-4">
                        {hasActiveFilters
                          ? "Nothing matches the current search and filters."
                          : tab === "unread"
                            ? "You have read everything in your inbox."
                            : "You are all caught up. New alerts will land here as they happen."}
                      </p>
                      {hasActiveFilters && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchTerm("");
                            setPriorityFilter("all");
                            setTypeFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {filteredNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 sm:p-6 transition-colors ${getPriorityColor(notification.priority, !notification.is_read)}`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="mt-1 flex-shrink-0">
                              {getPriorityIcon(notification.priority)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-slate-900 leading-tight">
                                    {notification.title}
                                  </h3>
                                  {!notification.is_read && (
                                    <Badge variant="secondary" className="text-xs mt-1">
                                      New
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {!notification.is_read && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleMarkAsRead(notification.id)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                    onClick={() => handleDelete(notification.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              {/* Full message, never truncated. The
                                  message column is text and we store
                                  the client's full request text on
                                  request-edits so admin reads what was
                                  asked without bouncing to the quote
                                  page first. */}
                              <p className="text-sm text-slate-700 mb-3 leading-relaxed whitespace-pre-wrap break-words">
                                {notification.message}
                              </p>

                              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {/* Guard: formatDistanceToNow throws a
                                      RangeError on an invalid date, which
                                      would crash the whole list render. */}
                                  {notification.created_at && Number.isFinite(new Date(notification.created_at).getTime())
                                    ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
                                    : "Unknown time"}
                                </div>
                                {notification.notification_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {notification.notification_type.replace(/_/g, " ")}
                                  </Badge>
                                )}
                              </div>

                              {/* Action row - View Details toggles the
                                  accordion below, primary action button
                                  varies by related entity. Quote
                                  notifications get a dedicated Edit
                                  Quote button that lands directly on
                                  the editable form. Other entity types
                                  fall back to the generic link. */}
                              {(() => {
                                const isExpanded = expandedIds.has(notification.id);
                                const isQuote =
                                  notification.related_entity_type === "quote" &&
                                  !!notification.related_entity_id;
                                // Order-type notifications (amendment /
                                // cancellation / postponement requests) get
                                // their own primary CTA. Without this, the
                                // amendment_requested row only shows a
                                // generic "Open" - yesterday's quote-edit
                                // notifications had a coloured "Edit quote"
                                // button and Bobby noticed the regression.
                                //
                                // Fallback path: rows inserted before
                                // related_entity_* was wired up still match
                                // by notification_type so the CTA shows on
                                // historical amendment/cancellation rows.
                                const orderType = (notification.notification_type || "").toString();
                                const isOrderType =
                                  orderType === "amendment_requested" ||
                                  orderType === "cancellation_requested" ||
                                  orderType === "postponement_requested" ||
                                  orderType === "driver_assigned" ||
                                  orderType === "out_for_delivery" ||
                                  orderType === "delivered" ||
                                  orderType === "order_confirmed" ||
                                  orderType === "order_ready";
                                const isOrder =
                                  (notification.related_entity_type === "order" &&
                                    !!notification.related_entity_id) ||
                                  (isOrderType && !!notification.link);
                                const orderCtaLabel =
                                  orderType === "amendment_requested" ? "Review change" :
                                  orderType === "cancellation_requested" ? "Review cancellation" :
                                  orderType === "postponement_requested" ? "Review postponement" :
                                  orderType === "driver_replacement_needed" ? "Find replacement" :
                                  "Open order";
                                // Wave 24: extend the smart-CTA pattern to
                                // the other high-frequency notification
                                // types. Falls back to the generic "Open"
                                // button when nothing matches. Each branch
                                // looks at related_entity_type first (the
                                // canonical pointer set by the broadcaster),
                                // then notification_type as a fallback for
                                // older rows.
                                const isLead =
                                  notification.related_entity_type === "lead" ||
                                  orderType === "lead_new" ||
                                  orderType === "lead_status_updated" ||
                                  orderType === "lead_converted";
                                const isInvoice =
                                  notification.related_entity_type === "invoice" ||
                                  orderType === "invoice_issued" ||
                                  orderType === "payment_received" ||
                                  orderType === "payment_reminder" ||
                                  orderType === "payment_claimed";
                                const isInventory =
                                  notification.related_entity_type === "inventory_item" ||
                                  orderType === "stock_low";
                                const isEquipment =
                                  notification.related_entity_type === "equipment" ||
                                  orderType === "equipment_service_due" ||
                                  orderType === "equipment_shortage";
                                const isVehicle =
                                  notification.related_entity_type === "vehicle" ||
                                  orderType === "vehicle_service_due";
                                return (
                                  <>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setExpandedIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(notification.id)) next.delete(notification.id);
                                            else next.add(notification.id);
                                            return next;
                                          });
                                        }}
                                      >
                                        {isExpanded ? (
                                          <><ChevronUp className="h-4 w-4 mr-1" /> Hide details</>
                                        ) : (
                                          <><ChevronDown className="h-4 w-4 mr-1" /> View details</>
                                        )}
                                      </Button>
                                      {isQuote && (
                                        <Button
                                          size="sm"
                                          className="bg-brand-primary hover:opacity-90"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            window.location.href = withSlug(
                                              `/admin/quotes/new?fromQuoteId=${encodeURIComponent(notification.related_entity_id!)}`,
                                            );
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          Edit quote
                                        </Button>
                                      )}
                                      {isOrder && (
                                        <Button
                                          size="sm"
                                          className="bg-brand-primary hover:opacity-90"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            // Prefer the deep link on the
                                            // notification (it carries the
                                            // amendment / cancellation
                                            // request id), fall back to the
                                            // bare order page when we only
                                            // have the related_entity_id.
                                            const fallback = notification.related_entity_id
                                              ? staffOrderHref(notification.related_entity_id, "admin")
                                              : "/admin/orders";
                                            window.location.href = withSlug(notification.link || fallback);
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          {orderCtaLabel}
                                        </Button>
                                      )}
                                      {/* Wave 24: smart CTAs for the other
                                          high-frequency notification types.
                                          Each prefers notification.link
                                          (broadcaster sets it correctly)
                                          and falls back to a sensible list
                                          page when only the entity type is
                                          known. */}
                                      {!isQuote && !isOrder && isLead && (
                                        <Button
                                          size="sm"
                                          className="bg-brand-primary hover:opacity-90"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            const fallback = notification.related_entity_id
                                              ? `/admin/leads?id=${encodeURIComponent(notification.related_entity_id)}`
                                              : "/admin/leads";
                                            window.location.href = withSlug(notification.link || fallback);
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          {orderType === "lead_new" ? "Review lead" : "Open lead"}
                                        </Button>
                                      )}
                                      {!isQuote && !isOrder && !isLead && isInvoice && (
                                        <Button
                                          size="sm"
                                          className="bg-brand-primary hover:opacity-90"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            const fallback = notification.related_entity_id
                                              ? `/admin/invoices?id=${encodeURIComponent(notification.related_entity_id)}`
                                              : "/admin/invoices";
                                            window.location.href = withSlug(notification.link || fallback);
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          {orderType === "payment_received" ? "View receipt" :
                                           orderType === "payment_claimed" ? "Verify claim" :
                                           orderType === "payment_reminder" ? "Send reminder" :
                                           "Open invoice"}
                                        </Button>
                                      )}
                                      {!isQuote && !isOrder && !isLead && !isInvoice && isInventory && (
                                        <Button
                                          size="sm"
                                          className="bg-brand-primary hover:opacity-90"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            const fallback = notification.related_entity_id
                                              ? `/admin/inventory?id=${encodeURIComponent(notification.related_entity_id)}`
                                              : "/admin/inventory";
                                            window.location.href = withSlug(notification.link || fallback);
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          {orderType === "stock_low" ? "Reorder stock" : "Open inventory"}
                                        </Button>
                                      )}
                                      {!isQuote && !isOrder && !isLead && !isInvoice && !isInventory && isEquipment && (
                                        <Button
                                          size="sm"
                                          className="bg-brand-primary hover:opacity-90"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            const fallback = notification.related_entity_id
                                              ? `/admin/equipment?id=${encodeURIComponent(notification.related_entity_id)}`
                                              : "/admin/equipment";
                                            window.location.href = withSlug(notification.link || fallback);
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          {orderType === "equipment_service_due" ? "Schedule service" :
                                           orderType === "equipment_shortage" ? "Resolve shortage" :
                                           "Open equipment"}
                                        </Button>
                                      )}
                                      {!isQuote && !isOrder && !isLead && !isInvoice && !isInventory && !isEquipment && isVehicle && (
                                        <Button
                                          size="sm"
                                          className="bg-brand-primary hover:opacity-90"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            const fallback = notification.related_entity_id
                                              ? `/admin/vehicles?id=${encodeURIComponent(notification.related_entity_id)}`
                                              : "/admin/vehicles";
                                            window.location.href = withSlug(notification.link || fallback);
                                          }}
                                        >
                                          <Edit3 className="h-4 w-4 mr-1" />
                                          {orderType === "vehicle_service_due" ? "Schedule service" : "Open vehicle"}
                                        </Button>
                                      )}
                                      {/* Wave 24: only show the generic
                                          Open button when no smart CTA
                                          claimed the row. Otherwise the
                                          row had two buttons pointing at
                                          (essentially) the same place. */}
                                      {notification.link &&
                                        !isQuote && !isOrder && !isLead &&
                                        !isInvoice && !isInventory &&
                                        !isEquipment && !isVehicle && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            if (!notification.is_read) handleMarkAsRead(notification.id);
                                            window.location.href = withSlug(notification.link!);
                                          }}
                                        >
                                          <ExternalLink className="h-4 w-4 mr-1" /> Open
                                        </Button>
                                      )}
                                    </div>

                                    {/* Accordion intentionally does NOT
                                        repeat the message or the type;
                                        both are already visible above.
                                        It only surfaces the precise
                                        meta the inline header omits:
                                        full timestamp, full priority
                                        word, related-entity link. */}
                                    {isExpanded && (
                                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-slate-700">
                                          <div className="flex justify-between sm:block">
                                            <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                              Received
                                              <InfoTooltip content={"When the system created this notification. Shown in your local timezone, so the time matches what your clock said when the event happened."} />
                                            </dt>
                                            <dd className="font-medium sm:mt-0.5">
                                              {notification.created_at
                                                ? new Date(notification.created_at).toLocaleString("en-ZA", {
                                                    day: "2-digit", month: "short", year: "numeric",
                                                    hour: "2-digit", minute: "2-digit",
                                                  })
                                                : "Unknown"}
                                            </dd>
                                          </div>
                                          <div className="flex justify-between sm:block">
                                            <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                              Priority
                                              <InfoTooltip content={"How urgent the trigger flagged this when it fired.\n\n• Urgent: drop what you're doing, act now (e.g. driver replacement needed).\n• High: act soon. A client is waiting for a response.\n• Medium / Normal: informational, no immediate action required.\n• Low: background context.\n\nSet automatically by the rule that created the row, not manually editable here."} />
                                            </dt>
                                            <dd className="font-medium capitalize sm:mt-0.5">
                                              {notification.priority || "normal"}
                                            </dd>
                                          </div>
                                          {notification.related_entity_type && (
                                            <div className="flex justify-between sm:block">
                                              <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                                Related to
                                                <InfoTooltip content={"The kind of record this notification is about (quote, invoice, order, payment, etc.). Use the action buttons above (Edit quote / Open in list) to jump straight to the source record without searching for it."} />
                                              </dt>
                                              <dd className="font-medium capitalize sm:mt-0.5">
                                                {notification.related_entity_type}
                                              </dd>
                                            </div>
                                          )}
                                          <div className="flex justify-between sm:block">
                                            <dt className="text-slate-500 sm:text-[10px] sm:uppercase sm:tracking-wide sm:font-semibold inline-flex items-center gap-1">
                                              Status
                                              <InfoTooltip content={"Whether you've marked this notification as read. Read items stay in the list (so you don't lose context) but stop counting toward the bell's unread badge. Use the tick icon on the row, or 'Mark all read' at the top, to clear them."} />
                                            </dt>
                                            <dd className="font-medium sm:mt-0.5">
                                              {notification.is_read ? "Read" : "Unread"}
                                            </dd>
                                          </div>
                                        </dl>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </PortalCard>
          </TabsContent>
        </Tabs>
        </PortalShell>
      </div>
    </>
  );
}
