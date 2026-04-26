import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Package, User, Phone, Navigation, RefreshCw, Star, TrendingUp } from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import { feedbackService } from "@/services/feedbackService";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import { DeliveryFeedbackModal, FeedbackData } from "@/components/DeliveryFeedbackModal";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { supabase } from "@/lib/supabase";

const ClientTrackingMap = dynamic(
  () => import("@/components/tracking/ClientTrackingMap").then((mod) => mod.ClientTrackingMap),
  { ssr: false }
) as React.ComponentType<any>;

interface OrderDetails {
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
  estimated_arrival?: string;
  items?: any[];
}

interface DriverLocation {
  lat: number;
  lng: number;
  driver_name: string;
  driver_phone?: string;
  last_updated: string;
}

export default function ClientTracking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackOrder, setFeedbackOrder] = useState<OrderDetails | null>(null);
  const [deliveredOrders, setDeliveredOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadOrders();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadOrders(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  // Check for newly delivered orders and prompt feedback
  useEffect(() => {
    orders.forEach(async (order) => {
      if (order.status === "delivered" && !deliveredOrders.has(order.id)) {
        // Check if feedback already exists
        const feedbackExists = await feedbackService.checkFeedbackExists(order.id);
        
        if (!feedbackExists) {
          // Delay to let the "delivered" status sink in
          setTimeout(() => {
            setFeedbackOrder(order);
            setFeedbackModalOpen(true);
            setDeliveredOrders(prev => new Set([...prev, order.id]));
          }, 2000); // 2 second delay
        }
      }
    });
  }, [orders, deliveredOrders]);

  const loadOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Get client's details
      const { data: clientData } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user?.id)
        .single();

      if (!clientData) {
        setLoading(false);
        return;
      }

      // Get active orders for this client
      const { data: fetchedOrders } = await supabase
        .from("orders")
        .select(`*, assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, phone)`)
        .eq("client_id", clientData.id)
        .order("event_date", { ascending: false });
      
      // Filter to show orders that are active or recently delivered
      const activeOrders = (fetchedOrders || []).filter((o: any) => 
        ["preparing", "ready", "out_for_delivery", "delivered"].includes(o.status)
      ).map((o: any) => ({
        ...o,
        driver_name: o.assigned_driver?.full_name,
        driver_phone: o.assigned_driver?.phone
      }));
      
      setOrders(activeOrders as any);
      
      // Auto-select first order if none selected
      if (activeOrders.length > 0 && !selectedOrder) {
        setSelectedOrder(activeOrders[0] as any);
        loadDriverLocation(activeOrders[0] as any);
      }
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDriverLocation = async (order: OrderDetails) => {
    if (!order.driver_id) return;
    
    try {
      const { data: driver } = await supabase
        .from("gps_tracking")
        .select("*")
        .eq("user_id", order.driver_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (driver) {
        setDriverLocation({
          lat: driver.latitude,
          lng: driver.longitude,
          driver_name: order.driver_name || "Your Driver",
          driver_phone: order.driver_phone,
          last_updated: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error loading driver location:", error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    if (selectedOrder) {
      await loadDriverLocation(selectedOrder);
    }
    setRefreshing(false);
  };

  const handleOrderSelect = async (order: OrderDetails) => {
    setSelectedOrder(order);
    await loadDriverLocation(order);
  };

  const handleLocationUpdate = (location: { lat: number; lng: number }) => {
    if (driverLocation) {
      setDriverLocation({
        ...driverLocation,
        lat: location.lat,
        lng: location.lng,
        last_updated: new Date().toISOString(),
      });
    }
  };

  const handleFeedbackSubmit = async (feedback: FeedbackData) => {
    try {
      await feedbackService.submitFeedback(feedback);
      toast({
        title: "Feedback Submitted! 🎉",
        description: "Thank you for helping us improve our service.",
      });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      throw error;
    }
  };

  const handleRateOrder = (order: OrderDetails) => {
    setFeedbackOrder(order);
    setFeedbackModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "out_for_delivery": return "bg-emerald-500";
      case "ready": return "bg-blue-500";
      case "preparing": return "bg-amber-500";
      case "delivered": return "bg-slate-500";
      default: return "bg-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "out_for_delivery": return "On the way!";
      case "ready": return "Ready for pickup";
      case "preparing": return "Being prepared";
      case "delivered": return "Delivered";
      default: return status;
    }
  };

  const calculateETA = (order: OrderDetails) => {
    if (!order.estimated_arrival) return "Calculating...";
    
    const eta = new Date(order.estimated_arrival);
    const now = new Date();
    const diffMinutes = Math.round((eta.getTime() - now.getTime()) / 60000);
    
    if (diffMinutes < 0) return "Arriving soon";
    if (diffMinutes < 60) return `${diffMinutes} minutes`;
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your deliveries...</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <>
        <Head>
          <title>Track Your Order - CateringMS</title>
        </Head>
        <NoIndexMeta />
        
        <div className="min-h-screen bg-slate-50 pb-20">
          <div className="container mx-auto px-4 py-8">
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Active Deliveries</h3>
                <p className="text-slate-600">You don't have any orders out for delivery right now.</p>
              </CardContent>
            </Card>
          </div>
        </div>
        
        <Footer />
        <ChatBot userRole="client" />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Track Your Order - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.CLIENT} />

      <div className="min-h-screen bg-slate-50 pb-20">
        {/* Header */}
        <div className="bg-white border-b">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Track Your Order</h1>
                <p className="text-slate-600 mt-1">Real-time delivery tracking</p>
              </div>
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                variant="outline"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Map */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-emerald-600" />
                      Live Tracking
                    </CardTitle>
                    {selectedOrder && (
                      <Badge className={`${getStatusColor(selectedOrder.status)} text-white`}>
                        {getStatusLabel(selectedOrder.status)}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedOrder && selectedOrder.venue_lat && selectedOrder.venue_lng ? (
                    <div className="h-[500px] relative">
                      <ClientTrackingMap
                        orderId={selectedOrder.id}
                        driverLocation={driverLocation || undefined}
                        venueLocation={{
                          lat: selectedOrder.venue_lat,
                          lng: selectedOrder.venue_lng,
                          address: selectedOrder.venue_address,
                        }}
                        orderStatus={selectedOrder.status}
                        estimatedArrival={selectedOrder.estimated_arrival}
                        onLocationUpdate={handleLocationUpdate}
                      />
                      
                      {/* Live indicator */}
                      {selectedOrder.status === "out_for_delivery" && driverLocation && (
                        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-4 py-2 border-2 border-emerald-500">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                            <span className="text-sm font-medium text-slate-900">Live Tracking</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-[500px] flex items-center justify-center bg-slate-100 rounded-lg">
                      <div className="text-center">
                        <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                        <p className="text-slate-600">Location data not available</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Driver Info Card */}
              {selectedOrder?.driver_name && (
                <Card className="mt-6">
                  <CardContent className="py-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-3 rounded-full">
                          <User className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Your Driver</p>
                          <p className="font-semibold">{selectedOrder.driver_name}</p>
                        </div>
                      </div>
                      
                      {selectedOrder.driver_phone && (
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-3 rounded-full">
                            <Phone className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm text-slate-600">Contact</p>
                            <p className="font-semibold">{selectedOrder.driver_phone}</p>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-100 p-3 rounded-full">
                          <Clock className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Estimated Arrival</p>
                          <p className="font-semibold">{calculateETA(selectedOrder)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Order List Sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Your Orders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      onClick={() => handleOrderSelect(order)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedOrder?.id === order.id
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold">{order.client_name}</p>
                          <p className="text-sm text-slate-600">{order.venue_address}</p>
                        </div>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-600 mt-3">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{new Date(order.delivery_time).toLocaleTimeString()}</span>
                        </div>
                        {order.status === "out_for_delivery" && (
                          <div className="flex items-center gap-1 text-emerald-600 font-medium">
                            <Navigation className="w-4 h-4" />
                            <span>En route</span>
                          </div>
                        )}
                      </div>

                      {/* Rate Order Button for Delivered Orders */}
                      {order.status === "delivered" && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRateOrder(order);
                          }}
                          variant="outline"
                          size="sm"
                          className="w-full mt-3"
                        >
                          <Star className="w-4 h-4 mr-2" />
                          Rate This Delivery
                        </Button>
                      )}
                    </div>
                  ))}
                  
                  <div className="pt-3 border-t text-center text-xs text-slate-500">
                    Last updated: {lastRefresh.toLocaleTimeString()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Modal */}
      {feedbackOrder && (
        <DeliveryFeedbackModal
          isOpen={feedbackModalOpen}
          onClose={() => {
            setFeedbackModalOpen(false);
            setFeedbackOrder(null);
          }}
          orderId={feedbackOrder.id}
          orderDetails={{
            client_name: feedbackOrder.client_name,
            venue_address: feedbackOrder.venue_address,
            driver_name: feedbackOrder.driver_name,
            delivery_time: feedbackOrder.delivery_time,
          }}
          onSubmit={handleFeedbackSubmit}
        />
      )}

      <Footer />
      <ChatBot userRole="client" />
    </>
  );
}