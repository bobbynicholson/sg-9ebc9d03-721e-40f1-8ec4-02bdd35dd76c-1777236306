import { useState, useEffect, useMemo, useCallback } from "react";
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
  Target,
  List,
  MapPin,
  Building2
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useToast } from "@/hooks/use-toast";
import { calculateUrgencyScore, getUrgencyColorClasses, getUrgencyEmoji, sortByUrgency, UrgencyScore } from "@/lib/urgencyScoring";
import { orderService } from "@/services/orderService";
import { regionService, Region } from "@/services/regionService";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";

interface PriorityTask {
  orderId: string;
  clientName: string;
  task: string;
  urgency: "high" | "medium";
  daysUntilEvent: number;
}

export default function JobProgressOverviewPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [whatsNextMode, setWhatsNextMode] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"date" | "urgency">("date");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login?message=login_required");
    }
  }, [user, authLoading, router]);

  const loadRegions = useCallback(async () => {
    try {
      if (!user?.id) return;
      
      const fetchedRegions = await regionService.getRegions(user.id);
      const activeRegions = fetchedRegions.filter((r) => r.is_active);
      
      // Add "All Regions" option at the beginning
      setRegions([
        { id: "all", name: "All Regions", province: "ALL", is_active: true, address: "", city: "", country: "", created_at: "", email: "", is_primary: false, phone: "", updated_at: "", user_id: "" },
        ...activeRegions
      ]);
    } catch (error) {
      console.error("Error loading regions:", error);
      toast({
        title: "Error",
        description: "Failed to load regions",
        variant: "destructive",
      });
    }
  }, [user?.id, toast]);

  const loadOrders = useCallback(async () => {
    try {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      const fetchedOrders = await orderService.getAllOrders(user.id);
      setOrders(fetchedOrders);
    } catch (error) {
      console.error("Error loading orders:", error);
      setError("Failed to load orders. Please try refreshing the page.");
      toast({
        title: "Error",
        description: "Failed to load orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    if (user && !authLoading) {
      setLoading(true);
      loadRegions();
      loadOrders();
    }
  }, [user, authLoading, loadRegions, loadOrders]);

  const handleOverrideComplete = async (orderId: string) => {
    try {
      await orderService.updateOrderStatus({
        orderId,
        newStatus: "completed",
        notes: "Manually marked complete by admin"
      });

      await loadOrders();

      toast({
        title: "Order Marked Complete",
        description: `Order ${orderId} has been manually marked as complete.`,
        duration: 3000,
      });
    } catch (error) {
      console.error("Error marking order complete:", error);
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    }
  };

  const calculatePriorityTasks = (): PriorityTask[] => {
    const tasks: PriorityTask[] = [];

    orders.forEach((order) => {
      const eventDate = new Date(order.event_date);
      const today = new Date();
      const daysUntilEvent = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (order.status === "pending_deposit" && daysUntilEvent <= 3) {
        tasks.push({
          orderId: order.id,
          clientName: order.client_name,
          task: "Follow up payment (overdue)",
          urgency: "high",
          daysUntilEvent,
        });
      }

      if (order.status === "confirmed" && daysUntilEvent <= 2) {
        tasks.push({
          orderId: order.id,
          clientName: order.client_name,
          task: "Assign to kitchen urgently",
          urgency: "high",
          daysUntilEvent,
        });
      }

      if (order.status === "preparing" && daysUntilEvent <= 1) {
        tasks.push({
          orderId: order.id,
          clientName: order.client_name,
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
    const eventDate = new Date(order.event_date);
    const today = new Date();
    const daysUntilEvent = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (order.status === "pending_deposit" && daysUntilEvent <= 7) return true;
    if (order.status === "confirmed" && daysUntilEvent <= 3) return true;
    if (order.status === "preparing" && daysUntilEvent <= 1) return true;

    return false;
  };

  const isPriorityOrder = (orderId: string): boolean => {
    return priorityTasks.some((task) => task.orderId === orderId);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
        const matchesSearch =
            order.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.venue_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.id.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesFilter = filterStatus === "all" || order.status === filterStatus;

        const matchesRegion = selectedRegion === "all" ||
            order.region_id === selectedRegion;

        return matchesSearch && matchesFilter && matchesRegion;
    });
  }, [orders, searchTerm, filterStatus, selectedRegion]);

  const calculateOrderUrgency = (order: AppOrder): UrgencyScore => {
    const eventDate = new Date(order.event_date);
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
      guestCount: order.guest_count,
      equipmentShortage: false,
      driverAvailable: true,
      kitchenCapacityPercent: 65,
      isVIPClient: order.guest_count >= 200,
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
    // Filter by selected region first
    const regionFilteredOrders = selectedRegion === "all" 
      ? orders 
      : orders.filter(o => o.region_id === selectedRegion);

    return {
      all: regionFilteredOrders.length,
      pending: regionFilteredOrders.filter((o) => o.status === "pending").length,
      confirmed: regionFilteredOrders.filter((o) => o.status === "confirmed").length,
      preparing: regionFilteredOrders.filter((o) => o.status === "preparing").length,
      ready: regionFilteredOrders.filter((o) => o.status === "ready").length,
      delivered: regionFilteredOrders.filter((o) => o.status === "delivered").length,
    };
  };

  const statusCounts = getStatusCounts();

  const getSelectedRegionName = () => {
    const region = regions.find(r => r.id === selectedRegion);
    return region?.name || "All Regions";
  };

  if (loading) {
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
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading job progress...</p>
                <p className="text-sm text-gray-500 mt-2">This should only take a moment</p>
              </div>
            </div>
          </main>
        </div>
      </>
    );
  }

  if (error) {
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
            <Card className="border-2 border-red-200 bg-red-50">
              <CardContent className="pt-12 pb-12 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <p className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Job Progress</p>
                <p className="text-gray-600 mb-4">{error}</p>
                <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700">
                  Refresh Page
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Job Progress Overview | CateringMS Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <NoIndexMeta />

      <AdminNav />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 lg:ml-64 xl:ml-72">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Job Progress Overview
                </h1>
                <p className="text-gray-600 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Viewing: <span className="font-semibold">{getSelectedRegionName()}</span>
                </p>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <Select
                  value={selectedRegion}
                  onValueChange={(value) => setSelectedRegion(value)}
                >
                  <SelectTrigger className="w-[220px] border-2 border-blue-200 bg-white">
                    <Building2 className="w-4 h-4 mr-2 text-blue-600" />
                    <SelectValue placeholder="Select Region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem 
                        key={region.id} 
                        value={region.id}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-500" />
                          <span>{region.name}</span>
                          {region.province !== "ALL" && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {region.province}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <Target className="w-4 h-4 mr-1" />
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
                    {selectedRegion !== "all" 
                      ? `No jobs found in ${getSelectedRegionName()}`
                      : "Try adjusting your search or filter criteria"
                    }
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
                                {order.client_name} - Order #{order.id}
                              </h3>
                              <p className="text-sm text-gray-600">
                                {order.venue_address} • {new Date(order.event_date).toLocaleDateString()}
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

                        <JobProgressTracker
                          currentStatus={order.status}
                          orderData={{
                            quote_sent: order.created_at,
                            quote_accepted: order.status !== "pending_deposit" ? order.created_at : undefined,
                            payment_confirmed: ["confirmed", "preparing", "ready", "delivered", "completed"].includes(
                              order.status
                            )
                              ? order.created_at
                              : undefined,
                            kitchen_assigned: ["preparing", "ready", "delivered", "completed"].includes(order.status)
                              ? order.created_at
                              : undefined,
                            driver_assigned: ["ready", "delivered", "completed"].includes(order.status)
                              ? order.created_at
                              : undefined,
                            in_transit: ["in_transit", "delivered", "completed"].includes(order.status) ? order.created_at : undefined,
                            delivered: order.status === "delivered" || order.status === "completed" ? order.created_at : undefined,
                            equipment_returned: order.status === "completed" ? order.created_at : undefined,
                          }}
                          clientName={order.client_name}
                          eventDate={order.event_date}
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
