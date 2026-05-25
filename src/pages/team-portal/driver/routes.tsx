import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Navigation,
  Clock,
  CheckCircle,
  Route as RouteIcon,
  TrendingUp,
  DollarSign,
  Fuel,
  Leaf,
  ChevronRight,
  Map,
  AlertCircle,
  Play,
  Pause,
  Flag,
  X,
  ExternalLink,
} from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { routeOptimizationService, OptimizedRoute } from "@/services/routeOptimizationService";
import driverService from "@/services/driverService";
import { useDriverPayRates } from "@/hooks/useDriverPayRates";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";
import { DeliveryStatusModal } from "@/components/driver/DeliveryStatusModal";
import { openNavigation as openMapsNavigation } from "@/lib/driverNavigation";
import { useKitchenOrigin } from "@/hooks/useKitchenOrigin";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useDriverTripTimer } from "@/hooks/useDriverTripTimer";
import { updateDeliveryStatus as updateDeliveryStatusRaw } from "@/services/driver/deliveryManagement";

const RouteMap = dynamic(
  () => import("@/components/tracking/RouteOptimizationMap"),
  { ssr: false }
);

export default function DriverRoutes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [tripStarted, setTripStarted] = useState(false);
  const [tripCompleted, setTripCompleted] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<{ id: string; name: string } | null>(null);
  // Kitchen origin: driver's region kitchen if set, otherwise company HQ
  const { origin: kitchenOrigin } = useKitchenOrigin(user?.id, user?.company_id);
  // Per-driver pay rates (override falling back to companies.default_*)
  // - used so the earnings tiles show the real number, not R250.
  // DRV-C (driver deep audit, DRV-9): payRates lifted to a shared
  // hook. Was a duplicate of the same fetch on /dashboard.
  const { payRates } = useDriverPayRates();
  // Wave 24: tenant-currency aware so non-ZAR tenants don't see "R"
  // hardcoded on the route stop callout/distance summary.
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);

  // Driver trip timer + Pause / Cancel controls. Bobby's brief:
  // Start Trip flipped a hidden boolean and showed nothing for
  // accountability. The hook persists clock to localStorage so a
  // phone lock or reload doesn't lose it, and resets when the
  // set of stops changes (claimed a different job).
  const stopIds = (route?.stops || []).map((s) => s.order_id);
  const trip = useDriverTripTimer(user?.id ?? null, stopIds);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadOptimizedRoute();
    }
  }, [user]);

  const loadOptimizedRoute = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const optimizedRoute = await routeOptimizationService.getDriverOptimizedRoute(user.id);
      setRoute(optimizedRoute);
      
      if (optimizedRoute) {
        // Find first incomplete stop
        const firstPending = optimizedRoute.stops.findIndex(
          stop => stop.status !== "completed" && stop.status !== "delivered"
        );
        setCurrentStopIndex(firstPending >= 0 ? firstPending : 0);
        
        // Check if trip was already started
        const hasStartedStop = optimizedRoute.stops.some(
          stop => stop.status === "in_progress" || stop.status === "completed" || stop.status === "delivered"
        );
        setTripStarted(hasStartedStop);
        
        // Check if all stops completed
        const allCompleted = optimizedRoute.stops.every(
          stop => stop.status === "completed" || stop.status === "delivered"
        );
        setTripCompleted(allCompleted);
      }
    } catch (error) {
      console.error("Error loading route:", error);
      toast({
        title: "Error",
        description: "Failed to load your route. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Bobby's separation-of-concerns brief:
  //   - "Start shift" (top-right) is generic. Driver clocks on to
  //     the timer. No order writes. No client notification. Just
  //     proof-of-shift + GPS pinger activation.
  //   - "Start delivery" (per-stop) is order-specific. Flips that
  //     stop's order to in_transit so the orderWorkflow cascade
  //     fires sendStatusNotifications -> client "Driver on the way"
  //     in-app + cateringms:order-updated bus broadcast that the
  //     client portal subscribes to.
  // Previously startTrip implicitly fired the first-stop order
  // write, which conflated shift-tracking with per-order comms
  // and broke on routes with multiple stops.
  const startShift = async () => {
    if (!route || route.stops.length === 0) return;
    setTripStarted(true);
    trip.start();
    toast({
      title: "Shift started",
      description: "GPS tracking on. Tap Start delivery on each stop when you set off.",
    });
  };

  /** Per-stop: flip this order to in_transit so the client gets
   *  the "Driver on the way" push + the dispatch + kitchen dashboards
   *  see the rolling status. Idempotent if already in_transit. */
  const startStopDelivery = async (stopIndex: number) => {
    if (!route) return;
    const stop = route.stops[stopIndex];
    if (!stop) return;
    try {
      const result = await driverService.startJob(stop.order_id);
      if (!result?.success) {
        // Most likely cause: the temporal guard in orderWorkflow
        // (event > 24h away). Surface the service-supplied error so
        // the driver sees "Too early - event is 47h away" rather
        // than a generic failure toast.
        toast({
          title: "Can't start delivery yet",
          description: result?.error || "Try again in a few minutes.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Delivery started",
        description: `Client notified you're on the way to ${stop.client_name}.`,
      });
      // Refresh so the per-stop status reflects in_transit; the timer
      // (if not already running) starts now too so the driver has
      // proof-of-shift even if they skipped the top-right button.
      if (!trip.isActive) trip.start();
      setTripStarted(true);
      await loadOptimizedRoute();
    } catch (error) {
      console.error("Error starting delivery:", error);
      toast({
        title: "Error",
        description: "Failed to start delivery. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Pause / Resume control the timer only. Order status stays as
  // in_transit because the driver is still on the trip - they're
  // just stopped for a break, traffic, or admin.
  const togglePause = () => {
    if (!trip.isActive) return;
    if (trip.isPaused) {
      trip.resume();
      toast({ title: "Trip resumed", description: "Clock is ticking again." });
    } else {
      trip.pause();
      toast({ title: "Trip paused", description: "Clock saved. Resume when you're moving again." });
    }
  };

  // Cancel: revert order statuses (in_transit -> ready), wipe the
  // timer, reset UI. Only available before any stop has been
  // completed - otherwise the driver should finish the trip rather
  // than discard a successful delivery.
  const handleCancelTrip = async () => {
    if (!route || cancelling) return;
    setCancelling(true);
    try {
      const userId = user?.id;
      if (!userId) throw new Error("Not authenticated");
      // Walk every in-flight stop back to ready. Stops already
      // delivered are left alone - cancelling shouldn't un-deliver
      // history.
      const REVERTABLE = new Set(["in_transit", "in_progress", "at_venue", "picked_up", "en_route"]);
      for (const stop of route.stops) {
        const stat = String((stop as any).status || "").toLowerCase();
        if (REVERTABLE.has(stat)) {
          try {
            await updateDeliveryStatusRaw(stop.order_id, "ready" as any, userId);
          } catch (revertErr) {
            console.warn("[routes/cancel] revert failed for", stop.order_id, revertErr);
          }
        }
      }
      trip.cancel();
      setTripStarted(false);
      setShowCancelDialog(false);
      toast({ title: "Trip cancelled", description: "Clock reset. The trip can be started again any time." });
      await loadOptimizedRoute();
    } catch (err) {
      console.error("Error cancelling trip:", err);
      toast({
        title: "Couldn't cancel",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  /**
   * Open Google Maps with kitchen as origin and the venue as destination.
   * Accepts either a stop object (uses lat/lng) or a plain address string.
   */
  const openNavigation = (stopOrAddress: { venue_lat?: number | null; venue_lng?: number | null; venue_address?: string | null } | string) => {
    const dest = typeof stopOrAddress === "string"
      ? { address: stopOrAddress }
      : { lat: stopOrAddress.venue_lat, lng: stopOrAddress.venue_lng, address: stopOrAddress.venue_address ?? null };
    openMapsNavigation(dest, kitchenOrigin ?? undefined);
  };

  const openStatusModal = (deliveryId: string, clientName: string) => {
    setSelectedDelivery({ id: deliveryId, name: clientName });
    setStatusModalOpen(true);
  };

  const handleStatusUpdated = async () => {
    await loadOptimizedRoute();
    setStatusModalOpen(false);
    setSelectedDelivery(null);
  };

  const markStopComplete = async (stopIndex: number) => {
    if (!route) return;
    
    const stop = route.stops[stopIndex];
    
    // Open status modal instead of auto-completing
    openStatusModal(stop.order_id, stop.client_name);
  };

  const completeTrip = async () => {
    if (!route) return;
    
    try {
      // Mark all assignments as completed
      for (const stop of route.stops) {
        if (stop.status !== "completed") {
          await driverService.completeJob(stop.order_id);
        }
      }
      
      // Freeze the timer at the final elapsed - the driver still
      // wants to see "trip ran 1h 23m" in the completed summary.
      trip.stop();
      toast({
        title: "Excellent Work! 🎊",
        description: `Trip completed in ${trip.elapsedLabel}. Earnings recorded.`,
      });

      // Reload route (will show as completed)
      await loadOptimizedRoute();
    } catch (error) {
      console.error("Error completing trip:", error);
      toast({
        title: "Error",
        description: "Failed to complete trip. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleNavigateToStop = (stop: any) => {
    if (stop.venue_lat && stop.venue_lng) {
      openMapsNavigation(
        { lat: stop.venue_lat, lng: stop.venue_lng, address: stop.venue_address ?? null },
        kitchenOrigin ?? undefined,
      );
    } else {
      toast({
        title: "Navigation unavailable",
        description: "Location coordinates not available for this stop",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <DriverPageShell
        pageTitle="My Routes - Driver Portal"
        heading="Today's Routes"
        subheading="AI-optimized delivery sequence for maximum efficiency"
        icon={RouteIcon}
        width="full"
      >
        <Card className="border-0 shadow-lg">
          <CardContent className="py-12 text-center">
            <RouteIcon className="w-16 h-16 mx-auto mb-4 text-slate-300 animate-pulse" />
            <p className="text-slate-600">Loading your optimized route...</p>
          </CardContent>
        </Card>
      </DriverPageShell>
    );
  }

  if (!route || route.stops.length === 0) {
    return (
      <DriverPageShell
        pageTitle="My Routes - Driver Portal"
        heading="Today's Routes"
        subheading="AI-optimized delivery sequence for maximum efficiency"
        icon={RouteIcon}
        width="full"
        hideFooter
      >
        <Card className="border-0 shadow-lg">
          <CardContent className="py-12 text-center">
            <RouteIcon className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No Route Assigned</h3>
            <p className="text-slate-600 mb-6">
              You don&apos;t have any optimized routes at the moment. Check back later or contact dispatch.
            </p>
          </CardContent>
        </Card>
        <ChatBot userRole="driver" companyId={user?.company_id} />
      </DriverPageShell>
    );
  }

  const stats = routeOptimizationService.calculateRouteStats(route);
  const completedStops = route.stops.filter(s => s.status === "completed" || s.status === "delivered").length;
  const currentStop = route.stops[currentStopIndex];
  // Estimated earnings = callout per stop + per-km on the optimised
  // route's total_distance (the actual driven path including legs
  // between stops). Shows 0 until rates load so we don't flash R250.
  const calloutFee = payRates?.base_callout_fee ?? 0;
  const distanceRate = payRates?.distance_rate_per_km ?? 0;
  const estimatedEarnings = payRates
    ? Math.round(route.stops.length * calloutFee + route.total_distance * distanceRate)
    : 0;

  // Trip-control cluster lives on the right side of the shell header.
  // Extracted from the inline JSX so the populated render is just
  // <DriverPageShell ...>{contents}</DriverPageShell> without the
  // ad-hoc flex wrapper.
  const tripControls = (
    <div className="flex flex-wrap items-center gap-2">
      {!tripStarted && !tripCompleted && (
        <Button
          size="lg"
          onClick={startShift}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 min-h-11"
          title="Start your driving shift. Each stop has its own Start delivery button that notifies the client."
        >
          <Play className="w-5 h-5 mr-2" />
          Start shift
        </Button>
      )}
      {tripStarted && !tripCompleted && (
        <>
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-base font-semibold tabular-nums shadow-sm ${
              trip.isPaused
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-blue-500 text-white"
            }`}
            aria-live="polite"
          >
            <Clock className={`w-4 h-4 ${trip.isPaused ? "" : "animate-pulse"}`} />
            {trip.elapsedLabel}
            {trip.isPaused && (
              <span className="text-xs font-normal opacity-80">paused</span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={togglePause}
            className="min-h-11"
            aria-label={trip.isPaused ? "Resume trip" : "Pause trip"}
          >
            {trip.isPaused ? (
              <>
                <Play className="w-4 h-4 mr-1.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 mr-1.5" />
                Pause
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCancelDialog(true)}
            className="min-h-11 text-red-700 border-red-300 hover:bg-red-50"
            aria-label="Cancel trip"
          >
            <X className="w-4 h-4 mr-1.5" />
            Cancel
          </Button>
        </>
      )}
      {tripCompleted && (
        <Badge className="bg-green-500 text-white text-base px-4 py-2">
          <CheckCircle className="w-4 h-4 mr-2" />
          Trip Completed{trip.elapsedMs > 0 ? ` - ${trip.elapsedLabel}` : ""}
        </Badge>
      )}
    </div>
  );

  return (
    <DriverPageShell
      pageTitle="My Routes - Driver Portal"
      heading="Today's Routes"
      subheading="AI-optimized delivery sequence for maximum efficiency"
      icon={RouteIcon}
      width="full"
      headerAction={tripControls}
      hideFooter
    >
          <div className="mb-6 lg:mb-8">
            {/* Progress Banner */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-cyan-50">
              <CardContent className="p-4 lg:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl lg:text-4xl font-bold text-blue-600">
                        {completedStops}/{route.stops.length}
                      </div>
                      <div className="text-sm lg:text-base text-slate-600">
                        <div className="font-semibold">Stops Completed</div>
                        <div className="text-xs text-slate-500">
                          {Math.round((completedStops / route.stops.length) * 100)}% Complete
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(completedStops / route.stops.length) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl lg:text-3xl font-bold text-green-600">
                      R{estimatedEarnings}
                    </div>
                    <div className="text-xs lg:text-sm text-slate-600">Potential Earnings</div>
                  </div>
                </div>
                
                {/* Complete Trip Button */}
                {tripStarted && completedStops === route.stops.length && !tripCompleted && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <Button
                      size="lg"
                      onClick={completeTrip}
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                    >
                      <Flag className="w-5 h-5 mr-2" />
                      Complete Trip & Record Earnings
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs lg:text-sm text-slate-600 flex items-center gap-1">
                      Total Distance
                      <InfoTooltip content="Total kilometres you'll cover across every stop on today's route." />
                    </p>
                    <p className="text-lg lg:text-2xl font-bold text-slate-900">
                      {route.total_distance.toFixed(1)} km
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 lg:w-10 lg:h-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs lg:text-sm text-slate-600 flex items-center gap-1">
                      Est. Time
                      <InfoTooltip content="Roughly how long the full route should take, including driving between stops." />
                    </p>
                    <p className="text-lg lg:text-2xl font-bold text-slate-900">
                      {route.total_duration} min
                    </p>
                  </div>
                  <Clock className="w-8 h-8 lg:w-10 lg:h-10 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs lg:text-sm text-slate-600 flex items-center gap-1">
                      Fuel Cost
                      <InfoTooltip content="Rough fuel cost for the whole route in rands.\n\nBased on the distance and an average cost per kilometre." />
                    </p>
                    <p className="text-lg lg:text-2xl font-bold text-slate-900">
                      R{stats.estimatedFuelCost}
                    </p>
                  </div>
                  <Fuel className="w-8 h-8 lg:w-10 lg:h-10 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 lg:pt-6 px-3 lg:px-6 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs lg:text-sm text-slate-600 flex items-center gap-1">
                      CO₂ Impact
                      <InfoTooltip content="Estimated kilograms of CO₂ this route will produce." />
                    </p>
                    <p className="text-lg lg:text-2xl font-bold text-slate-900">
                      {stats.carbonFootprint.toFixed(1)} kg
                    </p>
                  </div>
                  <Leaf className="w-8 h-8 lg:w-10 lg:h-10 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Stop Highlight */}
            <div className="lg:col-span-1 space-y-4">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-cyan-600 text-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Navigation className="h-5 w-5" />
                    {tripCompleted ? "Trip Complete" : tripStarted ? "Current Stop" : "Next Stop"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!tripCompleted && currentStop ? (
                    <>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-white text-blue-600 flex items-center justify-center font-bold">
                            {currentStopIndex + 1}
                          </div>
                          <h3 className="font-bold text-lg">{currentStop.client_name}</h3>
                        </div>
                        <p className="text-sm opacity-90 flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          {currentStop.venue_address}
                        </p>
                      </div>

                      <div className="space-y-2 text-sm">
                        {/* Collection time is the driver's FIRST
                            question - "when do I leave the kitchen?".
                            Render it above delivery because that's
                            the action the driver takes first. */}
                        {currentStop.pickup_time && (
                          <div className="flex items-center gap-2 font-semibold">
                            <Clock className="w-4 h-4" />
                            <span>Collect: {currentStop.pickup_time.slice(0, 5)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Delivery: {new Date(currentStop.delivery_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          <span>Callout: {tenantCurrency.format(calloutFee, 0)} + {tenantCurrency.format(distanceRate)}/km</span>
                        </div>
                      </div>

                      {(() => {
                        // Per-stop gate (Bobby's brief): the page-level
                        // "Start shift" is for the driver's clock. The
                        // client notification "Driver on the way" only
                        // fires when THIS stop's order flips to
                        // in_transit. So Navigate + Mark Complete here
                        // gate on the stop's own status, not on the
                        // generic shift flag.
                        const stopStatus = String((currentStop as any).status || "").toLowerCase();
                        const stopIsRolling = ["in_transit", "picked_up", "at_venue", "en_route"].includes(stopStatus);
                        return (
                          <>
                            {!stopIsRolling && (
                              <div className="bg-white/10 rounded-lg p-3 text-sm">
                                <p className="flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                  Tap <strong>Start delivery</strong> to let the client know you're on the way.
                                </p>
                              </div>
                            )}

                            <div className="space-y-2 pt-2">
                              {!stopIsRolling && (
                                <Button
                                  onClick={() => startStopDelivery(currentStopIndex)}
                                  className="w-full bg-white text-blue-600 hover:bg-blue-50"
                                  size="lg"
                                >
                                  <Play className="w-4 h-4 mr-2" />
                                  Start delivery
                                </Button>
                              )}
                              <Button
                                onClick={() => openNavigation(currentStop)}
                                disabled={!stopIsRolling}
                                className="w-full bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                                size="lg"
                              >
                                <Navigation className="w-4 h-4 mr-2" />
                                Navigate Now
                              </Button>
                              <Button
                                onClick={() => markStopComplete(currentStopIndex)}
                                disabled={!stopIsRolling}
                                variant="outline"
                                className="w-full border-white text-white hover:bg-white/10 disabled:opacity-50"
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {stopIsRolling ? "Mark Complete" : "Start delivery first"}
                              </Button>
                            </div>
                          </>
                        );
                      })()}
                    </>
                  ) : tripCompleted ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 mx-auto mb-4" />
                      <h3 className="text-xl font-bold mb-2">All Stops Completed! 🎉</h3>
                      <p className="opacity-90 mb-4">Great job on completing your route!</p>
                      <div className="bg-white/10 rounded-lg p-4">
                        <p className="text-2xl font-bold mb-1">R{estimatedEarnings}</p>
                        <p className="text-sm opacity-90">Total Earnings</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="opacity-90">All stops completed!</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Environmental Impact */}
              {!tripCompleted && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                      <Leaf className="h-4 w-4" />
                      Route Efficiency
                    </h4>
                    <p className="text-sm text-green-800">
                      This optimized route reduces your drive distance by approximately <span className="font-semibold">30%</span>, 
                      saving time and fuel while reducing carbon emissions.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Route Map */}
            <div className="lg:col-span-2">
              <Card className="border-0 shadow-lg h-[500px] lg:h-[700px]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Map className="h-5 w-5" />
                    Route Map
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[calc(100%-70px)]">
                  <RouteMap route={route} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* All Stops List */}
          <Card className="border-0 shadow-lg mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RouteIcon className="h-5 w-5" />
                Complete Route ({route.stops.length} stops)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {route.stops.map((stop, index) => {
                  const isCompleted = stop.status === "completed" || stop.status === "delivered";
                  const isCurrent = index === currentStopIndex && tripStarted && !tripCompleted;
                  const isPending = index > currentStopIndex || !tripStarted;
                  
                  return (
                    <div
                      key={stop.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isCurrent
                          ? "border-blue-500 bg-blue-50 shadow-md"
                          : isCompleted
                          ? "border-green-200 bg-green-50"
                          : isPending
                          ? "border-slate-200 bg-slate-50 opacity-60"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                              isCompleted
                                ? "bg-green-500 text-white"
                                : isCurrent
                                ? "bg-blue-600 text-white ring-4 ring-blue-200"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {isCompleted ? <CheckCircle className="w-5 h-5" /> : index + 1}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="font-semibold text-slate-900">{stop.client_name}</h4>
                                {isCurrent && (
                                  <Badge className="bg-blue-600 text-white">
                                    <Navigation className="w-3 h-3 mr-1 animate-pulse" />
                                    Current Stop
                                  </Badge>
                                )}
                                {isCompleted && (
                                  <Badge className="bg-green-100 text-green-800">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Completed
                                  </Badge>
                                )}
                                {isPending && !tripStarted && (
                                  <Badge className="bg-slate-100 text-slate-600">
                                    Pending
                                  </Badge>
                                )}
                                <Badge
                                  className={
                                    stop.priority === 1
                                      ? "bg-red-100 text-red-800"
                                      : stop.priority === 3
                                      ? "bg-gray-100 text-gray-800"
                                      : "bg-yellow-100 text-yellow-800"
                                  }
                                >
                                  {stop.priority === 1 ? "High" : stop.priority === 3 ? "Low" : "Normal"}
                                </Badge>
                                <Link
                                  href={withSlug(`/order/${stop.order_id}?role=driver`)}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold min-h-[32px]"
                                  title="Open the driver brief for this order"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open brief
                                </Link>
                              </div>
                              <p className="text-sm text-slate-600 mb-2 flex items-start gap-1">
                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                {stop.venue_address}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                                {/* Collect time leads the row because
                                    that's the actionable next step for
                                    the driver. Delivery follows. */}
                                {stop.pickup_time && (
                                  <span className="flex items-center gap-1 text-blue-700 font-medium">
                                    <Clock className="w-3 h-3" />
                                    Collect {stop.pickup_time.slice(0, 5)}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Deliver {new Date(stop.delivery_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" />
                                  {tenantCurrency.format(calloutFee, 0)} callout
                                </span>
                              </div>
                            </div>
                          </div>

                          {!isCompleted && isCurrent && (() => {
                            const stopStat = String((stop as any).status || "").toLowerCase();
                            const rolling = ["in_transit", "picked_up", "at_venue", "en_route"].includes(stopStat);
                            return (
                              <div className="flex gap-2 mt-3">
                                {!rolling && (
                                  <Button
                                    size="sm"
                                    onClick={() => startStopDelivery(index)}
                                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                                  >
                                    <Play className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">Start delivery</span>
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openNavigation(stop)}
                                  disabled={!rolling}
                                  className="flex-1 sm:flex-none"
                                >
                                  <Navigation className="w-4 h-4 sm:mr-2" />
                                  <span className="hidden sm:inline">Navigate</span>
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => markStopComplete(index)}
                                  disabled={!rolling}
                                  className="flex-1 sm:flex-none"
                                >
                                  <CheckCircle className="w-4 h-4 sm:mr-2" />
                                  <span className="hidden sm:inline">
                                    {rolling ? "Complete" : "Start delivery first"}
                                  </span>
                                </Button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {index < route.stops.length - 1 && (
                        <div className="ml-5 mt-3 pl-5 border-l-2 border-dashed border-slate-300 py-2">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <ChevronRight className="w-4 h-4" />
                            <span>
                              ~{routeOptimizationService.calculateDistance(
                                stop.venue_lat,
                                stop.venue_lng,
                                route.stops[index + 1].venue_lat,
                                route.stops[index + 1].venue_lng
                              ).toFixed(1)} km to next stop
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

      {/* Delivery Status Modal */}
      {selectedDelivery && (
        <DeliveryStatusModal
          open={statusModalOpen}
          onClose={() => {
            setStatusModalOpen(false);
            setSelectedDelivery(null);
          }}
          onStatusUpdated={handleStatusUpdated}
          deliveryId={selectedDelivery.id}
          stopName={selectedDelivery.name}
        />
      )}

      <ChatBot userRole="driver" companyId={user?.company_id} />

      {/* Cancel-trip confirmation. Spells out what reverts so the
          driver doesn't accidentally throw away a partially-done
          trip. Delivered stops are NOT touched - only in-flight
          ones revert to ready. */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <X className="w-5 h-5 text-red-600" />
              Cancel this trip?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  The clock resets to 0 and any in-flight stops revert to
                  &quot;ready&quot; so dispatch can re-route them. Stops you've
                  already delivered stay delivered.
                </p>
                <p className="text-slate-500 text-xs">
                  Trip ran for {trip.elapsedLabel} - this elapsed time is
                  discarded on cancel.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep trip</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCancelTrip();
              }}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? "Cancelling..." : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DriverPageShell>
  );
}