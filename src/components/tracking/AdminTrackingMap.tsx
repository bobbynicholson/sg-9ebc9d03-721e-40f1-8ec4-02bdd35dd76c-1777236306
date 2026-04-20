import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Clock, User } from "lucide-react";

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom marker icons
const createCustomIcon = (color: string, icon: string) => {
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
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
          ${icon}
        </svg>
      </div>
    `,
    className: "custom-marker",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const venueIcon = createCustomIcon(
  "#3b82f6",
  '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>'
);

const driverIcon = createCustomIcon(
  "#10b981",
  '<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>'
);

interface AdminTrackingMapProps {
  orders: any[];
  drivers: any[];
  center: [number, number];
  onOrderSelect: (order: any) => void;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  
  return null;
}

export default function AdminTrackingMap({
  orders,
  drivers,
  center,
  onOrderSelect,
}: AdminTrackingMapProps) {
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    const colors = {
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-yellow-100 text-yellow-800",
      ready: "bg-purple-100 text-purple-800",
      out_for_delivery: "bg-orange-100 text-orange-800",
      delivered: "bg-green-100 text-green-800",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  const getRouteColor = (status: string) => {
    const colors = {
      confirmed: "#3b82f6",
      preparing: "#eab308",
      ready: "#a855f7",
      out_for_delivery: "#f97316",
      delivered: "#10b981",
    };
    return colors[status as keyof typeof colors] || "#64748b";
  };

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
      className="rounded-lg"
    >
      <MapUpdater center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Render venue markers and routes */}
      {orders.map((order) => {
        if (!order.venue_lat || !order.venue_lng) return null;

        const venuePosition: [number, number] = [order.venue_lat, order.venue_lng];
        const driverPosition: [number, number] | null =
          order.driver_lat && order.driver_lng
            ? [order.driver_lat, order.driver_lng]
            : null;

        return (
          <div key={order.id}>
            {/* Route line from driver to venue */}
            {driverPosition && order.status === "out_for_delivery" && (
              <Polyline
                positions={[driverPosition, venuePosition]}
                color={getRouteColor(order.status)}
                weight={3}
                opacity={0.7}
                dashArray="10, 10"
              />
            )}

            {/* Venue marker */}
            <Marker
              position={venuePosition}
              icon={venueIcon}
              eventHandlers={{
                click: () => {
                  setSelectedMarkerId(order.id);
                  onOrderSelect(order);
                },
              }}
            >
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <div className="mb-2">
                    <Badge className={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                  <h3 className="font-semibold mb-2">{order.client_name}</h3>
                  <div className="space-y-1 text-sm text-slate-600">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{order.venue_address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <span>{order.delivery_time}</span>
                    </div>
                    {order.driver_name && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 flex-shrink-0" />
                        <span>{order.driver_name}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => onOrderSelect(order)}
                  >
                    View Details
                  </Button>
                </div>
              </Popup>
            </Marker>

            {/* Driver marker if active delivery */}
            {driverPosition && order.status === "out_for_delivery" && (
              <Marker
                position={driverPosition}
                icon={driverIcon}
                eventHandlers={{
                  click: () => {
                    setSelectedMarkerId(`driver-${order.id}`);
                    onOrderSelect(order);
                  },
                }}
              >
                <Popup>
                  <div className="p-2 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Navigation className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold">Driver Location</h3>
                    </div>
                    <div className="space-y-1 text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">{order.driver_name}</p>
                      <p>Delivering to: {order.client_name}</p>
                      {order.last_updated && (
                        <p className="text-xs text-slate-500">
                          Updated: {new Date(order.last_updated).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </div>
        );
      })}

      {/* Render standalone driver markers (not on delivery) */}
      {drivers
        .filter((driver) => {
          // Only show drivers not currently on an active delivery
          const isOnDelivery = orders.some(
            (order) =>
              order.driver_id === driver.id &&
              order.status === "out_for_delivery"
          );
          return !isOnDelivery && driver.current_lat && driver.current_lng;
        })
        .map((driver) => (
          <Marker
            key={`standalone-${driver.id}`}
            position={[driver.current_lat, driver.current_lng]}
            icon={driverIcon}
          >
            <Popup>
              <div className="p-2 min-w-[200px]">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold">{driver.full_name}</h3>
                </div>
                <div className="space-y-1 text-sm text-slate-600">
                  <Badge className="bg-green-100 text-green-800">Available</Badge>
                  {driver.location_updated_at && (
                    <p className="text-xs text-slate-500 mt-2">
                      Updated: {new Date(driver.location_updated_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}