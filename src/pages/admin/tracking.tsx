import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Clock, Package, User, Phone, Navigation, TrendingUp, AlertCircle } from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import driverService from "@/services/driverService";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";

// Dynamically import the map component with SSR disabled
const AdminTrackingMap = dynamic(
  () => import("@/components/tracking/AdminTrackingMap").then((mod) => mod.AdminTrackingMap),
  { ssr: false }
);

interface OrderWithTracking {
  id: string;
  client_name: string;
  venue_address: string;
  venue_lat?: number;
  venue_lng?: number;
  delivery_time: string;
  status: string;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_lat?: number;
  driver_lng?: number;
  last_updated?: string;
  estimated_arrival?: string;
}

export default function AdminTracking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [driverLocations, setDriverLocations] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    loadTrackingData();
  }, [user]);

  const loadTrackingData = async () => {
    if (!user?.company_id) return;

    try {
      const companyId = user.company_id;

      // Load orders with delivery status
      const allOrders = await orderService.getAllOrders(companyId);
      const activeOrders = allOrders.filter(order => 
        ["confirmed", "preparing", "ready", "out_for_delivery"].includes(order.status || "")
      );
      
      // Load driver data
      const driverData = await driverService.getAllDrivers(companyId);
      setDrivers(driverData);
      
      // Enrich orders with driver location data
      const enrichedOrders = activeOrders.map(order => {
        const driver = driverData.find(d => d.id === order.driver_id) as any;
        return {
          ...order,
          driver_name: driver?.full_name,
          driver_phone: driver?.phone,
          driver_lat: driver?.current_lat,
          driver_lng: driver?.current_lng,
          last_updated: driver?.location_updated_at,
        };
      });
      
      setOrders(enrichedOrders);
      setLoading(false);
    } catch (error) {
      console.error("Error loading tracking data:", error);
      setLoading(false);
    }
  };

  const handleDriverLocationUpdate = (updatedLocations: any[]) => {
    setDriverLocations(updatedLocations);
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.venue_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.driver_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesDriver = driverFilter === "all" || order.driver_id === driverFilter;
    
    return matchesSearch && matchesStatus && matchesDriver;
  });

  const getStatusColor = (status: string) => {
    const colors = {
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-yellow-100 text-yellow-800",
      ready: "bg-purple-100 text-purple-800",
      out_for_delivery: "bg-orange-100 text-orange-800",
      delivered: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed": return <Clock className="w-4 h-4" />;
      case "preparing": return <Package className="w-4 h-4" />;
      case "ready": return <TrendingUp className="w-4 h-4" />;
      case "out_for_delivery": return <Navigation className="w-4 h-4" />;
      case "delivered": return <Package className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const stats = {
    active: orders.filter(o => o.status === "out_for_delivery").length,
    preparing: orders.filter(o => o.status === "preparing").length,
    ready: orders.filter(o => o.status === "ready").length,
    total: orders.length,
  };

  return (
    <>
      <Head>
        <title>Live Tracking - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-20 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Real-Time Delivery Tracking
            </h1>
            <p className="text-slate-600">
              Monitor all active deliveries and driver locations in real-time
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">Out for Delivery <InfoTooltip content={"Orders that are with a driver right now, on the way to the venue."} /></p>
                    <p className="text-2xl font-bold text-orange-600">{stats.active}</p>
                  </div>
                  <Navigation className="w-8 h-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">Preparing <InfoTooltip content={"Orders being prepped in the kitchen right now."} /></p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.preparing}</p>
                  </div>
                  <Package className="w-8 h-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">Ready <InfoTooltip content={"Orders that are prepped, packed, and waiting for a driver to collect."} /></p>
                    <p className="text-2xl font-bold text-purple-600">{stats.ready}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1">Total Active <InfoTooltip content={"Every order in motion right now, from confirmed through to out for delivery.\n\nDelivered and cancelled orders aren't counted."} /></p>
                    <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                  </div>
                  <MapPin className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search by client, venue, or driver..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="preparing">Preparing</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={driverFilter} onValueChange={setDriverFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Filter by driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Drivers</SelectItem>
                    {drivers.map(driver => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant={autoRefresh ? "default" : "outline"}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="w-full md:w-auto"
                >
                  {autoRefresh ? "Auto-Refresh: ON" : "Auto-Refresh: OFF"}
                </Button>

                <Button
                  variant="outline"
                  onClick={loadTrackingData}
                  className="w-full md:w-auto"
                >
                  Refresh Now
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Main Content */}
          <Tabs defaultValue="map" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="map">Map View</TabsTrigger>
              <TabsTrigger value="list">List View</TabsTrigger>
            </TabsList>

            <TabsContent value="map">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Map */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">Live Tracking Map <InfoTooltip content={"Pins for every active venue and the last known position of each driver.\n\nDriver pins update as their devices report new locations."} /></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[600px] relative">
                      <AdminTrackingMap
                        orders={filteredOrders}
                        driverLocations={driverLocations}
                        onDriverLocationUpdate={handleDriverLocationUpdate}
                        companyId={user?.company_id}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Order Details Sidebar */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      {selectedOrder ? "Order Details" : "Active Orders"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[550px] overflow-y-auto">
                    {selectedOrder ? (
                      <div className="space-y-4">
                        <div>
                          <Badge className={getStatusColor(selectedOrder.status || "")}>
                            {selectedOrder.status}
                          </Badge>
                        </div>
                        
                        <div>
                          <p className="text-sm text-slate-600 mb-1">Client</p>
                          <p className="font-semibold">{selectedOrder.client_name}</p>
                        </div>

                        <div>
                          <p className="text-sm text-slate-600 mb-1">Delivery Address</p>
                          <p className="text-sm">{selectedOrder.venue_address}</p>
                        </div>

                        <div>
                          <p className="text-sm text-slate-600 mb-1">Delivery Time</p>
                          <p className="text-sm">{selectedOrder.delivery_time}</p>
                        </div>

                        {selectedOrder.driver_name && (
                          <>
                            <div className="border-t pt-4">
                              <p className="text-sm text-slate-600 mb-2">Driver Information</p>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-slate-600" />
                                  <span className="text-sm">{selectedOrder.driver_name}</span>
                                </div>
                                {selectedOrder.driver_phone && (
                                  <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-slate-600" />
                                    <span className="text-sm">{selectedOrder.driver_phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {selectedOrder.last_updated && (
                              <div className="text-xs text-slate-500">
                                Last updated: {new Date(selectedOrder.last_updated).toLocaleTimeString()}
                              </div>
                            )}
                          </>
                        )}

                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setSelectedOrder(null)}
                        >
                          Close Details
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredOrders.length === 0 ? (
                          <p className="text-sm text-slate-600 text-center py-8">
                            No active orders to display
                          </p>
                        ) : (
                          filteredOrders.map(order => (
                            <div
                              key={order.id}
                              className="p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                              onClick={() => {
                                setSelectedOrder(order);
                              }}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">{order.client_name}</p>
                                  <p className="text-xs text-slate-600">{order.venue_address}</p>
                                </div>
                                <Badge className={getStatusColor(order.status || "")}>
                                  {order.status}
                                </Badge>
                              </div>
                              {order.driver_name && (
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                  <User className="w-3 h-3" />
                                  <span>{order.driver_name}</span>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="list">
              <Card>
                <CardContent className="p-6">
                  {loading ? (
                    <div className="text-center py-8">
                      <p className="text-slate-600">Loading orders...</p>
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-slate-600">No orders found matching your filters</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredOrders.map(order => (
                        <div key={order.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-semibold text-slate-900">{order.client_name}</h3>
                                <Badge className={getStatusColor(order.status || "")}>
                                  <span className="flex items-center gap-1">
                                    {getStatusIcon(order.status || "")}
                                    {order.status}
                                  </span>
                                </Badge>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-600">
                                <div className="flex items-start gap-2">
                                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                  <span>{order.venue_address}</span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 flex-shrink-0" />
                                  <span>{order.delivery_time}</span>
                                </div>
                                
                                {order.driver_name && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4 flex-shrink-0" />
                                      <span>{order.driver_name}</span>
                                    </div>
                                    
                                    {order.driver_phone && (
                                      <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4 flex-shrink-0" />
                                        <span>{order.driver_phone}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedOrder(order);
                              }}
                            >
                              View on Map
                            </Button>
                          </div>
                          
                          {order.last_updated && (
                            <div className="text-xs text-slate-500 mt-2">
                              Last updated: {new Date(order.last_updated).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.company_id} />
    </>
  );
}