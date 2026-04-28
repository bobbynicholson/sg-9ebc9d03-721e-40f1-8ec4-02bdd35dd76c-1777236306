import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChefHat,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Users,
  Package,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DynamicNav } from "@/components/DynamicNav";
import { ChatBot } from "@/components/ChatBot";
import { DutyToggleWidget } from "@/components/kitchen/DutyToggleWidget";
import { OnDutyBoard } from "@/components/kitchen/OnDutyBoard";
import { TaskCompletionButtons } from "@/components/kitchen/TaskCompletionButtons";
import { UserRole } from "@/types/app";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type InventoryItem = Database["public"]["Tables"]["inventory_items"]["Row"];

export default function KitchenDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.company_id) {
      loadDashboardData();
    }
  }, [user?.company_id]);

  const loadDashboardData = async () => {
    if (!user?.company_id) return;

    try {
      setLoading(true);

      // Load orders for today and next 2 days
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 2);

      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("company_id", user.company_id)
        .gte("event_date", new Date().toISOString().split("T")[0])
        .lte("event_date", threeDaysFromNow.toISOString().split("T")[0])
        .in("status", ["confirmed", "preparing", "ready"])
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true });

      if (ordersError) {
        console.error("Error loading orders:", ordersError);
      } else {
        setOrders(ordersData || []);
      }

      // Load low stock items - compare current_stock to minimum_stock directly
      const { data: inventoryData, error: inventoryError } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("company_id", user.company_id)
        .filter("current_stock", "lt", "minimum_stock")
        .order("current_stock", { ascending: true })
        .limit(5);

      if (inventoryError) {
        console.error("Error loading inventory:", inventoryError);
      } else {
        setLowStockItems(inventoryData || []);
      }
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  };

  const todayOrders = orders.filter(
    (o) => o.event_date === new Date().toISOString().split("T")[0]
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      preparing: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      prep: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      completed: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300",
    };
    return colors[status] || colors.confirmed;
  };

  const getUrgencyLevel = (eventDate: string, eventTime: string | null) => {
    const now = new Date();
    const eventDateTime = new Date(eventDate);
    if (eventTime) {
      const [hours, minutes] = eventTime.split(":");
      eventDateTime.setHours(parseInt(hours), parseInt(minutes));
    }
    const hoursUntil = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntil < 4) return { level: "high", color: "border-red-500 bg-red-50 dark:bg-red-950" };
    if (hoursUntil < 8) return { level: "medium", color: "border-orange-500 bg-orange-50 dark:bg-orange-950" };
    return { level: "low", color: "border-green-500 bg-green-50 dark:bg-green-950" };
  };

  return (
    <>
      <Head>
        <title>Kitchen Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.KITCHEN_STAFF} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-screen-2xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
            <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <ChefHat className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Kitchen Dashboard</h1>
              <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400">Manage prep, duty shifts, and inventory</p>
            </div>
          </div>

          {/* Duty Management */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <DutyToggleWidget />
            <OnDutyBoard />
          </div>

          {/* Today's Production Priority */}
          {todayOrders.length > 0 && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-orange-50 to-red-50 dark:from-slate-800 dark:to-slate-900 mb-6 sm:mb-8">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                  Today's Production Priority
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="space-y-2 sm:space-y-3">
                  {todayOrders.slice(0, 3).map((order, index) => {
                    const urgency = getUrgencyLevel(order.event_date, order.event_time);
                    const eventTime = order.event_time || "TBC";

                    return (
                      <div key={order.id} className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border-l-4 ${urgency.color}`}>
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-base">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">{order.event_name}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">{order.guest_count} guests • {eventTime}</p>
                          </div>
                        </div>
                        <Badge className={`${getStatusColor(order.status)} text-xs flex-shrink-0 ml-2`}>{order.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      Today's Orders
                      <InfoTooltip content="Orders happening today that the kitchen is actively working on.\n\nIncludes anything confirmed, in prep, or ready to go." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{todayOrders.length}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center self-end md:self-auto">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      Total Guests
                      <InfoTooltip content="How many people you're cooking for today across all events.\n\nUse this to size your portions and prep list." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                      {todayOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0)}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center self-end md:self-auto">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      In Prep
                      <InfoTooltip content="Orders the kitchen is busy prepping right now.\n\nUpdates the moment someone ticks a task off." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {orders.filter(o => o.status === "preparing").length}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center self-end md:self-auto">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      Ready
                      <InfoTooltip content="Orders packed and waiting for the driver to collect.\n\nDrivers see these the moment you mark them ready." />
                    </p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-600 dark:text-green-400">
                      {orders.filter(o => o.status === "ready").length}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Low Stock Alerts */}
          {lowStockItems.length > 0 && (
            <Card className="border-0 shadow-lg mb-6 sm:mb-8 border-l-4 border-l-amber-500">
              <CardHeader className="px-3 sm:px-4 md:px-6 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                  Low Stock Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6">
                <div className="space-y-2">
                  {lowStockItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="font-medium text-sm text-slate-900 dark:text-white">{item.item_name}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Current: {item.current_stock} {item.unit_of_measure} | Minimum: {item.minimum_stock}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                        Low Stock
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active Orders */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-4 md:px-6">
              <CardTitle className="text-base sm:text-lg md:text-xl">Active Orders</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 md:px-6">
              {loading ? (
                <div className="text-center py-8 text-sm sm:text-base text-slate-600 dark:text-slate-400">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">No active orders - all caught up!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="border-2 border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white">
                              {order.event_name}
                            </h4>
                            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                          </div>
                          <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
                            {order.order_number}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {order.guest_count} guests
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(order.event_date).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {order.event_time || "Time TBC"}
                          </div>
                        </div>
                        {order.kitchen_instructions && (
                          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-xs">
                            <p className="font-medium text-blue-900 dark:text-blue-300 mb-1">Kitchen Instructions:</p>
                            <p className="text-blue-800 dark:text-blue-400">{order.kitchen_instructions}</p>
                          </div>
                        )}
                      </div>
                      
                      {/* Task Completion Buttons */}
                      <div className="p-4">
                        <TaskCompletionButtons 
                          orderId={order.id}
                          orderNumber={order.order_number}
                          clientName={order.client_name || order.event_name}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {/* AI Chatbot */}
      <ChatBot userRole="kitchen" companyId={user?.company_id} />
    </>
  );
}