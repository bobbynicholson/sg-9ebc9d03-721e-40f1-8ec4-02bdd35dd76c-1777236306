import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
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
import { routeOptimizationService } from "@/services/routeOptimizationService";
import dynamic from "next/dynamic";

const RouteMap = dynamic(
  () => import("@/components/tracking/RouteOptimizationMap"),
  { ssr: false }
);

interface OptimizedRoute {
  driver_id: string;
  stops: any[];
  total_distance: number;
  total_duration: number;
  estimated_completion: string;
}

export default function RoutePlanning() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [routes, setRoutes] = useState<OptimizedRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<OptimizedRoute | null>(null);
  const [unassignedOrders, setUnassignedOrders] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const companyId = user.user_metadata?.company_id || user.id;
      const orders = await routeOptimizationService.getUnassignedOrders(companyId);
      setUnassignedOrders(orders);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimizeRoutes = async () => {
    if (!user) return;
    setOptimizing(true);
    try {
      const companyId = user.user_metadata?.company_id || user.id;
      const optimizedRoutes = await routeOptimizationService.optimizeAllDriverRoutes(companyId);
      setRoutes(optimizedRoutes);
      if (optimizedRoutes.length > 0) {
        setSelectedRoute(optimizedRoutes[0]);
      }
    } catch (error) {
      console.error("Error optimizing routes:", error);
    } finally {
      setOptimizing(false);
    }
  };

  const handleSaveRoute = async (route: OptimizedRoute) => {
    const success = await routeOptimizationService.saveOptimizedRoute(route);
    if (success) {
      alert("Route saved successfully!");
      loadData();
    } else {
      alert("Error saving route");
    }
  };

  const getRouteStats = (route: OptimizedRoute) => {
    return routeOptimizationService.calculateRouteStats(route);
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Route Planning - CateringMS</title>
      </Head>

      <Header />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                  <Route className="inline-block mr-3 text-blue-600" />
                  Route Planning & Optimization
                </h1>
                <p className="text-slate-600">
                  AI-powered route optimization for efficient deliveries
                </p>
              </div>
              <Button
                onClick={handleOptimizeRoutes}
                disabled={optimizing || unassignedOrders.length === 0}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {optimizing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <Navigation className="mr-2 h-4 w-4" />
                    Optimize All Routes
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Unassigned Orders</p>
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
                    <p className="text-sm font-medium text-slate-600">Optimized Routes</p>
                    <p className="text-2xl font-bold text-slate-900">{routes.length}</p>
                  </div>
                  <Route className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Total Distance</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {routes.reduce((sum, r) => sum + r.total_distance, 0).toFixed(1)} km
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Est. Time</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {Math.round(routes.reduce((sum, r) => sum + r.total_duration, 0))} min
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Route List */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Driver Routes
                  </CardTitle>
                  <CardDescription>
                    {routes.length} optimized route{routes.length !== 1 ? "s" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {routes.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">
                      Click "Optimize All Routes" to generate efficient delivery sequences
                    </p>
                  ) : (
                    routes.map((route, index) => {
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
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900">Driver {index + 1}</p>
                                  <p className="text-xs text-slate-500">{route.stops.length} stops</p>
                                </div>
                              </div>
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Optimized
                              </Badge>
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
                                <span>${stats.estimatedFuelCost}</span>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="w-full mt-3"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveRoute(route);
                              }}
                            >
                              <Save className="w-3 h-3 mr-1" />
                              Apply Route
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
                    Route Visualization
                  </CardTitle>
                  <CardDescription>
                    {selectedRoute
                      ? `Showing optimized route with ${selectedRoute.stops.length} stops`
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
                          {routes.length === 0
                            ? "Generate routes to see visualization"
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
                    <CardTitle>Route Details & Stops</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {selectedRoute.stops.map((stop, index) => (
                        <div key={stop.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm">
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-1">
                              <h4 className="font-semibold text-slate-900">{stop.client_name}</h4>
                              <Badge className={
                                stop.priority === 1 ? "bg-red-100 text-red-800" :
                                stop.priority === 3 ? "bg-gray-100 text-gray-800" :
                                "bg-yellow-100 text-yellow-800"
                              }>
                                {stop.priority === 1 ? "High" : stop.priority === 3 ? "Low" : "Normal"} Priority
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 mb-2">{stop.venue_address}</p>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(stop.delivery_time).toLocaleString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                Stop #{index + 1}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Environmental Impact */}
                    <div className="mt-6 p-4 bg-green-50 rounded-lg">
                      <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                        <Leaf className="h-4 w-4" />
                        Environmental Impact
                      </h4>
                      <p className="text-sm text-green-800">
                        This optimized route will produce approximately{" "}
                        <span className="font-semibold">
                          {routeOptimizationService.calculateRouteStats(selectedRoute).carbonFootprint.toFixed(2)} kg CO₂
                        </span>
                        . Route optimization helps reduce emissions by up to 30%.
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
      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}