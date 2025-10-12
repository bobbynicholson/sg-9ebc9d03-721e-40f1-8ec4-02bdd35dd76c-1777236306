import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { JobProgressTracker } from "@/components/JobProgressTracker";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Order } from "@/types";
import { 
  Search, 
  Calendar, 
  Filter,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function JobProgressOverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
        menuItems: [],
        equipmentItems: [],
        status: "preparing",
        kitchenInstructions: "",
        total: 38700,
        totalAmount: 38700,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: "ORD-002",
        quoteId: "Q-002",
        client: "Michael Chen",
        clientName: "Michael Chen",
        eventDate: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
        venue: "Beach Club Venue",
        location: "45 Beach Road, Cape Town",
        eventLocation: "45 Beach Road, Cape Town",
        guestCount: 80,
        menuItems: [],
        equipmentItems: [],
        kitchenInstructions: "",
        status: "confirmed",
        total: 28000,
        totalAmount: 28000,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: "ORD-003",
        quoteId: "Q-003",
        client: "Emma Thompson",
        clientName: "Emma Thompson",
        eventDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        venue: "Mountain View Lodge",
        location: "78 Hill Road, Stellenbosch",
        eventLocation: "78 Hill Road, Stellenbosch",
        guestCount: 200,
        menuItems: [],
        equipmentItems: [],
        kitchenInstructions: "",
        status: "ready",
        total: 52000,
        totalAmount: 52000,
        createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      },
    ];

    const stored = localStorage.getItem("admin_orders");
    setOrders(stored ? JSON.parse(stored) : mockOrders);
  }, []);

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.venue.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === "all" || order.status === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const getStatusCounts = () => {
    return {
      all: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
      preparing: orders.filter((o) => o.status === "preparing").length,
      ready: orders.filter((o) => o.status === "ready").length,
      delivered: orders.filter((o) => o.status === "delivered").length,
    };
  };

  const statusCounts = getStatusCounts();

  return (
    <>
      <Head>
        <title>Job Progress Overview | CateringMS Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header />

        <main className="container mx-auto px-4 py-8">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Job Progress Overview
                </h1>
                <p className="text-gray-600">
                  Monitor all active jobs and their current status in real-time
                </p>
              </div>
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                <Calendar className="w-4 h-4 mr-2" />
                View Calendar
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "All Jobs", count: statusCounts.all, icon: TrendingUp, color: "blue" },
                { label: "Pending", count: statusCounts.pending, icon: Clock, color: "yellow" },
                { label: "Confirmed", count: statusCounts.confirmed, icon: CheckCircle2, color: "green" },
                { label: "In Kitchen", count: statusCounts.preparing, icon: AlertCircle, color: "purple" },
                { label: "Ready", count: statusCounts.ready, icon: CheckCircle2, color: "emerald" },
              ].map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <Card key={index} className="border-2 hover:shadow-lg transition-shadow cursor-pointer">
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

          {/* Search and Filter */}
          <Card className="mb-6 border-2">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    placeholder="Search by client name, venue, or order ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={filterStatus === "all" ? "default" : "outline"}
                    onClick={() => setFilterStatus("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={filterStatus === "confirmed" ? "default" : "outline"}
                    onClick={() => setFilterStatus("confirmed")}
                  >
                    Confirmed
                  </Button>
                  <Button
                    variant={filterStatus === "preparing" ? "default" : "outline"}
                    onClick={() => setFilterStatus("preparing")}
                  >
                    Kitchen
                  </Button>
                  <Button
                    variant={filterStatus === "ready" ? "default" : "outline"}
                    onClick={() => setFilterStatus("ready")}
                  >
                    Ready
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Job Progress Trackers */}
          <div className="space-y-6">
            {filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Filter className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-900 mb-2">No jobs found</p>
                  <p className="text-gray-600">
                    Try adjusting your search or filter criteria
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id}>
                  <JobProgressTracker
                    currentStatus={order.status}
                    orderData={{
                      quote_sent: order.createdAt,
                      quote_accepted: order.status !== "pending" ? order.createdAt : undefined,
                      payment_confirmed: ["confirmed", "preparing", "ready", "delivered", "completed"].includes(
                        order.status
                      )
                        ? order.createdAt
                        : undefined,
                      kitchen_assigned: ["preparing", "ready", "delivered", "completed"].includes(order.status)
                        ? order.createdAt
                        : undefined,
                      driver_assigned: ["ready", "delivered", "completed"].includes(order.status)
                        ? order.createdAt
                        : undefined,
                      in_transit: ["delivered", "completed"].includes(order.status) ? order.createdAt : undefined,
                      delivered: order.status === "delivered" || order.status === "completed" ? order.createdAt : undefined,
                      equipment_returned: order.status === "completed" ? order.createdAt : undefined,
                    }}
                    clientName={order.clientName}
                    eventDate={order.eventDate}
                    orderNumber={order.id}
                  />
                </div>
              ))
            )}
          </div>

          {/* Quick Actions */}
          <Card className="mt-8 border-2 bg-gradient-to-r from-purple-50 to-pink-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <Button variant="outline" className="justify-start h-auto py-4">
                  <div className="text-left">
                    <p className="font-semibold">Update Job Status</p>
                    <p className="text-sm text-gray-600">Move jobs to next stage</p>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-4">
                  <div className="text-left">
                    <p className="font-semibold">Assign Drivers</p>
                    <p className="text-sm text-gray-600">Schedule deliveries</p>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-4">
                  <div className="text-left">
                    <p className="font-semibold">View Reports</p>
                    <p className="text-sm text-gray-600">Analyze performance</p>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>

        <Footer />
      </div>
    </>
  );
}
