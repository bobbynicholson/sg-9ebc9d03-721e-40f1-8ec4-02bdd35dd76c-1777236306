import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Truck, Clock, Phone, Mail, Navigation, Map } from "lucide-react";
import { AppOrder, Driver, GPSLocation } from "@/types";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function AdminTrackingDashboard() {
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDelivery, setSelectedDelivery] = useState<any | null>(null);
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    loadActiveDeliveries();
    const interval = setInterval(() => {
      loadActiveDeliveries();
      setRefreshKey((prev) => prev + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadActiveDeliveries = () => {
    const orders: AppOrder[] = JSON.parse(localStorage.getItem("orders") || "[]");
    const drivers: Driver[] = JSON.parse(localStorage.getItem("drivers") || "[]");
    const locations: Record<string, GPSLocation> = JSON.parse(
      localStorage.getItem("driver_locations") || "{}"
    );

    const active = orders
      .filter((order) => order.status === "in_progress" && order.assignedDriver)
      .map((order) => {
        const driver = drivers.find((d) => d.id === order.assignedDriver);
        const location = locations[order.assignedDriver || ""];
        return {
          order,
          driver,
          location,
          trackingStatus: getTrackingStatus(order.id),
        };
      });

    setActiveDeliveries(active);
  };

  const getTrackingStatus = (orderId: string): string => {
    const statuses = JSON.parse(localStorage.getItem("delivery_statuses") || "{}");
    return statuses[orderId] || "pending";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "driver_logged_in":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "food_collected":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "en_route":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "driver_arrived":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "delivered":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "driver_logged_in":
        return "Driver Logged In";
      case "food_collected":
        return "Food Collected";
      case "en_route":
        return "En Route";
      case "driver_arrived":
        return "Driver Arrived";
      case "delivered":
        return "Delivered";
      default:
        return "Pending";
    }
  };

  const calculateETA = (location: GPSLocation | undefined): string => {
    if (!location) return "Unknown";
    const randomMinutes = Math.floor(Math.random() * 20) + 10;
    return `${randomMinutes} mins`;
  };

  const getDriverMarkerColor = (status: string) => {
    switch (status) {
      case "food_collected":
      case "en_route":
        return "#8b5cf6";
      case "driver_arrived":
        return "#f59e0b";
      case "delivered":
        return "#10b981";
      default:
        return "#3b82f6";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-8">
      <NoIndexMeta />
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">
                Admin Tracking Dashboard
              </h1>
              <p className="text-slate-600">
                Monitor all active deliveries in real-time with live GPS tracking
              </p>
            </div>
            <Button
              onClick={() => setShowMap(!showMap)}
              variant={showMap ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <Map className="w-4 h-4" />
              {showMap ? "Hide Map" : "Show Map"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm mb-1">Active Deliveries</p>
                  <p className="text-3xl font-bold text-white">
                    {activeDeliveries.length}
                  </p>
                </div>
                <Truck className="w-12 h-12 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm mb-1">En Route</p>
                  <p className="text-3xl font-bold text-white">
                    {activeDeliveries.filter((d) => d.trackingStatus === "en_route").length}
                  </p>
                </div>
                <Navigation className="w-12 h-12 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-orange-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm mb-1">Arrived</p>
                  <p className="text-3xl font-bold text-white">
                    {activeDeliveries.filter((d) => d.trackingStatus === "driver_arrived").length}
                  </p>
                </div>
                <MapPin className="w-12 h-12 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {showMap && activeDeliveries.length > 0 && (
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Live Driver Locations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-[500px] bg-slate-100 rounded-lg overflow-hidden">
                <div className="absolute inset-0">
                  <svg className="w-full h-full" viewBox="0 0 800 500">
                    <rect width="800" height="500" fill="#f8fafc" />
                    
                    <g opacity="0.2">
                      {[...Array(20)].map((_, i) => (
                        <line
                          key={`h-${i}`}
                          x1="0"
                          y1={i * 25}
                          x2="800"
                          y2={i * 25}
                          stroke="#cbd5e1"
                          strokeWidth="1"
                        />
                      ))}
                      {[...Array(32)].map((_, i) => (
                        <line
                          key={`v-${i}`}
                          x1={i * 25}
                          y1="0"
                          x2={i * 25}
                          y2="500"
                          stroke="#cbd5e1"
                          strokeWidth="1"
                        />
                      ))}
                    </g>

                    <text x="20" y="30" fontSize="12" fill="#64748b" fontWeight="600">
                      Cape Town Area - Real-Time Driver Tracking
                    </text>

                    {activeDeliveries.map((delivery, index) => {
                      if (!delivery.location) return null;
                      
                      const x = 100 + index * 200 + Math.random() * 50;
                      const y = 100 + index * 80 + Math.random() * 50;
                      const color = getDriverMarkerColor(delivery.trackingStatus);
                      
                      return (
                        <g
                          key={delivery.order.id}
                          className="cursor-pointer transition-all hover:opacity-80"
                          onClick={() => setSelectedDelivery(delivery)}
                        >
                          <circle
                            cx={x}
                            cy={y}
                            r="20"
                            fill={color}
                            opacity="0.2"
                          />
                          <circle
                            cx={x}
                            cy={y}
                            r="10"
                            fill={color}
                            stroke="white"
                            strokeWidth="2"
                          />
                          <path
                            d={`M ${x - 6} ${y - 2} L ${x + 6} ${y - 2} L ${x + 6} ${y + 4} L ${x} ${y + 8} L ${x - 6} ${y + 4} Z`}
                            fill="white"
                            opacity="0.9"
                          />
                          
                          <text
                            x={x}
                            y={y + 35}
                            fontSize="11"
                            fill="#1e293b"
                            fontWeight="600"
                            textAnchor="middle"
                          >
                            {delivery.driver?.name.split(" ")[0]}
                          </text>
                          
                          <circle
                            cx={x}
                            cy={y}
                            r="30"
                            fill="none"
                            stroke={color}
                            strokeWidth="2"
                            opacity="0.3"
                            className="animate-ping"
                            style={{
                              animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"
                            }}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-900 mb-2">Status Legend</div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <span className="text-xs text-slate-700">En Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <span className="text-xs text-slate-700">Arrived</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-xs text-slate-700">Delivered</span>
                  </div>
                </div>

                {selectedDelivery && (
                  <div className="absolute bottom-4 left-4 right-4 bg-white rounded-lg shadow-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {selectedDelivery.driver?.name}
                        </h4>
                        <p className="text-sm text-slate-600">
                          Order #{selectedDelivery.order.id.slice(0, 8)}
                        </p>
                      </div>
                      <Badge className={`${getStatusColor(selectedDelivery.trackingStatus)} border text-xs`}>
                        {getStatusLabel(selectedDelivery.trackingStatus)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Client</p>
                        <p className="font-medium text-slate-900">{selectedDelivery.order.clientName}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">ETA</p>
                        <p className="font-medium text-slate-900">{calculateETA(selectedDelivery.location)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-500">Destination</p>
                        <p className="font-medium text-slate-900">{selectedDelivery.order.venue}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => window.open(`tel:${selectedDelivery.driver?.phone}`)}
                      >
                        <Phone className="w-3 h-3 mr-1" />
                        Call Driver
                      </Button>
                      <Link href={`/tracking/client?orderId=${selectedDelivery.order.id}`} className="flex-1">
                        <Button size="sm" className="w-full">
                          <MapPin className="w-3 h-3 mr-1" />
                          Full Tracking
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activeDeliveries.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-12 text-center">
              <Truck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                No Active Deliveries
              </h3>
              <p className="text-slate-600">
                All deliveries are currently completed or pending assignment
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Active Deliveries</h2>
            {activeDeliveries.map((delivery) => (
              <Card key={delivery.order.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg mb-2">
                        Order #{delivery.order.id.slice(0, 8)}
                      </CardTitle>
                      <Badge className={`${getStatusColor(delivery.trackingStatus)} border`}>
                        {getStatusLabel(delivery.trackingStatus)}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/tracking/client?orderId=${delivery.order.id}`}>
                        <Button size="sm" variant="outline">
                          <MapPin className="w-4 h-4 mr-1" />
                          View Map
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-3">Driver Information</h4>
                      {delivery.driver ? (
                        <div className="space-y-2">
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Name:</span> {delivery.driver.name}
                          </p>
                          <p className="text-sm text-slate-700 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {delivery.driver.phone}
                          </p>
                          <p className="text-sm text-slate-700 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {delivery.driver.email}
                          </p>
                          {delivery.location && (
                            <p className="text-sm text-slate-700">
                              <span className="font-medium">Location:</span>{" "}
                              {delivery.location.latitude.toFixed(4)},{" "}
                              {delivery.location.longitude.toFixed(4)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">No driver assigned</p>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-900 mb-3">Delivery Details</h4>
                      <div className="space-y-2">
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">Client:</span> {delivery.order.clientName}
                        </p>
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">Venue:</span> {delivery.order.venue}
                        </p>
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">Event Date:</span>{" "}
                          {new Date(delivery.order.eventDate).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-slate-700 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span className="font-medium">ETA:</span>{" "}
                          {calculateETA(delivery.location)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      <Footer />
    </div>
  );
}
