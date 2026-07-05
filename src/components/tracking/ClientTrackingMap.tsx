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

interface ClientTrackingMapProps {
  orderId: string;
  driverLocation?: {
    lat: number;
    lng: number;
    driver_name: string;
    driver_phone?: string;
    last_updated: string;
  };
  // Venue coords can be null when the delivery address was never geocoded.
  // The map still runs in a driver-only mode in that case (see below), so
  // lat/lng are nullable rather than hard-required.
  venueLocation: {
    lat: number | null | undefined;
    lng: number | null | undefined;
    address: string;
  };
  orderStatus: string;
  estimatedArrival?: string;
  onLocationUpdate?: (location: { lat: number; lng: number }) => void;
  // When false, the map stops following the driver entirely: no GPS
  // subscription/polling, no driver pin, and no driver->venue route line
  // (the "distance"). Used once the trip is finished so a delivered +
  // collected order settles to just the venue pin. Defaults to true.
  trackDriver?: boolean;
}

// Custom driver icon - a clean filled car badge with a soft live "pulse"
// ring so the customer instantly reads it as the moving vehicle.
const driverIcon = new L.DivIcon({
  html: `<div style="position:relative;width:46px;height:46px;">
    <span style="position:absolute;inset:0;border-radius:50%;background:rgba(16,185,129,0.35);animation:cms-driver-pulse 1.8s ease-out infinite;"></span>
    <div style="position:absolute;inset:3px;background:#10b981;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM6.5 15.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
      </svg>
    </div>
  </div>
  <style>
    @keyframes cms-driver-pulse {
      0%   { transform: scale(0.7); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0; }
    }
  </style>`,
  className: "driver-marker-client",
  iconSize: [46, 46],
  iconAnchor: [23, 23],
});

// Custom venue icon (red pin - destination)
const venueIcon = new L.DivIcon({
  html: `<div style="background: #ef4444; border-radius: 50% 50% 50% 0; width: 40px; height: 40px; transform: rotate(-45deg); border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg style="transform: rotate(45deg);" width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    </svg>
  </div>`,
  className: "venue-marker-client",
  iconSize: [40, 50],
  iconAnchor: [20, 50],
});

// Keep BOTH the driver and the destination framed at all times. When only
// the venue is known we centre on it; once the driver pin lands we fit a
// bounding box around the two (with padding) so the customer always sees
// where the driver is AND where it's heading - and it re-fits as the driver
// moves. Replaces the old avg-centre + zoom-guess which often pushed the
// driver off-screen.
function FitBounds({
  driver,
  venue,
}: {
  driver: { lat: number; lng: number } | null;
  venue: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (driver && venue) {
      const bounds = L.latLngBounds([
        [driver.lat, driver.lng],
        [venue.lat, venue.lng],
      ]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (venue) {
      map.setView([venue.lat, venue.lng], 14);
    } else if (driver) {
      // Driver-only mode (venue not geocoded): keep the driver framed.
      map.setView([driver.lat, driver.lng], 15);
    }
  }, [driver?.lat, driver?.lng, venue?.lat, venue?.lng, map]);
  return null;
}

export function ClientTrackingMap({
  orderId,
  driverLocation,
  venueLocation,
  orderStatus,
  estimatedArrival,
  onLocationUpdate,
  trackDriver = true,
}: ClientTrackingMapProps) {
  const [liveDriverLocation, setLiveDriverLocation] = useState(driverLocation);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const [mapZoom, setMapZoom] = useState(13);
  const subscriptionRef = useRef<any>(null);
  const [driverId, setDriverId] = useState<string | null>(null);

  // Fetch driver ID for the order. Catering orders may use
  // assigned_driver_id (current dispatch flow) or driver_id (legacy),
  // so we read both and prefer the current column.
  useEffect(() => {
    const fetchDriverId = async () => {
      const { data: order } = await supabase
        .from("orders")
        .select("driver_id, assigned_driver_id")
        .eq("id", orderId)
        .maybeSingle();
      const resolved =
        (order as any)?.assigned_driver_id || (order as any)?.driver_id || null;
      if (resolved) setDriverId(resolved);
    };
    fetchDriverId();
  }, [orderId]);

  // Calculate map center to show both driver and destination
  useEffect(() => {
    if (liveDriverLocation && venueLocation.lat && venueLocation.lng) {
      const avgLat = (liveDriverLocation.lat + venueLocation.lat) / 2;
      const avgLng = (liveDriverLocation.lng + venueLocation.lng) / 2;
      setMapCenter([avgLat, avgLng]);
      
      // Calculate distance and adjust zoom
      const distance = calculateDistance(
        liveDriverLocation.lat,
        liveDriverLocation.lng,
        venueLocation.lat,
        venueLocation.lng
      );
      
      // Closer distance = higher zoom
      if (distance < 2) setMapZoom(15);
      else if (distance < 5) setMapZoom(14);
      else if (distance < 10) setMapZoom(13);
      else setMapZoom(12);
    } else if (venueLocation.lat && venueLocation.lng) {
      setMapCenter([venueLocation.lat, venueLocation.lng]);
      setMapZoom(14);
    } else if (liveDriverLocation && Number.isFinite(Number(liveDriverLocation.lat)) && Number.isFinite(Number(liveDriverLocation.lng))) {
      // Driver-only mode: no geocoded venue, but we have a live GPS fix.
      // Follow the driver so the customer still sees the vehicle moving.
      setMapCenter([Number(liveDriverLocation.lat), Number(liveDriverLocation.lng)]);
      setMapZoom(14);
    }
  }, [liveDriverLocation, venueLocation]);

  // Phase 2 #2: subscribe to the right tables. The foreground GPS
  // pinger writes to driver_locations (current state) + gps_tracking
  // (history) - it does NOT touch profiles.current_lat. The previous
  // subscription on profiles UPDATE was a no-op for live tracking;
  // the pin only moved when the legacy column happened to be set.
  //
  // New shape:
  //   - Realtime channel listens on gps_tracking INSERTs filtered to
  //     this driver, so each fresh fix lands as a pin patch.
  //   - 15s polling fallback reads driver_locations (single-row PK
  //     lookup) plus a parallel profiles read for name/phone, which
  //     gps_tracking doesn't carry.
  // Trip finished: drop the driver pin and stop following. Clears the
  // marker + route line so the map shows only the venue once everything's
  // done, and the subscription/polling effects below bail out.
  useEffect(() => {
    if (!trackDriver) setLiveDriverLocation(undefined);
  }, [trackDriver]);

  useEffect(() => {
    if (!driverId || !trackDriver) return;

    setLiveDriverLocation(driverLocation);

    const channel = supabase
      .channel(`client-tracking-${orderId}-${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gps_tracking",
          filter: `driver_id=eq.${driverId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          const lat = Number(row.latitude);
          const lng = Number(row.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          setLiveDriverLocation((prev) => ({
            lat,
            lng,
            driver_name: prev?.driver_name || driverLocation?.driver_name || "Your Driver",
            driver_phone: prev?.driver_phone || driverLocation?.driver_phone,
            last_updated: row.timestamp || new Date().toISOString(),
          }));
          onLocationUpdate?.({ lat, lng });
        },
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [orderId, driverId, driverLocation, onLocationUpdate, trackDriver]);

  // Fallback polling. Realtime drops on backgrounded mobile tabs, so
  // we still pull driver_locations every 15s to keep the pin warm.
  useEffect(() => {
    if (!driverId || !trackDriver) return;
    let active = true;

    // Pin + name in parallel; driver_locations.driver_id is the PK
    // so maybeSingle keeps the no-row case quiet.
    const pollOnce = async () => {
      const [{ data: pin }, { data: profile }] = await Promise.all([
        (supabase as any)
          .from("driver_locations")
          .select("latitude, longitude, updated_at")
          .eq("driver_id", driverId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", driverId)
          .maybeSingle(),
      ]);
      if (!active) return;
      if (pin && pin.latitude != null && pin.longitude != null) {
        const lat = Number(pin.latitude);
        const lng = Number(pin.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const newLocation = {
          lat,
          lng,
          driver_name: (profile as any)?.full_name || "Your Driver",
          driver_phone: (profile as any)?.phone,
          last_updated: pin.updated_at || new Date().toISOString(),
        };
        setLiveDriverLocation(newLocation);
        onLocationUpdate?.({ lat, lng });
      }
    };

    // Fetch the driver's pin IMMEDIATELY so the dot shows on open instead
    // of staying blank until the first 15s tick, then keep it warm.
    void pollOnce();
    const interval = setInterval(pollOnce, 15000);

    return () => { active = false; clearInterval(interval); };
  }, [driverId, onLocationUpdate, trackDriver]);

  // Coord guard. Leaflet's projection blows up on null / undefined / NaN
  // and we've seen orders without a geocoded venue reach this component.
  // The whole page crashes when one bad coord lands, so every Marker /
  // Polyline goes through this check.
  const hasCoords = (lat: any, lng: any): boolean => {
    const a = Number(lat);
    const b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0);
  };

  const venueOk = hasCoords(venueLocation?.lat, venueLocation?.lng);
  const driverOk = !!liveDriverLocation && hasCoords(liveDriverLocation.lat, liveDriverLocation.lng);

  if (mapCenter[0] === 0 && mapCenter[1] === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100 rounded-lg">
        <p className="text-slate-500">Loading map...</p>
      </div>
    );
  }

  // Nothing to plot at all - no geocoded venue AND no live driver GPS.
  // Only then show the graceful fallback rather than asking Leaflet to
  // project a null lat/lng (which crashes the page). When the venue is
  // missing but the driver's GPS is live we still render below in
  // driver-only mode so the customer sees the vehicle moving.
  if (!venueOk && !driverOk) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100 rounded-lg">
        <p className="text-slate-500 text-sm text-center px-4">
          Map unavailable - delivery address hasn't been geocoded yet.
        </p>
      </div>
    );
  }

  // Function DECLARATION (hoisted) on purpose: the map-center useEffect
  // above calls this, but the early `return`s between here and there mean
  // a `const` arrow would still be in its temporal dead zone when that
  // effect fires on the first (loading) render - crashing the whole map
  // with "Cannot access 'calculateDistance' before initialization" the
  // moment an order has BOTH a geocoded venue and a live driver (i.e. a
  // real dispatched delivery). Hoisting removes the TDZ.
  function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const getRouteColor = () => {
    switch (orderStatus) {
      case "in_transit": return "#10b981";
      case "preparing": return "#f59e0b";
      case "ready": return "#3b82f6";
      default: return "#6b7280";
    }
  };

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      style={{ height: "100%", width: "100%" }}
      className="rounded-lg"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds
        driver={driverOk && liveDriverLocation ? { lat: Number(liveDriverLocation.lat), lng: Number(liveDriverLocation.lng) } : null}
        venue={venueOk ? { lat: Number(venueLocation.lat), lng: Number(venueLocation.lng) } : null}
      />
      
      {/* Venue marker (destination) - only when the address is geocoded. */}
      {venueOk && (
        <Marker
          position={[Number(venueLocation.lat), Number(venueLocation.lng)]}
          icon={venueIcon}
        >
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-sm mb-1">📍 Your Delivery Location</h3>
              <p className="text-xs text-slate-600">{venueLocation.address}</p>
              {estimatedArrival && (
                <p className="text-xs text-brand-primary font-medium mt-2">
                  ETA: {new Date(estimatedArrival).toLocaleTimeString()}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      )}

      {/* Live driver marker - only when we have valid GPS coords. */}
      {driverOk && liveDriverLocation && (
        <Marker
          position={[Number(liveDriverLocation.lat), Number(liveDriverLocation.lng)]}
          icon={driverIcon}
        >
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-sm mb-1">🚗 {liveDriverLocation.driver_name}</h3>
              <p className="text-xs text-brand-primary font-medium mb-1">On the way with your order!</p>
              {liveDriverLocation.driver_phone && (
                <p className="text-xs text-slate-600 mb-1">
                  📞 {liveDriverLocation.driver_phone}
                </p>
              )}
              <p className="text-xs text-slate-400">
                Last updated: {new Date(liveDriverLocation.last_updated).toLocaleTimeString()}
              </p>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Route line from driver to destination - both ends must have
          valid coords or Leaflet's projection crashes the whole map.
          Skipped in driver-only mode (no geocoded venue). */}
      {driverOk && venueOk && liveDriverLocation && (
        <Polyline
          positions={[
            [Number(liveDriverLocation.lat), Number(liveDriverLocation.lng)],
            [Number(venueLocation.lat), Number(venueLocation.lng)]
          ]}
          color={getRouteColor()}
          weight={4}
          opacity={0.8}
          dashArray="10, 10"
        />
      )}
    </MapContainer>
  );
}