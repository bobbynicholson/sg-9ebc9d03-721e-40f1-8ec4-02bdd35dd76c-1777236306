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
import { AppOrder } from "@/types";
import { Search, Calendar, Filter, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function StaffJobProgressPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Create comprehensive dummy orders for Bob's Catering with correct statuses
    const dummyOrders: AppOrder[] = [
      {
        id: "ORD-001",
        quote_id: "Q-001",
        client_name: "Sarah Johnson",
        event_date: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        venue_address: "Grand Palace Hotel",
        guest_count: 150,
        menu_items: [],
        equipment_items: [],
        status: "confirmed",
        kitchen_instructions: "Nut allergy alert.",
        total: 38700,
        total_amount: 38700,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        deposit_paid: true,
        balance_paid: true,
      },
      {
        id: "ORD-002",
        quote_id: "Q-002",
        client_name: "Michael Chen",
        event_date: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
        venue_address: "Beach Club Venue",
        guest_count: 80,
        menu_items: [],
        equipment_items: [],
        kitchen_instructions: "VIP client.",
        status: "preparing",
        total: 28000,
        total_amount: 28000,
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        deposit_paid: true,
        balance_paid: true,
      },
      {
        id: "ORD-003",
        quote_id: "Q-003",
        client_name: "Emma Thompson",
        event_date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        venue_address: "Mountain View Lodge",
        guest_count: 200,
        menu_items: [],
        equipment_items: [],
        kitchen_instructions: "",
        status: "ready",
        total: 52000,
        total_amount: 52000,
        created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
        deposit_paid: true,
        balance_paid: true,
      },
      {
        id: "ORD-004",
        quote_id: "Q-004",
        client_name: "David Wilson",
        event_date: new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0],
        venue_address: "Garden Estate",
        guest_count: 120,
        menu_items: [],
        equipment_items: [],
        kitchen_instructions: "",
        status: "confirmed",
        total: 42000,
        total_amount: 42000,
        created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
        deposit_paid: true,
        balance_paid: true,
      },
      {
        id: "ORD-005",
        quote_id: "Q-005",
        client_name: "Linda Martinez",
        event_date: new Date(Date.now() + 86400000 * 4).toISOString().split("T")[0],
        venue_address: "City Conference Center",
        guest_count: 300,
        menu_items: [],
        equipment_items: [],
        kitchen_instructions: "",
        status: "preparing",
        total: 78000,
        total_amount: 78000,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        deposit_paid: true,
        balance_paid: true,
      },
      {
        id: "ORD-006",
        quote_id: "Q-006",
        client_name: "John Smith",
        event_date: new Date(Date.now() + 86400000 * 6).toISOString().split("T")[0],
        venue_address: "Riverside Restaurant",
        guest_count: 65,
        menu_items: [],
        equipment_items: [],
        kitchen_instructions: "",
        status: "confirmed",
        total: 18500,
        total_amount: 18500,
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        deposit_paid: true,
        balance_paid: true,
      },
      {
        id: "ORD-007",
        quote_id: "Q-007",
        client_name: "Amanda Roberts",
        event_date: new Date(Date.now() + 86400000 * 8).toISOString().split("T")[0],
        venue_address: "Corporate Towers",
        guest_count: 180,
        menu_items: [],
        equipment_items: [],
        kitchen_instructions: "",
        status: "ready",
        total: 45000,
        total_amount: 45000,
        created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
        deposit_paid: true,
        balance_paid: true,
      },
    ];

    console.log("🍽️ Bob's Catering - Setting dummy orders:", dummyOrders.length);
    console.log("📊 Order statuses:", dummyOrders.map(o => ({ id: o.id, status: o.status })));
    
    // Set orders state
    setOrders(dummyOrders);
    
    // Persist to localStorage for consistency
    localStorage.setItem("bobs_catering_staff_orders", JSON.stringify(dummyOrders));
    
    // Calculate and log counts immediately
    const counts = {
      all: dummyOrders.length,
      confirmed: dummyOrders.filter((o) => o.status === "confirmed").length,
      preparing: dummyOrders.filter((o) => o.status === "preparing").length,
      ready: dummyOrders.filter((o) => o.status === "ready").length,
      delivered: dummyOrders.filter((o) => o.status === "delivered").length,
    };
    
    console.log("✅ Calculated status counts:", counts);
    console.log("✅ All:", counts.all, "| Confirmed:", counts.confirmed, "| Preparing:", counts.preparing, "| Ready:", counts.ready);
    
    setLoading(false);
  }, []);

  // Calculate status counts reactively based on orders state
  const statusCounts = {
    all: orders.length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  const filteredOrders = orders
    .filter((order) => {
      const matchesSearch =
        order.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.venue_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                    payment_confirmed: order.created_at,
                    kitchen_assigned: ["preparing", "ready", "delivered", "completed"].includes(order.status)
                      ? order.created_at
                      : undefined,
                    driver_assigned: ["ready", "delivered", "completed"].includes(order.status)
                      ? order.created_at
                      : undefined,
                    in_transit: ["delivered", "completed"].includes(order.status) ? order.created_at : undefined,
                    delivered: order.status === "delivered" || order.status === "completed" ? order.created_at : undefined,
                    equipment_returned: order.status === "completed" ? order.created_at : undefined,
                  }}
                  clientName={order.client_name}
                  eventDate={order.event_date}
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
