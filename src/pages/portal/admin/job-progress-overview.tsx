import { useState, useEffect } from "react";
import Head from "next/head";
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
import { 
  Search, 
  Calendar, 
  Filter,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Target,
  List,
  Eye,
  CheckCircle
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useToast } from "@/hooks/use-toast";
import { calculateUrgencyScore, getUrgencyColorClasses, getUrgencyEmoji, sortByUrgency, UrgencyScore } from "@/lib/urgencyScoring";

interface PriorityTask {
  orderId: string;
  clientName: string;
  task: string;
  urgency: "high" | "medium";
  daysUntilEvent: number;
}

export default function JobProgressOverviewPage() {
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [whatsNextMode, setWhatsNextMode] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"date" | "urgency">("date");
  const { toast } = useToast();

  useEffect(() => {
    const mockOrders: AppOrder[] = [
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
        status: "pending",
        total: 52000,
        totalAmount: 52000,
        createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
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
        status: "ready",
        total: 42000,
        totalAmount: 42000,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
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
        status: "confirmed",
        total: 78000,
        totalAmount: 78000,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ];

    const stored = localStorage.getItem("admin_orders");
    setOrders(stored ? JSON.parse(stored) : mockOrders);
  }, []);

  const handleOverrideComplete = (orderId: string) => {
    const updatedOrders = orders.map((order) => {
      if (order.id === orderId) {
        const newStatus: AppOrder["status"] = "completed";
        return { ...order, status: newStatus };
      }
      return order;
    });

    setOrders(updatedOrders);
    localStorage.setItem("admin_orders", JSON.stringify(updatedOrders));

    toast({
      title: "Order Marked Complete",
      description: `Order ${orderId} has been manually marked as complete.`,
      duration: 3000,
    });
  };

  const calculatePriorityTasks = (): PriorityTask[] => {
    const tasks: PriorityTask[] = [];

    orders.forEach((order) => {
      const eventDate = new Date(order.eventDate);
      const today = new Date();
      const daysUntilEvent = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (order.status === "pending" && daysUntilEvent <= 3) {
        tasks.push({
          orderId: order.id,
          clientName: order.clientName,
          task: "Follow up payment (overdue)",
          urgency: "high",
          daysUntilEvent,
        });
      }

      if (order.status === "confirmed" && daysUntilEvent <= 2) {
        tasks.push({
          orderId: order.id,
          clientName: order.clientName,
          task: "Assign to kitchen urgently",
          urgency: "high",
          daysUntilEvent,
        });
      }

      if (order.status === "preparing" && daysUntilEvent <= 1) {
        tasks.push({
          orderId: order.id,
          clientName: order.clientName,
          task: "Assign driver immediately",
          urgency: "high",
          daysUntilEvent,
        });
      }
    });

    return tasks.sort((a, b) => {
      if (a.urgency === "high" && b.urgency === "medium") return -1;
      if (a.urgency === "medium" && b.urgency === "high") return 1;
      return a.daysUntilEvent - b.daysUntilEvent;
    }).slice(0, 3);
  };

  const priorityTasks = calculatePriorityTasks();

  const isBehindSchedule = (order: AppOrder): boolean => {
    const eventDate = new Date(order.eventDate);
    const today = new Date();
    const daysUntilEvent = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (order.status === "pending" && daysUntilEvent <= 7) return true;
    if (order.status === "confirmed" && daysUntilEvent <= 3) return true;
    if (order.status === "preparing" && daysUntilEvent <= 1) return true;

    return false;
  };

  const isPriorityOrder = (orderId: string): boolean => {
    return priorityTasks.some((task) => task.orderId === orderId);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.venue.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === "all" || order.status === filterStatus;

    return matchesSearch && matchesFilter;
  }).slice(0, itemsPerPage);

  const calculateOrderUrgency = (order: AppOrder): UrgencyScore => {
    const eventDate = new Date(order.eventDate);
    const today = new Date();
    const hoursUntilEvent = (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60);

    let paymentStatus: "none" | "deposit" | "full" = "none";
    if (order.status === "confirmed" || order.status === "preparing" || order.status === "ready") {
      paymentStatus = "deposit";
    }
    if (order.status === "delivered" || order.status === "completed") {
      paymentStatus = "full";
    }

    return calculateUrgencyScore({
      hoursUntilEvent,
      paymentStatus,
      currentStatus: order.status,
      guestCount: order.guestCount,
      equipmentShortage: false,
      driverAvailable: true,
      kitchenCapacityPercent: 65,
      isVIPClient: order.guestCount >= 200,
      hasSpecialRequirements: false,
    });
  };

  const ordersWithUrgency = filteredOrders.map((order) => ({
    ...order,
    urgencyScore: calculateOrderUrgency(order),
  }));

  const sortedOrders = sortBy === "urgency" 
    ? sortByUrgency(ordersWithUrgency)
    : ordersWithUrgency;

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
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Job Progress Overview
                </h1>
                <p className="text-gray-600">
                  Monitor all active jobs and their current status in real-time
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant={whatsNextMode ? "default" : "outline"}
                  onClick={() => setWhatsNextMode(!whatsNextMode)}
                  className={whatsNextMode ? "bg-gradient-to-r from-purple-600 to-pink-600" : ""}
                >
                  <Target className="w-4 h-4 mr-2" />
                  What's Next?
                </Button>
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  Calendar
                </Button>
              </div>
            </div>

            {whatsNextMode && priorityTasks.length > 0 && (
              <Card className="mb-6 border-4 border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
                      <Target className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-xl">Next 3 Priority Tasks</p>
                      <p className="text-sm font-normal text-gray-600">
                        Focus on these urgent items to keep all jobs on track
                      </p>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {priorityTasks.map((task, index) => (
                      <div
                        key={task.orderId}
                        className={`p-4 rounded-lg border-2 ${
                          task.urgency === "high"
                            ? "bg-orange-50 border-orange-500"
                            : "bg-yellow-50 border-yellow-500"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                task.urgency === "high"
                                  ? "bg-orange-600 text-white"
                                  : "bg-yellow-600 text-white"
                              } font-bold`}
                            >
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">
                                Order #{task.orderId} - {task.clientName}
                              </p>
                              <p className="text-sm text-gray-700 mt-1">{task.task}</p>
                            </div>
                          </div>
                          <Badge
                            className={
                              task.urgency === "high"
                                ? "bg-orange-600 text-white"
                                : "bg-yellow-600 text-white"
                            }
                          >
                            {task.daysUntilEvent === 0
                              ? "Today!"
                              : task.daysUntilEvent === 1
                              ? "Tomorrow"
                              : `${task.daysUntilEvent} days`}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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
                    variant={sortBy === "date" ? "default" : "outline"}
                    onClick={() => setSortBy("date")}
                    size="sm"
                  >
                    <Calendar className="w-4 h-4 mr-1" />
                    By Date
                  </Button>
                  <Button
                    variant={sortBy === "urgency" ? "default" : "outline"}
                    onClick={() => setSortBy("urgency")}
                    size="sm"
                    className={sortBy === "urgency" ? "bg-orange-600 hover:bg-orange-700" : ""}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    By Urgency
                  </Button>
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
                    variant={filterStatus === "pending" ? "default" : "outline"}
                    onClick={() => setFilterStatus("pending")}
                    size="sm"
                  >
                    Pending
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

                <div className="flex items-center gap-2">
                  <List className="w-5 h-5 text-gray-600" />
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => setItemsPerPage(parseInt(value))}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Show" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Show 5</SelectItem>
                      <SelectItem value="10">Show 10</SelectItem>
                      <SelectItem value="15">Show 15</SelectItem>
                      <SelectItem value="30">Show 30</SelectItem>
                      <SelectItem value="50">Show 50</SelectItem>
                      <SelectItem value="100">Show 100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className={`space-y-6 ${whatsNextMode ? "relative" : ""}`}>
            {sortedOrders.length === 0 ? (
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
              sortedOrders.map((order) => {
                const isPriority = whatsNextMode && isPriorityOrder(order.id);
                const isBehind = isBehindSchedule(order);
                const urgency = order.urgencyScore!;
                const colorClasses = getUrgencyColorClasses(urgency.level);

                return (
                  <div
                    key={order.id}
                    className={`transition-all duration-500 ${
                      whatsNextMode && !isPriority
                        ? "opacity-30 grayscale pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    <Card className={`border-l-4 ${colorClasses.border} ${colorClasses.bg}`}>
                      <CardHeader>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`text-3xl ${urgency.level === "critical" ? "animate-pulse" : ""}`}>
                              {getUrgencyEmoji(urgency.level)}
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">
                                {order.clientName} - Order #{order.id}
                              </h3>
                              <p className="text-sm text-gray-600">
                                {order.venue} • {new Date(order.eventDate).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={colorClasses.badge}>
                              Urgency: {urgency.total}/100
                            </Badge>
                            <Badge variant="outline">
                              {urgency.label}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Urgency Breakdown */}
                        <div className="mb-4 p-3 bg-white rounded-lg border">
                          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                            Urgency Breakdown
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                              <p className="text-gray-600">Time Pressure</p>
                              <p className="font-bold text-gray-900">{urgency.breakdown.timeScore}/40</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Payment Status</p>
                              <p className="font-bold text-gray-900">{urgency.breakdown.paymentScore}/25</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Complexity</p>
                              <p className="font-bold text-gray-900">{urgency.breakdown.complexityScore}/15</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Status Progress</p>
                              <p className="font-bold text-gray-900">{urgency.breakdown.statusScore}/20</p>
                            </div>
                          </div>
                        </div>

                        {/* Recommendations */}
                        {urgency.recommendations.length > 0 && (
                          <div className="mb-4 p-3 bg-white rounded-lg border border-blue-200">
                            <p className="text-xs font-semibold text-blue-900 mb-2 uppercase tracking-wider flex items-center gap-2">
                              <Target className="w-4 h-4" />
                              Action Items
                            </p>
                            <ul className="space-y-1">
                              {urgency.recommendations.map((rec, idx) => (
                                <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-blue-600 font-bold">•</span>
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Job Progress Tracker */}
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
                          isPriority={isPriority}
                          isBehindSchedule={isBehind}
                          userRole="admin"
                          onOverrideComplete={handleOverrideComplete}
                        />
                      </CardContent>
                    </Card>
                  </div>
                );
              })
            )}
          </div>

          {orders.length > itemsPerPage && (
            <Card className="mt-6 border-2">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <p>
                    Showing {Math.min(itemsPerPage, filteredOrders.length)} of {orders.length} total jobs
                  </p>
                  <Button variant="outline" size="sm">
                    Load More
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
