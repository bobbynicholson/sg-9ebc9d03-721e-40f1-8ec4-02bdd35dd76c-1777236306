import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Clock, Package, User, Phone, Navigation, TrendingUp, AlertCircle } from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import driverService from "@/services/driverService";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import dynamic from "next/dynamic";
import { OrderDetailsPanel } from "@/components/tracking/OrderDetailsPanel";
import { dispatchService } from "@/services/dispatchService";
import { supabase } from "@/integrations/supabase/client";

// Haversine + average speed for ETA. Phase 3 will plug real traffic.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
const AVG_SPEED_KMH = 35;

// Dynamically import the map component with SSR disabled
const AdminTrackingMap = dynamic(
  () => import("@/components/tracking/AdminTrackingMap").then((mod) => mod.AdminTrackingMap),
  { ssr: false }
);

/**
 * /admin/tracking -- the LIVE operational view.
 *
 * Different from /admin/route-planning which is the PRE-FLIGHT dispatcher
 * view. This page is for the owner / admin watching today's jobs run:
 * confirmed -> preparing -> ready -> in_transit -> delivered, plus driver
 * GPS pings ticking through. Audience is whoever's worried about whether
 * the food is going to land where it's meant to land, on time.
 */
export default function AdminTracking() {
  const { user, profile } = useAuth() as any;
  const [orders, setOrders] = useState<any[]>([]);
  const [driverLocations, setDriverLocations] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [arrivalBufferMinutes, setArrivalBufferMinutes] = useState(30);

  // Load dispatch settings once for the arrival buffer (used in at-risk calc).
  useEffect(() => {
    if (!user?.company_id) return;
    dispatchService.getDispatchSettings(user.company_id)
      .then(s => setArrivalBufferMinutes(s.arrivalBufferMinutes))
      .catch(() => {});
  }, [user?.company_id]);

  const loadTrackingData = useCallback(async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }

    try {
      const companyId = user.company_id;

      // LIVE scope: orders with active statuses AND event_date >= today.
      // Past events stay off this view -- they belong on the orders page.
      const allOrders = await orderService.getAllOrders(companyId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeStatuses = ["confirmed", "preparing", "ready", "out_for_delivery", "in_transit", "delivered"];
      const activeOrders = allOrders.filter((order: any) => {
        if (!activeStatuses.includes(order.status || "")) return false;
        // event_date may be null on some legacy rows -- include them so
        // staff can still find the order if they're looking for it.
        if (!order.event_date) return true;
        const eventDate = new Date(order.event_date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() >= today.getTime();
      });

      // Load driver data
      const driverData = await driverService.getAllDrivers(companyId);
      setDrivers(driverData);

      // Enrich orders with driver location data. Try assigned_driver_id
      // first then fall back to legacy driver_id (audit fix lives here).
      const enrichedOrders = activeOrders.map((order: any) => {
        const driverId = order.assigned_driver_id || order.driver_id;
        const driver = driverData.find((d: any) => d.id === driverId) as any;

        // ETA calculation: driver pin -> venue.
        let etaMinutes: number | null = null;
        let distanceKm: number | null = null;
        if (
          driver?.current_lat != null && driver?.current_lng != null &&
          order.venue_lat != null && order.venue_lng != null
        ) {
          distanceKm = haversineKm(
            { lat: Number(driver.current_lat), lng: Number(driver.current_lng) },
            { lat: Number(order.venue_lat),    lng: Number(order.venue_lng) },
          );
          etaMinutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60);
        }

        // Margin to deadline: minutes between predicted arrival and event_time.
        // Negative means we're going to be late.
        let marginMinutes: number | null = null;
        if (order.event_date && order.event_time && etaMinutes != null) {
          const eventDt = new Date(`${order.event_date}T${order.event_time}`);
          if (!isNaN(eventDt.getTime())) {
            const minutesUntilEvent = (eventDt.getTime() - Date.now()) / 60_000;
            marginMinutes = minutesUntilEvent - etaMinutes - arrivalBufferMinutes;
          }
        }
        const isAtRisk = marginMinutes != null && marginMinutes < 0;

        return {
          ...order,
          driver_id: driverId,
          driver_name: driver?.full_name,
          driver_phone: driver?.phone,
          driver_lat: driver?.current_lat,
          driver_lng: driver?.current_lng,
          last_updated: driver?.location_updated_at,
          eta_minutes: etaMinutes,
          distance_km: distanceKm,
          margin_minutes: marginMinutes,
          is_at_risk: isAtRisk,
        };
      });

      // Sort by margin ascending (most urgent first); orders with no margin go last.
      enrichedOrders.sort((a: any, b: any) => {
        if (a.margin_minutes == null && b.margin_minutes == null) return 0;
        if (a.margin_minutes == null) return 1;
        if (b.margin_minutes == null) return -1;
        return a.margin_minutes - b.margin_minutes;
      });

      setOrders(enrichedOrders);

      // Keep selectedOrder synced when refreshes happen so the right pane
      // updates rather than going stale on auto-refresh.
      setSelectedOrder((current: any) => {
        if (!current) return current;
        return enrichedOrders.find((o: any) => o.id === current.id) || current;
      });
    } catch (error) {
      console.error("Error loading tracking data:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    loadTrackingData();
  }, [loadTrackingData]);

  // Phase 3: realtime driver locations. Replaces the 30s polling lag for
  // pin movement -- when any driver in this company writes a new GPS row,
  // we patch the affected order's driver_lat/lng and recompute ETA + margin.
  // Falls back to the existing auto-refresh poll for status changes.
  useEffect(() => {
    if (!user?.company_id) return;
    const channel = supabase
      .channel(`tracking-realtime-${user.company_id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "gps_tracking" },
        (payload: any) => {
          const row = payload?.new;
          if (!row?.driver_id) return;
          setOrders(prev => prev.map((o: any) => {
            if (o.driver_id !== row.driver_id && o.assigned_driver_id !== row.driver_id) return o;
            const newLat = Number(row.latitude);
            const newLng = Number(row.longitude);
            if (isNaN(newLat) || isNaN(newLng)) return o;
            // Recompute ETA + margin against the new pin.
            let etaMinutes: number | null = null;
            let distanceKm: number | null = null;
            if (o.venue_lat != null && o.venue_lng != null) {
              distanceKm = haversineKm(
                { lat: newLat, lng: newLng },
                { lat: Number(o.venue_lat), lng: Number(o.venue_lng) },
              );
              etaMinutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60);
            }
            let marginMinutes: number | null = null;
            if (o.event_date && o.event_time && etaMinutes != null) {
              const eventDt = new Date(`${o.event_date}T${o.event_time}`);
              if (!isNaN(eventDt.getTime())) {
                const minutesUntilEvent = (eventDt.getTime() - Date.now()) / 60_000;
                marginMinutes = minutesUntilEvent - etaMinutes - arrivalBufferMinutes;
              }
            }
            return {
              ...o,
              driver_lat: newLat,
              driver_lng: newLng,
              last_updated: row.timestamp || new Date().toISOString(),
              eta_minutes: etaMinutes,
              distance_km: distanceKm,
              margin_minutes: marginMinutes,
              is_at_risk: marginMinutes != null && marginMinutes < 0,
            };
          }));
        },
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => loadTrackingData(),
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [user?.company_id, arrivalBufferMinutes, loadTrackingData]);

  // Auto-refresh: re-pull every 30s when toggled on. Verifies the toggle
  // actually does something -- previous build had the state but no timer.
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(() => {
        loadTrackingData();
      }, 30000);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, loadTrackingData]);

  // Pull company name once for the compose drawer signature
  useEffect(() => {
    if (companyName || !user?.company_id) return;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("companies")
          .select("company_name")
          .eq("id", user.company_id)
          .maybeSingle();
        if (data?.company_name) setCompanyName(data.company_name);
      } catch {
        /* fall back to undefined -- compose drawer handles it */
      }
    })();
  }, [user?.company_id, companyName]);

  const handleDriverLocationUpdate = (updatedLocations: any[]) => {
    setDriverLocations(updatedLocations);
  };

  // Apply status + driver filters first so the fuzzy matcher only ranks
  // orders the user has narrowed to (smart search rollout 29 Apr 2026).
  const statusDriverFilteredOrders = useMemo(() => {
    return orders.filter((order: any) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesDriver = driverFilter === "all" || order.driver_id === driverFilter;
      return matchesStatus && matchesDriver;
    });
  }, [orders, statusFilter, driverFilter]);

  const filteredOrders = useFuzzyItems(
    statusDriverFilteredOrders,
    searchTerm,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "venue_address" as any, weight: 2 },
      { key: "driver_name" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-yellow-100 text-yellow-800",
      ready: "bg-purple-100 text-purple-800",
      out_for_delivery: "bg-orange-100 text-orange-800",
      in_transit: "bg-orange-100 text-orange-800",
      delivered: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed": return <Clock className="w-4 h-4" />;
      case "preparing": return <Package className="w-4 h-4" />;
      case "ready": return <TrendingUp className="w-4 h-4" />;
      case "out_for_delivery":
      case "in_transit": return <Navigation className="w-4 h-4" />;
      case "delivered": return <Package className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const stats = {
    atRisk: orders.filter((o) => o.is_at_risk).length,
    active: orders.filter((o) => o.status === "out_for_delivery" || o.status === "in_transit").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    total: orders.length,
  };

  return (
    <>
      <Head>
        <title>Live Tracking - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-20 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Live Operations
            </h1>
            <p className="text-slate-600">
              Today's jobs in flight, with driver pins ticking through. Sorted by urgency.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className={stats.atRisk > 0 ? "border-red-300 bg-red-50/40" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">At risk <InfoTooltip content={"Orders where the driver's predicted arrival is later than required (event time minus arrival buffer). Needs attention now."} /></p>
                    <p className={`text-2xl font-bold ${stats.atRisk > 0 ? "text-red-700" : "text-slate-400"}`}>{stats.atRisk}</p>
                  </div>
                  <AlertCircle className={`w-7 h-7 ${stats.atRisk > 0 ? "text-red-600" : "text-slate-300"}`} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">In transit <InfoTooltip content={"Orders with a driver right now, on the way to the venue."} /></p>
                    <p className="text-2xl font-bold text-orange-600">{stats.active}</p>
                  </div>
                  <Navigation className="w-7 h-7 text-orange-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">Preparing <InfoTooltip content={"Orders being prepped in the kitchen right now."} /></p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.preparing}</p>
                  </div>
                  <Package className="w-7 h-7 text-yellow-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">Ready <InfoTooltip content={"Prepped, packed, waiting for a driver to collect."} /></p>
                    <p className="text-2xl font-bold text-purple-600">{stats.ready}</p>
                  </div>
                  <TrendingUp className="w-7 h-7 text-purple-600" />
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search by client, venue, or driver..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="preparing">Preparing</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={driverFilter} onValueChange={setDriverFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Filter by driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Drivers</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant={autoRefresh ? "default" : "outline"}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="w-full md:w-auto"
                >
                  {autoRefresh ? "Auto-Refresh: ON" : "Auto-Refresh: OFF"}
                </Button>

                <Button
                  variant="outline"
                  onClick={loadTrackingData}
                  className="w-full md:w-auto"
                >
                  Refresh Now
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Main Content */}
          <Tabs defaultValue="map" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="map">Map View</TabsTrigger>
              <TabsTrigger value="list">List View</TabsTrigger>
            </TabsList>

            <TabsContent value="map">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Map */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">Live Tracking Map <InfoTooltip content={"Pins for every active venue and the last known position of each driver.\n\nDriver pins update as their devices report new locations."} /></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[600px] relative">
                      <AdminTrackingMap
                        orders={filteredOrders}
                        driverLocations={driverLocations}
                        onDriverLocationUpdate={handleDriverLocationUpdate}
                        companyId={user?.company_id}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Order Details Sidebar */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      {selectedOrder ? "Order Details" : "Active Orders"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[700px] overflow-y-auto">
                    {selectedOrder ? (
                      <OrderDetailsPanel
                        order={selectedOrder}
                        fromName={profile?.full_name || companyName}
                        companyName={companyName}
                        onClose={() => setSelectedOrder(null)}
                      />
                    ) : (
                      <div className="space-y-2">
                        {filteredOrders.length === 0 ? (
                          <p className="text-sm text-slate-600 text-center py-8">
                            All clear -- nothing in motion right now.
                          </p>
                        ) : (
                          filteredOrders.map((order) => {
                            const atRisk = order.is_at_risk;
                            const margin = order.margin_minutes;
                            const eta = order.eta_minutes;
                            const isSelected = selectedOrder?.id === order.id;
                            return (
                              <div
                                key={order.id}
                                className={`p-3 border-l-4 rounded-md cursor-pointer transition-colors ${
                                  atRisk     ? "border-l-red-500 bg-red-50/40 hover:bg-red-50" :
                                  margin != null && margin < 30 ? "border-l-amber-500 hover:bg-amber-50/40" :
                                                                  "border-l-transparent border border-slate-200 hover:bg-slate-50"
                                } ${isSelected ? "ring-2 ring-blue-300" : ""}`}
                                onClick={() => setSelectedOrder(order)}
                              >
                                <div className="flex items-start justify-between mb-1.5">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-semibold text-sm truncate">{order.client_name}</p>
                                      {atRisk && (
                                        <Badge className="bg-red-100 text-red-800 border-0 text-[9px] font-bold tracking-wide">AT RISK</Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-600 truncate">{order.venue_address || order.venue_name}</p>
                                  </div>
                                  <Badge className={`${getStatusColor(order.status || "")} text-[10px]`}>
                                    {order.status}
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2 text-slate-600 min-w-0">
                                    {order.driver_name ? (
                                      <span className="inline-flex items-center gap-1 truncate">
                                        <User className="w-3 h-3 shrink-0" />
                                        {order.driver_name}
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 font-medium">No driver</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {eta != null && (
                                      <span className="text-slate-600 tabular-nums">ETA {eta}m</span>
                                    )}
                                    {margin != null && (
                                      <span className={`tabular-nums font-medium ${
                                        margin < 0  ? "text-red-700"   :
                                        margin < 30 ? "text-amber-700" :
                                                      "text-emerald-700"
                                      }`}>
                                        {margin >= 0 ? `${Math.round(margin)}m slack` : `${Math.round(margin)}m late`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="list">
              <Card>
                <CardContent className="p-6">
                  {loading ? (
                    <div className="text-center py-8">
                      <p className="text-slate-600">Loading orders...</p>
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-slate-600">No orders found matching your filters</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredOrders.map((order) => (
                        <div key={order.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h3 className="font-semibold text-slate-900">{order.client_name}</h3>
                                <Badge className={getStatusColor(order.status || "")}>
                                  <span className="flex items-center gap-1">
                                    {getStatusIcon(order.status || "")}
                                    {order.status}
                                  </span>
                                </Badge>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-600">
                                <div className="flex items-start gap-2">
                                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                  <span>{order.venue_address}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 flex-shrink-0" />
                                  <span>{order.delivery_time || (order.event_date ? new Date(order.event_date).toLocaleString("en-ZA") : "No time set")}</span>
                                </div>

                                {order.driver_name && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4 flex-shrink-0" />
                                      <span>{order.driver_name}</span>
                                    </div>

                                    {order.driver_phone && (
                                      <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4 flex-shrink-0" />
                                        <span>{order.driver_phone}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedOrder(order)}
                            >
                              View on Map
                            </Button>
                          </div>

                          {order.last_updated && (
                            <div className="text-xs text-slate-500 mt-2">
                              Last updated: {new Date(order.last_updated).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.company_id} />
    </>
  );
}
