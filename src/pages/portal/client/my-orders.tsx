import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobProgressTracker } from "@/components/JobProgressTracker";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AppOrder } from "@/types";
import { Calendar, Package, Clock } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function ClientMyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<AppOrder[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("admin_orders");
    if (stored) {
      const allOrders: AppOrder[] = JSON.parse(stored);
      setOrders(allOrders.filter((o) => o.status !== "pending"));
    }
  }, []);

  const upcomingOrders = orders.filter((o) => new Date(o.eventDate) >= new Date());
  const pastOrders = orders.filter((o) => new Date(o.eventDate) < new Date());

  return (
    <>
      <Head>
        <title>My Orders | Client Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header />

        <main className="container mx-auto px-4 py-8">
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
                      payment_confirmed: order.createdAt,
                      kitchen_assigned: ["preparing", "ready", "delivered", "completed"].includes(order.status)
                        ? order.createdAt
                        : undefined,
                      driver_assigned: ["ready", "delivered", "completed"].includes(order.status)
                        ? order.createdAt
                        : undefined,
                      in_transit: ["delivered", "completed"].includes(order.status) ? order.createdAt : undefined,
                      delivered: order.status === "delivered" || order.status === "completed" ? order.createdAt : undefined,
                    }}
                    clientName="Your Order"
                    eventDate={order.eventDate}
                    orderNumber={order.id}
                    userRole="client"
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
                            {order.venue} • {new Date(order.eventDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => router.push(`/tracking/client?order=${order.id}`)}>
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

        <Footer />
      </div>
    </>
  );
}
