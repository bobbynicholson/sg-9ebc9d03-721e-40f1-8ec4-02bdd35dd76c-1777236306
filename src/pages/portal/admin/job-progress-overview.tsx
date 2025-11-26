
import { useState, useEffect } from "react";
import Head from "next/head";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { JobProgressTracker } from "@/components/JobProgressTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orderService } from "@/services/orderService";
import { format } from "date-fns";
import Link from "next/link";
import type { AppOrder } from "@/types";

export default function JobProgressOverview() {
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AppOrder | null>(null);
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

  const activeOrders = orders.filter(
    (o) => !["completed", "cancelled"].includes(o.status)
  );

  return (
    <>
      <Head>
        <title>Job Progress Overview - Admin Portal</title>
      </Head>

      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header />

        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Job Progress Overview</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Monitor all active jobs and their progress in real-time
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Active Jobs ({activeOrders.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
                  {loading ? (
                    <p className="text-center py-4">Loading jobs...</p>
                  ) : activeOrders.length === 0 ? (
                    <p className="text-center py-4 text-gray-500">
                      No active jobs
                    </p>
                  ) : (
                    activeOrders.map((order) => (
                      <div
                        key={order.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                          selectedOrder?.id === order.id
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                            : "border-gray-200 dark:border-gray-700"
                        }`}
                        onClick={() => setSelectedOrder(order)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-semibold">{order.clientName}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {order.venue}
                            </p>
                          </div>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {order.eventDate &&
                            format(new Date(order.eventDate), "MMM dd, yyyy")}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {order.guestCount} guests
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              {selectedOrder ? (
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-2xl">
                          {selectedOrder.clientName}
                        </CardTitle>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                          {selectedOrder.venue}
                        </p>
                      </div>
                      <Badge className={getStatusColor(selectedOrder.status)}>
                        {selectedOrder.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-semibold">Event Date:</span>{" "}
                        {selectedOrder.eventDate &&
                          format(
                            new Date(selectedOrder.eventDate),
                            "MMMM dd, yyyy"
                          )}
                      </div>
                      <div>
                        <span className="font-semibold">Guest Count:</span>{" "}
                        {selectedOrder.guestCount}
                      </div>
                      <div>
                        <span className="font-semibold">Total Amount:</span> R
                        {selectedOrder.totalAmount?.toFixed(2) || "0.00"}
                      </div>
                      <div>
                        <span className="font-semibold">Order ID:</span>{" "}
                        {selectedOrder.id.slice(0, 8)}
                      </div>
                    </div>

                    <JobProgressTracker orderId={selectedOrder.id} />

                    <div className="mt-6 flex gap-3">
                      <Button asChild>
                        <Link href={`/orders?id=${selectedOrder.id}`}>
                          View Full Order
                        </Link>
                      </Button>
                      <Button variant="outline" onClick={loadOrders}>
                        Refresh Status
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      <p className="text-lg mb-2">Select a job to view details</p>
                      <p className="text-sm">
                        Click on any active job from the list to see its progress
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
