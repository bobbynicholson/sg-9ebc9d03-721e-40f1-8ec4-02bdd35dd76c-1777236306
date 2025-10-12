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

  useEffect(() => {
    const stored = localStorage.getItem("admin_orders");
    if (stored) {
      const allOrders: Order[] = JSON.parse(stored);
      const paidOrders = allOrders.filter((order) =>
        ["confirmed", "preparing", "ready", "delivered", "completed"].includes(order.status)
      );
      setOrders(paidOrders);
    }
  }, []);

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

  const getStatusCounts = () => {
    return {
      all: orders.length,
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
        <title>My Jobs | Staff Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">My Active Jobs</h1>
                <p className="text-gray-600">Track all confirmed jobs from payment to completion</p>
              </div>
              <Button onClick={() => router.push("/calendar")} className="bg-gradient-to-r from-blue-600 to-indigo-600">
                <Calendar className="w-4 h-4 mr-2" />
                View Calendar
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "All Jobs", count: statusCounts.all, icon: TrendingUp, color: "blue" },
                { label: "Confirmed", count: statusCounts.confirmed, icon: CheckCircle2, color: "green" },
                { label: "In Kitchen", count: statusCounts.preparing, icon: Clock, color: "purple" },
                { label: "Ready", count: statusCounts.ready, icon: CheckCircle2, color: "emerald" },
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
