import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import type { AppOrder } from "@/types/app";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/client/ClientNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Calendar, Package, Clock } from "lucide-react";
import { JobProgressTracker } from "@/components/JobProgressTracker";
import { UserRole } from "@/types/app";

function MyOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("admin_orders");
    if (stored) {
      const allOrders: AppOrder[] = JSON.parse(stored);
      setOrders(allOrders.filter((o) => o.status !== "pending"));
    }
  }, []);

  const upcomingOrders = orders.filter((o) => new Date(o.event_date) >= new Date());
  const pastOrders = orders.filter((o) => new Date(o.event_date) < new Date());

  return (
    <>
      <Head>
        <title>My Orders - Client Portal</title>
      </Head>
      <NoIndexMeta />
      <ClientNav />
      <div className="min-h-screen bg-gray-50 lg:pl-64 xl:pl-72">
        <main className="container mx-auto p-4 md:p-8">
          <h1 className="text-3xl font-bold mb-6 text-gray-800">My Orders</h1>
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">My Orders</h1>
                <p className="text-gray-600">Track your catering orders in real-time</p>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => router.push("/quotes/new")} variant="outline">
                  Request Quote
                </Button>
                <Button onClick={() => router.push("/client-portal")} className="bg-gradient-to-r from-purple-600 to-pink-600">
                  Dashboard
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[
                { label: "Total Orders", count: orders.length, icon: Package, color: "blue" },
                { label: "Upcoming Events", count: upcomingOrders.length, icon: Calendar, color: "green" },
                { label: "Past Events", count: pastOrders.length, icon: Clock, color: "gray" },
              ].map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Card key={index} className="border-2 hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
                          <p className="text-3xl font-bold text-gray-900">{stat.count}</p>
                        </div>
                        <div className={`w-12 h-12 rounded-lg bg-${stat.color}-100 flex items-center justify-center`}>
                          <Icon className={`w-6 h-6 text-${stat.color}-600`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {upcomingOrders.length > 0 && (
            <div className="mb-12">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upcoming Events</h2>
                <p className="text-gray-600">Track your confirmed and upcoming orders</p>
              </div>
              <div className="space-y-6">
                {upcomingOrders.map((order) => (
                  <JobProgressTracker
                    key={order.id}
                    currentStatus={order.status}
                    orderData={{
                      payment_confirmed: order.created_at,
                      kitchen_assigned: ["preparing", "ready", "delivered", "completed"].includes(order.status)
                        ? order.created_at
                        : undefined,
                      driver_assigned: ["ready", "delivered", "completed"].includes(order.status)
                        ? order.created_at
                        : undefined,
                      in_transit: ["delivered", "completed"].includes(order.status) ? order.created_at : undefined,
                      delivered: order.status === "delivered" || order.status === "completed" ? order.created_at : undefined,
                    }}
                    clientName="Your Order"
                    eventDate={order.event_date}
                    orderNumber={order.id}
                    userRole={UserRole.CLIENT}
                  />
                ))}
              </div>
            </div>
          )}

          {pastOrders.length > 0 && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Past Events</h2>
                <p className="text-gray-600">View your completed orders</p>
              </div>
              <div className="space-y-4">
                {pastOrders.map((order) => (
                  <Card key={order.id} className="border-2 hover:shadow-lg transition-shadow opacity-75">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-900">Order #{order.id}</h3>
                            <Badge className="bg-gray-600 text-white">Completed</Badge>
                          </div>
                          <p className="text-sm text-gray-600">
                            {order.venue_address} • {new Date(order.event_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => router.push(`/tracking/client?orderId=${order.id}`)}>
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {orders.length === 0 && (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-xl font-semibold text-gray-900 mb-2">No orders yet</p>
                <p className="text-gray-600 mb-6">Start by requesting a quote for your event</p>
                <Button onClick={() => router.push("/quotes/new")} className="bg-gradient-to-r from-purple-600 to-pink-600">
                  Request Quote
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </>
  );
}

export default function ClientMyOrdersPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT]}>
      <MyOrdersPage />
    </ProtectedRoute>
  );
}
