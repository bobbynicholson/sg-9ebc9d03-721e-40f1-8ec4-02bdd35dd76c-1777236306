import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock } from "lucide-react";

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom numbered markers for route sequence
const createNumberedIcon = (number: number, color: string) => {
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-weight: bold;
        font-size: 14px;
        color: white;
      ">
        ${number}
      </div>
    `,
    className: "numbered-marker",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

function MapUpdater({ route }: { route: any }) {
  const map = useMap();

  useEffect(() => {
    if (route && route.stops.length > 0) {
      const bounds = L.latLngBounds(
        route.stops.map((stop: any) => [stop.venue_lat, stop.venue_lng])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [route, map]);

  return null;
}

interface RouteOptimizationMapProps {
  route: {
    stops: any[];
    total_distance: number;
    total_duration: number;
  };
}

export default function RouteOptimizationMap({ route }: RouteOptimizationMapProps) {
  if (!route || route.stops.length === 0) {
    return null;
  }

  // Create route line coordinates
  const routeCoordinates = route.stops.map((stop) => [
    stop.venue_lat,
    stop.venue_lng,
  ]) as [number, number][];

  // Calculate color based on priority
  const getMarkerColor = (priority: number) => {
    if (priority === 1) return "#ef4444"; // High priority - red
    if (priority === 3) return "#64748b"; // Low priority - gray
    return "#3b82f6"; // Normal priority - blue
  };

  return (
    <MapContainer
      center={[route.stops[0].venue_lat, route.stops[0].venue_lng]}
      zoom={13}
      style={{ height: "100%", width: "100%", borderRadius: "8px" }}
    >
      <MapUpdater route={route} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Route line */}
      <Polyline
        positions={routeCoordinates}
        color="#3b82f6"
        weight={4}
        opacity={0.7}
        dashArray="10, 10"
      />

      {/* Stop markers */}
      {route.stops.map((stop, index) => (
        <Marker
          key={stop.id}
          position={[stop.venue_lat, stop.venue_lng]}
          icon={createNumberedIcon(index + 1, getMarkerColor(stop.priority))}
        >
          <Popup>
            <div className="p-2 min-w-[200px]">
              <div className="mb-2">
                <Badge className={
                  stop.priority === 1 ? "bg-red-100 text-red-800" :
                  stop.priority === 3 ? "bg-gray-100 text-gray-800" :
                  "bg-blue-100 text-blue-800"
                }>
                  Stop #{index + 1}
                </Badge>
              </div>
              <h3 className="font-semibold mb-2">{stop.client_name}</h3>
              <div className="space-y-1 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{stop.venue_address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>{new Date(stop.delivery_time).toLocaleString()}</span>
                </div>
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs text-slate-500">
                    Priority: {stop.priority === 1 ? "High" : stop.priority === 3 ? "Low" : "Normal"}
                  </p>
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Start marker */}
      {route.stops.length > 0 && (
        <Marker
          position={[route.stops[0].venue_lat, route.stops[0].venue_lng]}
          icon={L.divIcon({
            html: `
              <div style="
                background-color: #10b981;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
            `,
            className: "start-marker",
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          })}
        >
          <Popup>
            <div className="p-2">
              <h3 className="font-semibold text-green-700 mb-1">Route Start</h3>
              <p className="text-sm text-slate-600">First delivery point</p>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}