import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
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
import { Sparkles } from "lucide-react";

const RouteMap = dynamic(
  () => import("@/components/tracking/RouteOptimizationMap"),
  { ssr: false }
);

interface DriverProfile {
  id: string;
  full_name: string;
  current_lat?: number | null;
  current_lng?: number | null;
  available?: boolean;
  is_active?: boolean;
}

/**
 * /admin/route-planning -- the PRE-FLIGHT dispatcher view.
 *
 * Different from /admin/tracking which is the LIVE ops view. This page is
 * for the dispatcher the night before: pull every confirmed order that
 * still needs a driver, run the optimiser, lock in routes that the driver
 * portal then renders. After a route is applied the order disappears from
 * the unassigned list and shows up in the driver's portal.
 */
export default function RoutePlanning() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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
    const pairs = await dispatchService.findBatchableOrders(user.company_id);
    setBatchPairs(pairs);
  }, [user?.company_id]);

  useEffect(() => { loadBatchPairs(); }, [loadBatchPairs]);

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
      loadDispatchData();
      loadBatchPairs();
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
    } catch (error) {
      console.error("Error loading dispatch data:", error);
      toast({
        title: "Could not load dispatch data",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, toast]);

  useEffect(() => {
    loadDispatchData();
  }, [loadDispatchData]);

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
    try {
      for (const order of unassignedOrders) {
        const o: any = order;
        const suggestions = await dispatchService.suggestDriversForOrder(user.company_id, {
          id: o.order_id || o.id,
          event_date: o.event_date,
          event_time: o.event_time,
          venue_lat: o.venue_lat ?? o.delivery_lat ?? null,
          venue_lng: o.venue_lng ?? o.delivery_lng ?? null,
        }, 1);
        const top = suggestions.find(s => s.capacity.ok && s.feasibility.ok && s.vehicle.ok);
        if (!top) { skipped += 1; continue; }
        const r = await dispatchService.assignDriverWithGate({
          companyId: user.company_id,
          orderId: o.order_id || o.id,
          driverId: top.driver.id,
          performedBy: user.id,
          score: top.score.total,
          reason: "Auto-assigned from route planning",
        });
        if (r.ok) assigned += 1; else skipped += 1;
      }
      toast({
        title: `Auto-assigned ${assigned} order${assigned === 1 ? "" : "s"}`,
        description: skipped > 0 ? `${skipped} skipped (no eligible driver).` : "All confirmed orders now have a driver.",
      });
      loadDispatchData();
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
        <title>Route Planning - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-blue-50 py-8 lg:pl-72 xl:pl-80">
        <div className="max-w-full px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                  <Route className="inline-block mr-3 text-blue-600" />
                  Route Planning &amp; Optimisation
                </h1>
                <p className="text-slate-600">
                  Pre-flight dispatch: assign drivers to confirmed orders, run the optimiser, lock in routes.
                </p>
              </div>
              <div className="flex gap-2">
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
                  className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
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
                  className="bg-blue-600 hover:bg-blue-700"
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
              </div>
            </div>
          </div>

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
                    <p className="text-sm font-medium text-slate-600 flex items-center gap-1">Active Drivers <InfoTooltip content={"Drivers with role=driver and is_active=true on your team."} /></p>
                    <p className="text-2xl font-bold text-slate-900">{drivers.length}</p>
                  </div>
                  <Truck className="h-8 w-8 text-emerald-500" />
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
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Empty state */}
          {!loading && unassignedOrders.length === 0 && optimizedRoutes.length === 0 && (
            <Card className="mb-6 border-dashed">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
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
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-emerald-600" />
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
                        <div key={`${pair.primary.id}-${pair.secondary.id}`} className="rounded-md border border-emerald-200 bg-white p-2.5">
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
                            className="w-full mt-2 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1.5"
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
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    Unassigned Orders
                    <InfoTooltip content={"Confirmed orders waiting on a driver. Run the optimiser to distribute these across your team."} />
                  </CardTitle>
                  <CardDescription>
                    {filteredOrders.length} of {unassignedOrders.length} order{unassignedOrders.length === 1 ? "" : "s"}
                  </CardDescription>
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
                            className={`p-3 border-l-4 rounded-md text-sm ${
                              atRisk             ? "border-l-red-500 bg-red-50/40" :
                              minsToEvent && minsToEvent < 1440 ? "border-l-amber-500" :
                                                                   "border-l-transparent border border-slate-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-slate-900 truncate">{order.client_name}</p>
                                  {atRisk && (
                                    <Badge className="bg-red-100 text-red-800 border-0 text-[9px] font-bold tracking-wide">URGENT</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 truncate">{order.venue_address}</p>
                                <p className={`text-xs mt-1 tabular-nums ${
                                  atRisk             ? "text-red-700 font-semibold" :
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
                                <Badge className="bg-red-100 text-red-800 flex-shrink-0 gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  {route.infeasible_count} late
                                </Badge>
                              ) : (
                                <Badge className="bg-green-100 text-green-800 flex-shrink-0">
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
                      <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                        <div className="text-sm">
                          <p className="font-semibold text-red-800">
                            {selectedRoute.infeasible_count} of {selectedRoute.stops.length} stop{selectedRoute.stops.length === 1 ? "" : "s"} will breach the time window
                          </p>
                          <p className="text-xs text-red-700 mt-0.5">
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
                            stop.time_window_breach ? "bg-red-50/40 -mx-2 px-2 rounded" : ""
                          }`}
                        >
                          <div className="flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-semibold text-sm ${
                              stop.time_window_breach ? "bg-red-600" : "bg-blue-600"
                            }`}>
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1 gap-2 flex-wrap">
                              <h4 className="font-semibold text-slate-900 truncate">{stop.client_name}</h4>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {stop.time_window_breach && (
                                  <Badge className="bg-red-100 text-red-800 border-0 text-[10px] gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Will be late
                                  </Badge>
                                )}
                                <Badge className={
                                  stop.priority === 1 ? "bg-red-100 text-red-800" :
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
                                Due {stop.delivery_time ? new Date(stop.delivery_time).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" }) : "—"}
                              </span>
                              {stop.predicted_arrival_at && (
                                <span className={`flex items-center gap-1 tabular-nums ${
                                  stop.time_window_breach ? "text-red-700 font-medium" : "text-emerald-700"
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
                    <div className="mt-6 p-4 bg-green-50 rounded-lg">
                      <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                        <Leaf className="h-4 w-4" />
                        Environmental impact
                      </h4>
                      <p className="text-sm text-green-800">
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
        </div>
      </div>

      <Footer />
      <ChatBot userRole="admin" companyId={user?.company_id} />
    </>
  );
}
