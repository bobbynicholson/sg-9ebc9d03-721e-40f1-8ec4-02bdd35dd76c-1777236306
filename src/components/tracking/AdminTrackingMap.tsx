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

export function AdminTrackingMap({ orders, driverLocations, onDriverLocationUpdate }: AdminTrackingMapProps) {
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

  // Set up real-time subscription for driver locations
  useEffect(() => {
    setLiveDriverLocations(driverLocations);

    // Subscribe to driver location updates via Supabase Realtime
    const channel = supabase
      .channel("driver-locations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: "role=eq.driver",
        },
        (payload) => {
          console.log("Driver location update:", payload);
          
          if (payload.eventType === "UPDATE" && payload.new) {
            const updatedDriver = payload.new as any;
            
            // Only update if driver has valid coordinates
            if (updatedDriver.current_lat && updatedDriver.current_lng) {
              setLiveDriverLocations((prev) => {
                const existing = prev.findIndex((d) => d.id === updatedDriver.id);
                const newDriver: DriverLocation = {
                  id: updatedDriver.id,
                  driver_name: updatedDriver.full_name || "Unknown Driver",
                  current_lat: updatedDriver.current_lat,
                  current_lng: updatedDriver.current_lng,
                  last_updated: new Date().toISOString(),
                  status: updatedDriver.status || "active",
                  available: updatedDriver.available ?? true,
                };

                if (existing !== -1) {
                  const updated = [...prev];
                  updated[existing] = newDriver;
                  onDriverLocationUpdate?.(updated);
                  return updated;
                } else {
                  const updated = [...prev, newDriver];
                  onDriverLocationUpdate?.(updated);
                  return updated;
                }
              });
            }
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    // Cleanup subscription on unmount
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [driverLocations, onDriverLocationUpdate]);

  // Fallback: Refresh driver locations every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: drivers } = await supabase
        .from("profiles")
        .select("id, full_name, current_lat, current_lng, status, available")
        .eq("role", "driver")
        .not("current_lat", "is", null)
        .not("current_lng", "is", null);

      if (drivers) {
        const locations: DriverLocation[] = drivers.map((d: any) => ({
          id: d.id,
          driver_name: d.full_name || "Unknown Driver",
          current_lat: d.current_lat,
          current_lng: d.current_lng,
          last_updated: new Date().toISOString(),
          status: d.status || "active",
          available: d.available ?? true,
        }));
        setLiveDriverLocations(locations);
        onDriverLocationUpdate?.(locations);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [onDriverLocationUpdate]);

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
      
      {/* Venue markers (orders) */}
      {orders.map((order) => (
        <Marker
          key={order.id}
          position={[order.venue_lat, order.venue_lng]}
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

      {/* Live driver markers with real-time updates */}
      {liveDriverLocations.map((driver) => (
        <Marker
          key={driver.id}
          position={[driver.current_lat, driver.current_lng]}
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
                📍 {driver.current_lat.toFixed(4)}, {driver.current_lng.toFixed(4)}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Draw routes from drivers to their active deliveries */}
      {orders
        .filter(o => o.driver_id && o.status === "out_for_delivery")
        .map(order => {
          const driver = liveDriverLocations.find(d => d.id === order.driver_id);
          if (!driver) return null;
          
          return (
            <Polyline
              key={`route-${order.id}`}
              positions={[
                [driver.current_lat, driver.current_lng],
                [order.venue_lat, order.venue_lng]
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