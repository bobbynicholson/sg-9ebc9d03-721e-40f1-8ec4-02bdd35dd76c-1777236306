
import { useState, useEffect } from "react";
import Link from "next/link";
import Head from "next/head";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orderService } from "@/services/orderService";
import { format } from "date-fns";
import type { AppOrder } from "@/types/app";
import { Eye, Calendar, Users, MapPin } from "lucide-react";

export default function MyOrders() {
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await orderService.getAllOrders();
      setOrders(data || []);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-500",
      confirmed: "bg-blue-500",
      preparing: "bg-purple-500",
      ready: "bg-green-500",
      delivered: "bg-gray-500",
      completed: "bg-green-700",
      cancelled: "bg-red-500",
    };
    return colors[status] || "bg-gray-400";
  };

  return (
    <>
      <Head>
        <title>My Orders - Client Portal</title>
      </Head>

      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header />

        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">My Orders</h1>
            <p className="text-gray-600 dark:text-gray-400">
              View and track all your catering orders
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p>Loading your orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  You don't have any orders yet
                </p>
                <Button asChild>
                  <Link href="/quotes/new">Create Your First Order</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {orders.map((order) => (
                <Card key={order.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl">
                          {order.clientName}
                        </CardTitle>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Order #{order.id.slice(0, 8)}
                        </p>
                      </div>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span>
                          {order.eventDate &&
                            format(new Date(order.eventDate), "MMM dd, yyyy")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span>{order.guestCount} guests</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span>{order.venue}</span>
                      </div>
                      <div className="text-sm font-semibold">
                        R{order.totalAmount?.toFixed(2) || "0.00"}
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orders?id=${order.id}`}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>

        <Footer />
      </div>
    </>
  );
}
