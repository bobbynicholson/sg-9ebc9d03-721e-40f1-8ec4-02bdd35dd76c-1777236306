import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  CreditCard,
  Map,
  Truck,
  Users,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Package,
  User,
  Gamepad2,
  Calendar,
  MapPin,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { orderService } from "@/services/orderService";
import { paymentProcessingService } from "@/services/paymentProcessingService";
import { complaintService } from "@/services/complaintService";
import { ComplaintPortal } from "@/components/ComplaintPortal";
import { JobProgressTracker } from "@/components/JobProgressTracker";
import { CateringDashGame } from "@/components/games/CateringDashGame";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/client/ClientNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppOrder };

interface ClientPortalPageProps {
  companySlug?: string;
  portal?: string;
  currentRoute?: string;
}

function ClientPortalPage({ companySlug: propCompanySlug }: ClientPortalPageProps = {}) {
  const { user } = useAuth();
  const companySlug = propCompanySlug || user?.company_slug;
  const [recentOrder, setRecentOrder] = useState<AppOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [activeTab, setActiveTab] = useState("active");
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showGame, setShowGame] = useState(false);

  useEffect(() => {
    // Check if game parameter is in URL
    if (router.query.game === 'true') {
      setShowGame(true);
    }
  }, [router.query]);

  useEffect(() => {
    const mockOrdersData: AppOrder[] = [
      {
        id: "ORD-001",
        quote_id: "Q-001",
        client_name: "Sarah Johnson",
        event_date: new Date().toISOString().split("T")[0],
        venue_address: "Grand Palace Hotel",
        guest_count: 150,
        menu_items: [
          {
            id: "m1",
            name: "Braai Platter",
            category: "main",
            pricePerPerson: 250,
            quantity: 150,
            ingredients: [],
          },
        ],
        equipment_items: [
          {
            id: "eq1",
            name: "Dinner Plates",
            category: "crockery",
            quantity: 150,
            available: 150,
            condition: "excellent",
            rentalPrice: 5,
            pricePerItem: 5,
          },
          {
            id: "eq2",
            name: "Wine Glasses",
            category: "crockery",
            quantity: 150,
            available: 150,
            condition: "excellent",
            rentalPrice: 3,
            pricePerItem: 3,
          },
        ],
        status: "confirmed",
        internal_notes: "",
        total: 38700,
        created_at: new Date().toISOString(),
      } as unknown as AppOrder,
      {
        id: "ORD-002",
        quote_id: "Q-002",
        client_name: "Sarah Johnson",
        event_date: new Date(Date.now() + 86400000 * 7).toISOString().split("T")[0],
        venue_address: "Beach Club Venue",
        guest_count: 80,
        menu_items: [
          {
            id: "m2",
            name: "Seafood Buffet",
            category: "main",
            pricePerPerson: 350,
            quantity: 80,
            ingredients: [],
          },
        ],
        equipment_items: [],
        internal_notes: "",
        status: "preparing",
        total: 28000,
        created_at: new Date().toISOString(),
      } as unknown as AppOrder,
    ];

    const stored = localStorage.getItem("client_orders");
    setOrders(stored ? JSON.parse(stored) : mockOrdersData);
  }, []);

  const getStatusColor = (status: AppOrder["status"]) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      ready: "bg-green-100 text-green-800",
      delivered: "bg-slate-100 text-slate-800",
      completed: "bg-green-100 text-green-800",
    };
    return colors[status];
  };

  const getStatusIcon = (status: AppOrder["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4" />;
      case "confirmed":
        return <CheckCircle className="w-4 h-4" />;
      case "preparing":
        return <Package className="w-4 h-4" />;
      case "ready":
        return <CheckCircle className="w-4 h-4" />;
      case "delivered":
        return <Truck className="w-4 h-4" />;
      default:
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  const activeOrders = orders.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status));
  const completedOrders = orders.filter((o) => ["delivered", "completed"].includes(o.status));

  const handlePayment = async (order: AppOrder) => {
    setProcessingPayment(order.id);
    setPaymentError(null);

    try {
      const result = await paymentProcessingService.generatePaymentLink(
        order.id,
        order.deposit_paid ? "balance" : "deposit"
      );

      if (result) {
        window.location.href = result;
      } else {
        setPaymentError("Payment processing failed");
      }
    } catch (error) {
      setPaymentError("Unable to process payment. Please try again.");
    } finally {
      setProcessingPayment(null);
    }
  };

  const needsPayment = (order: AppOrder) => {
    return order.status === "pending" || order.status === "confirmed";
  };

  return (
    <>
      <Head>
        <title>Client Portal</title>
      </Head>
      <NoIndexMeta />
      <ClientNav />
      <div className="min-h-screen bg-gray-50 lg:pl-64 xl:pl-72">
        <div className="p-4 md:p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Client Portal</h1>
          </header>
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">My Events</h1>
                  <p className="text-slate-600">Track your catering orders</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowGame(true)}
                  className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600"
                >
                  <Gamepad2 className="w-4 h-4 mr-2" />
                  Play Game
                </Button>
                <Link href="/quotes/new">
                  <Button className="bg-gradient-to-r from-blue-500 to-blue-600">
                    Request New Quote
                  </Button>
                </Link>
              </div>
            </div>

            {paymentError && (
              <Alert variant="destructive">
                <AlertDescription>{paymentError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Active Orders</p>
                      <p className="text-2xl font-bold text-slate-900">{activeOrders.length}</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Package className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Upcoming Events</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {orders.filter((o) => new Date(o.event_date) > new Date()).length}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Completed</p>
                      <p className="text-2xl font-bold text-green-600">{completedOrders.length}</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="active">Active Orders</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="complaints">Complaints</TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="space-y-4">
                {activeOrders.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-slate-600">
                      No active orders
                    </CardContent>
                  </Card>
                ) : (
                  activeOrders.map((order) => (
                    <div key={order.id} className="space-y-4">
                      {/* Job Progress Tracker */}
                      <JobProgressTracker
                        currentStatus={order.status}
                        orderData={{
                          quote_sent: order.created_at,
                          quote_accepted: order.status !== "pending" ? order.created_at : undefined,
                          payment_confirmed: ["confirmed", "preparing", "ready", "delivered", "completed"].includes(order.status) ? order.created_at : undefined,
                          kitchen_assigned: ["preparing", "ready", "delivered", "completed"].includes(order.status) ? order.created_at : undefined,
                          driver_assigned: ["ready", "delivered", "completed"].includes(order.status) ? order.created_at : undefined,
                          in_transit: ["delivered", "completed"].includes(order.status) ? order.created_at : undefined,
                          delivered: order.status === "delivered" || order.status === "completed" ? order.created_at : undefined,
                          equipment_returned: order.status === "completed" ? order.created_at : undefined,
                        }}
                        clientName={order.client_name || ""}
                        eventDate={order.event_date}
                        orderNumber={order.id}
                      />

                      {/* Order Details Card */}
                      <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(order.status)}
                              <div>
                                <CardTitle className="text-xl">{order.venue_address}</CardTitle>
                                <p className="text-sm text-slate-600 mt-1">Order #{order.id}</p>
                              </div>
                            </div>
                            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-500" />
                              <div>
                                <p className="text-xs text-slate-500">Event Date</p>
                                <p className="text-sm font-medium">
                                  {new Date(order.event_date).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-500" />
                              <div>
                                <p className="text-xs text-slate-500">Guests</p>
                                <p className="text-sm font-medium">{order.guest_count}</p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-500 mt-1" />
                            <div>
                              <p className="text-xs text-slate-500">Location</p>
                              <p className="text-sm font-medium">{order.venue_address}</p>
                            </div>
                          </div>

                          <div className="pt-4 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600">Total Amount</span>
                              <span className="text-lg font-bold text-slate-900">
                                R{order.total?.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {needsPayment(order) && (
                            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <DollarSign className="w-4 h-4 text-yellow-600" />
                                <span className="text-sm font-medium text-yellow-900">Payment Required</span>
                              </div>
                              <p className="text-xs text-yellow-700 mb-3">
                                Complete payment to confirm your booking and reserve your event date
                              </p>
                              <Button 
                                onClick={() => handlePayment(order)}
                                disabled={processingPayment === order.id}
                                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                              >
                                {processingPayment === order.id ? (
                                  <>Processing...</>
                                ) : (
                                  <>
                                    <CreditCard className="w-4 h-4 mr-2" />
                                    Pay R{order.total?.toLocaleString()}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Link href={`/tracking/client?orderId=${order.id}`} className="flex-1">
                              <Button variant="outline" className="w-full">
                                Track Delivery
                              </Button>
                            </Link>
                            <Button className="flex-1">View Details</Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="upcoming" className="space-y-4">
                {orders
                  .filter((o) => new Date(o.event_date) > new Date())
                  .map((order) => (
                    <Card key={order.id} className="border-0 shadow-lg">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xl">{order.venue_address}</CardTitle>
                          <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">
                            {new Date(order.event_date).toLocaleDateString()} • {order.guest_count} guests
                          </span>
                          <span className="font-semibold text-slate-900">
                            R{order.total?.toLocaleString()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </TabsContent>

              <TabsContent value="completed" className="space-y-4">
                {completedOrders.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-slate-600">
                      No completed orders
                    </CardContent>
                  </Card>
                ) : (
                  completedOrders.map((order) => (
                    <Card key={order.id} className="border-0 shadow-lg">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xl">{order.venue_address}</CardTitle>
                          <Badge className="bg-green-100 text-green-800">Completed</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">
                            {new Date(order.event_date).toLocaleDateString()}
                          </span>
                          <Button variant="outline" size="sm">
                            Leave Review
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="complaints">
                <ComplaintPortal />
              </TabsContent>
            </Tabs>
          </div>
          
          <Footer />
          
          {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}
        </div>
      </div>
    </>
  );
}

export default function ProtectedClientPortalPage() {
    return (
        <ProtectedRoute allowedRoles={["client"]}>
            <ClientPortalPage />
        </ProtectedRoute>
    );
}
