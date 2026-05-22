import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Package, User, Phone, Navigation, RefreshCw, Star } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import { feedbackService } from "@/services/feedbackService";
import { ChatBot } from "@/components/ChatBot";
import { DeliveryFeedbackModal, FeedbackData } from "@/components/DeliveryFeedbackModal";
import { formatLocalTime } from "@/lib/localFormat";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ClientPageHeader } from "@/components/client-portal/ClientPageHeader";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { supabase } from "@/integrations/supabase/client";

const ClientTrackingMap = dynamic(
  () => import("@/components/tracking/ClientTrackingMap").then((mod) => mod.ClientTrackingMap),
  { ssr: false }
) as React.ComponentType<any>;

interface OrderDetails {
  id: string;
  order_number?: string | null;
  // Wave 70.45c - canonical BookingHeader fields. The orders select
  // is `*` so these come down for free; declaring them on the type
  // lets the header read them without `as any` shenanigans.
  event_name?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  guest_count?: number | null;
  total_amount?: number | null;
  client_name: string;
  venue_address: string;
  venue_lat?: number;
  venue_lng?: number;
  delivery_time: string;
  status: string;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  estimated_arrival?: string;
  items?: any[];
}

interface DriverLocation {
  lat: number;
  lng: number;
  driver_name: string;
  driver_phone?: string;
  last_updated: string;
}

export default function ClientTracking() {
  const { user, company } = useAuth() as any;
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [loading, setLoading] = useState(true);
  // Client persona follow-up: mirror the admin money-page pattern
  // (admin.md section 5). Track a load error so we can render a
  // retry card instead of the empty-state card when the load
  // actually failed (network / RLS / supabase outage). The two
  // failure modes look identical without this split: "no live
  // deliveries" silently substituted for "we couldn't reach the
  // server" was confusing customers.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackOrder, setFeedbackOrder] = useState<OrderDetails | null>(null);
  const [deliveredOrders, setDeliveredOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadOrders();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadOrders(true);
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, company?.id]);

  // Check for newly delivered orders and prompt feedback
  useEffect(() => {
    orders.forEach(async (order) => {
      if (order.status === "delivered" && !deliveredOrders.has(order.id)) {
        // Check if feedback already exists
        const feedbackExists = await feedbackService.checkFeedbackExists(order.id);
        
        if (!feedbackExists) {
          // Delay to let the "delivered" status sink in
          setTimeout(() => {
            setFeedbackOrder(order);
            setFeedbackModalOpen(true);
            setDeliveredOrders(prev => new Set([...prev, order.id]));
          }, 2000); // 2 second delay
        }
      }
    });
  }, [orders, deliveredOrders]);

  const loadOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setLoadError(null);
    try {
      // Tenant scope: only this catering company's orders.
      const tenantCompanyId: string | null = company?.id ?? null;
      if (!user?.id || !tenantCompanyId) {
        setLoading(false);
        return;
      }
      // Multiple historical clients rows are possible - collect all.
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", tenantCompanyId);
      const clientIds = ((clientRows as any[]) || []).map((r) => r.id);
      if (clientIds.length === 0 && !user?.email) {
        setLoading(false);
        return;
      }

      // Get active orders for this client. Union pattern catches
      // orphan rows linked by email when client_id is NULL.
      let q = supabase
        .from("orders")
        .select(`*, assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, phone)`)
        .eq("company_id", tenantCompanyId)
        .order("event_date", { ascending: false });
      if (clientIds.length > 0 && user.email) {
        q = q.or(
          `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
        );
      } else if (clientIds.length > 0) {
        q = q.in("client_id", clientIds);
      } else if (user.email) {
        q = q.ilike("client_email", user.email);
      }
      const { data: fetchedOrders } = await q;
      
      // Filter to show orders that are active or recently delivered.
      // We expose driver_id on the mapped order so that loadDriverLocation
      // can look up the driver's GPS row - the join produces
      // `assigned_driver.id` but the rest of this page reads `driver_id`.
      const activeOrders = (fetchedOrders || []).filter((o: any) =>
        ["preparing", "ready", "in_transit", "delivered"].includes(o.status)
      ).map((o: any) => ({
        ...o,
        driver_id: o.driver_id || o.assigned_driver_id || o.assigned_driver?.id,
        driver_name: o.assigned_driver?.full_name,
        driver_phone: o.assigned_driver?.phone
      }));
      
      setOrders(activeOrders as any);
      
      // Auto-select first order if none selected
      if (activeOrders.length > 0 && !selectedOrder) {
        setSelectedOrder(activeOrders[0] as any);
        loadDriverLocation(activeOrders[0] as any);
      }
      
      setLastRefresh(new Date());
    } catch (error: any) {
      console.error("Error loading orders:", error);
      // Only surface the load error to the UI on non-silent (i.e.
      // user-visible) attempts. The 30s background refresh failing
      // shouldn't replace a working page with a retry card.
      if (!silent) setLoadError(error?.message || "Couldn't load your deliveries. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadDriverLocation = async (order: OrderDetails) => {
    if (!order.driver_id) return;
    
    try {
      // Single-row-per-driver lookup off driver_locations (P1-23 split).
      // maybeSingle so the 'no row yet' case isn't an error (the driver
      // may not have started GPS yet).
      const { data: driver } = await (supabase as any)
        .from("driver_locations")
        .select("latitude, longitude")
        .eq("driver_id", order.driver_id)
        .maybeSingle();

      if (driver && driver.latitude && driver.longitude) {
        setDriverLocation({
          lat: driver.latitude,
          lng: driver.longitude,
          driver_name: order.driver_name || "Your Driver",
          driver_phone: order.driver_phone,
          last_updated: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error loading driver location:", error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    if (selectedOrder) {
      await loadDriverLocation(selectedOrder);
    }
    setRefreshing(false);
  };

  const handleOrderSelect = async (order: OrderDetails) => {
    setSelectedOrder(order);
    await loadDriverLocation(order);
  };

  const handleLocationUpdate = (location: { lat: number; lng: number }) => {
    if (driverLocation) {
      setDriverLocation({
        ...driverLocation,
        lat: location.lat,
        lng: location.lng,
        last_updated: new Date().toISOString(),
      });
    }
  };

  const handleFeedbackSubmit = async (feedback: FeedbackData) => {
    try {
      await feedbackService.submitFeedback(feedback);
      toast({
        title: "Feedback Submitted! 🎉",
        description: "Thank you for helping us improve our service.",
      });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      throw error;
    }
  };

  const handleRateOrder = (order: OrderDetails) => {
    setFeedbackOrder(order);
    setFeedbackModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "in_transit": return "bg-emerald-500";
      case "ready": return "bg-blue-500";
      case "preparing": return "bg-amber-500";
      case "delivered": return "bg-slate-500";
      default: return "bg-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "in_transit": return "On the way!";
      case "ready": return "Ready for pickup";
      case "preparing": return "Being prepared";
      case "delivered": return "Delivered";
      default: return status;
    }
  };

  // Haversine distance in kilometres between two lat/lng pairs.
  // Good enough for the in-city drive-time estimate; the client just
  // needs "10 mins" vs "an hour" granularity, not turn-by-turn.
  const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // Live ETA from the driver's current GPS position to the venue at
  // a 35 km/h urban average. Falls back to the persisted
  // `estimated_arrival` if we don't have a live driver location yet.
  // P1-37 from the 2026-05 audit.
  const calculateETA = (order: OrderDetails) => {
    if (order.status === "delivered") return "Delivered";

    if (driverLocation && order.venue_lat && order.venue_lng) {
      const km = haversineKm(driverLocation, { lat: order.venue_lat, lng: order.venue_lng });
      const minutes = Math.max(1, Math.round((km / 35) * 60));
      if (minutes <= 1) return "Arriving now";
      if (minutes < 60) return `~${minutes} minutes`;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `~${hours}h ${mins}m`;
    }

    if (order.estimated_arrival) {
      const eta = new Date(order.estimated_arrival);
      const now = new Date();
      const diffMinutes = Math.round((eta.getTime() - now.getTime()) / 60000);
      if (diffMinutes < 0) return "Arriving soon";
      if (diffMinutes < 60) return `${diffMinutes} minutes`;
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return `${hours}h ${minutes}m`;
    }

    return "Calculating...";
  };

  // Layout shell shared by all three render branches below. Keeps the
  // sidebar offset and responsive padding consistent so cards always
  // sit flush against the menu, and adds the mobile-header gap.
  const layoutShell = "min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 pb-20 lg:pl-64 xl:pl-72 pt-16 lg:pt-0";
  const innerPadding = "px-4 sm:px-6 md:px-8 lg:px-10";

  if (loading) {
    return (
      <>
        <Head><title>Tracking - CateringMS</title></Head>
        <NoIndexMeta />
        <ClientNav />
        <div className={layoutShell}>
          <ClientPageHeader title="Live tracking" subtitle="Watch your driver as they roll out." />
          <div className={`${innerPadding} py-12 flex items-center justify-center`}>
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading your deliveries...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Load-failure recovery branch. Distinguishes "couldn't reach the
  // server" from "nothing scheduled" so customers don't see a
  // friendly "no deliveries" message when the page is actually
  // broken. Matches the cashflow / financial recovery pattern.
  if (loadError && orders.length === 0) {
    return (
      <>
        <Head><title>Tracking - CateringMS</title></Head>
        <NoIndexMeta />
        <ClientNav />
        <div className={layoutShell}>
          <ClientPageHeader title="Live tracking" subtitle="Watch your driver as they roll out." />
          <div className={`${innerPadding} py-8`}>
            <Card className="border border-rose-200 shadow-sm">
              <CardContent className="py-10 text-center">
                <RefreshCw className="w-12 h-12 text-rose-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-rose-900 mb-2">Couldn't load your deliveries</h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto mb-4">{loadError}</p>
                <Button onClick={() => loadOrders()} className="bg-emerald-600 hover:bg-emerald-700">
                  <RefreshCw className="w-4 h-4 mr-2" /> Try again
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        <ChatBot userRole="client" />
      </>
    );
  }

  if (orders.length === 0) {
    return (
      <>
        <Head>
          <title>Tracking - CateringMS</title>
        </Head>
        <NoIndexMeta />

        <ClientNav />

        <div className={layoutShell}>
          <ClientPageHeader
            title="Live tracking"
            subtitle="Watch your driver as they roll out - map, ETA, and the option to call them direct."
          />
          <div className={`${innerPadding} py-8`}>
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No live deliveries right now</h3>
                <p className="text-slate-600 max-w-md mx-auto mb-4">
                  Live tracking opens up once your next event is being prepared.
                  Until then you can see all your bookings under &ldquo;My Orders&rdquo;.
                </p>
                <div className="inline-flex gap-2">
                  <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                    <Link href="/client-portal/my-orders">View my orders</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/client-portal/dashboard">Back to dashboard</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <ChatBot userRole="client" />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Tracking - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <ClientNav />

      <div className={layoutShell}>
        <ClientPageHeader
          title="Live tracking"
          subtitle="Real-time delivery tracking with driver pin and ETA."
          rightSlot={
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              className="bg-white/15 border-white/30 text-white hover:bg-white/25 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          }
        />

        <div className={`${innerPadding} py-8 space-y-6`}>
          {/* Wave 70.45c - canonical BookingHeader (client variant).
              Same component the client sees on every event document
              (quote, order tracking, order detail). Replaces the
              implicit "selected order context" that was previously
              spread across the Live Tracking card title + driver
              info card - those still render, this is the top-level
              identity strip for the order being tracked. */}
          {selectedOrder && (
            <BookingHeader
              variant="client"
              booking={{
                id: selectedOrder.id,
                order_number: selectedOrder.order_number ?? null,
                event_name: selectedOrder.event_name ?? null,
                event_date: selectedOrder.event_date ?? null,
                event_time: selectedOrder.event_time ?? null,
                guest_count: selectedOrder.guest_count ?? null,
                status: selectedOrder.status,
                client_name: selectedOrder.client_name,
                venue_address: selectedOrder.venue_address,
                total_amount: selectedOrder.total_amount ?? null,
              }}
            />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Map */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-emerald-600" />
                      Live Tracking
                    </CardTitle>
                    {selectedOrder && (
                      <Badge className={`${getStatusColor(selectedOrder.status)} text-white`}>
                        {getStatusLabel(selectedOrder.status)}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedOrder && selectedOrder.venue_lat && selectedOrder.venue_lng ? (
                    <div className="h-[500px] relative">
                      <ClientTrackingMap
                        orderId={selectedOrder.id}
                        driverLocation={driverLocation || undefined}
                        venueLocation={{
                          lat: selectedOrder.venue_lat,
                          lng: selectedOrder.venue_lng,
                          address: selectedOrder.venue_address,
                        }}
                        orderStatus={selectedOrder.status}
                        estimatedArrival={selectedOrder.estimated_arrival}
                        onLocationUpdate={handleLocationUpdate}
                      />
                      
                      {/* Live indicator */}
                      {selectedOrder.status === "in_transit" && driverLocation && (
                        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-4 py-2 border-2 border-emerald-500">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                            <span className="text-sm font-medium text-slate-900">Live Tracking</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-[500px] flex items-center justify-center bg-slate-100 rounded-lg">
                      <div className="text-center">
                        <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                        <p className="text-slate-600">Location data not available</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Driver Info Card */}
              {selectedOrder?.driver_name && (
                <Card className="mt-6">
                  <CardContent className="py-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-3 rounded-full">
                          <User className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Your Driver</p>
                          <p className="font-semibold">{selectedOrder.driver_name}</p>
                        </div>
                      </div>
                      
                      {selectedOrder.driver_phone && (
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-3 rounded-full">
                            <Phone className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-600">Contact</p>
                            <p className="font-semibold truncate">{selectedOrder.driver_phone}</p>
                            {/* Tap-to-call + WhatsApp - closes the audit gap
                                "client sees driver phone but cannot message".
                                Mirrors the driver-side bridge on /team-portal/driver/deliveries. */}
                            <div className="flex items-center gap-2 mt-1.5">
                              <a
                                href={`tel:${String(selectedOrder.driver_phone).replace(/[^+\d]/g, "")}`}
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700"
                              >
                                📞 Call
                              </a>
                              <a
                                href={`https://wa.me/${String(selectedOrder.driver_phone).replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                                  `Hi, I'm the client for ${selectedOrder.order_number || "this delivery"}. Quick question --`,
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                              >
                                💬 WhatsApp
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-100 p-3 rounded-full">
                          <Clock className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Estimated Arrival</p>
                          <p className="font-semibold">{calculateETA(selectedOrder)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Order List Sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Your Orders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      onClick={() => handleOrderSelect(order)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedOrder?.id === order.id
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold">{order.client_name}</p>
                          <p className="text-sm text-slate-600">{order.venue_address}</p>
                        </div>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-600 mt-3">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatLocalTime(order.delivery_time)}</span>
                        </div>
                        {order.status === "in_transit" && (
                          <div className="flex items-center gap-1 text-emerald-600 font-medium">
                            <Navigation className="w-4 h-4" />
                            <span>En route</span>
                          </div>
                        )}
                      </div>

                      {/* Rate Order Button for Delivered Orders */}
                      {order.status === "delivered" && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRateOrder(order);
                          }}
                          variant="outline"
                          size="sm"
                          className="w-full mt-3"
                        >
                          <Star className="w-4 h-4 mr-2" />
                          Rate This Delivery
                        </Button>
                      )}
                    </div>
                  ))}
                  
                  <div className="pt-3 border-t text-center text-xs text-slate-500">
                    Last updated: {formatLocalTime(lastRefresh)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Modal */}
      {feedbackOrder && (
        <DeliveryFeedbackModal
          isOpen={feedbackModalOpen}
          onClose={() => {
            setFeedbackModalOpen(false);
            setFeedbackOrder(null);
          }}
          orderId={feedbackOrder.id}
          orderDetails={{
            client_name: feedbackOrder.client_name,
            venue_address: feedbackOrder.venue_address,
            driver_name: feedbackOrder.driver_name,
            delivery_time: feedbackOrder.delivery_time,
          }}
          onSubmit={handleFeedbackSubmit}
        />
      )}

      <ChatBot userRole="client" />
    </>
  );
}