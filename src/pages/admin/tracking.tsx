import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { toLocalISO, tenantToday } from "@/lib/localDate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Clock, Package, User, Phone, Navigation, TrendingUp, AlertCircle, Download, Printer, ExternalLink, Search, RefreshCw } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { staffOrderHref } from "@/lib/orderUrls";
import { useTenantHref } from "@/lib/tenantUrl";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench, PortalCard, PortalCardHeader, StatTile,
} from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import driverService from "@/services/driverService";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import dynamic from "next/dynamic";
import { OrderDetailsPanel } from "@/components/tracking/OrderDetailsPanel";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { dispatchService, computeRiskScore } from "@/services/dispatchService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";

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

// Wave 70.64: ETA / margin maths runs both client-side (browser
// local TZ) and during the realtime patch. The naked
// `new Date("YYYY-MM-DDTHH:MM")` constructor parses as local time
// when there's no Z / offset, which is what we want for an
// operator viewing in their own timezone, but it broke quietly if
// event_time ever arrived padded with seconds-precision-Z (e.g.
// from a serialized ISO timestamp): the parser would then read it
// as UTC and the ETA could be off by hours.
//
// Strategy: normalise to `<date>T<time-truncated-to-mm:ss>` with
// no trailing Z, so the constructor consistently picks the
// browser's local timezone. event_time is stored as a TIME
// (postgres) and PostgREST returns 'HH:MM:SS' - we slice it
// defensively in case of legacy formats.
function parseEventDateTime(eventDate: string, eventTime: string): Date | null {
  if (!eventDate || !eventTime) return null;
  const time = String(eventTime).slice(0, 8); // HH:MM:SS or HH:MM
  const dt = new Date(`${eventDate}T${time}`);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

// Audit fix (2026-07-02): "today" buckets (query lower bound + the
// Today / Tomorrow badges) were anchored to the browser clock. An
// operator viewing from a different timezone than the tenant saw
// today's events drop off or tomorrow's arrive early. Anchor to
// companies.timezone; tenantToday falls back while the tz is null.
function getTodayISO(timezone: string | null): string {
  return toLocalISO(tenantToday(timezone));
}

function getTomorrowISO(timezone: string | null): string {
  const tomorrow = tenantToday(timezone);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalISO(tomorrow);
}

// Dynamically import the map component with SSR disabled.
// TIGHTEN I.27 (admin.md section 5): pre-fix a chunk-load failure on
// the leaflet bundle blanked the whole map slot with no signal. Now
// renders a skeleton while loading and surfaces a clear failure
// message via WidgetErrorBoundary if the chunk import throws.
const AdminTrackingMap = dynamic(
  () => import("@/components/tracking/AdminTrackingMap").then((mod) => mod.AdminTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] items-center justify-center rounded-md border border-slate-200 bg-slate-50">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm">Loading live map...</p>
        </div>
      </div>
    ),
  }
);

/**
 * /admin/tracking - the LIVE operational view.
 *
 * Different from /admin/route-planning which is the PRE-FLIGHT dispatcher
 * view. This page is for the owner / admin watching today's jobs run:
 * confirmed -> preparing -> ready -> in_transit -> delivered, plus driver
 * GPS pings ticking through. Audience is whoever's worried about whether
 * the food is going to land where it's meant to land, on time.
 */
function AdminTrackingInner() {
  const router = useRouter();
  const { user, profile } = useAuth() as any;
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id);
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [orders, setOrders] = useState<any[]>([]);
  const [driverLocations, setDriverLocations] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);
  // Tenant wall clock for the "today" scope + badges (see getTodayISO).
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Silent-failure audit: this page auto-refreshes, so an inline
  // banner (not a toast per failed poll) flags when the live data
  // couldn't be fetched. Clears itself on the next good load.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  // Wave 70.61: autoRefresh now persists to localStorage. The
  // previous default-true reset on every navigation - ops staff
  // who'd deliberately turned it off (e.g. to investigate a state
  // without the 30s wipe) had to re-disable on every return to the
  // page. Defaults to true on first visit; localStorage holds the
  // override.
  const [autoRefresh, setAutoRefreshState] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("liveOps:autoRefresh");
    if (raw === "false") setAutoRefreshState(false);
  }, []);
  const setAutoRefresh = (v: boolean) => {
    setAutoRefreshState(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("liveOps:autoRefresh", v ? "true" : "false");
    }
  };
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [arrivalBufferMinutes, setArrivalBufferMinutes] = useState(30);
  // LO-A (live-ops audit, 2026-05-19): controlled Tabs value so the
  // "View on Map" button in the list view can switch the active tab.
  // Default = "map" matches the previous defaultValue.
  const [activeTab, setActiveTab] = useState<"map" | "list">("map");
  const [operationsScope, setOperationsScope] = useState<"today" | "all">("today");

  useEffect(() => {
    const status = typeof router.query.status === "string" ? router.query.status : "";
    if (["all", "confirmed", "preparing", "ready", "in_transit", "delivered"].includes(status)) {
      setStatusFilter(status);
    }
    const view = typeof router.query.view === "string" ? router.query.view : "";
    if (view === "map" || view === "list") setActiveTab(view);
    const scope = typeof router.query.scope === "string" ? router.query.scope : "";
    if (scope === "today" || scope === "all") setOperationsScope(scope);
  }, [router.query.status, router.query.view, router.query.scope]);

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

      // LO-C (LO-17): server-side scope. Previously
      // orderService.getAllOrders pulled the whole company history
      // and the client-side filter narrowed to today+active. On a
      // busy tenant that meant hauling back 1000+ rows then keeping
      // ~30. The query now applies both filters server-side. Null
      // event_dates are kept (legacy rows) via the .or clause so
      // staff can still find them.
      const todayISO = getTodayISO(tenantTimezone);

      const { data: rawOrders, error: ordersErr } = await supabase
        .from("orders")
        .select(`
          *,
          client:clients(*),
          order_items(*),
          quote:quotes!orders_quote_id_fkey(public_token, quote_number),
          assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, email, phone),
          assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email),
          assigned_vehicle:vehicles!orders_assigned_vehicle_id_fkey(id, plate, nickname, refrigerated, has_warmer, max_pax_served, capacity_kg, owner_kind, requires_two_people)
        `)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        // Live operations starts at today and moves forward. Delivered
        // stays in the set so the Today scope can show completed work
        // without forcing the admin back to the full orders page.
        .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered"])
        // Wave 70.61: removed the .or(event_date.is.null) branch.
        // It was meant to keep "legacy rows" visible for cleanup but
        // in practice it dragged every undated draft / quote shell
        // into the live-ops page forever. The right home for those
        // is the orders list, not today's tracker.
        .gte("event_date", todayISO)
        .order("created_at", { ascending: false });
      if (ordersErr) {
        console.error("[admin/tracking] active-orders query error:", ordersErr);
        // Silent-failure audit: an empty board after a failed query
        // read as "no live jobs". Throw so the banner below shows.
        throw ordersErr;
      }
      const activeOrders = ((rawOrders || []) as any[]).filter((order) => !isAutomatedTestOrder(order));

      // Load driver data. Phase 2 #1: enrich with the latest pin from
      // driver_locations - profiles.current_lat / current_lng is the
      // legacy column the foreground pinger no longer writes to, so
      // the initial enrichment below would produce ETA=null on every
      // active order until the first realtime tick. One IN-query keeps
      // this cheap for tenants with O(20) drivers.
      const driverData = await driverService.getAllDrivers(companyId);
      try {
        const driverIds = driverData.map((d: any) => d.id).filter(Boolean);
        if (driverIds.length > 0) {
          // Wave 70.61: belt-and-braces company_id filter on the
          // driver_locations read. RLS scopes the table, but if a
          // driver profile.id is ever shared across tenants the
          // .in() alone would surface every linked tenant's last
          // pin. eq()ing company_id makes the wrong-tenant case
          // a 0-row reply we can see.
          const { data: pins } = await (supabase as any)
            .from("driver_locations")
            .select("driver_id, latitude, longitude, updated_at")
            .eq("company_id", companyId)
            .in("driver_id", driverIds);
          const pinMap: Record<string, any> = {};
          for (const p of pins || []) {
            pinMap[(p as any).driver_id] = p;
          }
          for (const d of driverData as any[]) {
            const pin = pinMap[d.id];
            if (pin && pin.latitude != null && pin.longitude != null) {
              d.current_lat = Number(pin.latitude);
              d.current_lng = Number(pin.longitude);
              d.location_updated_at = pin.updated_at;
            }
          }
        }
      } catch (pinErr) {
        console.warn("[admin/tracking] driver pin enrichment failed:", pinErr);
      }
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
          const eventDt = parseEventDateTime(order.event_date, order.event_time);
          if (eventDt && !isNaN(eventDt.getTime())) {
            const minutesUntilEvent = (eventDt.getTime() - Date.now()) / 60_000;
            marginMinutes = minutesUntilEvent - etaMinutes - arrivalBufferMinutes;
          }
        }

        // Phase 4: composite risk score
        const lastPingAge = driver?.location_updated_at
          ? (Date.now() - new Date(driver.location_updated_at).getTime()) / 60_000
          : null;
        const risk = computeRiskScore({
          marginMinutes,
          lastPingAgeMinutes: lastPingAge,
          driverLoadToday: null, // populated below in a second pass
          hasDriverPin: driver?.current_lat != null && driver?.current_lng != null,
          status: order.status ?? null,
        });
        // Wave 70.64: is_at_risk now mirrors the KPI tile's definition
        // (risk_tier === high|critical). Pre-fix this was the cruder
        // `marginMinutes < 0` binary, so the row badges + the row's
        // is_at_risk flag disagreed with the at-risk tile - the tile
        // counted 1 but the matching row had no badge, or vice versa.
        // Composite tier is the right signal (covers GPS staleness +
        // missing pin in-motion as well as a late margin).
        const isAtRisk = risk.tier === "high" || risk.tier === "critical";

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
          risk_score: risk.score,
          risk_tier: risk.tier,
          risk_reasons: risk.reasons,
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
      setLoadError(null);
    } catch (error: any) {
      console.error("Error loading tracking data:", error);
      setLoadError(error?.message || "Couldn't load live tracking data. It will retry on the next refresh.");
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, tenantTimezone]);

  useEffect(() => {
    loadTrackingData();
  }, [loadTrackingData, refreshSignal]);

  // Phase 3: realtime driver locations. Replaces the 30s polling lag for
  // pin movement - when any driver in this company writes a new GPS row,
  // we patch the affected order's driver_lat/lng and recompute ETA + margin.
  // Falls back to the existing auto-refresh poll for status changes.
  useEffect(() => {
    if (!user?.company_id) return;
    // Wave 70.62: gps_tracking now carries company_id (migration
    // 20260523080000) populated by a BEFORE INSERT trigger from
    // the driver's profile. The realtime binding can finally
    // filter server-side instead of relying on the handler-side
    // driver_id-match short-circuit, so cross-tenant pin payloads
    // stop riding the wire altogether.
    const channel = supabase
      .channel(`tracking-realtime-${user.company_id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "gps_tracking", filter: `company_id=eq.${user.company_id}` },
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
              const eventDt = parseEventDateTime(o.event_date, o.event_time);
              if (eventDt && !isNaN(eventDt.getTime())) {
                const minutesUntilEvent = (eventDt.getTime() - Date.now()) / 60_000;
                marginMinutes = minutesUntilEvent - etaMinutes - arrivalBufferMinutes;
              }
            }
            const risk = computeRiskScore({
              marginMinutes,
              lastPingAgeMinutes: 0, // ping just landed, by definition fresh
              driverLoadToday: null,
              hasDriverPin: true,
              status: o.status ?? null,
            });
            return {
              ...o,
              driver_lat: newLat,
              driver_lng: newLng,
              last_updated: row.timestamp || new Date().toISOString(),
              eta_minutes: etaMinutes,
              distance_km: distanceKm,
              margin_minutes: marginMinutes,
              // Wave 70.64: align is_at_risk with the KPI tile (tier
              // === high|critical). See loadTrackingData branch for
              // the longer explanation.
              is_at_risk: risk.tier === "high" || risk.tier === "critical",
              risk_score: risk.score,
              risk_tier: risk.tier,
              risk_reasons: risk.reasons,
            };
          }));
        },
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `company_id=eq.${user.company_id}` },
        (payload: any) => {
          const before = payload?.old;
          const after = payload?.new;
          // Detect geofence-fired arrival: delivery_status transitioned to "arrived"
          if (before?.delivery_status !== "arrived" && after?.delivery_status === "arrived" && after?.id) {
            // Find the order in current state to get the client name for the toast
            const o = orders.find((x: any) => x.id === after.id);
            toast({
              title: "Driver arrived at venue",
              description: o?.client_name
                ? `${o.driver_name ? o.driver_name + " · " : ""}${o.client_name}`
                : "An order was auto-marked as arrived (geofence).",
            });
          }
          loadTrackingData();
        },
      )
      .subscribe();
    // Wave 70.61: v2 cleanup uses removeChannel so the channel
    // object is released from the client registry. .unsubscribe()
    // detaches the binding but leaves the topic, so a remount
    // re-channel on the same name can collide.
    return () => { supabase.removeChannel(channel); };
  }, [user?.company_id, arrivalBufferMinutes, loadTrackingData]);

  // Wave 70.64: auto-refresh is now a safety-net poll, not the
  // primary live update path. Realtime (gps_tracking INSERT +
  // orders UPDATE) patches state inline; the polling timer only
  // re-pulls when the tab is visible AND it's been a long enough
  // window that we'd expect a state we haven't seen patched (e.g.
  // a row added to the queue while a different filter was on).
  //
  // Pre-fix the timer fired every 30s regardless, while realtime
  // ALSO triggered a full loadTrackingData() on every orders UPDATE
  // - so a tenant editing a far-future order paid for two
  // simultaneous selects, with the polling refresh also racing the
  // realtime patch and clobbering it.
  //
  // New strategy:
  //   - Drop the 30s cadence to 2 minutes. Realtime carries the
  //     fast path; the timer is a backstop.
  //   - Pause the timer when document.hidden (cron / overnight
  //     tabs no longer burn quota).
  //   - The toggle still flips the timer off entirely - some ops
  //     staff disable to investigate a frozen state.
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        loadTrackingData();
      }, 120000); // 2 min safety-net poll, realtime is the fast path
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, loadTrackingData]);

  // Pull company name once for the compose drawer signature, plus
  // the tenant timezone for the "today" anchoring in one round trip.
  useEffect(() => {
    if (companyName || !user?.company_id) return;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("companies")
          .select("company_name, timezone")
          .eq("id", user.company_id)
          .maybeSingle();
        if (data?.company_name) setCompanyName(data.company_name);
        if ((data as any)?.timezone) setTenantTimezone((data as any).timezone);
      } catch {
        /* fall back to undefined - compose drawer handles it */
      }
    })();
  }, [user?.company_id, companyName]);

  const handleDriverLocationUpdate = (updatedLocations: any[]) => {
    setDriverLocations(updatedLocations);
  };

  const todayISO = getTodayISO(tenantTimezone);
  const tomorrowISO = getTomorrowISO(tenantTimezone);
  const isTodayOrder = useCallback((order: any) => {
    return String(order?.event_date || "").slice(0, 10) === todayISO;
  }, [todayISO]);
  const getOrderDateBadge = useCallback((order: any) => {
    const date = String(order?.event_date || "").slice(0, 10);
    if (!date) {
      return { label: "No date", className: "bg-slate-100 text-slate-600 border-slate-200" };
    }
    if (date === todayISO) {
      return { label: "Today", className: "bg-brand-primary/15 text-brand-primary border-brand-primary/20" };
    }
    if (date === tomorrowISO) {
      return { label: "Tomorrow", className: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    const parsed = new Date(`${date}T00:00:00`);
    return {
      label: Number.isNaN(parsed.getTime())
        ? date
        : parsed.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }),
      className: "bg-slate-50 text-slate-600 border-slate-200",
    };
  }, [todayISO, tomorrowISO]);
  const todayOrders = useMemo(() => orders.filter(isTodayOrder), [orders, isTodayOrder]);
  const scopedOrders = useMemo(
    () => operationsScope === "today" ? todayOrders : orders,
    [operationsScope, orders, todayOrders],
  );

  // Apply scope + status + driver filters first so the fuzzy matcher only ranks
  // orders the user has narrowed to (smart search rollout 29 Apr 2026).
  const statusDriverFilteredOrders = useMemo(() => {
    return scopedOrders.filter((order: any) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesDriver = driverFilter === "all" || order.driver_id === driverFilter;
      return matchesStatus && matchesDriver;
    });
  }, [scopedOrders, statusFilter, driverFilter]);

  const filteredOrders = useFuzzyItems(
    statusDriverFilteredOrders,
    searchTerm,
    [
      { key: "order_number" as any, weight: 3 },
      { key: "client_name" as any, weight: 3 },
      { key: "event_name" as any, weight: 2 },
      { key: "venue_address" as any, weight: 2 },
      { key: "driver_name" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  useEffect(() => {
    if (!selectedOrder) return;
    if (!scopedOrders.some((order: any) => order.id === selectedOrder.id)) {
      setSelectedOrder(null);
    }
  }, [selectedOrder?.id, scopedOrders]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-yellow-100 text-yellow-800",
      ready: "bg-slate-100 text-slate-800",
      in_transit: "bg-orange-100 text-orange-800",
      delivered: "bg-brand-primary/15 text-brand-primary",
      cancelled: "bg-rose-100 text-rose-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed": return <Clock className="w-4 h-4" />;
      case "preparing": return <Package className="w-4 h-4" />;
      case "ready": return <TrendingUp className="w-4 h-4" />;
      case "in_transit": return <Navigation className="w-4 h-4" />;
      case "delivered": return <Package className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const stats = {
    atRisk: scopedOrders.filter((o) =>
      o.status !== "delivered" &&
      o.delivery_status !== "arrived" &&
      (o.risk_tier === "high" || o.risk_tier === "critical")
    ).length,
    active: scopedOrders.filter((o) => o.status === "in_transit").length,
    preparing: scopedOrders.filter((o) => o.status === "preparing").length,
    ready: scopedOrders.filter((o) => o.status === "ready").length,
    today: todayOrders.length,
    total: orders.length,
  };

  return (
    <>
      <Head>
        <title>Live operations - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <AdminNav />

      <div className="admin-page-shell admin-page-shell--deep-footer">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Live operations"
            icon={Navigation}
            subtitle={operationsScope === "today"
              ? "Today's confirmed-and-onwards orders, with live driver pins, prep status, and at-risk flags surfaced first."
              : "All active and upcoming confirmed-and-onwards orders from today forward. Use Today when the floor is running service."}
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {stats.today} event{stats.today === 1 ? "" : "s"} today
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {stats.active} in transit
                  </span>
                  {stats.atRisk > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200">
                      <AlertCircle className="h-3 w-3" />
                      {stats.atRisk} at risk
                    </span>
                  )}
                </>
              ) : null
            }
            actions={
              <Link href={withSlug("/admin/orders")}>
                <Button variant="outline" className="gap-1.5">
                  <ExternalLink className="w-4 h-4" />
                  All orders
                </Button>
              </Link>
            }
          />
          <PageWorkbench />

          {/* Load-failure banner: without it a failed fetch showed an
              empty board that read as "nothing running today". */}
          {loadError && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" />
              <p className="flex-1 text-sm text-rose-900">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadTrackingData} disabled={loading}>
                Try again
              </Button>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {operationsScope === "today" ? "Today is highlighted" : "All live orders"}
              </p>
              <p className="text-xs text-slate-500 tabular-nums">
                {stats.today} today - {stats.total} active/upcoming from today forward
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setOperationsScope("today")}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    operationsScope === "today"
                      ? "bg-brand-primary text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  Today <span className="ml-1 tabular-nums">{stats.today}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOperationsScope("all")}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    operationsScope === "all"
                      ? "bg-brand-primary text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  All live <span className="ml-1 tabular-nums">{stats.total}</span>
                </button>
              </div>
              <Link
                href={withSlug("/admin/orders")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Package className="w-4 h-4" />
                Full order book
              </Link>
            </div>
          </div>

          {/* Live KPI strip. StatTile row per the command-centre
              standard; the at-risk value stays SEMANTIC rose when
              non-zero. Skeletons render inside the shell during the
              first load so the rail never disappears. */}
          {loading && orders.length === 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200/90 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatTile
                label={operationsScope === "today" ? "Today" : "Shown"}
                value={scopedOrders.length}
                hint="In scope before search and filters"
                icon={Clock}
              />
              <StatTile
                label="At risk"
                value={<span className={stats.atRisk > 0 ? "text-rose-600" : undefined}>{stats.atRisk}</span>}
                hint="Predicted late, stale GPS or no pin in motion"
                icon={AlertCircle}
              />
              <StatTile
                label="In transit"
                value={stats.active}
                hint="Driver on the way to the venue"
                icon={Navigation}
              />
              <StatTile
                label="In kitchen"
                value={stats.preparing + stats.ready}
                hint={`${stats.preparing} preparing, ${stats.ready} ready for collection`}
                icon={Package}
              />
            </div>
          )}

          {/* Filters: search + selects + refresh/export/print in ONE
              toolbar card. */}
          <PortalCard className="mb-6">
            <div>
              <div className="grid gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Find an operation</p>
                      <p className="text-xs text-slate-500">{filteredOrders.length} shown after filters</p>
                    </div>
                    {searchTerm && (
                      <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")} className="h-8 px-2 text-xs">
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search client, venue, order number, driver..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-12 w-full rounded-lg border-slate-300 bg-white pl-12 pr-4 text-[15px] shadow-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[180px_180px_repeat(4,minmax(0,1fr))]">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="preparing">Preparing</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="in_transit">On the way</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={driverFilter} onValueChange={setDriverFilter}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder="Filter by driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All drivers</SelectItem>
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
                    className="h-10 justify-center whitespace-nowrap"
                  >
                    {autoRefresh ? "Auto on" : "Auto off"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={loadTrackingData}
                    className="h-10 justify-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      if (filteredOrders.length === 0) {
                        toast({ title: "Nothing to export", description: "Adjust filters until at least one order is visible." });
                        return;
                      }
                      const esc = (v: any) => {
                        if (v == null) return "";
                        const s = String(v).replace(/"/g, '""');
                        return /[",\n]/.test(s) ? `"${s}"` : s;
                      };
                      const headers = [
                        "Order", "Client", "Status", "Delivery status",
                        "Risk tier", "Event date", "Event time",
                        "Driver", "Venue", "Total",
                      ];
                      const lines = [headers.join(",")];
                      for (const o of filteredOrders as any[]) {
                        lines.push([
                          esc(o.order_number || ""),
                          esc(o.client_name || ""),
                          esc(o.status || ""),
                          esc(o.delivery_status || ""),
                          esc(o.risk_tier || ""),
                          esc(o.event_date || ""),
                          esc(o.event_time || ""),
                          esc(o.driver_name || ""),
                          esc(o.venue || o.venue_name || ""),
                          esc(Number(o.total_amount || 0).toFixed(2)),
                        ].join(","));
                      }
                      // UTF-8 BOM so Excel-ZA opens the export as
                      // UTF-8 (same fix as calendar / financial).
                      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `tracking-${toLocalISO(new Date())}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="h-10 justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      if (filteredOrders.length === 0) {
                        toast({ title: "Nothing to print", description: "Adjust filters until at least one order is visible." });
                        return;
                      }
                      setTimeout(() => window.print(), 100);
                    }}
                    className="h-10 justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </Button>
                </div>
              </div>
            </div>
          </PortalCard>

          {/* Main Content */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "map" | "list")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="map">Map View <span className="ml-1 tabular-nums">({filteredOrders.length})</span></TabsTrigger>
              <TabsTrigger value="list">List View <span className="ml-1 tabular-nums">({filteredOrders.length})</span></TabsTrigger>
            </TabsList>

            <TabsContent id="tracking-map" data-chat-section="admin.tracking.map" data-chat-section-label="Tracking map" value="map">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Map */}
                <PortalCard className="lg:col-span-2">
                  <PortalCardHeader title={<>Live tracking map <InfoTooltip content={"Pins for every active venue and the last known position of each driver.\n\nDriver pins update as their devices report new locations."} /></>} />
                  <div>
                    <div className="h-[600px] relative">
                      {/* TIGHTEN I.27: wrap the live map in a
                          WidgetErrorBoundary so a leaflet render
                          crash or a chunk-load failure renders an
                          inline error chip + Retry instead of
                          blanking the whole 600px area silently. */}
                      <WidgetErrorBoundary label="Live tracking map">
                        <AdminTrackingMap
                          orders={filteredOrders}
                          driverLocations={driverLocations}
                          onDriverLocationUpdate={handleDriverLocationUpdate}
                          companyId={user?.company_id}
                        />
                      </WidgetErrorBoundary>
                    </div>
                  </div>
                </PortalCard>

                {/* Order Details Sidebar */}
                <PortalCard>
                  <PortalCardHeader
                    title={<>
                      <MapPin className="w-4 h-4" />
                      {selectedOrder ? "Order details" : operationsScope === "today" ? "Today's orders" : "Live orders"}
                    </>}
                  />
                  <div className="max-h-[700px] overflow-y-auto">
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
                            {operationsScope === "today"
                              ? "No active orders for today match these filters."
                              : "No active or upcoming orders match these filters."}
                          </p>
                        ) : (
                          filteredOrders.map((order) => {
                            const margin = order.margin_minutes;
                            const eta = order.eta_minutes;
                            const isSelected = selectedOrder?.id === order.id;
                            const riskTier = order.risk_tier as ("ok" | "watch" | "high" | "critical" | undefined);
                            const riskReasons: string[] = order.risk_reasons || [];
                            const arrived = order.delivery_status === "arrived";
                            const dateBadge = getOrderDateBadge(order);
                            const isToday = isTodayOrder(order);
                            const borderTone =
                              arrived          ? "border-l-brand-primary bg-brand-primary/10 hover:bg-brand-primary/10" :
                              riskTier === "critical" ? "border-l-red-600 bg-rose-50/40 hover:bg-rose-50" :
                              riskTier === "high"     ? "border-l-red-500 bg-rose-50/40 hover:bg-rose-50" :
                              riskTier === "watch"    ? "border-l-amber-500 hover:bg-amber-50/40" :
                              isToday                 ? "border-l-brand-primary border border-brand-primary/20 bg-brand-primary/5 hover:bg-brand-primary/10" :
                                                        "border-l-transparent border border-slate-200 hover:bg-slate-50";
                            return (
                              <div
                                key={order.id}
                                className={`p-3 border-l-4 rounded-md cursor-pointer transition-colors ${borderTone} ${isSelected ? "ring-2 ring-blue-300" : ""}`}
                                onClick={() => setSelectedOrder(order)}
                                title={riskReasons.length > 0 ? `Risk reasons: ${riskReasons.join(" · ")}` : undefined}
                              >
                                <div className="flex items-start justify-between mb-1.5">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="font-semibold text-sm truncate">{order.client_name}</p>
                                      <Badge className={`${dateBadge.className} border text-[9px] font-bold tracking-wide`}>
                                        {dateBadge.label}
                                      </Badge>
                                      {arrived && (
                                        <Badge className="bg-brand-primary/15 text-brand-primary border-0 text-[9px] font-bold tracking-wide">ARRIVED</Badge>
                                      )}
                                      {!arrived && (riskTier === "critical" || riskTier === "high") && (
                                        <Badge className={`border-0 text-[9px] font-bold tracking-wide ${
                                          riskTier === "critical" ? "bg-rose-200 text-rose-900" : "bg-rose-100 text-rose-800"
                                        }`}>
                                          {riskTier === "critical" ? "CRITICAL" : "AT RISK"}
                                        </Badge>
                                      )}
                                      {!arrived && riskTier === "watch" && (
                                        <Badge className="bg-amber-100 text-amber-800 border-0 text-[9px] font-bold tracking-wide">WATCH</Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-600 truncate">{order.venue_address || order.venue_name}</p>
                                  </div>
                                  <Badge className={`${getStatusColor(order.status || "")} text-[10px]`}>
                                    {order.status}
                                  </Badge>
                                </div>
                                {order.event_time && (
                                  <p className="mb-2 text-[11px] text-slate-500 tabular-nums">
                                    Event {String(order.event_time).slice(0, 5)}
                                  </p>
                                )}
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
                                        margin < 0  ? "text-rose-700"   :
                                        margin < 30 ? "text-amber-700" :
                                                      "text-brand-primary"
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
                  </div>
                </PortalCard>
              </div>
            </TabsContent>

            <TabsContent id="tracking-list" data-chat-section="admin.tracking.list" data-chat-section-label="Tracking list" value="list">
              <PortalCard>
                <div>
                  {loading ? (
                    <div className="space-y-3" aria-label="Loading orders">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
                      ))}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-10">
                      <Navigation className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                      <p className="text-slate-600 font-medium mb-1">No live orders match these filters</p>
                      <p className="text-sm text-slate-500 mb-4">
                        {statusFilter !== "all" || driverFilter !== "all" || searchTerm
                          ? "Widen the search, status or driver filter to see more."
                          : operationsScope === "today"
                            ? "Nothing is running today yet. Confirmed orders appear here on the day of the event."
                            : "No confirmed orders from today forward. New confirmed work lands here automatically."}
                      </p>
                      <div className="inline-flex flex-wrap justify-center gap-2">
                        {(statusFilter !== "all" || driverFilter !== "all" || searchTerm) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setStatusFilter("all"); setDriverFilter("all"); setSearchTerm(""); }}
                          >
                            Clear filters
                          </Button>
                        )}
                        <Link href={withSlug("/admin/orders")}>
                          <Button variant="outline" size="sm">Open the order book</Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium text-slate-800">
                          {operationsScope === "today" ? "Today's operation list" : "All live operation list"}
                        </p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {filteredOrders.length} shown after filters
                        </p>
                      </div>
                      {filteredOrders.map((order) => {
                        const dateBadge = getOrderDateBadge(order);
                        const isToday = isTodayOrder(order);
                        const riskTier = order.risk_tier as ("ok" | "watch" | "high" | "critical" | undefined);
                        const rowTone =
                          riskTier === "critical" ? "border-rose-300 bg-rose-50/40" :
                          riskTier === "high"     ? "border-rose-200 bg-rose-50/30" :
                          isToday                 ? "border-brand-primary/30 bg-brand-primary/5" :
                                                    "border-slate-200";
                        return (
                        <div key={order.id} className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${rowTone}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h3 className="font-semibold text-slate-900">{order.client_name}</h3>
                                <Badge className={`${dateBadge.className} border`}>
                                  {dateBadge.label}
                                </Badge>
                                <Badge className={getStatusColor(order.status || "")}>
                                  <span className="flex items-center gap-1">
                                    {getStatusIcon(order.status || "")}
                                    {order.status}
                                  </span>
                                </Badge>
                                {(riskTier === "critical" || riskTier === "high") && order.status !== "delivered" && (
                                  <Badge className={riskTier === "critical" ? "bg-rose-200 text-rose-900" : "bg-rose-100 text-rose-800"}>
                                    {riskTier === "critical" ? "Critical" : "At risk"}
                                  </Badge>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-600">
                                <div className="flex items-start gap-2">
                                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                  <span>{order.venue_address}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 flex-shrink-0" />
                                  <span>
                                    {order.event_date || "No date"}
                                    {order.event_time ? ` ${String(order.event_time).slice(0, 5)}` : ""}
                                    {order.delivery_time ? ` - delivery ${order.delivery_time}` : ""}
                                  </span>
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
                                        {/* LO-D (LO-15): tel: link so dispatch
                                            can tap-to-call on a tablet without
                                            copy-paste. */}
                                        <a
                                          href={`tel:${order.driver_phone}`}
                                          className="text-slate-700 hover:text-slate-900 hover:underline"
                                        >
                                          {order.driver_phone}
                                        </a>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* TIGHTEN I.4: every per-order row
                                  carries an Open brief link to the
                                  unified order doc per the ODOC
                                  pattern. The View on map button
                                  stays alongside because the live
                                  operations page is also a quick
                                  pivot to the GPS pin without
                                  leaving the page. */}
                              <Link
                                href={withSlug(staffOrderHref(order.id, "admin"))}
                                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                                title="Open the unified order brief"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open brief
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  // LO-A (LO-13): previously only set
                                  // selectedOrder, leaving the user on
                                  // the list tab. Now switches to map.
                                  setSelectedOrder(order);
                                  setActiveTab("map");
                                }}
                              >
                                View on map
                              </Button>
                            </div>
                          </div>

                          {order.last_updated && (
                            <div className="text-xs text-slate-500 mt-2">
                              Last updated: {new Date(order.last_updated).toLocaleString()}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </PortalCard>
            </TabsContent>
          </Tabs>
        </PortalShell>

        <Footer />
      </div>

      {/* LO-B: print-only run-status sheet. Hidden on screen via the
          print CSS below. One row per filtered order, grouped by status
          so the morning standup reads it from preparing -> ready ->
          in_transit. Risk badges as red bold ASCII so it scans on
          paper. */}
      <div id="print-live-ops" className="print-only">
        <h1 style={{ fontSize: "18pt", marginBottom: "6pt", fontFamily: "sans-serif" }}>
          Live ops - status sheet
        </h1>
        <p style={{ fontSize: "10pt", color: "#475569", marginBottom: "14pt", fontFamily: "sans-serif" }}>
          {new Date().toLocaleString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" - "}
          {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"} shown in {operationsScope === "today" ? "today" : "all live orders"}
          {" · "}
          {stats.atRisk} at risk
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt", fontFamily: "sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #0f172a" }}>
              <th style={{ textAlign: "left", padding: "4pt" }}>Status</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Risk</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Client</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Venue</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Event</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Driver</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Phone</th>
              <th style={{ textAlign: "right", padding: "4pt" }}>ETA</th>
              <th style={{ textAlign: "right", padding: "4pt" }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {(filteredOrders as any[]).map((o) => {
              const tier = o.risk_tier as ("ok" | "watch" | "high" | "critical" | undefined);
              const tierLabel = tier === "critical" ? "CRITICAL" : tier === "high" ? "AT RISK" : tier === "watch" ? "WATCH" : "";
              const arrived = o.delivery_status === "arrived";
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #cbd5e1", pageBreakInside: "avoid" }}>
                  <td style={{ padding: "6pt 4pt", textTransform: "uppercase", fontSize: "8.5pt", letterSpacing: "0.5pt" }}>
                    {o.status || ""}
                  </td>
                  <td style={{ padding: "6pt 4pt", color: tier === "critical" || tier === "high" ? "#dc2626" : tier === "watch" ? "#b45309" : "#64748b", fontWeight: tierLabel ? 700 : 400, fontSize: "8.5pt" }}>
                    {arrived ? "ARRIVED" : tierLabel}
                  </td>
                  <td style={{ padding: "6pt 4pt" }}><strong>{o.client_name || ""}</strong></td>
                  <td style={{ padding: "6pt 4pt" }}>{o.venue_address || o.venue_name || ""}</td>
                  <td style={{ padding: "6pt 4pt" }}>
                    {o.event_date || ""}{o.event_time ? <span style={{ color: "#64748b" }}> {o.event_time}</span> : null}
                  </td>
                  <td style={{ padding: "6pt 4pt" }}>
                    {o.driver_name || <span style={{ color: "#dc2626", fontWeight: 700 }}>UNASSIGNED</span>}
                  </td>
                  <td style={{ padding: "6pt 4pt" }}>{o.driver_phone || ""}</td>
                  <td style={{ padding: "6pt 4pt", textAlign: "right" }}>
                    {o.eta_minutes != null ? `${o.eta_minutes}m` : ""}
                  </td>
                  <td style={{ padding: "6pt 4pt", textAlign: "right", color: o.margin_minutes != null && o.margin_minutes < 0 ? "#dc2626" : "#0f172a", fontWeight: o.margin_minutes != null && o.margin_minutes < 0 ? 700 : 400 }}>
                    {o.margin_minutes != null ? (o.margin_minutes >= 0 ? `${Math.round(o.margin_minutes)}m` : `${Math.round(o.margin_minutes)}m`) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ marginTop: "18pt", fontSize: "9pt", color: "#64748b", fontFamily: "sans-serif" }}>
          Generated {new Date().toLocaleString("en-ZA")} from CateringMS Live Operations
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 12mm; size: landscape; }
          body * { visibility: hidden !important; }
          #print-live-ops, #print-live-ops * { visibility: visible !important; }
          #print-live-ops {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
          }
        }
        @media not print {
          .print-only { display: none !important; }
        }
      `}</style>

      <ChatBot userRole="admin" companyId={user?.company_id} />
    </>
  );
}

// LO-D (LO-2): ProtectedRoute wrapper for defense-in-depth. Middleware
// already gates /admin/* to admin roles - this is the second layer so
// the rule stays explicit at the component boundary and matches every
// other admin page.
export default function AdminTracking() {
  // Restructure audit (2026-07-02): OWNER added - the baseline admin
  // tier is SUPER_ADMIN / OWNER / COMPANY_ADMIN / ADMIN and this page
  // has no finance gate, so owner was missing for no reason.
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <AdminTrackingInner />
    </ProtectedRoute>
  );
}
