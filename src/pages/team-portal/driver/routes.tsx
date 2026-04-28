import { useState, useEffect } from "react";
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
  Flag
} from "lucide-react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { routeOptimizationService, OptimizedRoute } from "@/services/routeOptimizationService";
import driverService from "@/services/driverService";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";
import { DeliveryStatusModal } from "@/components/driver/DeliveryStatusModal";

const RouteMap = dynamic(
  () => import("@/components/tracking/RouteOptimizationMap"),
  { ssr: false }
);

export default function DriverRoutes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [tripStarted, setTripStarted] = useState(false);
  const [tripCompleted, setTripCompleted] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<{ id: string; name: string } | null>(null);

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

  const startTrip = async () => {
    if (!route || route.stops.length === 0) return;
    
    try {
      const firstStop = route.stops[0];
      
      // Start the first assignment
      await driverService.startJob(firstStop.order_id);
      
      setTripStarted(true);
      toast({
        title: "Trip Started! 🚗",
        description: "GPS tracking activated. Drive safely!",
      });
      
      // Reload to get updated status
      await loadOptimizedRoute();
    } catch (error) {
      console.error("Error starting trip:", error);
      toast({
        title: "Error",
        description: "Failed to start trip. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openNavigation = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, "_blank");
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
      
      toast({
        title: "Excellent Work! 🎊",
        description: "Trip completed successfully. Your earnings have been recorded.",
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
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.venue_lat},${stop.venue_lng}`;
      window.open(googleMapsUrl, "_blank");
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
      <>
        <NoIndexMeta />
        <Head>
          <title>My Routes - Driver Portal</title>
        </Head>
        <DriverNav />
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 lg:pl-72 xl:pl-80">
          <div className="px-4 py-12 max-w-6xl">
            <div className="text-center">
              <RouteIcon className="w-16 h-16 mx-auto mb-4 text-slate-300 animate-pulse" />
              <p className="text-slate-600">Loading your optimized route...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!route || route.stops.length === 0) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <title>My Routes - Driver Portal</title>
        </Head>
        <DriverNav />
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 lg:pl-72 xl:pl-80">
          <div className="px-4 py-12 max-w-6xl">
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center">
                <RouteIcon className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No Route Assigned</h3>
                <p className="text-slate-600 mb-6">
                  You don't have any optimized routes at the moment. Check back later or contact dispatch.
                </p>
              </CardContent>
            </Card>
          </div>
          <Footer />
        </div>
        <ChatBot userRole="driver" companyId={user?.user_metadata?.company_id} />
      </>
    );
  }

  const stats = routeOptimizationService.calculateRouteStats(route);
  const completedStops = route.stops.filter(s => s.status === "completed" || s.status === "delivered").length;
  const currentStop = route.stops[currentStopIndex];
  const estimatedEarnings = route.stops.length * 250; // R250 per delivery

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>My Routes - Driver Portal</title>
      </Head>

      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 lg:py-12 max-w-full">
          {/* Header */}
          <div className="mb-6 lg:mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
                  <RouteIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Optimized Route</h1>
                  <p className="text-slate-600">AI-optimized delivery sequence for maximum efficiency</p>
                </div>
              </div>
              
              {/* Trip Control Buttons */}
              {!loading && route && route.stops.length > 0 && (
                <div className="flex gap-2">
                  {!tripStarted && !tripCompleted && (
                    <Button
                      size="lg"
                      onClick={startTrip}
                      className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                    >
                      <Play className="w-5 h-5 mr-2" />
                      Start Trip
                    </Button>
                  )}
                  {tripStarted && !tripCompleted && (
                    <Badge className="bg-blue-500 text-white text-base px-4 py-2">
                      <Navigation className="w-4 h-4 mr-2 animate-pulse" />
                      Trip In Progress
                    </Badge>
                  )}
                  {tripCompleted && (
                    <Badge className="bg-green-500 text-white text-base px-4 py-2">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Trip Completed
                    </Badge>
                  )}
                </div>
              )}
            </div>

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
                      <InfoTooltip content="Total kilometres across every leg of today's optimised route. Source: routeOptimizationService.getDriverOptimizedRoute().total_distance." />
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
                      <InfoTooltip content="Estimated drive time for the full route in minutes. Source: routeOptimizationService.getDriverOptimizedRoute().total_duration." />
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
                      <InfoTooltip content="Estimated fuel rand cost for the full route. Source: routeOptimizationService.calculateRouteStats().estimatedFuelCost (distance times an internal cost-per-km estimate)." />
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
                      <InfoTooltip content="Estimated kilograms of CO₂ from this route. Source: routeOptimizationService.calculateRouteStats().carbonFootprint." />
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
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Delivery: {new Date(currentStop.delivery_time).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          <span>Earning: R250</span>
                        </div>
                      </div>

                      {!tripStarted && (
                        <div className="bg-white/10 rounded-lg p-3 text-sm">
                          <p className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            Click "Start Trip" above to begin navigation
                          </p>
                        </div>
                      )}

                      <div className="space-y-2 pt-2">
                        <Button
                          onClick={() => openNavigation(currentStop.venue_address)}
                          disabled={!tripStarted}
                          className="w-full bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                          size="lg"
                        >
                          <Navigation className="w-4 h-4 mr-2" />
                          Navigate Now
                        </Button>
                        <Button
                          onClick={() => markStopComplete(currentStopIndex)}
                          disabled={!tripStarted}
                          variant="outline"
                          className="w-full border-white text-white hover:bg-white/10 disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {tripStarted ? "Mark Complete" : "Processing..."}
                        </Button>
                      </div>
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
                              </div>
                              <p className="text-sm text-slate-600 mb-2 flex items-start gap-1">
                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                {stop.venue_address}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(stop.delivery_time).toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" />
                                  R250 earnings
                                </span>
                              </div>
                            </div>
                          </div>

                          {!isCompleted && isCurrent && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openNavigation(stop.venue_address)}
                                disabled={!tripStarted}
                                className="flex-1 sm:flex-none"
                              >
                                <Navigation className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Navigate</span>
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => markStopComplete(index)}
                                disabled={!tripStarted}
                                className="flex-1 sm:flex-none"
                              >
                                <CheckCircle className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">
                                  {tripStarted ? "Complete" : "Processing..."}
                                </span>
                              </Button>
                            </div>
                          )}
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
        </div>

        <Footer />
      </div>

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

      <ChatBot userRole="driver" companyId={user?.user_metadata?.company_id} />
    </>
  );
}