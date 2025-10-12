import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Order } from "@/types";
import { User, Calendar, MapPin, Package, Clock, CheckCircle, Truck } from "lucide-react";
import Link from "next/link";
import { ComplaintPortal } from "@/components/ComplaintPortal";
import { Footer } from "@/components/Footer";
import { PaymentService } from "@/lib/paymentService";
import { CreditCard, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { JobProgressTracker } from "@/components/JobProgressTracker";

export default function ClientPortalPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState("active");
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    const mockOrders: Order[] = [
      {
        id: "ORD-001",
        quoteId: "Q-001",
        client: "Sarah Johnson",
        clientName: "Sarah Johnson",
        eventDate: new Date().toISOString().split("T")[0],
        date: new Date().toISOString().split("T")[0],
        venue: "Grand Palace Hotel",
        location: "123 Main St, Cape Town",
        eventLocation: "123 Main St, Cape Town",
        guestCount: 150,
        menuItems: [
          {
            id: "m1",
            name: "Braai Platter",
            category: "main",
            pricePerPerson: 250,
            quantity: 150,
            ingredients: [],
          },
        ],
        equipmentItems: [
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
        kitchenInstructions: "",
        total: 38700,
        totalAmount: 38700,
        createdAt: new Date().toISOString(),
      },
      {
        id: "ORD-002",
        quoteId: "Q-002",
        client: "Sarah Johnson",
        clientName: "Sarah Johnson",
        eventDate: new Date(Date.now() + 86400000 * 7).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000 * 7).toISOString().split("T")[0],
        venue: "Beach Club Venue",
        location: "45 Beach Road, Cape Town",
        eventLocation: "45 Beach Road, Cape Town",
        guestCount: 80,
        menuItems: [
          {
            id: "m2",
            name: "Seafood Buffet",
            category: "main",
            pricePerPerson: 350,
            quantity: 80,
            ingredients: [],
          },
        ],
        equipmentItems: [],
        kitchenInstructions: "",
        status: "preparing",
        total: 28000,
        totalAmount: 28000,
        createdAt: new Date().toISOString(),
      },
    ];

    const stored = localStorage.getItem("client_orders");
    setOrders(stored ? JSON.parse(stored) : mockOrders);
  }, []);

  const getStatusColor = (status: Order["status"]) => {
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

  const getStatusIcon = (status: Order["status"]) => {
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

  const handlePayment = async (order: Order) => {
    setProcessingPayment(order.id);
    setPaymentError(null);

    try {
      const result = await PaymentService.initiatePayment({
        orderId: order.id,
        amount: order.totalAmount,
        currency: "ZAR",
        customerEmail: "client@example.com",
        customerName: order.clientName,
        description: `Payment for ${order.venue} event`,
        metadata: {
          quoteId: order.quoteId,
          eventDate: order.eventDate,
          venue: order.venue
        }
      });

      if (result.success && result.paymentUrl) {
        window.location.href = result.paymentUrl;
      } else {
        setPaymentError(result.errorMessage || "Payment processing failed");
      }
    } catch (error) {
      setPaymentError("Unable to process payment. Please try again.");
    } finally {
      setProcessingPayment(null);
    }
  };

  const needsPayment = (order: Order) => {
    return order.status === "pending" || order.status === "confirmed";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <NoIndexMeta />
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
          <Link href="/quotes/new">
            <Button className="bg-gradient-to-r from-blue-500 to-blue-600">
              Request New Quote
            </Button>
          </Link>
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
                    {orders.filter((o) => new Date(o.eventDate) > new Date()).length}
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
                      quote_sent: order.createdAt,
                      quote_accepted: order.status !== "pending" ? order.createdAt : undefined,
                      payment_confirmed: ["confirmed", "preparing", "ready", "delivered", "completed"].includes(order.status) ? order.createdAt : undefined,
                      kitchen_assigned: ["preparing", "ready", "delivered", "completed"].includes(order.status) ? order.createdAt : undefined,
                      driver_assigned: ["ready", "delivered", "completed"].includes(order.status) ? order.createdAt : undefined,
                      in_transit: ["delivered", "completed"].includes(order.status) ? order.createdAt : undefined,
                      delivered: order.status === "delivered" || order.status === "completed" ? order.createdAt : undefined,
                      equipment_returned: order.status === "completed" ? order.createdAt : undefined,
                    }}
                    clientName={order.clientName}
                    eventDate={order.eventDate}
                    orderNumber={order.id}
                  />

                  {/* Order Details Card */}
                  <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(order.status)}
                          <div>
                            <CardTitle className="text-xl">{order.venue}</CardTitle>
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
                              {new Date(order.eventDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-500" />
                          <div>
                            <p className="text-xs text-slate-500">Guests</p>
                            <p className="text-sm font-medium">{order.guestCount}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-500 mt-1" />
                        <div>
                          <p className="text-xs text-slate-500">Location</p>
                          <p className="text-sm font-medium">{order.eventLocation}</p>
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Total Amount</span>
                          <span className="text-lg font-bold text-slate-900">
                            R{order.totalAmount?.toLocaleString()}
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
                                Pay R{order.totalAmount?.toLocaleString()}
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
              .filter((o) => new Date(o.eventDate) > new Date())
              .map((order) => (
                <Card key={order.id} className="border-0 shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl">{order.venue}</CardTitle>
                      <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">
                        {new Date(order.eventDate).toLocaleDateString()} • {order.guestCount} guests
                      </span>
                      <span className="font-semibold text-slate-900">
                        R{order.totalAmount?.toLocaleString()}
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
                      <CardTitle className="text-xl">{order.venue}</CardTitle>
                      <Badge className="bg-green-100 text-green-800">Completed</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">
                        {new Date(order.eventDate).toLocaleDateString()}
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
    </div>
  );
}
