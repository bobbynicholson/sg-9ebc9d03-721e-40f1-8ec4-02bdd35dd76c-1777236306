import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { toLocalISO } from "@/lib/localDate";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ChatBot } from "@/components/ChatBot";
import Head from "next/head";
import {
  Route,
  MapPin,
  Clock,
  TrendingUp,
  Truck,
  Navigation,
  CheckCircle,
  AlertCircle,
  Fuel,
  Leaf,
  RefreshCw,
  Save,
} from "lucide-react";
import { routeOptimizationService, DeliveryStop, OptimizedRoute } from "@/services/routeOptimizationService";
import dynamic from "next/dynamic";
import driverService from "@/services/driverService";
import { dispatchService, formatMinutesAsCountdown, minutesUntilSlaBreach } from "@/services/dispatchService";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Download } from "lucide-react";

const RouteMap = dynamic(
  () => import("@/components/tracking/RouteOptimizationMap"),
  { ssr: false }
);

interface DriverProfile {
  id: string;
  full_name: string;
  // RP-B (route-planning audit, RP-1): driver GPS coordinates live in
  // driver_locations now, not on profiles. The legacy current_lat /
  // current_lng / available columns were never created on profiles -
  // queries against them silently errored. Optional flags kept for
  // any consumer still reading them.
  is_active?: boolean;
}

/**
 * /admin/route-planning - the PRE-FLIGHT dispatcher view.
 *
 * Different from /admin/tracking which is the LIVE ops view. This page is
 * for the dispatcher the night before: pull every confirmed order that
 * still needs a driver, run the optimiser, lock in routes that the driver
 * portal then renders. After a route is applied the order disappears from
 * the unassigned list and shows up in the driver's portal.
 */
function RoutePlanningInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  // Command-centre audit: keep the toast for transient feedback but also
  // persist the failure so the page renders a Retry card instead of a
  // silently-empty queue (the zeros looked identical to "nothing to do").
  const [loadError, setLoadError] = useState<string | null>(null);
  const [optimising, setOptimising] = useState(false);
  const [unassignedOrders, setUnassignedOrders] = useState<DeliveryStop[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [optimizedRoutes, setOptimizedRoutes] = useState<OptimizedRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<OptimizedRoute | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [slaMinutes, setSlaMinutes] = useState(720);
  // Phase 3: batch suggestions
  const [batchPairs, setBatchPairs] = useState<any[]>([]);
  const [batchAssigning, setBatchAssigning] = useState<string | null>(null);

  // Load dispatch settings once for the SLA threshold
  useEffect(() => {
    if (!user?.company_id) return;
    dispatchService.getDispatchSettings(user.company_id)
      .then(s => setSlaMinutes(s.slaAssignMinutes))
      .catch(() => {});
  }, [user?.company_id]);

  // Load batch suggestions whenever the queue refreshes
  const loadBatchPairs = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const pairs = await dispatchService.findBatchableOrders(user.company_id);
      setBatchPairs(pairs);
    } catch (err) {
      // Batch suggestions are an optimisation aid, not core queue data.
      // A failure here must not reject unhandled or blank the page; the
      // card simply self-hides and the console records why.
      console.warn("[route-planning] batch suggestions failed:", err);
      setBatchPairs([]);
    }
  }, [user?.company_id]);

  useEffect(() => { loadBatchPairs(); }, [loadBatchPairs]);

  const emitOrderUpdated = useCallback((orderIds: string[], action: string) => {
    if (typeof window === "undefined" || orderIds.length === 0) return;
    try {
      window.dispatchEvent(new CustomEvent("cateringms:order-updated", {
        detail: { orderIds, action, source: "route-planning" },
      }));
    } catch {
      // CustomEvent is available in supported browsers; ignore old polyfill gaps.
    }
  }, []);

  const handleBatchAssign = async (pair: any) => {
    if (!user?.company_id) return;
    // Pick the top-suggested driver for the primary order, then assign both.
    setBatchAssigning(pair.primary.id);
    try {
      const suggestions = await dispatchService.suggestDriversForOrder(user.company_id, {
        id: pair.primary.id,
        event_date: pair.primary.event_date,
        event_time: pair.primary.event_time,
        venue_lat: pair.primary.venue_lat,
        venue_lng: pair.primary.venue_lng,
        region_id: pair.primary.region_id ?? null,
        requires_refrigeration: !!(pair.primary.requires_refrigeration || pair.secondary.requires_refrigeration),
      }, 1);
      const top = suggestions.find(s => s.capacity.ok && s.feasibility.ok && s.vehicle.ok);
      if (!top) {
        toast({ title: "No eligible driver", description: "Try assigning manually.", variant: "destructive" });
        return;
      }
      const r1 = await dispatchService.assignDriverWithGate({
        companyId: user.company_id,
        orderId: pair.primary.id,
        driverId: top.driver.id,
        performedBy: user.id,
        score: top.score.total,
        reason: `Batched with ${pair.secondary.client_name}`,
      });
      const r2 = await dispatchService.assignDriverWithGate({
        companyId: user.company_id,
        orderId: pair.secondary.id,
        driverId: top.driver.id,
        performedBy: user.id,
        score: top.score.total,
        reason: `Batched with ${pair.primary.client_name}`,
      });
      const ok = (r1.ok ? 1 : 0) + (r2.ok ? 1 : 0);
      toast({
        title: ok === 2 ? "Batch assigned" : ok === 1 ? "Partially assigned" : "Could not assign",
        description: `${top.driver.full_name} on ${pair.primary.client_name} + ${pair.secondary.client_name}`,
        variant: ok === 0 ? "destructive" : "default",
      });
      emitOrderUpdated(
        [r1.ok ? pair.primary.id : null, r2.ok ? pair.secondary.id : null].filter(Boolean) as string[],
        "batch-assign",
      );
      loadDispatchData();
      loadBatchPairs();
    } catch (error: any) {
      // Without this catch a scorer/assign failure rejected unhandled and
      // left the button stuck on "Assigning..." with no feedback.
      console.error("Batch assign failed:", error);
      toast({
        title: "Batch assign failed",
        description: error?.message || "Try assigning manually.",
        variant: "destructive",
      });
    } finally {
      setBatchAssigning(null);
    }
  };

  const loadDispatchData = useCallback(async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [orders, driverList] = await Promise.all([
        routeOptimizationService.getUnassignedOrders(user.company_id),
        driverService.getAllDrivers(user.company_id),
      ]);

      // Drivers must be active to receive routes; legacy rows may not have
      // is_active set so default to true rather than excluding them.
      const activeDrivers = (driverList || []).filter(
        (d: any) => d.is_active === undefined || d.is_active === true
      );

      // Sort by event_date ascending so the most urgent unassigned orders sit at the top.
      const sortedOrders = [...orders].sort((a: any, b: any) => {
        const da = a.event_date ? new Date(a.event_date).getTime() : Infinity;
        const db = b.event_date ? new Date(b.event_date).getTime() : Infinity;
        return da - db;
      });
      setUnassignedOrders(sortedOrders);
      setDrivers(activeDrivers);
    } catch (error: any) {
      console.error("Error loading dispatch data:", error);
      setLoadError(error?.message || "Check your connection and try again.");
      toast({
        title: "Could not load dispatch data",
        description: error?.message || "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, toast]);

  useEffect(() => {
    loadDispatchData();
  }, [loadDispatchData]);

  // RP-B (route-planning audit, RP-5): realtime channel scoped to the
  // caller's company so two ops admins planning routes in parallel
  // see each other's assignments without a manual Refresh. Without
  // this the unassigned queue could include orders another admin had
  // already taken, leading to "no eligible driver" toasts when the
  // gated assign attempt collided with the optimistic-lock check in
  // dispatchService. Subscribes to orders (assignment changes) and
  // driver_assignments (the audit row insert that lands when an
  // assignment lands through the gated path).
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const channelKey = `admin-route-planning-realtime:${companyId}`;
    const channel = (supabase as any)
      .channel(channelKey)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => { loadDispatchData(); loadBatchPairs(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_assignments", filter: `company_id=eq.${companyId}` },
        () => { loadDispatchData(); loadBatchPairs(); },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [user?.company_id, loadDispatchData, loadBatchPairs]);

  /**
   * Auto-assign drivers to every unassigned order. For each order, runs the
   * dispatch matcher to find the top-scored driver, then commits the
   * assignment via the gated service. Returns counts so we can toast a
   * single summary rather than one toast per assignment.
   */
  const autoAssignAll = async () => {
    if (!user?.company_id) return;
    if (drivers.length === 0) {
      toast({ title: "No active drivers", variant: "destructive" });
      return;
    }
    if (unassignedOrders.length === 0) {
      toast({ title: "Nothing to assign" });
      return;
    }
    setAutoAssigning(true);
    let assigned = 0;
    let skipped = 0;
    const assignedIds: string[] = [];
    try {
      for (const order of unassignedOrders) {
        const o: any = order;
        const suggestions = await dispatchService.suggestDriversForOrder(user.company_id, {
          id: o.order_id || o.id,
          event_date: o.event_date,
          event_time: o.event_time,
          venue_lat: o.venue_lat ?? o.delivery_lat ?? null,
          venue_lng: o.venue_lng ?? o.delivery_lng ?? null,
          region_id: o.region_id ?? null,
          requires_refrigeration: !!o.requires_refrigeration,
        }, 1);
        const top = suggestions.find(s => s.capacity.ok && s.feasibility.ok && s.vehicle.ok);
        if (!top) { skipped += 1; continue; }
        const orderId = o.order_id || o.id;
        const r = await dispatchService.assignDriverWithGate({
          companyId: user.company_id,
          orderId,
          driverId: top.driver.id,
          performedBy: user.id,
          score: top.score.total,
          reason: "Auto-assigned from route planning",
        });
        if (r.ok) {
          assigned += 1;
          assignedIds.push(orderId);
        } else {
          skipped += 1;
        }
      }
      toast({
        title: `Auto-assigned ${assigned} order${assigned === 1 ? "" : "s"}`,
        description: skipped > 0 ? `${skipped} skipped (no eligible driver).` : "All confirmed orders now have a driver.",
      });
      emitOrderUpdated(assignedIds, "auto-assign");
      loadDispatchData();
      loadBatchPairs();
    } catch (error: any) {
      // Same unhandled-rejection trap as handleBatchAssign: a mid-loop
      // failure previously froze the button in "Matching..." forever.
      console.error("Auto-assign failed:", error);
      toast({
        title: "Auto-assign failed",
        description: error?.message || `Assigned ${assigned} before the failure. Refresh and try again.`,
        variant: "destructive",
      });
    } finally {
      setAutoAssigning(false);
    }
  };

  const optimizeAllRoutes = async () => {
    if (!user?.company_id) return;
    if (drivers.length === 0) {
      toast({
        title: "No active drivers",
        description: "Add at least one driver before running the optimiser.",
        variant: "destructive",
      });
      return;
    }
    if (unassignedOrders.length === 0) {
      toast({
        title: "Nothing to optimise",
        description: "No unassigned orders are waiting for a route.",
      });
      return;
    }

    setOptimising(true);
    try {
      const routes = await routeOptimizationService.optimizeAllDriverRoutes(user.company_id);

      // The service returns routes keyed by driver_id only; weave the
      // driver name in so the UI can label cards correctly.
      const named = routes.map((route) => {
        const driver = drivers.find((d) => d.id === route.driver_id);
        return { ...route, driver_name: driver?.full_name || "Driver" };
      });

      setOptimizedRoutes(named);
      if (named.length > 0) {
        setSelectedRoute(named[0]);
        toast({
          title: "Routes optimised",
          description: `Built ${named.length} route${named.length === 1 ? "" : "s"} across ${named.reduce((sum, r) => sum + r.stops.length, 0)} stops.`,
        });
      } else {
        toast({
          title: "Optimiser returned no routes",
          description: "Drivers may be missing GPS coordinates. Check driver profiles.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error optimizing routes:", error);
      toast({
        title: "Optimisation failed",
        description: "Could not build routes. Try again or check the console.",
        variant: "destructive",
      });
    } finally {
      setOptimising(false);
    }
  };

  const applyRoute = async (route: OptimizedRoute) => {
    try {
      const success = await routeOptimizationService.saveOptimizedRoute(route);
      if (!success) {
        throw new Error("saveOptimizedRoute returned false");
      }

      toast({
        title: "Route applied",
        description: `${route.driver_name} now sees ${route.stops.length} stops in the driver portal.`,
      });

      // Drop the applied route's stops from the optimisation panel and
      // refresh unassigned orders so the dispatcher sees the queue shrink.
      setOptimizedRoutes((prev) => prev.filter((r) => r.driver_id !== route.driver_id));
      setSelectedRoute(null);
      emitOrderUpdated(route.stops.map((stop) => stop.order_id), "route-apply");
      loadDispatchData();
    } catch (error) {
      console.error("Error applying route:", error);
      toast({
        title: "Could not apply route",
        description: "Route was not saved. Try again.",
        variant: "destructive",
      });
    }
  };

  const filteredOrders = unassignedOrders.filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    return true;
  });

  const filteredRoutes = optimizedRoutes.filter((route) => {
    if (driverFilter !== "all" && route.driver_id !== driverFilter) return false;
    return true;
  });

  const getRouteStats = (route: OptimizedRoute) => {
    return routeOptimizationService.calculateRouteStats(route);
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Route planning - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          {/* Page Header */}
          <PortalHeader
            variant="hero"
            title="Route planning"
            icon={Route}
            subtitle={
              /* RP-B (route-planning audit, RP-3): honest copy. Pre-
                 RP-B this claimed "for tomorrow" but no date filter
                 was applied anywhere - the queue surfaces every
                 unassigned confirmed order regardless of date. And
                 "Capacity, time-conflict, and vehicle gates run
                 before any assignment lands" is only true for the
                 Auto-assign + Batch paths (both go through
                 dispatchService.assignDriverWithGate). The Apply
                 path on optimised routes still bypasses every
                 gate; that refactor is its own PR. New copy
                 describes what's actually true today. */
              "Auto-assign drivers and optimise routes for upcoming unassigned orders. Capacity, time-conflict and vehicle gates run on the Auto-assign and Batch buttons before any assignment lands."
            }
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${unassignedOrders.length === 0 ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {unassignedOrders.length} unassigned order{unassignedOrders.length === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {drivers.length} active driver{drivers.length === 1 ? "" : "s"}
                  </span>
                  {batchPairs.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {batchPairs.length} batchable pair{batchPairs.length === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
            <>
                <Button
                  variant="outline"
                  onClick={loadDispatchData}
                  disabled={loading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  onClick={autoAssignAll}
                  disabled={autoAssigning || unassignedOrders.length === 0 || drivers.length === 0}
                  size="lg"
                  variant="outline"
                  className="border-brand-primary/80 text-brand-primary hover:bg-brand-primary/10"
                  title="Score every unassigned order and assign the top-matched driver"
                >
                  {autoAssigning ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Matching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Auto-assign drivers
                    </>
                  )}
                </Button>
                <Button
                  onClick={optimizeAllRoutes}
                  disabled={optimising || unassignedOrders.length === 0 || drivers.length === 0}
                  size="lg"
                  className="bg-brand-primary hover:opacity-90"
                >
                  {optimising ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Optimising...
                    </>
                  ) : (
                    <>
                      <Navigation className="mr-2 h-4 w-4" />
                      Optimise routes
                    </>
                  )}
                </Button>
            </>
            }
          />
          <PageWorkbench />

          {/* Surfaced load failure with a Retry, instead of a queue that
              silently reads 0 and looks like an empty dispatch day. */}
          {loadError && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-rose-900 mb-1">Couldn&apos;t load dispatch data</h2>
              <p className="text-sm text-slate-600 mb-3">{loadError}</p>
              <Button onClick={loadDispatchData} size="sm" disabled={loading} className="bg-brand-primary hover:bg-brand-primary/90">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 flex items-center gap-1">Unassigned Orders <InfoTooltip content={"Confirmed orders that still need a driver assigned. Pulled live from the orders table for your company."} /></p>
                    <p className="text-2xl font-bold text-slate-900">{unassignedOrders.length}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 flex items-center gap-1">Active Drivers <InfoTooltip content={"Drivers with role=driver on your team. Drivers without an explicit is_active flag count as active."} /></p>
                    <p className="text-2xl font-bold text-slate-900">{drivers.length}</p>
                  </div>
                  <Truck className="h-8 w-8 text-brand-primary" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 flex items-center gap-1">Optimised Routes <InfoTooltip content={"How many routes the optimiser has built so far in this session."} /></p>
                    <p className="text-2xl font-bold text-slate-900">{optimizedRoutes.length}</p>
                  </div>
                  <Route className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 flex items-center gap-1">Total Distance <InfoTooltip content={"Total kilometres across every route built in this session."} /></p>
                    <p className="text-2xl font-bold text-slate-900">
                      {optimizedRoutes.reduce((sum, r) => sum + r.total_distance, 0).toFixed(1)} km
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-brand-primary" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Empty state (suppressed while a load failure is showing,
              zeros from a failed fetch are not a clear dispatch day) */}
          {!loading && !loadError && unassignedOrders.length === 0 && optimizedRoutes.length === 0 && (
            <Card className="mb-6 border-dashed">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-brand-primary mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900">Nothing waiting on dispatch</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  No confirmed orders need a driver right now. Once a quote is converted and confirmed, the order will land here for routing.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Unassigned + Routes column */}
            <div className="lg:col-span-1 space-y-4">
              {/* Phase 3: batch suggestions */}
              {batchPairs.length > 0 && (
                <Card className="border-brand-primary/20 bg-brand-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-brand-primary" />
                      Batch suggestions
                      <InfoTooltip content={"Two unassigned orders close in distance and time. Sending them to one driver saves a trip. Click Batch to auto-assign the top-scored driver to both."} />
                    </CardTitle>
                    <CardDescription>
                      {batchPairs.length} pair{batchPairs.length === 1 ? "" : "s"} can ride together
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {batchPairs.slice(0, 5).map(pair => {
                      const isAssigning = batchAssigning === pair.primary.id;
                      return (
                        <div key={`${pair.primary.id}-${pair.secondary.id}`} className="rounded-md border border-brand-primary/20 bg-white p-2.5">
                          <div className="text-xs space-y-1">
                            <p className="font-medium text-slate-900 truncate">{pair.primary.client_name}</p>
                            <p className="font-medium text-slate-900 truncate">+ {pair.secondary.client_name}</p>
                            <p className="text-slate-500 tabular-nums">
                              {pair.distance_km}km apart · {pair.minutes_apart}m gap
                            </p>
                          </div>
                          <Button
                            size="sm"
                            disabled={isAssigning}
                            onClick={() => handleBatchAssign(pair)}
                            className="w-full mt-2 h-7 text-xs bg-brand-primary hover:bg-brand-primary/90 gap-1.5"
                          >
                            <Sparkles className="w-3 h-3" />
                            {isAssigning ? "Assigning..." : "Batch to one driver"}
                          </Button>
                        </div>
                      );
                    })}
                    {batchPairs.length > 5 && (
                      <p className="text-xs text-slate-500 text-center pt-1">
                        + {batchPairs.length - 5} more pair{batchPairs.length - 5 === 1 ? "" : "s"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Unassigned orders queue */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-orange-500" />
                        Unassigned Orders
                        <InfoTooltip content={"Confirmed orders waiting on a driver. Run the optimiser to distribute these across your team."} />
                      </CardTitle>
                      <CardDescription>
                        {filteredOrders.length} of {unassignedOrders.length} order{unassignedOrders.length === 1 ? "" : "s"}
                      </CardDescription>
                    </div>
                    {/* Phase 22 #3: unassigned queue CSV. Dispatch
                        leads working from a phone or handing the
                        queue off to a colleague needed a flat list. */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filteredOrders.length === 0}
                      onClick={() => {
                        const esc = (v: any) => {
                          if (v == null) return "";
                          const s = String(v).replace(/"/g, '""');
                          return /[",\n]/.test(s) ? `"${s}"` : s;
                        };
                        const headers = [
                          "Client", "Event date", "Event time", "Venue",
                          "Guests", "Status",
                        ];
                        const lines = [headers.join(",")];
                        for (const o of filteredOrders as any[]) {
                          lines.push([
                            esc(o.client_name || ""),
                            esc(o.event_date || ""),
                            esc(o.event_time || ""),
                            esc(o.venue_address || o.venue_name || ""),
                            esc(o.guest_count ?? ""),
                            esc(o.status || ""),
                          ].join(","));
                        }
                        // RP-B (route-planning audit, RP-4): leading
                        // BOM so Excel-ZA renders ZAR + accented
                        // venue names correctly. Same fix shipped on
                        // /admin/calendar (task #116).
                        const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `unassigned-orders-${toLocalISO(new Date())}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="preparing">Preparing</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                    </SelectContent>
                  </Select>

                  {filteredOrders.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      Queue is empty. Confirmed orders without a driver appear here.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {filteredOrders.map((order) => {
                        const o: any = order;
                        const slack = o.event_date
                          ? minutesUntilSlaBreach(o.event_date, o.event_time, slaMinutes)
                          : Number.POSITIVE_INFINITY;
                        const atRisk = slack <= 0;
                        const eventDt = o.event_date && o.event_time
                          ? new Date(`${o.event_date}T${o.event_time}`)
                          : o.event_date ? new Date(`${o.event_date}T12:00`) : null;
                        const minsToEvent = eventDt && !isNaN(eventDt.getTime())
                          ? (eventDt.getTime() - Date.now()) / 60_000
                          : null;
                        return (
                          <div
                            key={order.id}
                            className={`rounded-md border p-3 text-sm ${
                              atRisk             ? "border-rose-300 bg-rose-50/50" :
                              minsToEvent && minsToEvent < 1440 ? "border-amber-300 bg-amber-50/40" :
                                                                   "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-slate-900 truncate">{order.client_name}</p>
                                  {atRisk && (
                                    <Badge className="bg-rose-100 text-rose-800 border-0 text-[9px] font-bold tracking-wide">URGENT</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 truncate">{order.venue_address}</p>
                                <p className={`text-xs mt-1 tabular-nums ${
                                  atRisk             ? "text-rose-700 font-semibold" :
                                  minsToEvent && minsToEvent < 1440 ? "text-amber-700 font-medium" :
                                                                       "text-slate-500"
                                }`}>
                                  {o.event_date} {o.event_time || ""}
                                  {minsToEvent != null && (
                                    <span> · {formatMinutesAsCountdown(minsToEvent).replace("-", "in ")}</span>
                                  )}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-xs capitalize flex-shrink-0">
                                {order.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Optimised driver routes */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Driver Routes
                    <InfoTooltip content={"One card per route. Click Apply to lock the route in, the driver gets a notification and the orders move to their portal."} />
                  </CardTitle>
                  <CardDescription>
                    {filteredRoutes.length} optimised route{filteredRoutes.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {drivers.length > 0 && (
                    <Select value={driverFilter} onValueChange={setDriverFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Filter by driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All drivers</SelectItem>
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {filteredRoutes.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">
                      Click &quot;Optimise All Routes&quot; to generate efficient delivery sequences
                    </p>
                  ) : (
                    filteredRoutes.map((route, index) => {
                      const stats = getRouteStats(route);
                      return (
                        <Card
                          key={route.driver_id}
                          className={`cursor-pointer transition-all ${
                            selectedRoute?.driver_id === route.driver_id
                              ? "ring-2 ring-blue-500 bg-blue-50"
                              : "hover:bg-slate-50"
                          }`}
                          onClick={() => setSelectedRoute(route)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold flex-shrink-0">
                                  {index + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 truncate">{route.driver_name || "Driver"}</p>
                                  <p className="text-xs text-slate-500">{route.stops.length} stop{route.stops.length === 1 ? "" : "s"}</p>
                                </div>
                              </div>
                              {route.infeasible_count != null && route.infeasible_count > 0 ? (
                                <Badge className="bg-rose-100 text-rose-800 flex-shrink-0 gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  {route.infeasible_count} late
                                </Badge>
                              ) : (
                                <Badge className="bg-brand-primary/15 text-brand-primary flex-shrink-0">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Ready
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-1 text-slate-600">
                                <Route className="w-3 h-3" />
                                <span>{stats.totalStops} stops</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-600">
                                <Navigation className="w-3 h-3" />
                                <span>{route.total_distance.toFixed(1)} km</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-600">
                                <Clock className="w-3 h-3" />
                                <span>{route.total_duration} min</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-600">
                                <Fuel className="w-3 h-3" />
                                <span>R{stats.estimatedFuelCost}</span>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="w-full mt-3"
                              onClick={(e) => {
                                e.stopPropagation();
                                applyRoute(route);
                              }}
                            >
                              <Save className="w-3 h-3 mr-1" />
                              Apply &amp; notify driver
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Map & Details */}
            <div className="lg:col-span-2">
              <Card className="h-[700px]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Route Visualisation
                  </CardTitle>
                  <CardDescription>
                    {selectedRoute
                      ? `Showing optimised route with ${selectedRoute.stops.length} stops`
                      : "Select a route to view on map"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[calc(100%-80px)]">
                  {selectedRoute ? (
                    <RouteMap route={selectedRoute} />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-slate-100 rounded-lg">
                      <div className="text-center">
                        <MapPin className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">
                          {optimizedRoutes.length === 0
                            ? "Generate routes to see visualisation"
                            : "Select a route from the list"}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Route Details */}
              {selectedRoute && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>Route Details &amp; Stops</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedRoute.infeasible_count != null && selectedRoute.infeasible_count > 0 && (
                      <div className="mb-4 p-3 rounded-md border border-rose-200 bg-rose-50 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 border-rose-200 mt-0.5 shrink-0" />
                        <div className="text-sm">
                          <p className="font-semibold text-rose-800">
                            {selectedRoute.infeasible_count} of {selectedRoute.stops.length} stop{selectedRoute.stops.length === 1 ? "" : "s"} will breach the time window
                          </p>
                          <p className="text-xs text-rose-700 mt-0.5">
                            Predicted arrival is later than the delivery deadline. Reassign or split the route.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {selectedRoute.stops.map((stop: any, index: number) => (
                        <div
                          key={stop.id}
                          className={`flex items-start gap-4 pb-4 border-b last:border-0 ${
                            stop.time_window_breach ? "bg-rose-50/40 -mx-2 px-2 rounded" : ""
                          }`}
                        >
                          <div className="flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-semibold text-sm ${
                              stop.time_window_breach ? "bg-rose-600" : "bg-blue-600"
                            }`}>
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1 gap-2 flex-wrap">
                              <h4 className="font-semibold text-slate-900 truncate">{stop.client_name}</h4>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {stop.time_window_breach && (
                                  <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px] gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Will be late
                                  </Badge>
                                )}
                                <Badge className={
                                  stop.priority === 1 ? "bg-rose-100 text-rose-800" :
                                  stop.priority === 3 ? "bg-gray-100 text-gray-800" :
                                  "bg-yellow-100 text-yellow-800"
                                }>
                                  {stop.priority === 1 ? "High" : stop.priority === 3 ? "Low" : "Normal"} priority
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 mb-2 truncate">{stop.venue_address}</p>
                            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Due {stop.delivery_time ? new Date(stop.delivery_time).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" }) : "-"}
                              </span>
                              {stop.predicted_arrival_at && (
                                <span className={`flex items-center gap-1 tabular-nums ${
                                  stop.time_window_breach ? "text-rose-700 font-medium" : "text-brand-primary"
                                }`}>
                                  <Clock className="w-3 h-3" />
                                  ETA {new Date(stop.predicted_arrival_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                                  {stop.slack_minutes != null && (
                                    <span className="text-slate-500">
                                      {" "}({stop.slack_minutes >= 0 ? `${stop.slack_minutes}m slack` : `${Math.abs(stop.slack_minutes)}m late`})
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Environmental Impact */}
                    <div className="mt-6 p-4 bg-brand-primary/10 rounded-lg">
                      <h4 className="font-semibold text-brand-primary mb-2 flex items-center gap-2">
                        <Leaf className="h-4 w-4" />
                        Environmental impact
                      </h4>
                      <p className="text-sm text-brand-primary">
                        This optimised route will produce approximately{" "}
                        <span className="font-semibold">
                          {routeOptimizationService.calculateRouteStats(selectedRoute).carbonFootprint.toFixed(2)} kg CO₂
                        </span>
                        . Route optimisation helps cut emissions by up to 30%.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </PortalShell>
      </div>

      <Footer />
      <ChatBot userRole="admin" companyId={user?.company_id} />
    </>
  );
}

// RTE-A (route-planning audit, RTE-1 + RTE-2): defense-in-depth +
// admit sales_admin (visibility for client calls) and region_admin
// (RLS-narrowed regional queue).
export default function RoutePlanning() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <RoutePlanningInner />
    </ProtectedRoute>
  );
}
