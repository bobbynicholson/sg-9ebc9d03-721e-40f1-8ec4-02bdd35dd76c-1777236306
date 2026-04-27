import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Package,
  Truck,
  User,
  Gamepad2,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { CateringDashGame } from "@/components/games/CateringDashGame";
import { PaymentScheduleCard } from "@/components/orders/PaymentScheduleCard";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Order {
  id: string;
  event_date: string;
  venue_address: string;
  guest_count: number;
  status: string;
  total_amount: number;
  payment_status?: string;
  delivery_status?: string;
}

export default function ClientPortalDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGame, setShowGame] = useState(false);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        let ordersQuery = supabase
          .from("orders")
          .select("id, event_date, venue_address, guest_count, status, total_amount, payment_status, delivery_status")
          .order("event_date", { ascending: false });

        if (clientRow?.id) {
          ordersQuery = ordersQuery.eq("client_id", clientRow.id);
        } else {
          ordersQuery = ordersQuery.eq("client_email", user.email ?? "");
        }

        const { data: rows, error } = await ordersQuery;
        if (error) {
          console.error("Error loading client orders:", error);
        }
        if (!cancelled) setOrders((rows as Order[]) ?? []);
      } catch (e) {
        console.error("Client portal load failed:", e);
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  const activeOrders = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");
  const completedOrders = orders.filter((o) => o.status === "completed");

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      ready: "bg-green-100 text-green-800",
      completed: "bg-slate-100 text-slate-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const needsPayment = (order: Order) => {
    return order.payment_status === "pending" && order.total_amount > 0;
  };

  const handlePayment = async (order: Order) => {
    setProcessingPayment(order.id);
    // Mock payment processing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setProcessingPayment(null);
    alert("Payment processing would happen here");
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>My Events - CateringMS</title>
      </Head>

      <DynamicNav userRole={UserRole.CLIENT} />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-screen-2xl">
          <div className="mb-4 sm:mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">My Events</h1>
                  <p className="text-xs sm:text-sm md:text-base text-slate-600">Track your catering orders</p>
                </div>
              </div>
              <div className="flex flex-col xs:flex-row gap-2">
                <Button
                  onClick={() => setShowGame(true)}
                  className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 w-full xs:w-auto h-10 sm:h-11 text-sm sm:text-base"
                >
                  <Gamepad2 className="w-4 h-4 mr-2" />
                  Play Game
                </Button>
                <Link href="/quotes/new" className="w-full xs:w-auto">
                  <Button className="bg-gradient-to-r from-blue-500 to-blue-600 w-full h-10 sm:h-11 text-sm sm:text-base">
                    Request New Quote
                  </Button>
                </Link>
              </div>
            </div>

            {/* Next Event Summary */}
            {activeOrders.length > 0 && (
              <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 mt-4 sm:mt-6">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                        <h3 className="text-base sm:text-lg font-bold text-slate-900">Your Next Event</h3>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-blue-600 mb-1">
                        {new Date(activeOrders[0].event_date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                      <p className="text-sm sm:text-base text-slate-700">{activeOrders[0].venue_address}</p>
                      <p className="text-xs sm:text-sm text-slate-600 mt-1">{activeOrders[0].guest_count} guests</p>
                    </div>
                    <div className="text-left md:text-right w-full md:w-auto">
                      <p className="text-xs sm:text-sm text-slate-600 mb-1">Days until event</p>
                      <div className="text-3xl sm:text-4xl font-bold text-blue-600">
                        {Math.ceil((new Date(activeOrders[0].event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col xs:flex-row gap-2">
                    <Link href={`/tracking/client?orderId=${activeOrders[0].id}`} className="flex-1">
                      <Button className="w-full text-sm sm:text-base h-10 sm:h-11">Track Order</Button>
                    </Link>
                    <Button variant="outline" className="flex-1 text-sm sm:text-base h-10 sm:h-11">View Details</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment Reminders */}
            {orders.filter(o => needsPayment(o)).length > 0 && (
              <Card className="border-0 shadow-lg bg-gradient-to-r from-amber-50 to-orange-50 mt-4 sm:mt-6">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                    Payment Reminders
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6">
                  {orders.filter(o => needsPayment(o)).map(order => (
                    <div key={order.id} className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-3 p-3 bg-white rounded-lg">
                      <div>
                        <p className="font-semibold text-sm sm:text-base text-slate-900">{order.venue_address}</p>
                        <p className="text-xs text-slate-600">
                          Event: {new Date(order.event_date).toLocaleDateString()}
                        </p>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => handlePayment(order)}
                        disabled={processingPayment === order.id}
                        className="w-full xs:w-auto text-sm"
                      >
                        Pay R{Number(order.total_amount || 0).toLocaleString()}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1">
                      Active Events
                      <InfoTooltip content="Your bookings that aren't completed or cancelled yet -- the catering team is actively working on these." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600">{activeOrders.length}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center self-end md:self-auto">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1">
                      Completed
                      <InfoTooltip content="Past events that have been delivered and closed out. Your full booking history is on the My Orders page." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">{completedOrders.length}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1">
                      Total Guests
                      <InfoTooltip content="Sum of guest_count across every order you've placed. A rough sense of how many people we've fed for you." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-purple-600">
                      {orders.reduce((sum, o) => sum + o.guest_count, 0)}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-purple-100 flex items-center justify-center self-end md:self-auto">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1">
                      Total Spent
                      <InfoTooltip content="Sum of total_amount across every non-cancelled order on your account. VAT inclusive." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">
                      R{orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-slate-100 flex items-center justify-center self-end md:self-auto">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-slate-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Orders List */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg">My Orders</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {loading ? (
                <div className="text-center py-8 text-sm sm:text-base text-slate-600">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <Package className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-sm sm:text-base text-slate-600 font-medium mb-2">No orders yet</p>
                  <p className="text-xs sm:text-sm text-slate-500 mb-4">Start by requesting a quote for your event</p>
                  <Link href="/quotes/new">
                    <Button className="text-sm sm:text-base">Request Quote</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="p-3 sm:p-4 md:p-6 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="font-semibold text-base sm:text-lg text-slate-900">
                              {new Date(order.event_date).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </h3>
                            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                            {order.payment_status && (
                              <Badge
                                className={
                                  order.payment_status === "paid"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-amber-100 text-amber-800"
                                }
                              >
                                {order.payment_status}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1 text-xs sm:text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span>{order.venue_address}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span>{order.guest_count} guests</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span>R{Number(order.total_amount || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col xs:flex-row gap-2">
                          {needsPayment(order) && (
                            <Button size="sm" onClick={() => handlePayment(order)} className="text-xs sm:text-sm">
                              Pay Now
                            </Button>
                          )}
                          <Link href={`/tracking/client?orderId=${order.id}`}>
                            <Button size="sm" variant="outline" className="w-full xs:w-auto text-xs sm:text-sm">
                              <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                              Track
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}
      
      <ChatBot userRole="client" companyId={user?.user_metadata?.company_id} />
    </>
  );
}