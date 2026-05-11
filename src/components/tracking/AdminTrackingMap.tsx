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

// Map updater component to handle center changes
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.setView(center, 12);
    }
  }, [center, map]);
  return null;
}

export function AdminTrackingMap({ orders, driverLocations, onDriverLocationUpdate, companyId }: AdminTrackingMapProps) {
  const [liveDriverLocations, setLiveDriverLocations] = useState<DriverLocation[]>(driverLocations);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const subscriptionRef = useRef<any>(null);

  // Calculate map center
  useEffect(() => {
    const allLocations = [
      ...orders.map(o => ({ lat: o.venue_lat, lng: o.venue_lng })),
      ...liveDriverLocations.map(d => ({ lat: d.current_lat, lng: d.current_lng }))
    ].filter(loc => loc.lat && loc.lng);

    if (allLocations.length > 0) {
      const avgLat = allLocations.reduce((sum, loc) => sum + loc.lat, 0) / allLocations.length;
      const avgLng = allLocations.reduce((sum, loc) => sum + loc.lng, 0) / allLocations.length;
      setMapCenter([avgLat, avgLng]);
    }
  }, [orders, liveDriverLocations]);

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
      let nameMap: Record<string, { full_name?: string }> = {};
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
        { event: "INSERT", schema: "public", table: "gps_tracking" },
        (payload: any) => {
          const row = payload?.new;
          if (!row?.driver_id) return;
          const lat = Number(row.latitude);
          const lng = Number(row.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          setLiveDriverLocations((prev) => {
            // Tenant scope. We don't get company_id on gps_tracking
            // rows, so we accept the update only if we already know
            // this driver (i.e. they appeared in pullInitial for this
            // tenant). Drivers from other tenants are silently ignored.
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
      let nameMap: Record<string, string> = {};
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

  if (mapCenter[0] === 0 && mapCenter[1] === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100 rounded-lg">
        <p className="text-slate-500">No locations available to display</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "#3b82f6";
      case "preparing": return "#f59e0b";
      case "ready": return "#10b981";
      case "out_for_delivery": return "#8b5cf6";
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
      <MapUpdater center={mapCenter} />

      {/* Venue markers (orders) -- only ones with valid coords. Orders
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

      {/* Live driver markers -- only ones with valid GPS coords. */}
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
        .filter(o => o.driver_id && o.status === "out_for_delivery")
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
  );
}