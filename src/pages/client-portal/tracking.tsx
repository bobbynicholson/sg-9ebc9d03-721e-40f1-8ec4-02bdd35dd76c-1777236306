import { useState, useEffect } from "react";
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
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
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
  // Wave 70.x - live collection trip. When the post-event equipment
  // collection is en-route, the order is still status='delivered' but we
  // surface it as a live trip (pin + ETA + "Collecting" state) the same
  // way the delivery leg is shown. collection_driver_id is the driver on
  // the collection assignment (may differ from the delivery driver).
  collecting?: boolean;
  collection_driver_id?: string | null;
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
        .is("deleted_at", null)
        .order("event_date", { ascending: false });
      const normEmail = (user.email || "").toLowerCase();
      if (clientIds.length > 0 && normEmail) {
        q = q.or(
          `client_id.in.(${clientIds.join(",")}),client_email.eq.${normEmail}`,
        );
      } else if (clientIds.length > 0) {
        q = q.in("client_id", clientIds);
      } else if (normEmail) {
        q = q.eq("client_email", normEmail);
      }
      const { data: fetchedOrders } = await q;
      
      // Filter to show orders that are active or recently delivered.
      // We expose driver_id on the mapped order so that loadDriverLocation
      // can look up the driver's GPS row - the join produces
      // `assigned_driver.id` but the rest of this page reads `driver_id`.
      let activeOrders = (fetchedOrders || []).filter((o: any) =>
        ["preparing", "ready", "in_transit", "delivered"].includes(o.status)
      ).map((o: any) => ({
        ...o,
        driver_id: o.driver_id || o.assigned_driver_id || o.assigned_driver?.id,
        driver_name: o.assigned_driver?.full_name,
        driver_phone: o.assigned_driver?.phone
      }));

      // Live collection trip: a delivered order whose equipment-collection
      // assignment is en route to collect (en_route / at_venue) is shown as
      // a live trip, not a static "Delivered". 'assigned' / 'accepted'
      // don't count - the driver hasn't rolled yet. 'picked_up' is no
      // longer live either: once the gear is collected the client's part is
      // finished (they've had the "all done" ping), so the order settles
      // back to a static state rather than tracking the driver's return.
      const activeIds = activeOrders.map((o: any) => o.id);
      if (activeIds.length > 0) {
        const { data: collRows } = await supabase
          .from("driver_assignments")
          .select("order_id, driver_id, status")
          .eq("assignment_type", "collection")
          .in("order_id", activeIds)
          .in("status", ["en_route", "at_venue"]);
        const collByOrder = new Map<string, string | null>();
        for (const c of (collRows as any[]) || []) collByOrder.set(c.order_id, c.driver_id || null);
        activeOrders = activeOrders.map((o: any) =>
          collByOrder.has(o.id)
            ? { ...o, collecting: true, collection_driver_id: collByOrder.get(o.id) }
            : o,
        );
      }

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
    // During a live collection trip track the collection driver (who may
    // differ from the delivery driver); otherwise the delivery driver.
    const trackDriverId = order.collecting && order.collection_driver_id
      ? order.collection_driver_id
      : order.driver_id;
    if (!trackDriverId) return;

    try {
      // Single-row-per-driver lookup off driver_locations (P1-23 split).
      // maybeSingle so the 'no row yet' case isn't an error (the driver
      // may not have started GPS yet).
      const { data: driver } = await (supabase as any)
        .from("driver_locations")
        .select("latitude, longitude")
        .eq("driver_id", trackDriverId)
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
      // delivery_feedback needs client_id + company_id (both NOT NULL) and
      // the RLS INSERT policy requires the client_id to belong to this
      // logged-in user. The order's own client_id can be NULL (orphan rows
      // linked by email), so resolve the *user's* client row for the order's
      // company instead - that's what RLS checks against.
      const companyId: string | null =
        (feedbackOrder as any)?.company_id ?? company?.id ?? null;
      if (!user?.id || !companyId) {
        throw new Error("Missing account context for feedback.");
      }
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", companyId)
        .limit(1)
        .maybeSingle();
      const clientId = (clientRow as any)?.id;
      if (!clientId) {
        throw new Error("Couldn't find your client profile for this order.");
      }

      await feedbackService.submitFeedback(feedback, {
        client_id: clientId,
        company_id: companyId,
      });
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

  // Restrained semantic tints: subtle bg + readable text + hairline
  // border (plus dark variants) instead of solid colour + white text.
  // in_transit stays emerald (live / on-the-way is a valid green);
  // preparing + ready warm to amber; delivered settles to neutral slate.
  const getStatusColor = (status: string) => {
    switch (status) {
      case "collecting": return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
      case "in_transit": return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
      case "ready": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
      case "preparing": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
      case "delivered": return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
      default: return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "collecting": return "Collecting equipment";
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
    // A delivered order that's NOT being collected is done. When a
    // collection trip is live, fall through to the live driver->venue ETA
    // (the driver is heading back to the venue to pick the gear up).
    if (order.status === "delivered" && !order.collecting) return "Delivered";

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
  const layoutShell = "min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 pb-20 lg:pl-72 xl:pl-80 pt-16 lg:pt-0";

  if (loading) {
    return (
      <>
        <Head><title>Tracking - CateringMS</title></Head>
        <NoIndexMeta />
        <ClientNav />
        <div className={layoutShell}>
          <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
            <PortalHeader
              title="Live tracking"
              subtitle="Watch your driver as they roll out."
              icon={MapPin}
            />
            {/* Skeleton matches the loaded shape (booking strip + map +
                sidebar list) so the layout doesn't jump on arrival. */}
            <div className="space-y-6" aria-busy="true" aria-label="Loading your deliveries">
              <div className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 h-[500px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-28 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
          </PortalShell>
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
          <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
            <PortalHeader
              title="Live tracking"
              subtitle="Watch your driver as they roll out."
              icon={MapPin}
            />
            <PortalCard className="border-rose-200 dark:border-rose-900/60">
              <div className="py-10 text-center">
                <RefreshCw className="w-12 h-12 text-rose-400 dark:text-rose-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-200 mb-2">Couldn't load your deliveries</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-4">{loadError}</p>
                <Button onClick={() => loadOrders()} className="bg-brand-primary hover:opacity-90 text-white">
                  <RefreshCw className="w-4 h-4 mr-2" /> Try again
                </Button>
              </div>
            </PortalCard>
          </PortalShell>
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
          <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
            <PortalHeader
              title="Live tracking"
              subtitle="Watch your driver as they roll out - map, ETA, and the option to call them direct."
              icon={MapPin}
            />
            <PortalCard padded={false}>
              <div className="py-16 px-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  <Package className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No live deliveries right now</h3>
                <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-5">
                  Live tracking opens up once your next event is being prepared.
                  Until then you can see all your bookings under &ldquo;My Orders&rdquo;.
                </p>
                <div className="inline-flex gap-2">
                  <Button asChild className="bg-brand-primary hover:opacity-90 text-white">
                    <Link href="/client-portal/my-orders">View my orders</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/client-portal/dashboard">Back to dashboard</Link>
                  </Button>
                </div>
              </div>
            </PortalCard>
          </PortalShell>
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
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Live tracking"
            subtitle="Real-time delivery tracking with driver pin and ETA."
            icon={MapPin}
            actions={
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-brand-primary hover:opacity-90 text-white"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            }
          />

          <div className="space-y-6">
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
              <PortalCard>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <MapPin className="w-5 h-5 text-brand-primary" />
                    Live Tracking
                  </h2>
                  {selectedOrder && (
                    <Badge variant="outline" className={getStatusColor(selectedOrder.collecting ? "collecting" : selectedOrder.status)}>
                      {getStatusLabel(selectedOrder.collecting ? "collecting" : selectedOrder.status)}
                    </Badge>
                  )}
                </div>
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

                    {/* Live indicator - emerald pulse signals "live". Shows
                        for the delivery leg (in_transit) and for a live
                        equipment-collection trip. */}
                    {(selectedOrder.status === "in_transit" || selectedOrder.collecting) && driverLocation && (
                      <div className="absolute top-4 right-4 bg-white dark:bg-slate-900 rounded-lg shadow-lg px-4 py-2 border-2 border-emerald-500 dark:border-emerald-600">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedOrder.collecting ? "Collecting - Live" : "Live Tracking"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-[500px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="text-center">
                      <MapPin className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                      <p className="text-slate-600 dark:text-slate-400">Location data not available</p>
                    </div>
                  </div>
                )}
              </PortalCard>

              {/* Driver Info Card */}
              {selectedOrder?.driver_name && (
                <PortalCard className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <User className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Your Driver</p>
                        <p className="font-semibold text-slate-900 dark:text-white">{selectedOrder.driver_name}</p>
                      </div>
                    </div>

                    {selectedOrder.driver_phone && (
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                          <Phone className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-600 dark:text-slate-400">Contact</p>
                          <p className="font-semibold truncate text-slate-900 dark:text-white tabular-nums">{selectedOrder.driver_phone}</p>
                            {/* Tap-to-call + WhatsApp - closes the audit gap
                                "client sees driver phone but cannot message".
                                Mirrors the driver-side bridge on /team-portal/driver/deliveries. */}
                          <div className="flex items-center gap-2 mt-1.5">
                            <a
                              href={`tel:${String(selectedOrder.driver_phone).replace(/[^+\d]/g, "")}`}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              📞 Call
                            </a>
                            <a
                              href={`https://wa.me/${String(selectedOrder.driver_phone).replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                                `Hi, I'm the client for ${selectedOrder.order_number || "this delivery"}. Quick question --`,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                            >
                              💬 WhatsApp
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Clock className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Estimated Arrival</p>
                        <p className="font-semibold text-slate-900 dark:text-white tabular-nums">{calculateETA(selectedOrder)}</p>
                      </div>
                    </div>
                  </div>
                </PortalCard>
              )}
            </div>

            {/* Order List Sidebar */}
            <div>
              <PortalCard>
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Your Orders</h2>
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      onClick={() => handleOrderSelect(order)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                        selectedOrder?.id === order.id
                          ? "border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 dark:border-brand-primary"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">{order.client_name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{order.venue_address}</p>
                        </div>
                        <Badge variant="outline" className={`${getStatusColor(order.collecting ? "collecting" : order.status)} text-xs shrink-0`}>
                          {getStatusLabel(order.collecting ? "collecting" : order.status)}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mt-3">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span className="tabular-nums">{formatLocalTime(order.delivery_time)}</span>
                        </div>
                        {(order.status === "in_transit" || order.collecting) && (
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <Navigation className="w-4 h-4" />
                            <span>{order.collecting ? "Collecting" : "En route"}</span>
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

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                    Last updated: <span className="tabular-nums">{formatLocalTime(lastRefresh)}</span>
                  </div>
                </div>
              </PortalCard>
            </div>
          </div>
          </div>
        </PortalShell>
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