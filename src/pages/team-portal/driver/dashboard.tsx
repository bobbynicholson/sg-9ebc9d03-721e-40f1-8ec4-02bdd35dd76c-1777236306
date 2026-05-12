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
} from "lucide-react";
import { PodCaptureDialog } from "@/components/driver/PodCaptureDialog";
import { DeclineAssignmentDialog } from "@/components/driver/DeclineAssignmentDialog";
import { OrderChatPanel } from "@/components/admin/dispatch/OrderChatPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle } from "lucide-react";
import { openNavigation as openMapsNavigation } from "@/lib/driverNavigation";
import { useKitchenOrigin } from "@/hooks/useKitchenOrigin";
import { useDriverGPSPing } from "@/hooks/useDriverGPSPing";
import { TeamWelcomeBanner } from "@/components/portal/TeamWelcomeBanner";
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
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { notificationService, Notification } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MetricCard } from "@/components/dashboard/MetricCard";
import type { Tables } from "@/integrations/supabase/types";

type Order = Tables<"orders">;
type DriverAssignment = Tables<"driver_assignments">;

interface Job {
  id: string;
  order_number: string;
  client_name: string;
  venue_address: string;
  venue_lat?: number | null;
  venue_lng?: number | null;
  guest_count: number;
  event_time: string;
  status: string;
  event_date: string;
  pickup_time?: string;
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showGame, setShowGame] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);

  // Phase 5: POD capture + decline dialogs
  const [podJob, setPodJob] = useState<Job | null>(null);
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

      // Get driver's assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from("driver_assignments")
        .select(`
          id,
          order_id,
          status,
          orders (
            id,
            order_number,
            client_name,
            venue_address,
            venue_lat,
            venue_lng,
            guest_count,
            event_time,
            event_date,
            status,
            pickup_time
          )
        `)
        .eq("driver_id", user.id)
        .in("status", ["assigned", "accepted", "en_route", "picked_up"])
        .order("assigned_at", { ascending: false });

      if (assignmentsError) {
        console.error("Error loading assignments:", assignmentsError);
        return;
      }

      // Also get orders directly assigned to driver. Catering orders may
      // have either `driver_id` (legacy) or `assigned_driver_id` (current
      // dispatch flow) populated, so we OR across both columns. Status
      // values use the canonical set (preparing / in_transit), not the
      // legacy strings the page used to filter on.
      const { data: directOrders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("company_id", user.company_id)
        .or(`assigned_driver_id.eq.${user.id},driver_id.eq.${user.id}`)
        .in("status", ["confirmed", "preparing", "ready", "in_transit"])
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
      }));

      // Deduplicate by order ID
      const uniqueJobs = [...assignmentJobs, ...directJobs].filter(
        (job, index, self) => self.findIndex((j) => j.id === job.id) === index
      );

      setJobs(uniqueJobs);

      // Auto-acknowledge any unacked assignments. Opening the driver
      // app IS the acknowledgement -- the audit gap was "admin doesn't
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

  // Load total outstanding earnings (completed deliveries)
  useEffect(() => {
    if (!user?.id) return;

    const loadEarnings = async () => {
      const { data, error } = await supabase
        .from("driver_assignments")
        .select("total_earnings")
        .eq("driver_id", user.id)
        .in("status", ["completed", "delivered"]);

      if (error) {
        console.error("Error loading driver earnings:", error);
        return;
      }

      const total = (data || []).reduce(
        (sum: number, row: any) => sum + (Number(row.total_earnings) || 0),
        0
      );
      setTotalEarnings(total);
    };

    loadEarnings();
  }, [user?.id, jobs.length]);

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

      <DynamicNav userRole={UserRole.DRIVER} />

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
                <Button
                  onClick={() => setShowGame(true)}
                  className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white h-10 sm:h-12 px-4 sm:px-6 text-sm sm:text-base"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Play Game
                </Button>
              </div>
            </div>

            <TeamWelcomeBanner role="driver" userId={user?.id} />

            {/* Phase 10 #10: one-tap clock-in / clock-out.
             *  Replaces the only-after-the-fact admin-logged shift
             *  flow with a real-time clock. Drives the BCEA
             *  fatigue checks (Phase 7 #2) honestly. */}
            <div className="mb-4 sm:mb-6">
              <DriverClockButton driverId={user?.id} companyId={user?.company_id} />
            </div>

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
                      ? ` • last ping ${new Date(lastPingAt).toLocaleTimeString()}`
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
                      R{(todaysJobs.length * 250).toFixed(0)}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-2">
                      {todaysJobs.length} {todaysJobs.length === 1 ? "delivery" : "deliveries"} scheduled •{" "}
                      {completedToday} completed
                    </p>
                  </div>
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500 flex items-center justify-center mb-2 mx-auto sm:mx-0">
                      <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                    </div>
                    <p className="text-xs text-slate-600 text-center sm:text-right">Outstanding</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900 text-center sm:text-right">
                      R{totalEarnings.toFixed(0)}
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
                        className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-base">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                            {job.client_name}
                          </p>
                          <p className="text-xs text-slate-600 truncate">{job.venue_address}</p>
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
              label="Earnings"
              value={`R${totalEarnings}`}
              tooltip="What you've earned from finished deliveries that haven't been paid out yet."
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
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openNavigation(job)}
                          className="flex-1 sm:flex-none text-xs sm:text-sm"
                        >
                          <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Navigate</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setChatJob(job)}
                          className="flex-1 sm:flex-none text-xs sm:text-sm"
                          title="Chat with dispatcher"
                        >
                          <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Chat</span>
                        </Button>

                        {/* POD capture dialog. Phase 2 #5 narrowed
                            visibility -- the button used to appear on
                            every non-terminal job including pending,
                            which encouraged drivers to "confirm
                            delivered" before they'd actually loaded
                            the truck. Now only shows once the order is
                            packed and moving: ready, out_for_delivery,
                            in_transit, or already delivered (re-take
                            POD if missing). */}
                        {["ready", "out_for_delivery", "in_transit", "delivered"].includes(job.status) && (
                          <Button
                            size="sm"
                            className="flex-1 sm:flex-none text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 gap-1"
                            onClick={() => setPodJob(job)}
                          >
                            <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Confirm delivery</span>
                          </Button>
                        )}

                        {/* Phase 5: Decline (only when still pending) */}
                        {(job.status === "assigned" || job.status === "accepted") && assignmentByOrder[job.id] && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 sm:flex-none text-xs sm:text-sm text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => setDeclineCtx({
                              assignmentId: assignmentByOrder[job.id],
                              orderId: job.id,
                              clientName: job.client_name,
                            })}
                          >
                            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline">Decline</span>
                          </Button>
                        )}
                      </div>
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
          onSaved={() => { setPodJob(null); loadDriverJobs(); }}
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
          onDeclined={() => { setDeclineCtx(null); loadDriverJobs(); }}
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

      {/* AI Chatbot */}
      <ChatBot userRole="driver" companyId={user?.company_id} />
    </>
  );
}