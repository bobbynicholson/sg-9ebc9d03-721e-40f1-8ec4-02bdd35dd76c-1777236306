import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  Navigation,
  TrendingUp,
  DollarSign,
  Sparkles,
  Bell,
  Camera,
  X,
  Printer,
  Route as RouteIcon,
} from "lucide-react";
import { PodCaptureDialog } from "@/components/driver/PodCaptureDialog";
import { DeclineAssignmentDialog } from "@/components/driver/DeclineAssignmentDialog";
import { RunningLateChips } from "@/components/driver/RunningLateChips";
import { DriverConfirmationPanel } from "@/components/driver/DriverConfirmationPanel";
import { OrderChatPanel } from "@/components/admin/dispatch/OrderChatPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle } from "lucide-react";
import { openNavigation as openMapsNavigation } from "@/lib/driverNavigation";
import { useKitchenOrigin } from "@/hooks/useKitchenOrigin";
import { useDriverGPSPing } from "@/hooks/useDriverGPSPing";
import { TeamWelcomeBanner } from "@/components/portal/TeamWelcomeBanner";
import { MyShiftTodayCard } from "@/components/portal/MyShiftTodayCard";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { AvailableJobsCard } from "@/components/driver/AvailableJobsCard";
import { PWAInstallPrompt } from "@/components/driver/PWAInstallPrompt";
import { DriverClockButton } from "@/components/driver/DriverClockButton";
import { DriverShiftHistory } from "@/components/driver/DriverShiftHistory";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { CateringDashGame } from "@/components/games/CateringDashGame";
import { ChatBot } from "@/components/ChatBot";
import Link from "next/link";
import { DriverNav } from "@/components/navigation/DriverNav";
import { UserRole } from "@/types/app";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { notificationService, Notification } from "@/services/notificationService";
import { emitOrderUpdated } from "@/lib/events/orderEvents";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MetricCard } from "@/components/dashboard/MetricCard";
import type { Tables } from "@/integrations/supabase/types";
import { useDriverPayRates } from "@/hooks/useDriverPayRates";
import { driverPayService } from "@/services/driverPayService";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { formatLocalTime } from "@/lib/localFormat";

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
  const { user } = useAuth();
  const { toast } = useToast();
  // Wave 24: tenant-currency aware so a UK / US driver doesn't see "R"
  // on the earnings tile. The earnings page already had this; the
  // dashboard tile was the last hardcoded "R" in the driver portal.
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showGame, setShowGame] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
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
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetchHours = async () => {
      const todayIso = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("driver_shifts")
        .select("actual_start, actual_end, status")
        .eq("driver_id", user.id)
        .eq("shift_date", todayIso)
        .is("deleted_at", null);
      if (error || cancelled) return;
      const now = new Date();
      let totalMs = 0;
      for (const s of (data || []) as Array<{ actual_start: string | null; actual_end: string | null; status: string }>) {
        if (!s.actual_start) continue;
        const start = new Date(s.actual_start).getTime();
        const end = s.actual_end ? new Date(s.actual_end).getTime() : now.getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          totalMs += (end - start);
        }
      }
      setHoursWorkedToday(totalMs / 3_600_000);
    };
    void fetchHours();
    // Re-tick every 60s so an active shift's running hours update
    // without a page refresh.
    const t = setInterval(fetchHours, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user?.id]);

  // Phase 5: POD capture + decline dialogs
  const [podJob, setPodJob] = useState<Job | null>(null);
  const [declineCtx, setDeclineCtx] = useState<{ assignmentId: string; orderId: string; clientName?: string } | null>(null);
  // Map order_id -> assignment_id so the decline dialog can target the right row
  const [assignmentByOrder, setAssignmentByOrder] = useState<Record<string, string>>({});
  // Phase 5B: chat dialog
  const [chatJob, setChatJob] = useState<Job | null>(null);
  // DRV-H (driver deep audit, DRV-34 / DRV-49): "Status step" dialog
  // that surfaces the full DriverConfirmationPanel (4-stage flow:
  // en route to kitchen / at kitchen / departed / at venue) one tap
  // from the home screen. The panel lives at
  // /team-portal/driver/deliveries today, so the driver couldn't
  // confirm en-route + arrived from the dashboard without
  // navigating away.
  const [confirmJob, setConfirmJob] = useState<Job | null>(null);
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
      const todayISO = new Date().toISOString().slice(0, 10);
      const horizonDate = new Date();
      horizonDate.setDate(horizonDate.getDate() + 14);
      const horizonISO = horizonDate.toISOString().slice(0, 10);

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
            special_instructions
          )
        `)
        .eq("driver_id", user.id)
        .is("deleted_at", null)
        .in("status", ["assigned", "accepted", "en_route", "picked_up", "at_venue"])
        .gte("orders.event_date", todayISO)
        .lte("orders.event_date", horizonISO)
        .order("assigned_at", { ascending: false });

      if (assignmentsError) {
        console.error("Error loading assignments:", assignmentsError);
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

      // Auto-acknowledge any unacked assignments. Opening the driver
      // app IS the acknowledgement - the audit gap was "admin doesn't
      // know if driver saw the dispatch". Loading the dashboard is
      // proof they saw it. Fire-and-forget per order; the API
      // endpoint is idempotent so re-firing on already-acked orders
      // is a cheap no-op.
      const unackedIds = (directOrders || [])
        .filter((o: any) => !o.driver_acknowledged_at)
        .map((o: any) => o.id);
      if (unackedIds.length > 0) {
        void Promise.allSettled(
          unackedIds.map((id) =>
            fetch(`/api/orders/${id}/driver-ack`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ via: "in_app" }),
            }),
          ),
        ).catch((e) => console.warn("[driver dashboard] auto-ack fire failed:", e));
      }
    } catch (error) {
      console.error("Error in loadDriverJobs:", error);
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

        // Show toast notification with sound
        if (notification.notification_type === "order_ready") {
          // Play notification sound
          const audio = new Audio("/notification.mp3");
          audio.play().catch((e) => console.log("Audio play failed:", e));

          // Show toast
          toast({
            title: notification.title,
            description: notification.message,
            duration: 10000,
            className: "bg-green-50 border-green-500",
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
  }, [user?.id, toast]);

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
        const fromIso = startOfMonth.toISOString().slice(0, 10);
        const toIso = now.toISOString().slice(0, 10);
        const summary = await driverPayService.getPaySummary({
          companyId: user.company_id,
          driverId: user.id,
          range: { from: fromIso, to: toIso },
        });
        if (!cancelled) {
          setTotalEarnings(summary.totals.grand_total || 0);
        }
      } catch (e) {
        console.error("Error loading driver earnings:", e);
      }
    };

    loadEarnings();
    return () => { cancelled = true; };
  }, [user?.id, user?.company_id, jobs.length]);

  // Subscribe to order updates (when status changes)
  useEffect(() => {
    if (!user?.id || !user?.company_id) return;

    const channel = supabase
      .channel("driver-orders")
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
    (j) => j.event_date === new Date().toISOString().split("T")[0]
  );
  const completedToday = todaysJobs.filter((j) => j.status === "completed" || j.status === "delivered").length;
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-green-100 text-green-800 border-green-300";
      case "assigned":
      case "accepted":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "en_route":
      case "picked_up":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "delivered":
      case "completed":
        return "bg-green-100 text-green-800 border-green-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ready":
        return "🔥 Ready for Pickup";
      case "assigned":
        return "📋 Assigned";
      case "accepted":
        return "✅ Accepted";
      case "en_route":
        return "🚗 En Route";
      case "picked_up":
        return "📦 Picked Up";
      case "delivered":
        return "✅ Delivered";
      case "completed":
        return "✅ Completed";
      default:
        return status;
    }
  };

  return (
    <>
      <Head>
        <title>Driver Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-screen-2xl">
          {/* Header */}
          <div className="mb-4 sm:mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                  Welcome back, {driverName.split(" ")[0]}! 👋
                </h1>
                <p className="text-xs sm:text-sm md:text-base text-slate-600">
                  {loading ? "Loading your deliveries..." : `${jobs.length} active ${jobs.length === 1 ? "delivery" : "deliveries"}`}
                </p>
                {/* Bobby's brief: after a claim, the driver should
                    see an unmistakable path to the route page where
                    the new job lives. The active deliveries text
                    above is informational; this chip is the action. */}
                {!loading && jobs.length > 0 && (
                  <Link
                    href="/team-portal/driver/routes"
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 transition"
                  >
                    <RouteIcon className="w-3.5 h-3.5" />
                    View today's route
                    <Badge variant="outline" className="ml-1 tabular-nums bg-white">
                      {jobs.length}
                    </Badge>
                  </Link>
                )}
              </div>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-2 border-red-200 rounded-lg">
                    <Bell className="w-4 h-4 text-red-600 animate-pulse" />
                    <span className="text-sm font-semibold text-red-600">
                      {unreadCount} new {unreadCount === 1 ? "alert" : "alerts"}
                    </span>
                  </div>
                )}
                {/* DRV-J (driver deep audit, DRV-32 / DRV-60):
                    paper backup. A driver in a cab at 6am with a
                    flat phone battery still needs to know who's
                    where today. Print walks the current jobs list
                    (already date-windowed by DRV-B). */}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (jobs.length === 0) {
                      toast({ title: "Nothing to print", description: "No deliveries scheduled in the next 14 days." });
                      return;
                    }
                    setTimeout(() => window.print(), 100);
                  }}
                  className="h-10 sm:h-12 px-4 sm:px-6 text-sm sm:text-base gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Print run sheet
                </Button>
                <Button
                  onClick={() => setShowGame(true)}
                  className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white h-10 sm:h-12 px-4 sm:px-6 text-sm sm:text-base"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Play Game
                </Button>
              </div>
            </div>

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
                <div className="mb-4 sm:mb-6 rounded-xl border-2 border-orange-400 bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg p-4 sm:p-5">
                  <p className="text-xs sm:text-sm uppercase tracking-wide opacity-90 mb-1">Next pickup</p>
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-3xl sm:text-4xl md:text-5xl font-bold tabular-nums leading-tight">
                        {pickupLabel || "Time TBD"}
                      </p>
                      <p className="text-base sm:text-lg font-semibold mt-1 truncate">
                        {nextPickup.client_name}
                      </p>
                      <p className="text-sm sm:text-base opacity-90 truncate">
                        {nextPickup.venue_address}
                      </p>
                    </div>
                    {nextPickup.client_phone && (
                      <a
                        href={`tel:${nextPickup.client_phone}`}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white text-orange-700 font-semibold min-h-11 hover:bg-orange-50 transition"
                      >
                        <Bell className="w-4 h-4" />
                        Call client
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}

            <TeamWelcomeBanner role="driver" userId={user?.id} />

            {/* Wave 42 Tier 3: personal shift card. Lists today's
                delivery shifts (and any other shift_type the driver
                is rostered for) with task chips inline. Self-add
                works thanks to the staff_shift_tasks_self_write
                policy from Tier 1.
                Wave 43 T1: scope widened to include
                kitchen_and_cleaning so multi-role drivers (some
                drivers also help in kitchen) see all their shifts
                here. Wrapped in WidgetErrorBoundary so a render
                fault doesn't blank the portal. */}
            <WidgetErrorBoundary label="Your shifts today">
              <MyShiftTodayCard
                scopeShiftTypes={["delivery", "kitchen_and_cleaning"]}
                defaultTaskType="delivery"
              />
            </WidgetErrorBoundary>

            {/* Phase 10 #10: one-tap clock-in / clock-out.
             *  Replaces the only-after-the-fact admin-logged shift
             *  flow with a real-time clock. Drives the BCEA
             *  fatigue checks (Phase 7 #2) honestly. */}
            <div className="mb-4 sm:mb-6">
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

            {/* GPS pinger status. Quiet when no active jobs; greenish
             *  pulse while the foreground hook is dripping coords to
             *  dispatch; a soft warning when geolocation was refused
             *  so the driver knows the in-app tracker isn't running.
             *  Wake-lock pill shows when the screen-keep-on is held so
             *  drivers know they don't need to manually keep tapping
             *  the phone. */}
            {activeOrderIds.length > 0 && (
              <div className="mb-4 sm:mb-6 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                {gpsActive && !gpsError ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    <MapPin className="w-3 h-3 mr-1 animate-pulse" />
                    GPS sharing on
                    {lastPingAt
                      ? ` • last ping ${formatLocalTime(lastPingAt)}`
                      : ""}
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                    <MapPin className="w-3 h-3 mr-1" />
                    GPS off — dispatch can't see your live position
                  </Badge>
                )}
                {wakeLockHeld && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                    Screen lock disabled while on route
                  </Badge>
                )}
                {gpsError && (
                  <span className="text-slate-500 text-xs hidden sm:inline">
                    ({gpsError})
                  </span>
                )}
              </div>
            )}

            {/* Today's Earnings Summary */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 mb-4 sm:mb-6">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm text-slate-600 mb-1">Today's Potential Earnings</p>
                    <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-600">
                      {tenantCurrency.format(todaysPotentialEarnings, 0)}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-2">
                      {todaysJobs.length} {todaysJobs.length === 1 ? "delivery" : "deliveries"} scheduled •{" "}
                      {completedToday} completed
                    </p>
                    {/* Wave 70.12 - breakdown so the driver sees how
                        the number is built. Hides when there's
                        nothing to break down. */}
                    {(todaysHourlyEarnings > 0 || todaysDeliveryEarnings > 0) && payRates && (
                      <div className="mt-2 pt-2 border-t border-green-200/60 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        {todaysHourlyEarnings > 0 && (
                          <span className="inline-flex items-center gap-1" title={`${hoursWorkedToday.toFixed(2)}h x ${tenantCurrency.format(payRates.hourly_rate, 0)}/h`}>
                            <Clock className="w-3 h-3" />
                            <span className="tabular-nums">{hoursWorkedToday.toFixed(2)}h</span> &middot;
                            <span className="font-semibold tabular-nums">{tenantCurrency.format(todaysHourlyEarnings, 0)}</span>
                          </span>
                        )}
                        {todaysDeliveryEarnings > 0 && (
                          <span className="inline-flex items-center gap-1" title="Callout + round-trip km">
                            <Truck className="w-3 h-3" />
                            <span>{todaysJobs.length} drop{todaysJobs.length === 1 ? "" : "s"}</span> &middot;
                            <span className="font-semibold tabular-nums">{tenantCurrency.format(todaysDeliveryEarnings, 0)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500 flex items-center justify-center mb-2 mx-auto sm:mx-0">
                      <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                    </div>
                    {/* DRV-D: label clarifies the window so the chef
                        knows this matches the /earnings page MTD view. */}
                    <p className="text-xs text-slate-600 text-center sm:text-right">This month</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900 text-center sm:text-right">
                      {tenantCurrency.format(totalEarnings, 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Route Overview */}
            {todaysJobs.length > 0 && (
              <Card className="border-0 shadow-lg mb-4 sm:mb-6">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                  <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Navigation className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                      Today's Route Overview
                    </CardTitle>
                    <Link href="/team-portal/driver/routes">
                      <Button size="sm" variant="outline" className="text-xs sm:text-sm">
                        View Full Route
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <div className="space-y-2 sm:space-y-3">
                    {todaysJobs.slice(0, 3).map((job, index) => (
                      <div
                        key={job.id}
                        className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-base mt-0.5">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                            {job.client_name}
                          </p>
                          <p className="text-xs text-slate-600 truncate">{job.venue_address}</p>
                          {/* Wave 46 T5 - client_phone tap-to-call so the
                              driver can ring on arrival without leaving the
                              app. Special instructions render in rose so a
                              "back gate, ring up first" note is unmissable. */}
                          {job.client_phone && (
                            <a
                              href={`tel:${String(job.client_phone).replace(/\s+/g, "")}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] text-blue-700 hover:underline tabular-nums inline-flex items-center gap-1 mt-0.5"
                            >
                              📞 {job.client_phone}
                            </a>
                          )}
                          {job.special_instructions && (
                            <p className="text-[11px] text-rose-700 mt-1 italic line-clamp-2">
                              {job.special_instructions}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900">{job.event_time}</p>
                          <p className="text-xs text-slate-600">{job.guest_count} pax</p>
                        </div>
                      </div>
                    ))}
                    {todaysJobs.length > 3 && (
                      <p className="text-xs sm:text-sm text-slate-600 text-center">
                        +{todaysJobs.length - 3} more stops
                      </p>
                    )}
                  </div>
                  <Link href="/team-portal/driver/routes">
                    <Button className="w-full mt-3 sm:mt-4 text-sm sm:text-base h-10 sm:h-11">
                      <Navigation className="w-4 h-4 mr-2" />
                      View Optimized Route
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
            <MetricCard
              icon={Truck}
              iconColor="text-blue-600"
              label="Today's Jobs"
              value={todaysJobs.length}
              tooltip="Deliveries assigned to you for today."
            />
            <MetricCard
              icon={CheckCircle}
              iconColor="text-green-600"
              label="Completed"
              value={completedToday}
              tooltip="Today's deliveries you've already finished and signed off."
            />
            <MetricCard
              icon={Clock}
              iconColor="text-orange-600"
              label="Pending"
              value={todaysJobs.length - completedToday}
              tooltip="Deliveries still left to do today."
            />
            <MetricCard
              icon={DollarSign}
              iconColor="text-green-600"
              label="This month"
              value={tenantCurrency.format(totalEarnings)}
              tooltip="Earnings this month - hourly + distance + callout. Matches the /earnings page for the same window."
            />
          </div>

          {/* Deliveries List */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-4 md:px-6">
              <CardTitle className="text-base sm:text-lg md:text-xl">My Deliveries</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 md:px-6">
              <div className="space-y-2 sm:space-y-3">
                {loading ? (
                  <div className="text-center py-8 text-sm sm:text-base text-slate-600">
                    Loading deliveries...
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <p className="text-sm sm:text-base font-medium text-slate-700">No deliveries scheduled.</p>
                    <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                      Once dispatch assigns you to an event, it'll show up here with the route, ETA and pickup details.
                    </p>
                  </div>
                ) : (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border-2 border-slate-200 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="font-semibold text-xs sm:text-sm md:text-base text-slate-900">
                            {job.client_name}
                          </h4>
                          <Badge className={`${getStatusColor(job.status)} text-xs border-2`}>
                            {getStatusLabel(job.status)}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="truncate">{job.venue_address}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span>Event: {job.event_time}</span>
                            <span>•</span>
                            <span>{job.guest_count} guests</span>
                            <span>•</span>
                            <span>Order: {job.order_number}</span>
                          </div>
                        </div>
                      </div>
                      {/* DRV-H (driver deep audit, DRV-36): Navigate /
                          Chat / Confirm delivery / Decline previously
                          used size="sm" (32px height). Drivers wearing
                          gloves at 5am will miss. min-h-11 = 44px
                          (Apple HIG minimum), with px-3 horizontal so
                          the icon-only collapsed view stays tappable. */}
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
                        {/* DRV-H (driver deep audit, DRV-34 / DRV-49):
                            opens the 4-stage status checklist dialog
                            (en route / at kitchen / departed / at
                            venue). One tap from the dashboard so the
                            driver doesn't have to navigate to
                            /deliveries to stamp a milestone. Available
                            on every active job. */}
                        <Button
                          variant="outline"
                          onClick={() => setConfirmJob(job)}
                          className="flex-1 sm:flex-none min-h-11 px-3 text-sm"
                          title="Stamp status milestone (en route / at kitchen / arrived)"
                        >
                          <CheckCircle className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Status</span>
                        </Button>

                        {/* POD capture dialog. Only shows once the
                            order is packed and moving: ready,
                            in_transit, or already delivered (re-take
                            POD if missing). */}
                        {["ready", "in_transit", "delivered"].includes(job.status) && (
                          <Button
                            className="flex-1 sm:flex-none min-h-11 px-3 text-sm bg-emerald-600 hover:bg-emerald-700 gap-1"
                            onClick={() => setPodJob(job)}
                          >
                            <Camera className="w-4 h-4" />
                            <span>Confirm delivery</span>
                          </Button>
                        )}

                        {/* Phase 5: Decline (only when still pending) */}
                        {(job.status === "assigned" || job.status === "accepted") && assignmentByOrder[job.id] && (
                          <Button
                            variant="outline"
                            className="flex-1 sm:flex-none min-h-11 px-3 text-sm text-red-700 border-red-200 hover:bg-red-50"
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
                      {/* DRV-G (driver deep audit, DRV-33): one-tap
                          running-late broadcast. Shows once the job
                          is in motion (ready / in_transit / picked
                          up / at venue). 15/30/60-minute presets
                          with a two-tap confirm so an accidental
                          steering-wheel bump doesn't spam admin. */}
                      {["ready", "in_transit", "picked_up", "at_venue"].includes(job.status) && (
                        <div className="mt-2 pt-2 border-t border-slate-200">
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
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}

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
              <MessageCircle className="w-5 h-5 text-blue-600" />
              Chat · {chatJob?.client_name}
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
      <Dialog open={!!confirmJob} onOpenChange={(open) => !open && setConfirmJob(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Status · {confirmJob?.client_name}
            </DialogTitle>
          </DialogHeader>
          {confirmJob && (
            <DriverConfirmationPanel
              orderId={confirmJob.id}
              orderNumber={confirmJob.order_number}
              eventTime={confirmJob.event_time}
              venueAddress={confirmJob.venue_address}
            />
          )}
        </DialogContent>
      </Dialog>

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
    <ProtectedRoute allowedRoles={[UserRole.DRIVER, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DriverDashboardInner />
    </ProtectedRoute>
  );
}