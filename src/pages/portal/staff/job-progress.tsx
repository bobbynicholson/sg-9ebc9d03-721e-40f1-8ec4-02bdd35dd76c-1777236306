import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JobProgressTracker } from "@/components/JobProgressTracker";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Order } from "@/types";
import { Search, Calendar, Filter, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function StaffJobProgressPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Create comprehensive dummy orders for Bob's Catering with correct statuses
    const dummyOrders: Order[] = [
      {
        id: "ORD-001",
        quoteId: "Q-001",
        client: "Sarah Johnson",
        clientName: "Sarah Johnson",
        eventDate: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        venue: "Grand Palace Hotel",
        location: "123 Main St, Cape Town",
        eventLocation: "123 Main St, Cape Town",
        guestCount: 150,
        menuItems: [],
        equipmentItems: [],
        status: "confirmed",
        kitchenInstructions: "",
        total: 38700,
        totalAmount: 38700,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        depositPaid: true,
        balancePaid: true,
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
        status: "preparing",
        total: 28000,
        totalAmount: 28000,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        depositPaid: true,
        balancePaid: true,
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
        depositPaid: true,
        balancePaid: true,
      },
      {
        id: "ORD-004",
        quoteId: "Q-004",
        client: "David Wilson",
        clientName: "David Wilson",
        eventDate: new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0],
        venue: "Garden Estate",
        location: "90 Valley Road, Franschhoek",
        eventLocation: "90 Valley Road, Franschhoek",
        guestCount: 120,
        menuItems: [],
        equipmentItems: [],
        kitchenInstructions: "",
        status: "confirmed",
        total: 42000,
        totalAmount: 42000,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        depositPaid: true,
        balancePaid: true,
      },
      {
        id: "ORD-005",
        quoteId: "Q-005",
        client: "Linda Martinez",
        clientName: "Linda Martinez",
        eventDate: new Date(Date.now() + 86400000 * 4).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000 * 4).toISOString().split("T")[0],
        venue: "City Conference Center",
        location: "15 Main Street, Cape Town CBD",
        eventLocation: "15 Main Street, Cape Town CBD",
        guestCount: 300,
        menuItems: [],
        equipmentItems: [],
        kitchenInstructions: "",
        status: "preparing",
        total: 78000,
        totalAmount: 78000,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        depositPaid: true,
        balancePaid: true,
      },
      {
        id: "ORD-006",
        quoteId: "Q-006",
        client: "John Smith",
        clientName: "John Smith",
        eventDate: new Date(Date.now() + 86400000 * 6).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000 * 6).toISOString().split("T")[0],
        venue: "Riverside Restaurant",
        location: "55 River Road, Paarl",
        eventLocation: "55 River Road, Paarl",
        guestCount: 65,
        menuItems: [],
        equipmentItems: [],
        kitchenInstructions: "",
        status: "confirmed",
        total: 18500,
        totalAmount: 18500,
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        depositPaid: true,
        balancePaid: true,
      },
      {
        id: "ORD-007",
        quoteId: "Q-007",
        client: "Amanda Roberts",
        clientName: "Amanda Roberts",
        eventDate: new Date(Date.now() + 86400000 * 8).toISOString().split("T")[0],
        date: new Date(Date.now() + 86400000 * 8).toISOString().split("T")[0],
        venue: "Corporate Towers",
        location: "88 Business Park, Century City",
        eventLocation: "88 Business Park, Century City",
        guestCount: 180,
        menuItems: [],
        equipmentItems: [],
        kitchenInstructions: "",
        status: "ready",
        total: 45000,
        totalAmount: 45000,
        createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
        depositPaid: true,
        balancePaid: true,
      },
    ];

    console.log("Setting dummy orders:", dummyOrders);
    console.log("Order statuses:", dummyOrders.map(o => ({ id: o.id, status: o.status })));
    
    // Ensure orders are set and persisted
    setOrders(dummyOrders);
    localStorage.setItem("bobs_catering_staff_orders", JSON.stringify(dummyOrders));
    setLoading(false);
  }, []);

  // Calculate status counts - MOVED INSIDE useMemo to ensure it recalculates when orders change
  const statusCounts = {
    all: orders.length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  console.log("Calculated status counts:", statusCounts);

  const filteredOrders = orders
    .filter((order) => {
      const matchesSearch =
        order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.venue.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter = filterStatus === "all" || order.status === filterStatus;

      return matchesSearch && matchesFilter;
    })
    .slice(0, itemsPerPage);

  if (loading) {
    return (
      <>
        <Head>
          <title>My Jobs | Bob's Catering Staff Portal</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <NoIndexMeta />

        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
          <Header />
          <main className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading Bob's Catering orders...</p>
              </div>
            </div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>My Jobs | Bob's Catering Staff Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">My Active Jobs</h1>
                <p className="text-gray-600">
                  Track all confirmed jobs from payment to completion
                </p>
                <Badge className="mt-2 bg-purple-100 text-purple-700 border-purple-200">
                  🍽️ Bob's Catering - Demo Staff Portal
                </Badge>
              </div>
              <Button onClick={() => router.push("/calendar")} className="bg-gradient-to-r from-blue-600 to-indigo-600">
                <Calendar className="w-4 h-4 mr-2" />
                View Calendar
              </Button>
            </div>

            {/* Statistics Cards - Display counts correctly */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">All Jobs</p>
                      <p className="text-3xl font-bold text-gray-900">{statusCounts.all}</p>
                      <p className="text-xs text-gray-500 mt-1">Total active orders</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Confirmed</p>
                      <p className="text-3xl font-bold text-gray-900">{statusCounts.confirmed}</p>
                      <p className="text-xs text-gray-500 mt-1">Paid & confirmed</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">In Kitchen</p>
                      <p className="text-3xl font-bold text-gray-900">{statusCounts.preparing}</p>
                      <p className="text-xs text-gray-500 mt-1">Being prepared</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Ready</p>
                      <p className="text-3xl font-bold text-gray-900">{statusCounts.ready}</p>
                      <p className="text-xs text-gray-500 mt-1">Ready for delivery</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="mb-6 border-2">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    placeholder="Search by client name, venue, or order ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={filterStatus === "all" ? "default" : "outline"}
                    onClick={() => setFilterStatus("all")}
                    size="sm"
                  >
                    All
                  </Button>
                  <Button
                    variant={filterStatus === "confirmed" ? "default" : "outline"}
                    onClick={() => setFilterStatus("confirmed")}
                    size="sm"
                  >
                    Confirmed
                  </Button>
                  <Button
                    variant={filterStatus === "preparing" ? "default" : "outline"}
                    onClick={() => setFilterStatus("preparing")}
                    size="sm"
                  >
                    Kitchen
                  </Button>
                  <Button
                    variant={filterStatus === "ready" ? "default" : "outline"}
                    onClick={() => setFilterStatus("ready")}
                    size="sm"
                  >
                    Ready
                  </Button>
                </div>

                <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Show" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Show 5</SelectItem>
                    <SelectItem value="10">Show 10</SelectItem>
                    <SelectItem value="15">Show 15</SelectItem>
                    <SelectItem value="30">Show 30</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Filter className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-900 mb-2">No jobs found</p>
                  <p className="text-gray-600">Try adjusting your search or filter criteria</p>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order) => (
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
                    equipment_returned: order.status === "completed" ? order.createdAt : undefined,
                  }}
                  clientName={order.clientName}
                  eventDate={order.eventDate}
                  orderNumber={order.id}
                  userRole="staff"
                />
              ))
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
