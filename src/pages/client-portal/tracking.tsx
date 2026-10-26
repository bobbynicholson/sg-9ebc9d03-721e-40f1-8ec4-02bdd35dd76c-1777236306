import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Package, User, Phone, Navigation, RefreshCw, MessageCircle } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { LazyChatBot as ChatBot } from "@/components/chatbot/LazyChatBot";
import { formatLocalTime } from "@/lib/localFormat";
import dynamic from "next/dynamic";
import { ClientNav } from "@/components/navigation/ClientNav";
import { PortalShell, PortalHeader, PortalCard, PortalOverview,
  PageWorkbench,
} from "@/components/portal/ui";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { orderDisplayName } from "@/lib/orderDisplayName";

const ClientTrackingMap = dynamic(
  () => import("@/components/tracking/ClientTrackingMap").then((mod) => mod.ClientTrackingMap),
  { ssr: false }
) as React.ComponentType<any>;

// One subtitle for every state (loading, empty, error, live) so the header
// doesn't change wording while the page loads.
const TRACKING_SUBTITLE = "Follow your delivery or equipment collection while the driver is on the road.";

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
  venue_name?: string | null;
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
  // Live collection trip. When the post-event equipment collection is
  // en-route, the order can still be status='delivered', but this page
  // treats the active collection assignment as the trackable trip.
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

function ClientTrackingInner() {
  const { user, company } = useAuth() as any;
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const requestedOrderId = typeof router.query.orderId === "string" ? router.query.orderId : null;
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
  const [requestedOrderMissing, setRequestedOrderMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    loadOrders();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadOrders(true);
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, company?.id, requestedOrderId]);

  const loadOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setLoadError(null);
    try {
      // Tenant scope: only this catering company's orders.
      const tenantCompanyId: string | null = company?.id ?? null;
      if (!user?.id || !tenantCompanyId) {
        setOrders([]);
        setSelectedOrder(null);
        setDriverLocation(null);
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
        setOrders([]);
        setSelectedOrder(null);
        setDriverLocation(null);
        setLoading(false);
        return;
      }

      // Get only rows that can become live tracking entries:
      // - in_transit delivery trips
      // - delivered orders that may have a live equipment collection trip
      // Preparing/ready/completed history belongs on Bookings, not here.
      // Union pattern catches orphan rows linked by email when client_id is NULL.
      let q = supabase
        .from("orders")
        .select(`*, assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, phone)`)
        .eq("company_id", tenantCompanyId)
        .is("deleted_at", null)
        .in("status", ["in_transit", "delivered"])
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
      
      // We expose driver_id on the mapped order so that loadDriverLocation
      // can look up the driver's GPS row - the join produces
      // `assigned_driver.id` but the rest of this page reads `driver_id`.
      let candidateOrders = (fetchedOrders || []).map((o: any) => ({
        ...o,
        driver_id: o.driver_id || o.assigned_driver_id || o.assigned_driver?.id,
        driver_name: o.assigned_driver?.full_name,
        driver_phone: o.assigned_driver?.phone
      }));

      // Live collection trip: a delivered order whose equipment-collection
      // assignment is en route or at the venue is shown as a live trip.
      // Assigned/accepted rows are scheduled but not tracking yet; picked_up
      // and completed rows are done and stay in Bookings/history.
      const candidateIds = candidateOrders.map((o: any) => o.id);
      if (candidateIds.length > 0) {
        const { data: collRows } = await supabase
          .from("driver_assignments")
          .select("order_id, driver_id, status")
          .eq("assignment_type", "collection").neq("status", "cancelled")
          .in("order_id", candidateIds)
          .in("status", ["en_route", "at_venue"]);
        const collectionAssignments = ((collRows as any[]) || []);
        const collectionDriverIds = Array.from(new Set(
          collectionAssignments.map((c) => c.driver_id).filter(Boolean),
        ));
        const { data: collectionDrivers } = collectionDriverIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name, phone")
              .in("id", collectionDriverIds)
          : { data: [] as any[] };
        const collectionDriverById = new Map(
          ((collectionDrivers as any[]) || []).map((driver) => [driver.id, driver]),
        );
        const collByOrder = new Map<string, any>();
        for (const c of collectionAssignments) collByOrder.set(c.order_id, c);
        candidateOrders = candidateOrders.map((o: any) =>
          collByOrder.has(o.id)
            ? {
                ...o,
                collecting: true,
                collection_driver_id: collByOrder.get(o.id)?.driver_id || null,
                driver_id: collByOrder.get(o.id)?.driver_id || o.driver_id,
                driver_name: collectionDriverById.get(collByOrder.get(o.id)?.driver_id)?.full_name || o.driver_name,
                driver_phone: collectionDriverById.get(collByOrder.get(o.id)?.driver_id)?.phone || o.driver_phone,
              }
            : o,
        );
      }

      const liveTrips = candidateOrders.filter((order: OrderDetails) => (
        (order.status === "in_transit" && !!order.driver_id) ||
        (order.collecting && !!order.collection_driver_id)
      ));
      const requestedLiveTrip = requestedOrderId
        ? liveTrips.find((order: OrderDetails) => order.id === requestedOrderId)
        : null;
      setRequestedOrderMissing(Boolean(requestedOrderId && !requestedLiveTrip));

      setOrders(liveTrips as any);

      const nextSelectedOrder =
        requestedLiveTrip ||
        (selectedOrder && liveTrips.find((order: OrderDetails) => order.id === selectedOrder.id)) ||
        liveTrips[0] ||
        null;
      setSelectedOrder(nextSelectedOrder as OrderDetails | null);
      if (nextSelectedOrder) {
        await loadDriverLocation(nextSelectedOrder as OrderDetails);
      } else {
        setDriverLocation(null);
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
    const tenantCompanyId: string | null = company?.id ?? null;
    if (!trackDriverId || !tenantCompanyId) {
      setDriverLocation(null);
      return;
    }

    try {
      // Single-row-per-driver lookup off driver_locations (P1-23 split).
      // maybeSingle so the 'no row yet' case isn't an error (the driver
      // may not have started GPS yet).
      const { data: driver } = await (supabase as any)
        .from("driver_locations")
        .select("latitude, longitude")
        .eq("driver_id", trackDriverId)
        .eq("company_id", tenantCompanyId)
        .maybeSingle();

      if (driver && driver.latitude && driver.longitude) {
        setDriverLocation({
          lat: driver.latitude,
          lng: driver.longitude,
          driver_name: order.driver_name || "Your Driver",
          driver_phone: order.driver_phone,
          last_updated: new Date().toISOString(),
        });
      } else {
        setDriverLocation(null);
      }
    } catch (error) {
      console.error("Error loading driver location:", error);
      setDriverLocation(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
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

  // Restrained semantic tints: subtle bg + readable text + hairline
  // border (plus dark variants) instead of solid colour + white text.
  // in_transit uses the brand tone for live/on-the-way movement;
  // preparing + ready warm to amber; delivered settles to neutral slate.
  const getStatusColor = (status: string) => {
    switch (status) {
      case "collecting": return "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30";
      case "in_transit": return "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30";
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

  // Is there a driver actively on the road for this order right now?
  // True only for the live delivery leg (in_transit) or a live equipment
  // collection trip (collecting). A delivered order that's no longer being
  // collected is finished - we stop showing the driver + distance.
  const isLiveTrip = (order: OrderDetails) =>
    order.status === "in_transit" || !!order.collecting;

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
              subtitle={TRACKING_SUBTITLE}
              icon={MapPin}
              variant="hero"
            />
            <PageWorkbench />
            {/* Most visits end on "no driver on the road", so the skeleton is
                one quiet card rather than a 500px map placeholder. */}
            <PortalCard aria-busy="true" aria-label="Checking for a driver on the road">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none dark:bg-slate-800" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-56 max-w-[70%] animate-pulse rounded bg-slate-200 motion-reduce:animate-none dark:bg-slate-800" />
                  <div className="h-3 w-80 max-w-[90%] animate-pulse rounded bg-slate-100 motion-reduce:animate-none dark:bg-slate-800/60" />
                </div>
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                Checking for a driver on the road...
              </p>
            </PortalCard>
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
              subtitle={TRACKING_SUBTITLE}
              icon={MapPin}
              variant="hero"
            />
            <PageWorkbench />
            <PortalOverview
              eyebrow="Live tracking"
              title="Tracking could not load"
              description="The map and driver state could not be refreshed. Use Try again below, or open Bookings for the full order status."
              items={[
                { label: "Trips", value: 0, helper: "Not loaded", icon: Navigation, tone: "danger" },
                { label: "Driver pin", value: "Offline", helper: "No GPS loaded", icon: MapPin, tone: "danger" },
                { label: "ETA", value: "Unknown", helper: "Retry needed", icon: Clock, tone: "warning" },
                { label: "Fallback", value: "Bookings", helper: "Full order status", icon: Package, tone: "neutral" },
              ]}
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
              subtitle={TRACKING_SUBTITLE}
              icon={MapPin}
              variant="hero"
            />
            <PageWorkbench />
            {/* One card says it once: nothing is on the road, what this page
                will show when something is, and where to go meanwhile. */}
            <PortalCard padded={false}>
              <div className="px-5 py-10 text-center sm:px-8 sm:py-14">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <Navigation className="h-7 w-7 text-slate-400 dark:text-slate-500" />
                </div>
                <h2 className="mb-2 text-lg font-semibold text-slate-900 sm:text-xl dark:text-white">
                  {requestedOrderMissing ? "That booking is not on the road right now" : "No driver is on the road right now"}
                </h2>
                <p className="mx-auto max-w-md text-sm leading-6 text-slate-600 sm:text-base dark:text-slate-400">
                  {requestedOrderMissing
                    ? "This page shows a booking only while its driver is on the way or collecting equipment. Your booking has the full status."
                    : "This page comes alive when your delivery leaves the kitchen or a driver sets off to collect equipment. Upcoming and past bookings are under Bookings."}
                </p>
                <ul className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-2 text-left sm:grid-cols-3">
                  {[
                    { icon: MapPin, label: "Driver on a live map" },
                    { icon: Clock, label: "Estimated arrival time" },
                    { icon: Phone, label: "Call or message the driver" },
                  ].map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                      <Icon className="h-4 w-4 shrink-0 text-brand-primary" />
                      {label}
                    </li>
                  ))}
                </ul>
                <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
                  <Button asChild className="bg-brand-primary text-white hover:opacity-90">
                    <Link href={withSlug(requestedOrderId ? `/client-portal/my-orders?orderId=${requestedOrderId}` : "/client-portal/my-orders")}>
                      {requestedOrderId ? "Open this booking" : "See my bookings"}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={withSlug("/client-portal/dashboard")}>Back to dashboard</Link>
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
            subtitle={TRACKING_SUBTITLE}
            icon={MapPin}
            variant="hero"
            actions={
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                className="border border-white/20 bg-white/10 text-white hover:bg-white/15"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh driver location
              </Button>
            }
          />
          <PageWorkbench />

          <PortalOverview
            eyebrow="Live tracking"
            title={selectedOrder ? `${orderDisplayName(selectedOrder) || "Live trip"} is active` : "Live tracking is active"}
            description="Use this page only while a driver is moving. For upcoming and completed bookings, open Bookings for the full status and documents."
            items={[
              { label: "Live trips", value: orders.length, helper: "Driver on road", icon: Navigation, tone: "brand" },
              { label: "Selected", value: selectedOrder ? getStatusLabel(selectedOrder.collecting ? "collecting" : selectedOrder.status) : "-", helper: selectedOrder?.venue_address || "No order selected", icon: Package, tone: "neutral" },
              { label: "Driver pin", value: driverLocation ? "Live" : "Waiting", helper: driverLocation ? "GPS received" : "Driver GPS not received", icon: MapPin, tone: driverLocation ? "success" : "warning" },
              { label: "ETA", value: selectedOrder ? calculateETA(selectedOrder) : "-", helper: "Auto refreshed", icon: Clock, tone: "neutral" },
            ]}
            actions={
              selectedOrder ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={withSlug(`/client-portal/my-orders?orderId=${selectedOrder.id}`)}>Open booking</Link>
                </Button>
              ) : null
            }
          />

          <div className="space-y-6">
          {requestedOrderMissing && requestedOrderId && (
            <PortalCard className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Requested booking is not live right now</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Showing another live trip. Open Bookings to view the requested order&apos;s full status.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href={withSlug(`/client-portal/my-orders?orderId=${requestedOrderId}`)}>View requested booking</Link>
              </Button>
            </PortalCard>
          )}
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
                status: selectedOrder.collecting ? "collecting" : selectedOrder.status,
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
                    Live map
                  </h2>
                  {selectedOrder && (
                    <Badge variant="outline" className={getStatusColor(selectedOrder.collecting ? "collecting" : selectedOrder.status)}>
                      {getStatusLabel(selectedOrder.collecting ? "collecting" : selectedOrder.status)}
                    </Badge>
                  )}
                </div>
                {selectedOrder && (
                  (selectedOrder.venue_lat && selectedOrder.venue_lng) ||
                  (isLiveTrip(selectedOrder) && driverLocation)
                ) ? (
                  <div className="relative h-[340px] overflow-hidden rounded-lg sm:h-[420px] lg:h-[500px]">
                    <ClientTrackingMap
                      orderId={selectedOrder.id}
                      driverLocation={isLiveTrip(selectedOrder) ? (driverLocation || undefined) : undefined}
                      venueLocation={{
                        lat: selectedOrder.venue_lat,
                        lng: selectedOrder.venue_lng,
                        address: selectedOrder.venue_address,
                      }}
                      orderStatus={selectedOrder.status}
                      estimatedArrival={selectedOrder.estimated_arrival}
                      onLocationUpdate={handleLocationUpdate}
                      // Once the trip is over (delivered and not actively
                      // collecting) stop following the driver - the map drops
                      // the driver pin + distance line and shows just the venue.
                      trackDriver={isLiveTrip(selectedOrder)}
                    />

                    {/* Live indicator - brand pulse signals "live". Shows
                        for the delivery leg (in_transit) and for a live
                        equipment-collection trip. */}
                    {(selectedOrder.status === "in_transit" || selectedOrder.collecting) && driverLocation && (
                      <div className="absolute right-3 top-3 rounded-lg border-2 border-brand-primary bg-white px-3 py-1.5 shadow-lg sm:right-4 sm:top-4 sm:px-4 sm:py-2 dark:border-brand-primary/80 dark:bg-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-primary motion-reduce:animate-none sm:h-3 sm:w-3"></div>
                          <span className="text-xs font-medium text-slate-900 sm:text-sm dark:text-white">{selectedOrder.collecting ? "Collecting - live" : "Live"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-lg bg-slate-100 px-6 sm:h-72 dark:bg-slate-800">
                    <div className="text-center">
                      <MapPin className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                      <p className="font-medium text-slate-700 dark:text-slate-300">Waiting for the driver&apos;s location</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The map appears as soon as their phone shares GPS.</p>
                    </div>
                  </div>
                )}
              </PortalCard>

              {/* Driver Info Card */}
              {selectedOrder?.driver_name && (
                <PortalCard className="mt-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <User className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400">Your driver</p>
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{selectedOrder.driver_name}</p>
                        {selectedOrder.driver_phone && (
                          <p className="truncate text-sm tabular-nums text-slate-600 dark:text-slate-400">{selectedOrder.driver_phone}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Clock className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-400">Estimated arrival</p>
                        <p className="font-semibold text-slate-900 dark:text-white tabular-nums">{calculateETA(selectedOrder)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Tap-to-call + WhatsApp - closes the audit gap
                      "client sees driver phone but cannot message".
                      Mirrors the driver-side bridge on /team-portal/driver/deliveries.
                      Full-width on phones so they are easy to tap. */}
                  {selectedOrder.driver_phone && (
                    <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
                      <Button asChild variant="outline">
                        <a href={`tel:${String(selectedOrder.driver_phone).replace(/[^+\d]/g, "")}`}>
                          <Phone className="mr-2 h-4 w-4" />
                          Call driver
                        </a>
                      </Button>
                      <Button asChild className="bg-brand-primary text-white hover:opacity-90">
                        <a
                          href={buildWhatsAppUrl(String(selectedOrder.driver_phone),
                            `Hi, I'm the client for ${selectedOrder.order_number || "this delivery"}. Quick question --`,
                          ) || undefined}
                          target="_self"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="mr-2 h-4 w-4" />
                          Message driver on WhatsApp
                        </a>
                      </Button>
                    </div>
                  )}
                </PortalCard>
              )}
            </div>

            {/* Live trip selector. Full booking history and ratings live
                under Bookings; this page only lists trips with a driver
                actively on the road. */}
            {/* With more than one trip, phones show the picker above the map
                so the client chooses before scrolling. */}
            <div className={orders.length > 1 ? "order-first lg:order-none" : undefined}>
              <PortalCard id="live-trips" data-chat-section="client.tracking.live" data-chat-section-label="Live trips">
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Live trips</h2>
                <div className="space-y-3">
                  {orders.map((order) => (
                    <button
                      type="button"
                      key={order.id}
                      onClick={() => handleOrderSelect(order)}
                      aria-pressed={selectedOrder?.id === order.id}
                      className={`block w-full p-4 text-left rounded-xl border-2 cursor-pointer transition-colors ${
                        selectedOrder?.id === order.id
                          ? "border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 dark:border-brand-primary"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {orderDisplayName(order) || order.venue_name || "Live trip"}
                          </p>
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
                          <div className="flex items-center gap-1 text-brand-primary dark:text-brand-primary font-medium">
                            <Navigation className="w-4 h-4" />
                            <span>{order.collecting ? "Collecting" : "En route"}</span>
                          </div>
                        )}
                      </div>

                    </button>
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

      <ChatBot userRole="client" />
    </>
  );
}

export default function ClientTracking() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ClientTrackingInner />
    </ProtectedRoute>
  );
}
