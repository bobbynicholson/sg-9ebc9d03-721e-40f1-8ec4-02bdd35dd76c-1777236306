import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Navigation,
  Clock,
  CheckCircle,
  Route as RouteIcon,
  TrendingUp,
  Banknote,
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
import { staffOrderHref } from "@/lib/orderUrls";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
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
        <div className="space-y-6" aria-busy="true" aria-label="Loading your optimised route">
          <div className="h-32 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
            ))}
          </div>
          <div className="h-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
        </div>
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
        <PortalCard padded={false}>
          <div className="py-16 px-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
              <RouteIcon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">No route assigned</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              You don&apos;t have any optimised routes right now. Check back later or contact dispatch.
            </p>
          </div>
        </PortalCard>
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
          className="bg-brand-primary hover:opacity-90 text-white min-h-11"
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
                ? "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900"
                : "bg-brand-primary text-white"
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
            className="min-h-11 text-rose-700 border-rose-300 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-900 dark:hover:bg-rose-950/40"
            aria-label="Cancel trip"
          >
            <X className="w-4 h-4 mr-1.5" />
            Cancel
          </Button>
        </>
      )}
      {tripCompleted && (
        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-base px-4 py-2 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-900">
          <CheckCircle className="w-4 h-4 mr-2" />
          Trip completed{trip.elapsedMs > 0 ? ` - ${trip.elapsedLabel}` : ""}
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
            <PortalCard>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl lg:text-4xl font-semibold tabular-nums text-slate-900 dark:text-white">
                        {completedStops}/{route.stops.length}
                      </div>
                      <div className="text-sm lg:text-base text-slate-600 dark:text-slate-400">
                        <div className="font-semibold text-slate-900 dark:text-white">Stops completed</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {Math.round((completedStops / route.stops.length) * 100)}% complete
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                      <div
                        className="bg-brand-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(completedStops / route.stops.length) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl lg:text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {tenantCurrency.format(estimatedEarnings, 0)}
                    </div>
                    <div className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">Potential earnings</div>
                  </div>
                </div>

                {/* Complete Trip Button */}
                {tripStarted && completedStops === route.stops.length && !tripCompleted && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <Button
                      size="lg"
                      onClick={completeTrip}
                      className="w-full bg-brand-primary hover:opacity-90 text-white"
                    >
                      <Flag className="w-5 h-5 mr-2" />
                      Complete trip & record earnings
                    </Button>
                  </div>
                )}
            </PortalCard>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
            <StatTile
              icon={TrendingUp}
              label="Total distance"
              value={`${route.total_distance.toFixed(1)} km`}
              hint="Across every stop on today's route"
            />
            <StatTile
              icon={Clock}
              label="Est. time"
              value={`${route.total_duration} min`}
              hint="Including driving between stops"
            />
            <StatTile
              icon={Fuel}
              label="Fuel cost"
              value={tenantCurrency.format(stats.estimatedFuelCost, 0)}
              hint="Rough cost at an average rate per km"
            />
            <StatTile
              icon={Leaf}
              label="CO2 impact"
              value={`${stats.carbonFootprint.toFixed(1)} kg`}
              hint="Estimated emissions for this route"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Stop Highlight */}
            <div className="lg:col-span-1 space-y-4">
              <PortalCard>
                <PortalCardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      {tripCompleted ? "Trip complete" : tripStarted ? "Current stop" : "Next stop"}
                    </span>
                  }
                />
                <div className="space-y-4">
                  {!tripCompleted && currentStop ? (
                    <>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-semibold tabular-nums">
                            {currentStopIndex + 1}
                          </div>
                          <h3 className="font-semibold text-lg text-slate-900 dark:text-white">{currentStop.client_name}</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                          {currentStop.venue_address}
                        </p>
                      </div>

                      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                        {/* Collection time is the driver's FIRST
                            question - "when do I leave the kitchen?".
                            Render it above delivery because that's
                            the action the driver takes first. */}
                        {currentStop.pickup_time && (
                          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                            <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            <span>Collect: {currentStop.pickup_time.slice(0, 5)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          <span>Delivery: {new Date(currentStop.delivery_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-slate-400 dark:text-slate-500" />
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
                              <div className="rounded-lg p-3 text-sm bg-brand-primary/10 text-brand-primary border border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary">
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
                                  className="w-full bg-brand-primary hover:opacity-90 text-white"
                                  size="lg"
                                >
                                  <Play className="w-4 h-4 mr-2" />
                                  Start delivery
                                </Button>
                              )}
                              <Button
                                onClick={() => openNavigation(currentStop)}
                                disabled={!stopIsRolling}
                                variant="outline"
                                className="w-full disabled:opacity-50"
                                size="lg"
                              >
                                <Navigation className="w-4 h-4 mr-2" />
                                Navigate now
                              </Button>
                              <Button
                                onClick={() => markStopComplete(currentStopIndex)}
                                disabled={!stopIsRolling}
                                variant="outline"
                                className="w-full disabled:opacity-50"
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {stopIsRolling ? "Mark complete" : "Start delivery first"}
                              </Button>
                              {/* ODOC H.10: easy-reference link to the
                                  full order brief from inside the Next
                                  Stop hero card. Bobby's brief - the
                                  driver wants to glance at the venue
                                  contact / equipment / special notes
                                  without leaving the routes page. */}
                              {(currentStop as any).id && (
                                <Link
                                  href={withSlug(staffOrderHref((currentStop as any).id, "driver"))}
                                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors duration-150 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                  title="Open the full driver brief for this order"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  See order
                                </Link>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  ) : tripCompleted ? (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-center dark:border-emerald-900 dark:bg-emerald-500/10">
                        <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1.5 text-slate-900 dark:text-white">All stops completed</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Great work on finishing your route.</p>
                      <div className="rounded-lg p-4 bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                        <p className="text-2xl font-semibold tabular-nums mb-1 text-slate-900 dark:text-white">{tenantCurrency.format(estimatedEarnings, 0)}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Total earnings</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">All stops completed.</p>
                    </div>
                  )}
                </div>
              </PortalCard>

              {/* Route efficiency note */}
              {!tripCompleted && (
                <PortalCard className="bg-slate-50 dark:bg-slate-900">
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <Leaf className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                    Route efficiency
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    This optimised route cuts your drive distance by roughly <span className="font-semibold text-slate-900 dark:text-white">30%</span>,
                    saving time and fuel while reducing carbon emissions.
                  </p>
                </PortalCard>
              )}
            </div>

            {/* Route Map */}
            <div className="lg:col-span-2">
              <PortalCard className="h-[500px] lg:h-[700px] flex flex-col">
                <PortalCardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Map className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      Route map
                    </span>
                  }
                />
                <div className="flex-1 min-h-0">
                  <RouteMap route={route} />
                </div>
              </PortalCard>
            </div>
          </div>

          {/* All Stops List */}
          <PortalCard className="mt-6">
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  <RouteIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  Complete route ({route.stops.length} stops)
                </span>
              }
            />
              <div className="space-y-3">
                {route.stops.map((stop, index) => {
                  const isCompleted = stop.status === "completed" || stop.status === "delivered";
                  const isCurrent = index === currentStopIndex && tripStarted && !tripCompleted;
                  const isPending = index > currentStopIndex || !tripStarted;
                  
                  return (
                    <div
                      key={stop.id}
                      className={`p-4 rounded-xl border transition-colors duration-150 ${
                        isCurrent
                          ? "border-brand-primary/40 bg-brand-primary/10 dark:border-brand-primary/40 dark:bg-brand-primary/20"
                          : isCompleted
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-500/10"
                          : isPending
                          ? "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-900"
                          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-lg tabular-nums ${
                              isCompleted
                                ? "bg-emerald-600 text-white"
                                : isCurrent
                                ? "bg-brand-primary text-white ring-4 ring-brand-primary/20 dark:ring-brand-primary/30"
                                : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {isCompleted ? <CheckCircle className="w-5 h-5" /> : index + 1}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="font-semibold text-slate-900 dark:text-white">{stop.client_name}</h4>
                                {isCurrent && (
                                  <Badge className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary">
                                    <Navigation className="w-3 h-3 mr-1 animate-pulse" />
                                    Current stop
                                  </Badge>
                                )}
                                {isCompleted && (
                                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-900">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Completed
                                  </Badge>
                                )}
                                {isPending && !tripStarted && (
                                  <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    Pending
                                  </Badge>
                                )}
                                <Badge
                                  className={
                                    stop.priority === 1
                                      ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-900"
                                      : stop.priority === 3
                                      ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                      : "bg-brand-primary/10 text-brand-primary border border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary"
                                  }
                                >
                                  {stop.priority === 1 ? "High" : stop.priority === 3 ? "Low" : "Normal"}
                                </Badge>
                                <Link
                                  href={withSlug(staffOrderHref(stop.order_id, "driver"))}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-primary/30 bg-brand-primary/10 hover:bg-brand-primary/5 text-brand-primary font-semibold min-h-[32px] transition-colors duration-150 dark:border-brand-primary/30 dark:bg-brand-primary/20 dark:text-brand-primary"
                                  title="Open the driver brief for this order"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open brief
                                </Link>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex items-start gap-1">
                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                                {stop.venue_address}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                                {/* Collect time leads the row because
                                    that's the actionable next step for
                                    the driver. Delivery follows. */}
                                {stop.pickup_time && (
                                  <span className="flex items-center gap-1 text-brand-primary font-medium">
                                    <Clock className="w-3 h-3" />
                                    Collect {stop.pickup_time.slice(0, 5)}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                  Deliver {new Date(stop.delivery_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className="flex items-center gap-1 tabular-nums">
                                  <Banknote className="w-3 h-3 text-slate-400 dark:text-slate-500" />
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
                                    className="flex-1 sm:flex-none bg-brand-primary hover:opacity-90 text-white"
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
                        <div className="ml-5 mt-3 pl-5 border-l-2 border-dashed border-slate-300 dark:border-slate-700 py-2">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
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
          </PortalCard>

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
              <X className="w-5 h-5 text-rose-600" />
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
              className="bg-rose-600 hover:bg-rose-700"
            >
              {cancelling ? "Cancelling..." : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DriverPageShell>
  );
}