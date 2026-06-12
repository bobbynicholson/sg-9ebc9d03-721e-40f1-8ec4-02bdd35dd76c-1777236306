import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface DriverLocation {
  id: string;
  driver_name: string;
  current_lat: number;
  current_lng: number;
  last_updated: string;
  status: string;
  available: boolean;
}

interface Order {
  id: string;
  client_name: string;
  venue_address: string;
  venue_lat: number;
  venue_lng: number;
  status: string;
  driver_id?: string;
  driver_name?: string;
}

interface AdminTrackingMapProps {
  orders: Order[];
  driverLocations: DriverLocation[];
  onDriverLocationUpdate?: (locations: DriverLocation[]) => void;
  companyId?: string;
}

// Custom driver icon (green car)
const driverIcon = new L.DivIcon({
  html: `<div style="background: #10b981; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
      <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17v4m14-4v4M7 7V5m10 2V5M7 11h10"/>
    </svg>
  </div>`,
  className: "driver-marker",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Custom venue icon (blue pin)
const venueIcon = new L.DivIcon({
  html: `<div style="background: #3b82f6; border-radius: 50% 50% 50% 0; width: 30px; height: 30px; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg style="transform: rotate(45deg);" width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    </svg>
  </div>`,
  className: "venue-marker",
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

// Wave 70.63: MapUpdater now fits to bounds ONCE on mount instead
// of re-panning + re-zooming on every center change. Pre-fix every
// driver ping triggered setMapCenter via the average-of-points
// effect below, which triggered MapUpdater's setView, which yanked
// the user's map back to a recomputed centre mid-pan. With dozens
// of pins ticking the page felt unusable.
//
// New behaviour:
//   - Fit to the bounding box of all venue + driver points on the
//     first paint that has at least one valid coord.
//   - On subsequent renders, leave the user's map alone - they can
//     pan / zoom freely and the pins move under them.
//   - A "Recentre" button in the toolbar (rendered by the parent)
//     can call back into this via the `recentreSignal` prop to
//     manually re-fit. Not added yet; signal hook exposed for later.
function MapUpdater({
  points,
  recentreSignal,
}: {
  points: Array<{ lat: number; lng: number }>;
  recentreSignal: number;
}) {
  const map = useMap();
  const didInitialFitRef = useRef(false);
  const lastSignalRef = useRef(0);
  useEffect(() => {
    const valid = points.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0),
    );
    if (valid.length === 0) return;
    const wantsFit = !didInitialFitRef.current || recentreSignal !== lastSignalRef.current;
    if (!wantsFit) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 13);
    } else {
      const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
    didInitialFitRef.current = true;
    lastSignalRef.current = recentreSignal;
  }, [points, recentreSignal, map]);
  return null;
}

// Leaflet measures its container size once on init. When the map
// mounts inside a tab / card that lays out a tick later (or was
// briefly hidden), that first measurement is wrong and the tiles
// render grey / half-drawn until something forces a recompute. Call
// invalidateSize after mount (and on window resize) so the map always
// fills its 600px slot cleanly.
function InvalidateSizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t1 = setTimeout(fix, 150);
    const t2 = setTimeout(fix, 600);
    window.addEventListener("resize", fix);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}

export function AdminTrackingMap({ orders, driverLocations, onDriverLocationUpdate, companyId }: AdminTrackingMapProps) {
  const [liveDriverLocations, setLiveDriverLocations] = useState<DriverLocation[]>(driverLocations);
  // Wave 70.63: initial map center retained for the MapContainer
  // mount (Leaflet needs an initial value), but the actual bounds
  // fit is driven by MapUpdater consuming points + recentreSignal.
  // setMapCenter no longer fires on every driver ping - the
  // average-of-points effect was driving the auto-pan jank.
  const [mapCenter] = useState<[number, number]>([-29.8587, 31.0218]); // ZA-ish fallback
  const subscriptionRef = useRef<any>(null);
  // Bumped to trigger a re-fit. Wired to the "Recentre" button later.
  const recentreSignal = 0;
  // Build the points the fit-to-bounds effect needs. Cheap recompute
  // because the parent re-renders on every realtime patch anyway.
  const mapPoints = [
    ...orders.map((o) => ({ lat: Number(o.venue_lat), lng: Number(o.venue_lng) })),
    ...liveDriverLocations.map((d) => ({ lat: Number(d.current_lat), lng: Number(d.current_lng) })),
  ];

  // Phase 2 #1: read pins from driver_locations + gps_tracking, not
  // the legacy profiles.current_lat / current_lng columns. The
  // foreground GPS pinger (useDriverGPSPing) writes to:
  //   - driver_locations: current state, single row per driver, the
  //     right source for the initial load + polling fallback.
  //   - gps_tracking:     append-only history, drives the realtime
  //     INSERT subscription so the pin animates as new fixes land.
  // The old code subscribed to profiles UPDATE events that the
  // pinger never fires, so the map was effectively static.
  //
  // Pull driver names alongside the location so the popup has a
  // human-readable label without a second query per marker.
  useEffect(() => {
    setLiveDriverLocations(driverLocations);

    let cancelled = false;

    async function pullInitial() {
      if (!companyId) return;
      // Step A: current state from driver_locations, scoped to tenant.
      // RLS already gates the read so company_id filter is belt-and-
      // braces against any future relax.
      const { data: locations } = await (supabase as any)
        .from("driver_locations")
        .select("driver_id, latitude, longitude, updated_at")
        .eq("company_id", companyId);
      if (cancelled || !locations) return;

      // Step B: hydrate names. Single IN-query is cheaper than N
      // round-trips and the driver list is small.
      const driverIds = locations.map((l: any) => l.driver_id).filter(Boolean);
      const nameMap: Record<string, { full_name?: string }> = {};
      if (driverIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", driverIds);
        for (const p of profiles || []) {
          nameMap[(p as any).id] = { full_name: (p as any).full_name };
        }
      }

      const hydrated: DriverLocation[] = locations
        .filter((l: any) => l.latitude != null && l.longitude != null)
        .map((l: any) => ({
          id: l.driver_id,
          driver_name: nameMap[l.driver_id]?.full_name || "Driver",
          current_lat: Number(l.latitude),
          current_lng: Number(l.longitude),
          last_updated: l.updated_at || new Date().toISOString(),
          status: "active",
          available: true,
        }));
      if (cancelled) return;
      setLiveDriverLocations(hydrated);
      onDriverLocationUpdate?.(hydrated);
    }

    pullInitial();

    // Realtime: every new gps_tracking INSERT is a fresh fix for some
    // driver. Patch (or insert) the matching row in liveDriverLocations
    // so the pin moves without re-running pullInitial.
    const channel = supabase
      .channel(`driver-locations-${companyId || "global"}`)
      .on(
        "postgres_changes",
        // Wave 70.62: gps_tracking now carries company_id (migration
        // 20260523080000) populated by a BEFORE INSERT trigger, so
        // the binding can finally filter server-side. The previous
        // handler-side defence (drop unknown driver_id when companyId
        // set) stays as belt-and-braces in case a row predates the
        // backfill.
        companyId
          ? { event: "INSERT", schema: "public", table: "gps_tracking", filter: `company_id=eq.${companyId}` }
          : { event: "INSERT", schema: "public", table: "gps_tracking" },
        (payload: any) => {
          const row = payload?.new;
          if (!row?.driver_id) return;
          const lat = Number(row.latitude);
          const lng = Number(row.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          setLiveDriverLocations((prev) => {
            // Belt-and-braces: even with the server-side filter
            // above, drop a payload that doesn't match a known
            // driver we already pulled for this tenant. A legacy
            // gps_tracking row with company_id=NULL would skip the
            // filter but we still want to ignore it here.
            const existing = prev.findIndex((d) => d.id === row.driver_id);
            if (existing === -1 && companyId) return prev;

            const patched: DriverLocation = {
              id: row.driver_id,
              driver_name:
                existing !== -1 ? prev[existing].driver_name : "Driver",
              current_lat: lat,
              current_lng: lng,
              last_updated: row.timestamp || new Date().toISOString(),
              status: existing !== -1 ? prev[existing].status : "active",
              available: existing !== -1 ? prev[existing].available : true,
            };
            const next =
              existing !== -1
                ? prev.map((d, i) => (i === existing ? patched : d))
                : [...prev, patched];
            onDriverLocationUpdate?.(next);
            return next;
          });
        },
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocations, onDriverLocationUpdate, companyId]);

  // Fallback polling. The realtime subscription drops on long-running
  // tabs (browser throttling, network blips) and the operator should
  // still see fresh pins. Polls driver_locations every 30s.
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(async () => {
      const { data: locations } = await (supabase as any)
        .from("driver_locations")
        .select("driver_id, latitude, longitude, updated_at")
        .eq("company_id", companyId);
      if (!locations) return;
      const driverIds = locations.map((l: any) => l.driver_id).filter(Boolean);
      const nameMap: Record<string, string> = {};
      if (driverIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", driverIds);
        for (const p of profiles || []) {
          nameMap[(p as any).id] = (p as any).full_name;
        }
      }
      const hydrated: DriverLocation[] = locations
        .filter((l: any) => l.latitude != null && l.longitude != null)
        .map((l: any) => ({
          id: l.driver_id,
          driver_name: nameMap[l.driver_id] || "Driver",
          current_lat: Number(l.latitude),
          current_lng: Number(l.longitude),
          last_updated: l.updated_at || new Date().toISOString(),
          status: "active",
          available: true,
        }));
      setLiveDriverLocations(hydrated);
      onDriverLocationUpdate?.(hydrated);
    }, 30000);

    return () => clearInterval(interval);
  }, [onDriverLocationUpdate, companyId]);

  // Wave 70.63: empty-state gate now checks the actual points list
  // rather than the (0,0) sentinel. (0,0) used to be both "no data"
  // and "geocoded to Gulf of Guinea" - conflated until now.
  const hasMappable =
    orders.some((o) => Number.isFinite(Number(o.venue_lat)) && Number.isFinite(Number(o.venue_lng)) && !(Number(o.venue_lat) === 0 && Number(o.venue_lng) === 0))
    || liveDriverLocations.some((d) => Number.isFinite(d.current_lat) && Number.isFinite(d.current_lng) && !(d.current_lat === 0 && d.current_lng === 0));
  // Empty state (2026-06-13): previously this replaced the whole map
  // with a grey box, so the operator never saw that the map itself
  // works - it just looked broken. Now render the base map regardless
  // (centred on the ZA fallback) with a small overlay note, so the
  // map is always visible and only the PINS are missing when there's
  // no geocoded venue / live driver yet.

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "#3b82f6";
      case "preparing": return "#f59e0b";
      case "ready": return "#10b981";
      case "in_transit": return "#8b5cf6";
      case "delivered": return "#6b7280";
      default: return "#3b82f6";
    }
  };

  const getStatusBadge = (available: boolean, status: string) => {
    if (!available) return "🔴 Unavailable";
    if (status === "busy") return "🟡 Busy";
    return "🟢 Available";
  };

  // Coord guard. Leaflet's projection blows up on null / undefined / NaN
  // and we've seen orders without geocoded venues + drivers without GPS
  // pings reach the marker render. The whole page crashes when one bad
  // coord lands, so every marker / polyline goes through this check.
  const hasCoords = (lat: any, lng: any): boolean => {
    const a = Number(lat);
    const b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0);
  };

  const mappableOrders = orders.filter(o => hasCoords(o.venue_lat, o.venue_lng));
  const mappableDrivers = liveDriverLocations.filter(d => hasCoords(d.current_lat, d.current_lng));

  return (
    <div className="relative h-full w-full">
      {!hasMappable && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-md border border-slate-200">
            No live driver or geocoded venue yet — pins appear here once a driver shares GPS or an order's venue is geocoded.
          </span>
        </div>
      )}
    <MapContainer
      center={mapCenter}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <InvalidateSizeFix />
      <MapUpdater points={mapPoints} recentreSignal={recentreSignal} />

      {/* Venue markers (orders) - only ones with valid coords. Orders
          without a geocoded venue will appear in the side list but not
          on the map. */}
      {mappableOrders.map((order) => (
        <Marker
          key={order.id}
          position={[Number(order.venue_lat), Number(order.venue_lng)]}
          icon={venueIcon}
        >
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-sm mb-1">{order.client_name}</h3>
              <p className="text-xs text-slate-600 mb-1">{order.venue_address}</p>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: getStatusColor(order.status) }}
                >
                  {order.status}
                </span>
                {order.driver_name && (
                  <span className="text-xs text-slate-500">
                    Driver: {order.driver_name}
                  </span>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Live driver markers - only ones with valid GPS coords. */}
      {mappableDrivers.map((driver) => (
        <Marker
          key={driver.id}
          position={[Number(driver.current_lat), Number(driver.current_lng)]}
          icon={driverIcon}
        >
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-sm mb-1">🚗 {driver.driver_name}</h3>
              <p className="text-xs mb-1">{getStatusBadge(driver.available, driver.status)}</p>
              <p className="text-xs text-slate-500">
                Last updated: {new Date(driver.last_updated).toLocaleTimeString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                📍 {Number(driver.current_lat).toFixed(4)}, {Number(driver.current_lng).toFixed(4)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Routes from drivers to active deliveries. Both ends must have
          valid coords or Leaflet's projection crashes the whole map. */}
      {mappableOrders
        .filter(o => o.driver_id && o.status === "in_transit")
        .map(order => {
          const driver = mappableDrivers.find(d => d.id === order.driver_id);
          if (!driver) return null;

          return (
            <Polyline
              key={`route-${order.id}`}
              positions={[
                [Number(driver.current_lat), Number(driver.current_lng)],
                [Number(order.venue_lat), Number(order.venue_lng)]
              ]}
              color={getStatusColor(order.status)}
              weight={3}
              opacity={0.7}
              dashArray="10, 10"
            />
          );
        })}
    </MapContainer>
    </div>
  );
}