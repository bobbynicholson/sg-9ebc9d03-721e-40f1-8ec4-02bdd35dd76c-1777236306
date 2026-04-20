import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Truck, Clock, CheckCircle, Package, Navigation, AlertCircle } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

interface DeliveryTracking {
  id: string;
  orderId: string;
  orderName: string;
  driverName: string;
  vehicleNumber: string;
  status: "pending" | "in_transit" | "arrived" | "completed";
  currentLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  destination: {
    lat: number;
    lng: number;
    address: string;
  };
  estimatedArrival: string;
  distance: number; // km
  lastUpdated: string;
}

export default function AdminTracking() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryTracking[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data - replace with real API call
    const mockDeliveries: DeliveryTracking[] = [
      {
        id: "del-001",
        orderId: "ORD-001",
        orderName: "Sarah Johnson Event",
        driverName: "John Smith",
        vehicleNumber: "ABC-123-GP",
        status: "in_transit",
        currentLocation: {
          lat: -26.1076,
          lng: 28.0567,
          address: "Sandton, Johannesburg"
        },
        destination: {
          lat: -26.2041,
          lng: 28.0473,
          address: "123 Event Venue Rd, Johannesburg"
        },
        estimatedArrival: new Date(Date.now() + 1800000).toISOString(),
        distance: 12.5,
        lastUpdated: new Date().toISOString()
      },
      {
        id: "del-002",
        orderId: "ORD-002",
        orderName: "Corporate Event",
        driverName: "Jane Doe",
        vehicleNumber: "XYZ-456-GP",
        status: "arrived",
        currentLocation: {
          lat: -26.1100,
          lng: 28.0600,
          address: "456 Corporate Blvd, Sandton"
        },
        destination: {
          lat: -26.1100,
          lng: 28.0600,
          address: "456 Corporate Blvd, Sandton"
        },
        estimatedArrival: new Date().toISOString(),
        distance: 0,
        lastUpdated: new Date().toISOString()
      }
    ];

    setDeliveries(mockDeliveries);
    setLoading(false);
  }, []);

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      in_transit: "bg-blue-100 text-blue-800",
      arrived: "bg-green-100 text-green-800",
      completed: "bg-slate-100 text-slate-800"
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      pending: Clock,
      in_transit: Truck,
      arrived: MapPin,
      completed: CheckCircle
    };
    const Icon = icons[status as keyof typeof icons] || Clock;
    return <Icon className="w-4 h-4" />;
  };

  const activeDeliveries = deliveries.filter(d => d.status !== "completed");
  const completedDeliveries = deliveries.filter(d => d.status === "completed");

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Delivery Tracking - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Delivery Tracking</h1>
              <p className="text-slate-600">Monitor all deliveries in real-time</p>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Active</p>
                    <p className="text-2xl font-bold text-blue-600">{activeDeliveries.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Truck className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">In Transit</p>
                    <p className="text-2xl font-bold text-indigo-600">
                      {deliveries.filter(d => d.status === "in_transit").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Navigation className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Arrived</p>
                    <p className="text-2xl font-bold text-green-600">
                      {deliveries.filter(d => d.status === "arrived").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Completed</p>
                    <p className="text-2xl font-bold text-slate-600">
                      {completedDeliveries.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-slate-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Deliveries List */}
          <Tabs defaultValue="active" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 gap-2 bg-white/50 p-1 rounded-lg">
              <TabsTrigger value="active" className="gap-2">
                <Truck className="h-4 w-4" />
                Active Deliveries ({activeDeliveries.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Completed ({completedDeliveries.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {activeDeliveries.length === 0 ? (
                <Card className="border-0 shadow-lg">
                  <CardContent className="py-12 text-center">
                    <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-slate-600">No active deliveries</p>
                  </CardContent>
                </Card>
              ) : (
                activeDeliveries.map((delivery) => (
                  <Card key={delivery.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg text-slate-900">
                              {delivery.orderName}
                            </h3>
                            <Badge className={`${getStatusColor(delivery.status)} gap-1`}>
                              {getStatusIcon(delivery.status)}
                              {delivery.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="space-y-2 text-sm text-slate-600">
                            <p className="flex items-center gap-2">
                              <Truck className="w-4 h-4" />
                              {delivery.driverName} • {delivery.vehicleNumber}
                            </p>
                            <p className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              Current: {delivery.currentLocation.address}
                            </p>
                            <p className="flex items-center gap-2">
                              <Navigation className="w-4 h-4" />
                              Destination: {delivery.destination.address}
                            </p>
                            <p className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              ETA: {new Date(delivery.estimatedArrival).toLocaleTimeString()}
                              {delivery.distance > 0 && ` • ${delivery.distance.toFixed(1)} km away`}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button variant="outline" size="sm">
                            <MapPin className="w-4 h-4 mr-2" />
                            View on Map
                          </Button>
                          <Button variant="outline" size="sm">
                            <Package className="w-4 h-4 mr-2" />
                            Order Details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedDeliveries.length === 0 ? (
                <Card className="border-0 shadow-lg">
                  <CardContent className="py-12 text-center">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-slate-600">No completed deliveries yet</p>
                  </CardContent>
                </Card>
              ) : (
                completedDeliveries.map((delivery) => (
                  <Card key={delivery.id} className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-slate-900">
                          {delivery.orderName}
                        </h3>
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Completed
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-slate-600">
                        <p>{delivery.driverName} • {delivery.vehicleNumber}</p>
                        <p>Delivered to: {delivery.destination.address}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}