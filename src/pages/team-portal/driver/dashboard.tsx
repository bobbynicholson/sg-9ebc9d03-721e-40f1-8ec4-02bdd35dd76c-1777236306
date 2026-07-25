import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  Navigation,
  TrendingUp,
  Banknote,
  Bell,
  CalendarDays,
  Camera,
  X,
  Printer,
  RefreshCw,
  Route as RouteIcon,
  ExternalLink,
} from "lucide-react";
import { PodCaptureDialog } from "@/components/driver/PodCaptureDialog";
import {
  clearPendingPodCapture,
  POD_PENDING_MAX_AGE_MS,
  pendingPodRecoveryFlow,
  readPendingPodCapture,
} from "@/lib/podCaptureRecovery";
import { DeclineAssignmentDialog } from "@/components/driver/DeclineAssignmentDialog";
import { RunningLateChips } from "@/components/driver/RunningLateChips";
import { OrderChatPanel } from "@/components/admin/dispatch/OrderChatPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle } from "lucide-react";
import { openNavigation as openMapsNavigation } from "@/lib/driverNavigation";
import { useKitchenOrigin } from "@/hooks/useKitchenOrigin";
import { useDriverGPSPing } from "@/hooks/useDriverGPSPing";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { AvailableJobsCard } from "@/components/driver/AvailableJobsCard";
import { WaiterServicePanel } from "@/components/waiter/WaiterServicePanel";
import { UserRole } from "@/types/app";
import { PWAInstallPrompt } from "@/components/driver/PWAInstallPrompt";
import { DriverClockButton } from "@/components/driver/DriverClockButton";
import { DriverStatusDialog } from "@/components/driver/DriverStatusDialog";
import { DriverShiftHistory } from "@/components/driver/DriverShiftHistory";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { PortalOverview, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { ChatBot } from "@/components/ChatBot";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { notificationService, Notification } from "@/services/notificationService";
import { emitOrderUpdated } from "@/lib/events/orderEvents";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { useDriverPayRates } from "@/hooks/useDriverPayRates";
import { driverPayService } from "@/services/driverPayService";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { formatLocalTime } from "@/lib/localFormat";
import { toLocalISO } from "@/lib/localDate";
import { sumDriverShiftMilliseconds } from "@/lib/driverClock";

type Order = Tables<"orders">;
type DriverAssignment = Tables<"driver_assignments">;

interface Job {
  id: string;
  order_number: string;
  client_name: string;
  // Wave 46 T5 - driver previously couldn't ring the client when
  // they hit the venue (locked gate, on-site contact only). Now
  // surfaces the contact phone + any special instructions inline.
  client_phone?: string | null;
  venue_address: string;
  venue_lat?: number | null;
  venue_lng?: number | null;
  guest_count: number;
  event_time: string;
  status: string;
  event_date: string;
  pickup_time?: string;
  delivery_distance_km?: number | null;
  special_instructions?: string | null;
}

function DriverDashboardInner() {
  const { user, userRoles } = useAuth();
  const { withSlug } = useTenantHref();
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id ?? null);
  // WTR-A: combined field-staff portal. A staffer with the 'waiter'
  // role (or both driver + waiter) sees service-phase widgets on top
  // of the driver UI. Same URL, same login, role-aware widget mix.
  const isWaiter = Array.isArray(userRoles)
    ? userRoles.includes(UserRole.WAITER)
    : (user as any)?.role === "waiter" || (user as any)?.active_role === "waiter";
  const { toast } = useToast();
  // Wave 24: tenant-currency aware so a UK / US driver doesn't see "R"
  // on the earnings tile. The earnings page already had this; the
  // dashboard tile was the last hardcoded "R" in the driver portal.
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  const [jobs, setJobs] = useState<Job[]>([]);
  // Counted separately from `jobs`: the jobs queries only load in-flight
  // statuses, so a derived completed count over `jobs` is structurally 0.
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Command-centre restructure (2026-07-02): every data load on this
  // page now surfaces failures with a Retry card instead of silently
  // console.error-ing into an empty dashboard.
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [earningsLoaded, setEarningsLoaded] = useState(false);
  const [earningsTick, setEarningsTick] = useState(0);
  // DRV-C (driver deep audit, DRV-9): payRates resolution lifted to
  // a shared hook so /routes and /dashboard read from the same
  // source. The hook handles per-driver override falling back to
  // companies.default_*; used to compute "Today's Potential
  // Earnings" from callout + round-trip distance * rate.
  const { payRates } = useDriverPayRates();

  // Wave 70.12 - today's clocked hours so the earnings widget can
  // include the hourly portion (clocked_hours x hourly_rate) on top
  // of the per-delivery callout + km calc. Bobby's reality: drivers
  // get paid for showing up even when no jobs land, so a clocked
  // 0.2h shift should not display as R0 earnings.
  const [hoursWorkedToday, setHoursWorkedToday] = useState(0);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursLoaded, setHoursLoaded] = useState(false);
  const [hoursTick, setHoursTick] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetchHours = async () => {
      const todayIso = toLocalISO(new Date());
      const { data, error } = await (supabase as any)
        .from("driver_shifts")
        .select("actual_start, actual_end, status")
        .eq("driver_id", user.id)
        .eq("shift_date", todayIso)
        .is("deleted_at", null);
      if (cancelled) return;
      if (error) {
        // Pre-restructure this swallowed the failure and the hourly
        // portion silently rendered as zero. Surface it with Retry.
        console.error("Error loading today's clocked hours:", error);
        setHoursError(error.message || "We couldn't load your clocked hours for today.");
        return;
      }
      // Split shifts are separate immutable rows. Sum each session rather
      // than stretching the first clock-in to the final clock-out, which
      // would pay the off-duty gap between them.
      const totalMs = sumDriverShiftMilliseconds(
        (data || []) as Array<{ actual_start: string | null; actual_end: string | null }>,
      );
      setHoursError(null);
      setHoursLoaded(true);
      setHoursWorkedToday(totalMs / 3_600_000);
    };
    void fetchHours();
    // Re-tick every 60s so an active shift's running hours update
    // without a page refresh.
    const t = setInterval(fetchHours, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user?.id, hoursTick]);

  // Phase 5: POD capture + decline dialogs
  const [podJob, setPodJob] = useState<Job | null>(null);
  // DRV-H (driver deep audit, DRV-34 / DRV-49): "Status step" dialog.
  // This state must exist before interrupted-POD recovery below: a nested
  // Status capture owns its marker and must never be replaced by podJob.
  const [confirmJob, setConfirmJob] = useState<Job | null>(null);

  // Interrupted-POD recovery (Callum, Pic 92). PodCaptureDialog writes
  // a localStorage marker while a capture is in progress and clears it
  // on explicit close/save. If the marker is still there when this
  // page (re)mounts with jobs loaded, the page died mid-capture (some
  // Androids kill the tab while the native camera is in the
  // foreground) - reopen the dialog so the driver finishes the POD
  // instead of it silently vanishing. 15-minute freshness cap keeps a
  // marker from a days-old abandoned session from popping the dialog.
  useEffect(() => {
    if (confirmJob || podJob || jobs.length === 0) return;
    try {
      const pending = readPendingPodCapture();
      if (!pending?.orderId || !pending.at || Date.now() - pending.at > POD_PENDING_MAX_AGE_MS) {
        clearPendingPodCapture();
        return;
      }
      const job = jobs.find((j) => j.id === pending.orderId);
      if (!job) {
        // Not in the in-flight list any more (delivered via another
        // surface, reassigned, cancelled) - nothing to resume.
        clearPendingPodCapture();
        return;
      }
      // The marker records which dialog owned the native-camera round trip.
      // Never replace a nested Setup-completed capture with the top-level
      // Confirm-delivery dialog: that remount discards the File object and
      // changes the write cascade. Untagged pre-deploy markers came from the
      // reported Status flow, so recover them there as the safe default.
      if (pendingPodRecoveryFlow(pending) === "direct") setPodJob(job);
      else setConfirmJob(job);
      toast({
        title: "Resuming delivery confirmation",
        description: "The proof-of-delivery window was interrupted. Please retake the photo.",
      });
    } catch {
      /* localStorage unavailable or corrupt marker - ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, confirmJob, podJob]);
  const [declineCtx, setDeclineCtx] = useState<{ assignmentId: string; orderId: string; clientName?: string } | null>(null);
  // Map order_id -> assignment_id so the decline dialog can target the right row
  const [assignmentByOrder, setAssignmentByOrder] = useState<Record<string, string>>({});
  // Phase 5B: chat dialog
  const [chatJob, setChatJob] = useState<Job | null>(null);
  // Kitchen origin: driver's region kitchen if set, otherwise company HQ
  const { origin: kitchenOrigin } = useKitchenOrigin(user?.id, user?.company_id);

  // Foreground GPS pinger. Drip-feeds the driver's coords to
  // driver_locations while they have at least one active job loaded.
  // The hook bails when activeOrderIds is empty, so a driver browsing
  // the portal at home doesn't burn battery. Audit Driver G7.
  const activeOrderIds = jobs.map((j) => j.id);
  const { isTracking: gpsActive, lastPingAt, lastError: gpsError, wakeLockHeld } =
    useDriverGPSPing(user?.id ?? null, activeOrderIds);

  const driverName = user?.full_name || user?.email?.split("@")[0] || "Driver";

  // Load driver's assigned orders
  const loadDriverJobs = async () => {
    if (!user?.id || !user?.company_id) return;

    try {
      setLoading(true);
      setJobsError(null);

      // DRV-B (driver deep audit, DRV-5 / DRV-13 / DRV-46):
      //
      // We keep two queries because they cover different concerns:
      //   (a) driver_assignments captures mid-flight dispatch state
      //       (assigned -> accepted -> en_route -> picked_up -> at_venue).
      //   (b) orders.assigned_driver_id / driver_id catches newly-confirmed
      //       orders that don't yet have a driver_assignments row (legacy
      //       dispatch path).
      //
      // Both queries now:
      //   - filter `deleted_at IS NULL` (DRV-13) so soft-deleted rows
      //     can't ghost into the active list.
      //   - apply a server-side date window of [today, today + 14 days)
      //     on event_date (DRV-46) so a multi-year tenant doesn't haul
      //     back the entire history on every load + realtime tick.
      //
      // The dedup further down is assignment-wins (assignments are
      // pushed into the array first, then filtered by index === first
      // appearance) so the more-granular dispatch status takes
      // precedence over the bare order status when both exist.
      const todayISO = toLocalISO(new Date());
      const horizonDate = new Date();
      horizonDate.setDate(horizonDate.getDate() + 14);
      const horizonISO = toLocalISO(horizonDate);
      // Collections happen AFTER the event (often the next day), so an
      // event_date >= today lower bound would drop a pending collection
      // trip off the driver's active list the morning after - which also
      // silently stops the GPS pinger mid-collection (no active job ->
      // no ping -> client live map goes stale). Reach back a week for the
      // assignment query so post-event collection assignments stay live.
      // The active-status filter already keeps this to live assignments.
      const collectionGraceDate = new Date();
      collectionGraceDate.setDate(collectionGraceDate.getDate() - 7);
      const collectionGraceISO = toLocalISO(collectionGraceDate);

      // Get driver's assignments
      // Wave 46 T5 - pull client_phone + special_instructions so the
      // driver doesn't get stuck at a locked venue with no number
      // to call, and sees any "back gate, ring up first" notes.
      const { data: assignments, error: assignmentsError } = await supabase
        .from("driver_assignments")
        .select(`
          id,
          order_id,
          status,
          orders!inner (
            id,
            order_number,
            client_name,
            client_phone,
            venue_address,
            venue_lat,
            venue_lng,
            guest_count,
            event_time,
            event_date,
            status,
            pickup_time,
            delivery_distance_km,
            special_instructions,
            driver_acknowledged_at
          )
        `)
        .eq("driver_id", user.id)
        .eq("company_id", user.company_id)
        // driver_assignments has no deleted_at column (the .is("deleted_at",null)
        // here 400'd the whole assignments load -> driver saw no jobs). Soft-
        // delete isn't modelled on this table; the status filter below already
        // scopes to live, actionable assignments.
        .in("status", ["assigned", "accepted", "en_route", "picked_up", "at_venue"])
        .gte("orders.event_date", collectionGraceISO)
        .lte("orders.event_date", horizonISO)
        .order("assigned_at", { ascending: false });

      if (assignmentsError) {
        // Pre-restructure this early-returned after a console.error,
        // leaving the driver staring at an empty "No deliveries"
        // dashboard. Surface it with a Retry card instead.
        console.error("Error loading assignments:", assignmentsError);
        setJobsError(assignmentsError.message || "We couldn't load your assigned jobs.");
        return;
      }

      // Also get orders directly assigned to driver. Catering orders may
      // have either `driver_id` (legacy) or `assigned_driver_id` (current
      // dispatch flow) populated, so we OR across both columns.
      const { data: directOrders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .or(`assigned_driver_id.eq.${user.id},driver_id.eq.${user.id}`)
        .in("status", ["confirmed", "preparing", "ready", "in_transit"])
        .gte("event_date", todayISO)
        .lte("event_date", horizonISO)
        .order("event_date", { ascending: true });

      if (ordersError) {
        console.error("Error loading orders:", ordersError);
        setJobsError(ordersError.message || "We couldn't load your assigned deliveries.");
        return;
      }

      // Build order_id -> assignment_id map so decline dialog can target the row
      const assignmentMap: Record<string, string> = {};
      for (const a of (assignments || []) as any[]) {
        if (a.order_id && a.id) assignmentMap[a.order_id] = a.id;
      }
      setAssignmentByOrder(assignmentMap);

      // Combine and deduplicate
      const assignmentJobs: Job[] = (assignments || [])
        .filter((a: any) => a.orders)
        .map((a: any) => ({
          id: a.orders.id,
          order_number: a.orders.order_number,
          client_name: a.orders.client_name,
          venue_address: a.orders.venue_address,
          venue_lat: a.orders.venue_lat ?? null,
          venue_lng: a.orders.venue_lng ?? null,
          guest_count: a.orders.guest_count,
          event_time: a.orders.event_time || "TBD",
          status: a.status,
          event_date: a.orders.event_date,
          pickup_time: a.orders.pickup_time,
          delivery_distance_km: a.orders.delivery_distance_km ?? null,
          // Wave 46 T5
          client_phone: a.orders.client_phone ?? null,
          special_instructions: a.orders.special_instructions ?? null,
        }));

      const directJobs: Job[] = (directOrders || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        client_name: o.client_name || "Client",
        venue_address: o.venue_address,
        venue_lat: o.venue_lat ?? null,
        venue_lng: o.venue_lng ?? null,
        guest_count: o.guest_count,
        event_time: o.event_time || "TBD",
        status: o.status || "pending",
        event_date: o.event_date,
        pickup_time: o.pickup_time,
        delivery_distance_km: o.delivery_distance_km ?? null,
        // Wave 46 T5
        client_phone: o.client_phone ?? null,
        special_instructions: o.special_instructions ?? null,
      }));

      // Deduplicate by order ID
      const uniqueJobs = [...assignmentJobs, ...directJobs].filter(
        (job, index, self) => self.findIndex((j) => j.id === job.id) === index
      );

      setJobs(uniqueJobs);

      // Today's completed/delivered count. The two queries above only
      // load in-flight statuses, so it must come from its own query or
      // "Completed today" is stuck at 0.
      try {
        const { count: doneCount } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", user.company_id)
          .is("deleted_at", null)
          .or(`assigned_driver_id.eq.${user.id},driver_id.eq.${user.id}`)
          .in("status", ["delivered", "completed"])
          .eq("event_date", todayISO);
        setCompletedTodayCount(doneCount || 0);
      } catch (countErr) {
        console.warn("[driver dashboard] completed-today count failed:", countErr);
      }

      // Auto-acknowledge any unacked assignments. Opening the driver
      // app IS the acknowledgement - the audit gap was "admin doesn't
      // know if driver saw the dispatch". Loading the dashboard is
      // proof they saw it. Fire-and-forget per order; the API
      // endpoint is idempotent so re-firing on already-acked orders
      // is a cheap no-op.
      //
      // Restructure fix (2026-07-02): pre-fix only directOrders fed
      // this, so an order that surfaced purely through a
      // driver_assignments row (dispatch flow, no
      // orders.assigned_driver_id) was never acked and admin kept
      // chasing a driver who had already seen it. Both sources now
      // feed a deduped set.
      const unackedIds = new Set<string>();
      for (const o of (directOrders || []) as any[]) {
        if (o?.id && !o.driver_acknowledged_at) unackedIds.add(o.id);
      }
      for (const a of (assignments || []) as any[]) {
        if (a?.orders?.id && !a.orders.driver_acknowledged_at) unackedIds.add(a.orders.id);
      }
      if (unackedIds.size > 0) {
        void Promise.allSettled(
          Array.from(unackedIds).map((id) =>
            fetch(`/api/orders/${id}/driver-ack`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ via: "in_app" }),
            }),
          ),
        ).catch((e) => console.warn("[driver dashboard] auto-ack fire failed:", e));
      }
    } catch (error: any) {
      console.error("Error in loadDriverJobs:", error);
      setJobsError(error?.message || "Something went wrong while loading your jobs.");
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!user?.id) return;

    // Load initial jobs
    loadDriverJobs();

    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribeToNotifications(
      user.id,
      (notification: Notification) => {
        console.log("🔔 Real-time notification received:", notification);

        // NotificationBell (mounted by DriverNav/PortalSidebar) owns the
        // shared, unlocked sound so this page does not play a duplicate.
        if (notification.notification_type === "order_ready") {
          // Show toast
          toast({
            title: notification.title,
            description: notification.message,
            duration: 10000,
            className: "bg-brand-primary/10 border-brand-primary",
          });

          // Reload jobs to show updated status
          loadDriverJobs();
        }

        // Update unread count
        notificationService.getUnreadCount(user.id, "driver").then(setUnreadCount);
      },
      "driver"
    );

    // Load initial unread count
    notificationService.getUnreadCount(user.id, "driver").then(setUnreadCount);

    return () => {
      unsubscribe();
    };
  }, [user?.id, toast, refreshSignal]);

  // DRV-D (driver deep audit, DRV-10 / DRV-23 / DRV-47): earnings
  // totals agreement.
  //
  // Pre-fix: this effect summed `driver_assignments.total_earnings`
  // across ALL TIME for the driver. A 3-year tenured driver saw a
  // giant cumulative rand figure and the /earnings page (which
  // computes via driverPayService.getPaySummary on a date window)
  // reported a completely different "this month" number. Two
  // surfaces, two contradictory truths.
  //
  // Post-fix: scope to the month-to-date window that /earnings
  // defaults to. Compute through the same getPaySummary code path
  // so the dashboard tile and /earnings always agree. The hourly
  // + distance + callout split is summed into grand_total here -
  // the tile just shows one number.
  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    let cancelled = false;

    const loadEarnings = async () => {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const fromIso = toLocalISO(startOfMonth);
        const toIso = toLocalISO(now);
        const summary = await driverPayService.getPaySummary({
          companyId: user.company_id,
          driverId: user.id,
          range: { from: fromIso, to: toIso },
        });
        if (!cancelled) {
          setEarningsError(null);
          setEarningsLoaded(true);
          setTotalEarnings(summary.totals.grand_total || 0);
        }
      } catch (e: any) {
        // Pre-restructure this swallowed the failure and the tile
        // showed R0 month-to-date. Surface it with a Retry card.
        console.error("Error loading driver earnings:", e);
        if (!cancelled) {
          setEarningsError(e?.message || "We couldn't load your month-to-date earnings.");
        }
      }
    };

    loadEarnings();
    return () => { cancelled = true; };
  }, [user?.id, user?.company_id, jobs.length, refreshSignal, earningsTick]);

  // Subscribe to order updates (when status changes)
  useEffect(() => {
    if (!user?.id || !user?.company_id) return;

    // Phase 6 audit: per-tenant channel name + existing company_id
    // filter. Previously the channel name was shared across every
    // driver from every tenant; the filter kept payloads tenant-safe
    // but the broadcast namespace was unnecessarily global.
    const channel = supabase
      .channel(`driver-orders:${user.company_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `company_id=eq.${user.company_id}`,
        },
        (payload) => {
          const newOrder = payload.new as Order;
          const oldOrder = payload.old as Order;

          // If status changed to ready and this driver is assigned
          if (
            newOrder.status === "ready" &&
            oldOrder.status !== "ready" &&
            (newOrder.driver_id === user.id || newOrder.assigned_driver_id === user.id)
          ) {
            console.log("🚀 Order is ready for pickup:", newOrder.order_number);
            loadDriverJobs();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.company_id]);

  const todaysJobs = jobs.filter(
    (j) => j.event_date === toLocalISO(new Date())
  );
  // Sourced from its own count query (see loadDriverJobs); the in-flight
  // `jobs` list never contains completed/delivered rows.
  const completedToday = completedTodayCount;
  // Wave 70.12 - Potential earnings now includes THREE components:
  //   1. Per-delivery callout fee (one flat charge per job)
  //   2. Per-delivery round-trip distance pay (km x rate)
  //   3. Hourly portion = hours_clocked_today x hourly_rate
  //
  // The hourly portion fires for ANY clocked-in driver, even with
  // zero jobs claimed - so a driver who clocks in to wait around
  // sees R earned for time, not R0. Pre-Wave-70.12 only the
  // delivery components counted, so a 0.2h shift with 0 deliveries
  // rendered R0 - which Bobby flagged as wrong.
  const todaysDeliveryEarnings = (() => {
    if (!payRates) return 0;
    return todaysJobs.reduce((sum, j) => {
      const oneWay = Number(j.delivery_distance_km || 0);
      const distancePay = oneWay * 2 * payRates.distance_rate_per_km;
      return sum + payRates.base_callout_fee + distancePay;
    }, 0);
  })();
  const todaysHourlyEarnings = payRates && hoursWorkedToday > 0
    ? hoursWorkedToday * payRates.hourly_rate
    : 0;
  const todaysPotentialEarnings = todaysDeliveryEarnings + todaysHourlyEarnings;

  /**
   * Open Google Maps with kitchen as origin and the venue as destination.
   * Falls back to address-only origin if HQ coords are missing, and to
   * device GPS if no kitchen address is set on the company at all.
   */
  const openNavigation = (job: Job) => {
    openMapsNavigation(
      { lat: job.venue_lat, lng: job.venue_lng, address: job.venue_address },
      kitchenOrigin ?? undefined,
    );
  };

  // Semantic status tints: brand = delivered/ready (success),
  // brand = en-route/in-flight (active), slate = assigned/neutral.
  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/10 dark:text-brand-primary dark:border-brand-primary/30";
      case "assigned":
      case "accepted":
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
      case "en_route":
      case "picked_up":
        return "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary dark:border-brand-primary/20";
      case "delivered":
      case "completed":
        return "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/10 dark:text-brand-primary dark:border-brand-primary/30";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ready":
        return "Ready for pickup";
      case "assigned":
        return "Assigned";
      case "accepted":
        return "Accepted";
      case "en_route":
        return "En route";
      case "picked_up":
        return "Picked up";
      case "delivered":
        return "Delivered";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  };

  // Hero band context: tenant-brand PortalHeader painted by
  // DriverPageShell. Chips only render once their data source has
  // loaded without error (command-centre standard).
  const todayLabel = new Date().toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const heroChip =
    "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white";

  return (
    <>
      <DriverPageShell
        pageTitle="Driver today - CateringMS"
        heading={<>Welcome back, {driverName.split(" ")[0]}</>}
        subheading={
          jobsError
            ? todayLabel
            : loading
              ? `${todayLabel}. Loading your deliveries...`
              : `${todayLabel}. ${jobs.length} assigned ${jobs.length === 1 ? "job" : "jobs"} in your work window.`
        }
        icon={Truck}
        width="full"
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void loadDriverJobs()}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {/* DRV-J (driver deep audit, DRV-32 / DRV-60):
                paper backup. A driver in a cab at 6am with a
                flat phone battery still needs to know who's
                where today. Print walks the current jobs list
                (already date-windowed by DRV-B). */}
            <Button
              variant="outline"
              onClick={() => {
                if (jobs.length === 0) {
                  toast({ title: "Nothing to print", description: "No assigned jobs in your work window." });
                  return;
                }
                setTimeout(() => window.print(), 100);
              }}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Print run sheet
            </Button>
          </div>
        }
        meta={
          <>
            {!loading && !jobsError && (
              <span className={heroChip}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {todaysJobs.length} {todaysJobs.length === 1 ? "job" : "jobs"} today
              </span>
            )}
            {hoursLoaded && !hoursError && (
              <span className={heroChip}>
                <Clock className="h-3 w-3" />
                {hoursWorkedToday.toFixed(1)}h clocked today
              </span>
            )}
            {earningsLoaded && !earningsError && (
              <span className={heroChip}>
                <Banknote className="h-3 w-3" />
                {tenantCurrency.format(totalEarnings, 0)} month to date
              </span>
            )}
            {unreadCount > 0 && (
              <span className={heroChip}>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {unreadCount} new {unreadCount === 1 ? "alert" : "alerts"}
              </span>
            )}
            {/* Bobby's brief: after a claim, the driver should see an
                unmistakable path to the route page where the new job
                lives. */}
            {!loading && !jobsError && jobs.length > 0 && (
              <Link
                href={withSlug("/team-portal/driver/routes")}
                className={`${heroChip} hover:bg-white/20 transition-colors duration-150`}
              >
                <RouteIcon className="h-3 w-3" />
                Route board ({jobs.length})
              </Link>
            )}
          </>
        }
        overview={
          jobsError ? undefined : (
            <PortalOverview
              eyebrow="Driver workspace"
              title={
                loading
                  ? "Loading your work for today"
                  : jobs.length > 0
                    ? "Start with your next pickup, then work the route"
                    : "No assigned deliveries in your work window"
              }
              description="This page is the driver's first stop: clock in, see the next pickup, open the route board, claim open jobs, and check GPS sharing before leaving the kitchen."
              items={[
                { label: "Assigned", value: jobs.length, helper: "Active work window", icon: Truck, tone: jobs.length > 0 ? "brand" : "neutral" },
                { label: "Today", value: todaysJobs.length, helper: "Scheduled for today", icon: CalendarDays, tone: "neutral" },
                { label: "Left to do", value: Math.max(todaysJobs.length - completedToday, 0), helper: `${completedToday} completed`, icon: Clock, tone: todaysJobs.length - completedToday > 0 ? "warning" : "success" },
                { label: "Alerts", value: unreadCount, helper: unreadCount > 0 ? "Needs a look" : "All clear", icon: Bell, tone: unreadCount > 0 ? "danger" : "success" },
              ]}
              actions={
                <>
                  <Button asChild size="sm" className="bg-brand-primary text-white hover:opacity-90">
                    <Link href={withSlug("/team-portal/driver/routes")}>Open route board</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={withSlug("/team-portal/driver/deliveries")}>All deliveries</Link>
                  </Button>
                </>
              }
            />
          )
        }
      >
        {/* #today anchor kept for the DriverNav deep-link. */}
          <div id="today" className="scroll-mt-24">

            {/* Recovery card: the assignments/orders load failed.
                Pre-restructure this state rendered as a silently
                empty dashboard. */}
            {jobsError && (
              <div className="mb-4 sm:mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-slate-900">
                <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load your deliveries</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{jobsError}</p>
                <Button
                  size="sm"
                  onClick={() => void loadDriverJobs()}
                  disabled={loading}
                  className="bg-brand-primary hover:opacity-90 text-white"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            )}

            {/* DRV-F (driver deep audit, DRV-38): "Next pickup at HH:MM
                @ {venue}" as the largest glanceable element. Most-asked
                driver question - currency (in the Earnings card below)
                is motivation; pickup time is action. High-contrast for
                sunlight legibility; tap-to-call client phone built in. */}
            {!loading && jobs.length > 0 && (() => {
              // Sort by event_date asc, then pickup_time asc, take the
              // earliest still-pending job. Filter out delivered so the
              // banner advances to the next stop after each handover.
              const nextPickup = [...jobs]
                .filter((j) => j.status !== "delivered" && j.status !== "completed")
                .sort((a, b) => {
                  const aKey = `${a.event_date} ${a.pickup_time || a.event_time || ""}`;
                  const bKey = `${b.event_date} ${b.pickup_time || b.event_time || ""}`;
                  return aKey.localeCompare(bKey);
                })[0];
              if (!nextPickup) return null;
              const pickupLabel = nextPickup.pickup_time || nextPickup.event_time;
              return (
                <PortalCard className="mb-4 sm:mb-6 border-l-4 border-l-brand-primary">
                  <p className="text-xs sm:text-sm uppercase tracking-wide font-semibold text-brand-primary mb-1.5">Next pickup</p>
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-3xl sm:text-4xl md:text-5xl font-semibold tabular-nums leading-tight text-slate-900 dark:text-white">
                        {pickupLabel || "Time TBD"}
                      </p>
                      <p className="text-base sm:text-lg font-semibold mt-1 truncate text-slate-900 dark:text-white">
                        {nextPickup.client_name}
                      </p>
                      <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 truncate">
                        {nextPickup.venue_address}
                      </p>
                    </div>
                    {nextPickup.client_phone && (
                      <a
                        href={`tel:${nextPickup.client_phone}`}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-primary text-white font-semibold min-h-11 hover:opacity-90 transition-opacity duration-150"
                      >
                        <Bell className="w-4 h-4" />
                        Call client
                      </a>
                    )}
                  </div>
                </PortalCard>
              );
            })()}

            {/* ODOC H.9: top-of-page operational block. Bobby's brief:
                the driver should land on earnings + jobs + their list,
                not on a stack of system widgets (welcome banner / shift
                history / PWA prompt). Welcome stack moves below; the
                stuff that pays the rent (earnings) and tells them what
                to do today (stats + deliveries) sits at the top of the
                page where the first scroll lives. */}

            {/* Recovery card: clocked-hours / month-to-date earnings
                loads failed. Pre-restructure both fetches swallowed
                errors and quietly rendered zeros, which reads as
                "you earned nothing" to a driver. */}
            {(hoursError || earningsError) && (
              <div className="mb-4 sm:mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-slate-900">
                <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Some earnings figures didn&apos;t load</h2>
                {hoursError && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Clocked hours: {hoursError}</p>
                )}
                {earningsError && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Month to date: {earningsError}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {hoursError && (
                    <Button size="sm" onClick={() => setHoursTick((n) => n + 1)} className="bg-brand-primary hover:opacity-90 text-white">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry hours
                    </Button>
                  )}
                  {earningsError && (
                    <Button size="sm" onClick={() => setEarningsTick((n) => n + 1)} className="bg-brand-primary hover:opacity-90 text-white">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry earnings
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Today's Earnings Summary */}
            <PortalCard className="mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1">Today's potential earnings</p>
                  <div className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
                    {tenantCurrency.format(todaysPotentialEarnings, 0)}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2">
                    {todaysJobs.length} {todaysJobs.length === 1 ? "delivery" : "deliveries"} scheduled -{" "}
                    {completedToday} completed
                  </p>
                  {(todaysHourlyEarnings > 0 || todaysDeliveryEarnings > 0) && payRates && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {todaysHourlyEarnings > 0 && (
                        <span className="inline-flex items-center gap-1" title={`${hoursWorkedToday.toFixed(2)}h x ${tenantCurrency.format(payRates.hourly_rate, 0)}/h`}>
                          <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          <span className="tabular-nums">{hoursWorkedToday.toFixed(2)}h</span> -
                          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{tenantCurrency.format(todaysHourlyEarnings, 0)}</span>
                        </span>
                      )}
                      {todaysDeliveryEarnings > 0 && (
                        <span className="inline-flex items-center gap-1" title="Callout + round-trip km">
                          <Truck className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          <span>{todaysJobs.length} drop{todaysJobs.length === 1 ? "" : "s"}</span> -
                          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{tenantCurrency.format(todaysDeliveryEarnings, 0)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-left sm:text-right w-full sm:w-auto">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center mb-2 mx-auto sm:mx-0 dark:border-slate-700 dark:bg-slate-800">
                    <TrendingUp className="w-7 h-7 sm:w-8 sm:h-8 text-brand-primary" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-right">This month</p>
                  <p className="text-base sm:text-lg font-semibold tabular-nums text-slate-900 dark:text-white text-center sm:text-right">
                    {tenantCurrency.format(totalEarnings, 0)}
                  </p>
                </div>
              </div>
            </PortalCard>

            {/* Stats Grid - 4 KPI tiles. Moved up with the earnings
                + deliveries block (ODOC H.9). */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6">
              <StatTile
                icon={Truck}
                label="Today's jobs"
                value={todaysJobs.length}
                hint="Deliveries assigned to you today"
              />
              <StatTile
                icon={CheckCircle}
                label="Completed"
                value={completedToday}
                hint="Finished and signed off today"
              />
              <StatTile
                icon={Clock}
                label="Pending"
                value={todaysJobs.length - completedToday}
                hint="Still left to do today"
              />
              <StatTile
                icon={Banknote}
                label="This month"
                value={tenantCurrency.format(totalEarnings)}
                hint="Hourly + distance + callout"
              />
            </div>

            {/* My Deliveries - moved up with the earnings + stats
                block (ODOC H.9). Every active job carries an "Open
                brief" pill to the unified /order/[id]?role=driver
                doc. */}
            <PortalCard className="mb-4 sm:mb-6">
              <PortalCardHeader title="My deliveries" />
              <div className="space-y-2 sm:space-y-3">
                  {loading ? (
                    <div className="space-y-2" aria-busy="true" aria-label="Loading deliveries">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="h-20 rounded-xl border border-slate-200 bg-white animate-pulse dark:border-slate-800 dark:bg-slate-900" />
                      ))}
                    </div>
                  ) : jobs.length === 0 ? (
                    jobsError ? (
                      // Don't claim "no deliveries scheduled" when the
                      // load actually failed; the Retry card above owns
                      // the recovery action.
                      <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                        Your deliveries are unavailable right now. Use Retry above to reload them.
                      </p>
                    ) : (
                      <div className="text-center py-10 px-4">
                        <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                          <Truck className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                        </div>
                        <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">No deliveries scheduled</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
                          Once dispatch assigns you to an event, it'll show up here with the route, ETA and pickup details.
                        </p>
                      </div>
                    )
                  ) : (
                    jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-slate-200 hover:border-brand-primary/50 transition-colors duration-150 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-primary/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-semibold text-xs sm:text-sm md:text-base text-slate-900 dark:text-white">
                              {job.client_name}
                            </h4>
                            <Badge className={`${getStatusColor(job.status)} text-xs`}>
                              {getStatusLabel(job.status)}
                            </Badge>
                            <Link
                              href={withSlug(staffOrderHref(job.id, "driver"))}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-brand-primary bg-brand-primary/10 border border-brand-primary/20 hover:bg-brand-primary/20 transition-colors duration-150 dark:text-brand-primary dark:bg-brand-primary/20 dark:border-brand-primary/20 dark:hover:bg-brand-primary/30"
                              title="Open the driver brief for this order"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open brief
                            </Link>
                          </div>
                          <div className="space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                              <span className="truncate">{job.venue_address}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                              <span>Event: {job.event_time}</span>
                              <span>-</span>
                              <span className="tabular-nums">{job.guest_count} guests</span>
                              <span>-</span>
                              <span>Order: {job.order_number}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => openNavigation(job)}
                            className="flex-1 sm:flex-none min-h-11 px-3 text-sm"
                          >
                            <Navigation className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Navigate</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setChatJob(job)}
                            className="flex-1 sm:flex-none min-h-11 px-3 text-sm"
                            title="Chat with dispatcher"
                          >
                            <MessageCircle className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Chat</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setConfirmJob(job)}
                            className="flex-1 sm:flex-none min-h-11 px-3 text-sm"
                            title="Stamp status milestone (en route / at kitchen / arrived)"
                          >
                            <CheckCircle className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Status</span>
                          </Button>
                          {["ready", "in_transit", "delivered"].includes(job.status) && (
                            <Button
                              className="flex-1 sm:flex-none min-h-11 px-3 text-sm bg-brand-primary hover:opacity-90 text-white gap-1"
                              onClick={() => setPodJob(job)}
                            >
                              <Camera className="w-4 h-4" />
                              <span>Confirm delivery</span>
                            </Button>
                          )}
                          {(job.status === "assigned" || job.status === "accepted") && assignmentByOrder[job.id] && (
                            <Button
                              variant="outline"
                              className="flex-1 sm:flex-none min-h-11 px-3 text-sm text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-900 dark:hover:bg-rose-950/40"
                              onClick={() => setDeclineCtx({
                                assignmentId: assignmentByOrder[job.id],
                                orderId: job.id,
                                clientName: job.client_name,
                              })}
                            >
                              <X className="w-4 h-4" />
                              <span className="hidden sm:inline">Decline</span>
                            </Button>
                          )}
                        </div>
                        {["ready", "in_transit", "picked_up", "at_venue"].includes(job.status) && (
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                            <RunningLateChips
                              orderId={job.id}
                              onBroadcast={() => {
                                emitOrderUpdated(job.id, "driver/dashboard:running-late", ["status"]);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
              </div>
            </PortalCard>

            {/* Phase 10 #10: one-tap clock-in / clock-out.
             *  Replaces the only-after-the-fact admin-logged shift
             *  flow with a real-time clock. Drives the BCEA
             *  fatigue checks (Phase 7 #2) honestly. */}
            <div id="clock" className="mb-4 sm:mb-6 scroll-mt-24">
              <DriverClockButton driverId={user?.id} companyId={user?.company_id} />
            </div>

            {/* Wave 43 T2: driver self-claim surface. Lists confirmed
                orders in this company that are still unassigned --
                one-tap Claim calls the SECURITY DEFINER claim_order
                RPC which atomically locks the order to this driver,
                inserts the driver_assignments row, fires the admin
                notification. Refreshes loadDriverJobs() so the
                claimed order appears in active deliveries. */}
            <WidgetErrorBoundary label="Available jobs">
              <AvailableJobsCard onClaimed={loadDriverJobs} />
            </WidgetErrorBoundary>

            {/* WTR-A (XSC Wave C, task #259): waiter / on-site
                server panel. Renders only when the user has the
                'waiter' role. The same person who drives can also
                be a waiter at the same event - this surface
                handles the service phases (arrived, setup, guests
                arrived, service started/ended, event complete)
                with a tap per phase, an equipment-back-to-kitchen
                helper, and a notes capture for the office. */}
            {isWaiter && (
              <div className="mb-4 sm:mb-6">
                <WidgetErrorBoundary label="Service today">
                  <WaiterServicePanel />
                </WidgetErrorBoundary>
              </div>
            )}

            {/* Phase 17 #4: recent shift history. Driver-side
             *  sanity-check for 'did I forget to clock out
             *  yesterday?' Self-hides until at least one
             *  shift is recorded. */}
            <div className="mb-4 sm:mb-6">
              <DriverShiftHistory driverId={user?.id} />
            </div>

            {/* Phase 7 #4: A2HS prompt. Renders only when the
             *  browser fires beforeinstallprompt (Chrome / Edge /
             *  Android) or when we detect iOS Safari. Self-hides
             *  if the app is already running standalone or the
             *  driver dismissed it within the last 14 days. */}
            <div className="mb-4 sm:mb-6">
              <PWAInstallPrompt />
            </div>

            {/* GPS pinger status. Quiet when no active jobs; brand
             *  pulse while the foreground hook is dripping coords to
             *  dispatch; a soft warning when geolocation was refused
             *  so the driver knows the in-app tracker isn't running.
             *  Wake-lock pill shows when the screen-keep-on is held so
             *  drivers know they don't need to manually keep tapping
             *  the phone. */}
            {activeOrderIds.length > 0 && (
              <div className="mb-4 sm:mb-6 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                {gpsActive && !gpsError ? (
                  <Badge className="bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/10 dark:text-brand-primary dark:border-brand-primary/30">
                    <MapPin className="w-3 h-3 mr-1 animate-pulse" />
                    GPS sharing on
                    {lastPingAt
                      ? ` - last ping ${formatLocalTime(lastPingAt)}`
                      : ""}
                  </Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900">
                    <MapPin className="w-3 h-3 mr-1" />
                    GPS off, dispatch can't see your live position
                  </Badge>
                )}
                {wakeLockHeld && (
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                    Screen lock disabled while on route
                  </Badge>
                )}
                {gpsError && (
                  <span className="text-slate-500 dark:text-slate-400 text-xs hidden sm:inline">
                    ({gpsError})
                  </span>
                )}
              </div>
            )}

          </div>
      </DriverPageShell>

      {/* Phase 5: POD capture */}
      {podJob && (
        <PodCaptureDialog
          open={!!podJob}
          onOpenChange={open => !open && setPodJob(null)}
          orderId={podJob.id}
          clientName={podJob.client_name}
          onSaved={() => {
            const orderId = podJob.id;
            setPodJob(null);
            // DRV-E (driver deep audit, DRV-16): broadcast on the
            // cross-tab event bus so dispatch / kitchen / calendar /
            // client portal pick up the delivered state without
            // waiting for the realtime sub.
            emitOrderUpdated(orderId, "driver/dashboard:pod-saved", ["status", "handover"]);
            loadDriverJobs();
          }}
        />
      )}

      {/* Phase 5: Decline assignment */}
      {declineCtx && user?.id && (
        <DeclineAssignmentDialog
          open={!!declineCtx}
          onOpenChange={open => !open && setDeclineCtx(null)}
          assignmentId={declineCtx.assignmentId}
          driverId={user.id}
          orderId={declineCtx.orderId}
          clientName={declineCtx.clientName}
          onDeclined={() => {
            const orderId = declineCtx.orderId;
            setDeclineCtx(null);
            // DRV-E (DRV-16): same recipe - decline frees the order
            // back to dispatch + clears assigned_driver_id. Dispatch's
            // open tab needs to see the row flip immediately.
            emitOrderUpdated(orderId, "driver/dashboard:declined", ["driver", "status"]);
            loadDriverJobs();
          }}
        />
      )}

      {/* Phase 5B: Driver chat with dispatcher */}
      <Dialog open={!!chatJob} onOpenChange={open => !open && setChatJob(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              Chat - {chatJob?.client_name}
            </DialogTitle>
          </DialogHeader>
          {chatJob && user?.id && user?.company_id && (
            <OrderChatPanel
              companyId={user.company_id}
              orderId={chatJob.id}
              userId={user.id}
              senderRole="driver"
              maxHeight="320px"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* DRV-H (DRV-34 / DRV-49): 4-stage status checklist surfaced
          as a dialog on the dashboard. Lets the driver tap "Arrived
          at venue" from the home screen without navigating to
          /deliveries. The panel does its own GPS + write workflow
          via driverConfirmationService. */}
      <DriverStatusDialog job={confirmJob} onClose={() => setConfirmJob(null)} />

      {/* AI Chatbot */}
      <ChatBot userRole="driver" companyId={user?.company_id} />

      {/* DRV-J (DRV-32 / DRV-60): print-only day's run sheet. Hidden
          on screen via the print CSS below. One row per active job
          with the data a driver needs at a venue with no signal:
          event date+time, pickup, client + phone, venue address,
          guest count, special instructions, status. Walks the same
          jobs array as the on-screen list (already date-windowed). */}
      <div id="print-driver-run-sheet" className="print-only">
        <h1 style={{ fontSize: "18pt", marginBottom: "4pt", fontFamily: "sans-serif" }}>
          {driverName} - run sheet
        </h1>
        <p style={{ fontSize: "10pt", color: "#475569", marginBottom: "14pt", fontFamily: "sans-serif" }}>
          {new Date().toLocaleString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" - "}
          {jobs.length} {jobs.length === 1 ? "delivery" : "deliveries"}
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt", fontFamily: "sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #0f172a" }}>
              <th style={{ textAlign: "left", padding: "4pt" }}>Event</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Pickup</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Client</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Phone</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Venue</th>
              <th style={{ textAlign: "right", padding: "4pt" }}>Guests</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} style={{ borderBottom: "1px solid #cbd5e1", pageBreakInside: "avoid" }}>
                <td style={{ padding: "6pt 4pt" }}>
                  <strong>{job.event_date}</strong>
                  {job.event_time ? <span style={{ color: "#64748b" }}> {job.event_time}</span> : null}
                </td>
                <td style={{ padding: "6pt 4pt" }}>
                  {job.pickup_time
                    ? <strong>{job.pickup_time}</strong>
                    : <span style={{ color: "#dc2626", fontWeight: 700 }}>SET</span>}
                </td>
                <td style={{ padding: "6pt 4pt" }}>{job.client_name}</td>
                <td style={{ padding: "6pt 4pt" }}>{job.client_phone || ""}</td>
                <td style={{ padding: "6pt 4pt" }}>{job.venue_address}</td>
                <td style={{ padding: "6pt 4pt", textAlign: "right" }}>{job.guest_count}</td>
                <td style={{ padding: "6pt 4pt", textTransform: "uppercase", fontSize: "8.5pt", letterSpacing: "0.5pt", color: "#475569" }}>
                  {job.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.some((j) => j.special_instructions) && (
          <div style={{ marginTop: "14pt", borderTop: "1px solid #cbd5e1", paddingTop: "10pt" }}>
            <p style={{ fontSize: "10pt", fontWeight: 700, marginBottom: "6pt", fontFamily: "sans-serif" }}>Special instructions</p>
            {jobs.filter((j) => j.special_instructions).map((j) => (
              <p key={j.id} style={{ fontSize: "9.5pt", marginBottom: "4pt", fontFamily: "sans-serif" }}>
                <strong>{j.client_name}</strong> - {j.special_instructions}
              </p>
            ))}
          </div>
        )}
        <p style={{ marginTop: "18pt", fontSize: "9pt", color: "#64748b", fontFamily: "sans-serif" }}>
          Generated {new Date().toLocaleString("en-ZA")} from CateringMS Driver Portal
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 12mm; size: landscape; }
          body * { visibility: hidden !important; }
          #print-driver-run-sheet, #print-driver-run-sheet * { visibility: visible !important; }
          #print-driver-run-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
          }
        }
        @media not print {
          .print-only { display: none !important; }
        }
      `}</style>
    </>
  );
}

// DRV-A (driver deep audit, DRV-1 / DRV-2 / DRV-21): defense-in-depth.
// Every other dashboard in the audit programme is wrapped in
// ProtectedRoute; driver dashboard previously relied purely on
// `useAuth().user` for fetching, so a logged-in non-driver hitting
// the URL rendered a blank-data dashboard rather than getting bounced.
// Admin roles are admitted for support / cross-tenant troubleshooting.
export default function DriverDashboard() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.DRIVER,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <DriverDashboardInner />
    </ProtectedRoute>
  );
}
