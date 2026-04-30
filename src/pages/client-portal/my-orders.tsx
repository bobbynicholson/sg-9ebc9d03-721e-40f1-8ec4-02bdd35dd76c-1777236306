import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, DollarSign, Package, Truck, ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";

interface Order {
  id: string;
  event_date: string;
  venue_address: string;
  guest_count: number;
  status: string;
  total_amount: number;
  payment_status?: string;
}

export default function MyOrders() {
  const { user } = useAuth();
  const router = useRouter();
  // Slug-aware "Back to Dashboard" link -- keep nav inside the tenant
  // URL space when the page was reached via /[slug]/client-portal/my-orders.
  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    (user as any)?.user_metadata?.last_company_slug ||
    "";
  const dashboardHref = resolvedSlug
    ? `/${resolvedSlug}/client-portal/dashboard`
    : "/client-portal/dashboard";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

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
          .select("id, event_date, venue_address, guest_count, status, total_amount, payment_status")
          .order("event_date", { ascending: false });

        if (clientRow?.id) {
          ordersQuery = ordersQuery.eq("client_id", clientRow.id);
        } else {
          ordersQuery = ordersQuery.eq("client_email", user.email ?? "");
        }

        const { data, error } = await ordersQuery;
        if (error) {
          console.error("Error loading client orders:", error);
          if (!cancelled) setOrders([]);
          return;
        }
        if (!cancelled) setOrders((data || []) as unknown as Order[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const filteredOrders = orders.filter((o) => {
    if (filter === "active") return o.status !== "completed" && o.status !== "cancelled";
    if (filter === "completed") return o.status === "completed";
    return true;
  });

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

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>My Orders - CateringMS</title>
      </Head>

      <DynamicNav userRole={UserRole.CLIENT} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-12">
          <div className="mb-6">
            <Link href={dashboardHref}>
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900">My Orders</h1>
            <p className="text-slate-600 mt-1">View and manage all your catering orders</p>
          </div>

          <div className="flex gap-2 mb-6">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
            >
              All Orders
            </Button>
            <Button
              variant={filter === "active" ? "default" : "outline"}
              onClick={() => setFilter("active")}
            >
              Active
            </Button>
            <Button
              variant={filter === "completed" ? "default" : "outline"}
              onClick={() => setFilter("completed")}
            >
              Completed
            </Button>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Orders ({filteredOrders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-slate-600">Loading orders...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-600 font-medium mb-2">No orders found</p>
                  <p className="text-sm text-slate-500">Try changing the filter or request a new quote</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 md:p-6 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg text-slate-900">
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
                          <div className="space-y-1 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{order.venue_address}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{order.guest_count} guests</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              <span>R{Number(order.total_amount || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Link href={`/tracking/client?orderId=${order.id}`}>
                            <Button size="sm" variant="outline" className="w-full sm:w-auto">
                              <Truck className="w-4 h-4 mr-2" />
                              Track
                            </Button>
                          </Link>
                          <Button size="sm" variant="outline">
                            View Details
                          </Button>
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

      <ChatBot userRole="client" companyId={user?.user_metadata?.company_id} />
    </>
  );
}