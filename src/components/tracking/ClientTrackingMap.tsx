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
  venueLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  orderStatus: string;
  estimatedArrival?: string;
  onLocationUpdate?: (location: { lat: number; lng: number }) => void;
}

// Custom driver icon (green car - larger for client view)
const driverIcon = new L.DivIcon({
  html: `<div style="background: #10b981; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: pulse 2s infinite;">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
      <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17v4m14-4v4M7 7V5m10 2V5M7 11h10"/>
    </svg>
  </div>
  <style>
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
  </style>`,
  className: "driver-marker-client",
  iconSize: [48, 48],
  iconAnchor: [24, 24],
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

// Map updater component to handle center changes
function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

export function ClientTrackingMap({
  orderId,
  driverLocation,
  venueLocation,
  orderStatus,
  estimatedArrival,
  onLocationUpdate,
}: ClientTrackingMapProps) {
  const [liveDriverLocation, setLiveDriverLocation] = useState(driverLocation);
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]);
  const [mapZoom, setMapZoom] = useState(13);
  const subscriptionRef = useRef<any>(null);
  const [driverId, setDriverId] = useState<string | null>(null);

  // Fetch driver ID for the order
  useEffect(() => {
    const fetchDriverId = async () => {
      const { data: order } = await supabase
        .from("orders")
        .select("driver_id")
        .eq("id", orderId)
        .single();
      
      if (order?.driver_id) {
        setDriverId(order.driver_id);
      }
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
    }
  }, [liveDriverLocation, venueLocation]);

  // Set up real-time subscription for driver location
  useEffect(() => {
    if (!driverId) return;

    setLiveDriverLocation(driverLocation);

    // Subscribe to driver location updates via Supabase Realtime
    const channel = supabase
      .channel(`client-tracking-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${driverId}`,
        },
        (payload) => {
          console.log("Driver location update:", payload);
          
          if (payload.new) {
            const updatedDriver = payload.new as any;
            
            if (updatedDriver.current_lat && updatedDriver.current_lng) {
              const newLocation = {
                lat: updatedDriver.current_lat,
                lng: updatedDriver.current_lng,
                driver_name: updatedDriver.full_name || "Your Driver",
                driver_phone: updatedDriver.phone,
                last_updated: new Date().toISOString(),
              };
              
              setLiveDriverLocation(newLocation);
              onLocationUpdate?.({ lat: updatedDriver.current_lat, lng: updatedDriver.current_lng });
            }
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [orderId, driverId, driverLocation, onLocationUpdate]);

  // Fallback: Refresh driver location every 15 seconds
  useEffect(() => {
    if (!driverId) return;

    const interval = setInterval(async () => {
      const { data: driver } = await supabase
        .from("profiles")
        .select("current_lat, current_lng, full_name, phone")
        .eq("id", driverId)
        .single();

      if (driver && driver.current_lat && driver.current_lng) {
        const newLocation = {
          lat: driver.current_lat,
          lng: driver.current_lng,
          driver_name: driver.full_name || "Your Driver",
          driver_phone: driver.phone,
          last_updated: new Date().toISOString(),
        };
        setLiveDriverLocation(newLocation);
        onLocationUpdate?.({ lat: driver.current_lat, lng: driver.current_lng });
      }
    }, 15000); // 15 seconds

    return () => clearInterval(interval);
  }, [driverId, onLocationUpdate]);

  if (mapCenter[0] === 0 && mapCenter[1] === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100 rounded-lg">
        <p className="text-slate-500">Loading map...</p>
      </div>
    );
  }

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
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
  };

  const getRouteColor = () => {
    switch (orderStatus) {
      case "out_for_delivery": return "#10b981";
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
      <MapUpdater center={mapCenter} zoom={mapZoom} />
      
      {/* Venue marker (destination) */}
      <Marker
        position={[venueLocation.lat, venueLocation.lng]}
        icon={venueIcon}
      >
        <Popup>
          <div className="p-2">
            <h3 className="font-semibold text-sm mb-1">📍 Your Delivery Location</h3>
            <p className="text-xs text-slate-600">{venueLocation.address}</p>
            {estimatedArrival && (
              <p className="text-xs text-emerald-600 font-medium mt-2">
                ETA: {new Date(estimatedArrival).toLocaleTimeString()}
              </p>
            )}
          </div>
        </Popup>
      </Marker>

      {/* Live driver marker */}
      {liveDriverLocation && (
        <Marker
          position={[liveDriverLocation.lat, liveDriverLocation.lng]}
          icon={driverIcon}
        >
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-sm mb-1">🚗 {liveDriverLocation.driver_name}</h3>
              <p className="text-xs text-emerald-600 font-medium mb-1">On the way with your order!</p>
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

      {/* Route line from driver to destination */}
      {liveDriverLocation && (
        <Polyline
          positions={[
            [liveDriverLocation.lat, liveDriverLocation.lng],
            [venueLocation.lat, venueLocation.lng]
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