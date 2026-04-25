import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  Navigation,
  TrendingUp,
  DollarSign,
  Sparkles,
  Bell,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { CateringDashGame } from "@/components/games/CateringDashGame";
import { ChatBot } from "@/components/ChatBot";
import Link from "next/link";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { notificationService, Notification } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Order = Tables<"orders">;
type DriverAssignment = Tables<"driver_assignments">;

interface Job {
  id: string;
  order_number: string;
  client_name: string;
  venue_address: string;
  guest_count: number;
  event_time: string;
  status: string;
  event_date: string;
  pickup_time?: string;
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showGame, setShowGame] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const driverName = user?.full_name || user?.email?.split("@")[0] || "Driver";

  // Load driver's assigned orders
  const loadDriverJobs = async () => {
    if (!user?.id || !user?.company_id) return;

    try {
      setLoading(true);

      // Get driver's assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from("driver_assignments")
        .select(`
          id,
          order_id,
          status,
          orders (
            id,
            order_number,
            client_name,
            venue_address,
            guest_count,
            event_time,
            event_date,
            status,
            pickup_time
          )
        `)
        .eq("driver_id", user.id)
        .in("status", ["assigned", "accepted", "en_route", "picked_up"])
        .order("assigned_at", { ascending: false });

      if (assignmentsError) {
        console.error("Error loading assignments:", assignmentsError);
        return;
      }

      // Also get orders directly assigned to driver
      const { data: directOrders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("driver_id", user.id)
        .eq("company_id", user.company_id)
        .in("status", ["confirmed", "prep", "ready", "out_for_delivery"])
        .order("event_date", { ascending: true });

      if (ordersError) {
        console.error("Error loading orders:", ordersError);
        return;
      }

      // Combine and deduplicate
      const assignmentJobs: Job[] = (assignments || [])
        .filter((a: any) => a.orders)
        .map((a: any) => ({
          id: a.orders.id,
          order_number: a.orders.order_number,
          client_name: a.orders.client_name,
          venue_address: a.orders.venue_address,
          guest_count: a.orders.guest_count,
          event_time: a.orders.event_time || "TBD",
          status: a.status,
          event_date: a.orders.event_date,
          pickup_time: a.orders.pickup_time,
        }));

      const directJobs: Job[] = (directOrders || []).map((o: Order) => ({
        id: o.id,
        order_number: o.order_number,
        client_name: o.client_name || "Client",
        venue_address: o.venue_address,
        guest_count: o.guest_count,
        event_time: o.event_time || "TBD",
        status: o.status || "pending",
        event_date: o.event_date,
        pickup_time: o.pickup_time,
      }));

      // Deduplicate by order ID
      const uniqueJobs = [...assignmentJobs, ...directJobs].filter(
        (job, index, self) => self.findIndex((j) => j.id === job.id) === index
      );

      setJobs(uniqueJobs);
    } catch (error) {
      console.error("Error in loadDriverJobs:", error);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!user?.id) return;

    // Load initial jobs
    loadDriverJobs();

    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribeToNotifications(
      user.id,
      (notification: Notification) => {
        console.log("🔔 Real-time notification received:", notification);

        // Show toast notification with sound
        if (notification.notification_type === "order_ready") {
          // Play notification sound
          const audio = new Audio("/notification.mp3");
          audio.play().catch((e) => console.log("Audio play failed:", e));

          // Show toast
          toast({
            title: notification.title,
            description: notification.message,
            duration: 10000,
            className: "bg-green-50 border-green-500",
          });

          // Reload jobs to show updated status
          loadDriverJobs();
        }

        // Update unread count
        notificationService.getUnreadCount(user.id, "driver").then(setUnreadCount);
      },
      "driver"
    );

    // Load initial unread count
    notificationService.getUnreadCount(user.id, "driver").then(setUnreadCount);

    return () => {
      unsubscribe();
    };
  }, [user?.id, toast]);

  // Subscribe to order updates (when status changes)
  useEffect(() => {
    if (!user?.id || !user?.company_id) return;

    const channel = supabase
      .channel("driver-orders")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `company_id=eq.${user.company_id}`,
        },
        (payload) => {
          const newOrder = payload.new as Order;
          const oldOrder = payload.old as Order;

          // If status changed to ready and this driver is assigned
          if (
            newOrder.status === "ready" &&
            oldOrder.status !== "ready" &&
            (newOrder.driver_id === user.id || newOrder.assigned_driver_id === user.id)
          ) {
            console.log("🚀 Order is ready for pickup:", newOrder.order_number);
            loadDriverJobs();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.company_id]);

  const todaysJobs = jobs.filter(
    (j) => j.event_date === new Date().toISOString().split("T")[0]
  );
  const completedToday = todaysJobs.filter((j) => j.status === "completed" || j.status === "delivered").length;
  const totalEarnings = 3850; // Mock earnings

  const openNavigation = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, "_blank");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-green-100 text-green-800 border-green-300";
      case "assigned":
      case "accepted":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "en_route":
      case "picked_up":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "delivered":
      case "completed":
        return "bg-green-100 text-green-800 border-green-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ready":
        return "🔥 Ready for Pickup";
      case "assigned":
        return "📋 Assigned";
      case "accepted":
        return "✅ Accepted";
      case "en_route":
        return "🚗 En Route";
      case "picked_up":
        return "📦 Picked Up";
      case "delivered":
        return "✅ Delivered";
      case "completed":
        return "✅ Completed";
      default:
        return status;
    }
  };

  return (
    <>
      <Head>
        <title>Driver Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.DRIVER} />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-7xl">
          {/* Header */}
          <div className="mb-4 sm:mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                  Welcome back, {driverName.split(" ")[0]}! 👋
                </h1>
                <p className="text-xs sm:text-sm md:text-base text-slate-600">
                  {loading ? "Loading your deliveries..." : `${jobs.length} active ${jobs.length === 1 ? "delivery" : "deliveries"}`}
                </p>
              </div>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-2 border-red-200 rounded-lg">
                    <Bell className="w-4 h-4 text-red-600 animate-pulse" />
                    <span className="text-sm font-semibold text-red-600">
                      {unreadCount} new {unreadCount === 1 ? "alert" : "alerts"}
                    </span>
                  </div>
                )}
                <Button
                  onClick={() => setShowGame(true)}
                  className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white h-10 sm:h-12 px-4 sm:px-6 text-sm sm:text-base"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Play Game
                </Button>
              </div>
            </div>

            {/* Today's Earnings Summary */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 mb-4 sm:mb-6">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm text-slate-600 mb-1">Today's Potential Earnings</p>
                    <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-600">
                      R{(todaysJobs.length * 250).toFixed(0)}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-2">
                      {todaysJobs.length} {todaysJobs.length === 1 ? "delivery" : "deliveries"} scheduled •{" "}
                      {completedToday} completed
                    </p>
                  </div>
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500 flex items-center justify-center mb-2 mx-auto sm:mx-0">
                      <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                    </div>
                    <p className="text-xs text-slate-600 text-center sm:text-right">Outstanding</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900 text-center sm:text-right">
                      R{totalEarnings.toFixed(0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Route Overview */}
            {todaysJobs.length > 0 && (
              <Card className="border-0 shadow-lg mb-4 sm:mb-6">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                  <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Navigation className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                      Today's Route Overview
                    </CardTitle>
                    <Link href="/team-portal/driver/routes">
                      <Button size="sm" variant="outline" className="text-xs sm:text-sm">
                        View Full Route
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <div className="space-y-2 sm:space-y-3">
                    {todaysJobs.slice(0, 3).map((job, index) => (
                      <div
                        key={job.id}
                        className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-base">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                            {job.client_name}
                          </p>
                          <p className="text-xs text-slate-600 truncate">{job.venue_address}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900">{job.event_time}</p>
                          <p className="text-xs text-slate-600">{job.guest_count} pax</p>
                        </div>
                      </div>
                    ))}
                    {todaysJobs.length > 3 && (
                      <p className="text-xs sm:text-sm text-slate-600 text-center">
                        +{todaysJobs.length - 3} more stops
                      </p>
                    )}
                  </div>
                  <Link href="/team-portal/driver/routes">
                    <Button className="w-full mt-3 sm:mt-4 text-sm sm:text-base h-10 sm:h-11">
                      <Navigation className="w-4 h-4 mr-2" />
                      View Optimized Route
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Today's Jobs</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">
                      {todaysJobs.length}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center self-end md:self-auto">
                    <Truck className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Completed</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">
                      {completedToday}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Pending</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-orange-600">
                      {todaysJobs.length - completedToday}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center self-end md:self-auto">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Earnings</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">
                      R{totalEarnings}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Deliveries List */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-4 md:px-6">
              <CardTitle className="text-base sm:text-lg md:text-xl">My Deliveries</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 md:px-6">
              <div className="space-y-2 sm:space-y-3">
                {loading ? (
                  <div className="text-center py-8 text-sm sm:text-base text-slate-600">
                    Loading deliveries...
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8 text-sm sm:text-base text-slate-600">
                    No deliveries scheduled
                  </div>
                ) : (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border-2 border-slate-200 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="font-semibold text-xs sm:text-sm md:text-base text-slate-900">
                            {job.client_name}
                          </h4>
                          <Badge className={`${getStatusColor(job.status)} text-xs border-2`}>
                            {getStatusLabel(job.status)}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs sm:text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="truncate">{job.venue_address}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span>Event: {job.event_time}</span>
                            <span>•</span>
                            <span>{job.guest_count} guests</span>
                            <span>•</span>
                            <span>Order: {job.order_number}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openNavigation(job.venue_address)}
                          className="flex-1 sm:flex-none text-xs sm:text-sm"
                        >
                          <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Navigate</span>
                        </Button>
                        {job.status === "ready" && (
                          <Button size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm bg-green-600 hover:bg-green-700">
                            Start Pickup
                          </Button>
                        )}
                        {(job.status === "assigned" || job.status === "accepted") && (
                          <Button size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                            View Details
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}

      {/* AI Chatbot */}
      <ChatBot userRole="driver" companyId={user?.company_id} />
    </>
  );
}