import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Truck, Clock, Phone, Mail, Navigation } from "lucide-react";
import { Order, Driver, GPSLocation } from "@/types";
import Link from "next/link";
import { Footer } from "@/components/Footer";

export default function AdminTrackingDashboard() {
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadActiveDeliveries();
    const interval = setInterval(() => {
      loadActiveDeliveries();
      setRefreshKey((prev) => prev + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadActiveDeliveries = () => {
    const orders: Order[] = JSON.parse(localStorage.getItem("orders") || "[]");
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

  const calculateETA = (location: GPSLocation | undefined, destination: string): string => {
    if (!location) return "Unknown";
    const randomMinutes = Math.floor(Math.random() * 20) + 10;
    return `${randomMinutes} mins`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Admin Tracking Dashboard
          </h1>
          <p className="text-slate-600">
            Monitor all active deliveries in real-time
          </p>
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
                          {calculateETA(delivery.location, delivery.order.venue)}
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
