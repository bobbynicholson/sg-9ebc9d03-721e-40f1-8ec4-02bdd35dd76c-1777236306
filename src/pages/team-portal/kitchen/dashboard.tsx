import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Truck,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DynamicNav } from "@/components/DynamicNav";
import { ChatBot } from "@/components/ChatBot";
import { KitchenStaffTileBoard } from "@/components/kitchen/KitchenStaffTileBoard";
import { TaskCompletionButtons } from "@/components/kitchen/TaskCompletionButtons";
import { UserRole } from "@/types/app";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { markOrderReady } from "@/services/order/orderWorkflow";
import { useToast } from "@/hooks/use-toast";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type InventoryItem = Database["public"]["Tables"]["inventory_items"]["Row"];

function formatCountdown(mins: number): string {
  if (!isFinite(mins)) return "—";
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const minutes = Math.floor(abs % 60);
  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h ${minutes}m`;
  return `${sign}${minutes}m`;
}

export default function KitchenDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressByOrder, setProgressByOrder] = useState<Record<string, { total: number; done: number }>>({});
  const [now, setNow] = useState(new Date());
  // Allergen confirmation dialog state -- triggers when Mark Ready hits a
  // dietary clash, blocks the action until the chef explicitly overrides.
  const [allergenDialog, setAllergenDialog] = useState<{
    orderId: string;
    clientName?: string | null;
    conflicts: Array<{ menuItem: string; allergens: string[] }>;
    dietary: string;
  } | null>(null);

  // Phase 4: tomorrow + day-after preview, plus hot-hold tunable threshold.
  const [upcoming, setUpcoming] = useState<Array<{
    date: string;
    orders: number;
    guests: number;
    earliest_event_time: string | null;
    items: Array<{ id: string; event_name: string; client_name: string | null; event_time: string | null; guest_count: number; status: string }>;
  }>>([]);
  const [maxHotHoldMin, setMaxHotHoldMin] = useState(90);

  // Tick the clock every minute so countdowns stay live without polling the DB
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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

      // Phase 1: load prep task progress per order in one shot
      const orderIds = (ordersData || []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        const prog = await kitchenPrepService.getProgressByOrder(orderIds);
        setProgressByOrder(prog);
      } else {
        setProgressByOrder({});
      }

      // Phase 4: tomorrow + day-after preview and hot-hold threshold
      try {
        const preview = await kitchenPrepService.getUpcomingPreview(user.company_id, 2);
        setUpcoming(preview);
      } catch (pErr) {
        console.warn("Upcoming preview failed:", pErr);
      }
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("kitchen_settings")
          .eq("id", user.company_id)
          .single();
        const ks: any = company?.kitchen_settings || {};
        if (ks.maxHotHoldMin) setMaxHotHoldMin(Number(ks.maxHotHoldMin));
      } catch (sErr) {
        console.warn("Settings load failed:", sErr);
      }
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Mark an order ready -- one-click action with an allergen safety gate.
  // The order's dietary_requirements text is cross-checked against every
  // menu item's allergen_codes; any hits force a confirm-or-cancel dialog
  // before we let the driver be summoned.
  const handleMarkReady = async (orderId: string, clientName?: string | null) => {
    try {
      const check = await kitchenPrepService.checkOrderAllergens(orderId);
      if (check.hasConflicts) {
        setAllergenDialog({
          orderId,
          clientName,
          conflicts: check.conflicts,
          dietary: check.dietaryRequirements,
        });
        return;
      }
      await finishMarkReady(orderId, clientName, "passed");
    } catch (e: any) {
      toast({ title: "Could not mark ready", description: e?.message, variant: "destructive" });
    }
  };

  const finishMarkReady = async (
    orderId: string,
    clientName: string | null | undefined,
    checkResult: "passed" | "overridden",
  ) => {
    try {
      if (user?.id) {
        await kitchenPrepService.recordAllergenCheck(orderId, user.id, checkResult);
      }
      await markOrderReady(orderId);
      toast({
        title: "Order ready",
        description: clientName ? `${clientName} marked ready. Driver notified.` : "Driver notified.",
      });
      loadDashboardData();
    } catch (e: any) {
      toast({ title: "Could not mark ready", description: e?.message, variant: "destructive" });
    }
  };

  // Find the next pickup across active orders. Drives the headline card --
  // we keep the original event Date alongside the minutes-away so the UI can
  // format it as a real human day + time instead of a T-minus code.
  const nextPickup = useMemo(() => {
    const live = orders.filter(o => o.status === "confirmed" || o.status === "preparing");
    if (live.length === 0) return null;
    let earliest: {
      id: string;
      eventName: string;
      client: string;
      minutesAway: number;
      eventDate: Date;
      hasExplicitTime: boolean;
    } | null = null;
    for (const o of live as any[]) {
      const dt = o.event_time
        ? new Date(`${o.event_date}T${o.event_time}`)
        : new Date(`${o.event_date}T12:00`);
      if (isNaN(dt.getTime())) continue;
      const minutesAway = (dt.getTime() - now.getTime()) / 60_000;
      if (!earliest || minutesAway < earliest.minutesAway) {
        earliest = {
          id: o.id,
          eventName: o.event_name || "Event",
          client: o.client_name || "",
          minutesAway,
          eventDate: dt,
          hasExplicitTime: !!o.event_time,
        };
      }
    }
    return earliest;
  }, [orders, now]);

  // Human-friendly day label: Today / Tomorrow / weekday name / dated for
  // anything more than a week out. Plain English, no T-minus codes.
  const formatPickupWhen = (date: Date, hasTime: boolean): { dayLabel: string; timeLabel: string } => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((target.getTime() - today.getTime()) / 86400000);
    let dayLabel: string;
    if (dayDiff === 0) dayLabel = "Today";
    else if (dayDiff === 1) dayLabel = "Tomorrow";
    else if (dayDiff > 1 && dayDiff < 7) dayLabel = date.toLocaleDateString("en-ZA", { weekday: "long" });
    else dayLabel = date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
    const timeLabel = hasTime
      ? date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "time TBC";
    return { dayLabel, timeLabel };
  };

  // Plain-English distance-away phrase. "in 2 days", "in 4 hours", "in 25 min",
  // "starting now", "30 min late". No T-minus.
  const formatPickupAway = (mins: number): string => {
    if (mins < -1) {
      const m = Math.abs(Math.floor(mins));
      if (m < 60) return `${m} min late`;
      const h = Math.floor(m / 60);
      const mm = m % 60;
      if (h < 24) return mm > 0 ? `${h}h ${mm}m late` : `${h}h late`;
      const d = Math.floor(h / 24);
      return `${d} day${d === 1 ? "" : "s"} late`;
    }
    if (mins < 1) return "starting now";
    const m = Math.floor(mins);
    if (m < 60) return `in ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h} hour${h === 1 ? "" : "s"}`;
    const d = Math.floor(h / 24);
    const remH = h % 24;
    if (d < 7) return remH > 0 ? `in ${d}d ${remH}h` : `in ${d} day${d === 1 ? "" : "s"}`;
    return `in ${d} days`;
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

          {/* Phase 5C: tile board replaces the per-user Start/End Duty
              widget. One login on the tablet, one tap per staff member. */}
          <div className="mb-6 sm:mb-8">
            <KitchenStaffTileBoard />
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

          {/* Next pickup -- plain English, no T-minus codes. Tells the chef:
              when (day + 24h time), how far away in normal language, what
              event, who for, and a one-word status word so urgency is read
              at a glance instead of decoded. */}
          {nextPickup && (() => {
            const when = formatPickupWhen(nextPickup.eventDate, nextPickup.hasExplicitTime);
            const away = formatPickupAway(nextPickup.minutesAway);
            const isLate = nextPickup.minutesAway < 0;
            const isSoon = nextPickup.minutesAway >= 0 && nextPickup.minutesAway < 120;
            const statusWord =
              isLate ? "Late" :
              isSoon ? "Starts soon" :
                       "Plenty of time";
            const tone =
              isLate ? "bg-red-50 border-l-red-500" :
              isSoon ? "bg-amber-50 border-l-amber-500" :
                       "bg-emerald-50 border-l-emerald-500";
            const statusTone =
              isLate ? "bg-red-600 text-white" :
              isSoon ? "bg-amber-500 text-white" :
                       "bg-emerald-600 text-white";
            const iconTone =
              isLate ? "text-red-500" :
              isSoon ? "text-amber-500" :
                       "text-emerald-500";
            return (
              <Card className={`border-0 shadow-lg mb-4 sm:mb-6 border-l-4 ${tone}`}>
                <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-xs uppercase tracking-wide text-slate-600 font-semibold">Next pickup</p>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusTone}`}>
                        {statusWord}
                      </span>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                      {when.dayLabel} <span className="tabular-nums">{when.timeLabel}</span>
                    </p>
                    <p className="text-sm text-slate-600 mt-1 truncate">
                      <span className="font-medium text-slate-700">{nextPickup.eventName}</span>
                      {nextPickup.client && <span className="text-slate-500"> -- {nextPickup.client}</span>}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{away}</p>
                  </div>
                  <Clock className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 ${iconTone}`} />
                </CardContent>
              </Card>
            );
          })()}

          {/* Phase 4: tomorrow + day-after preview. Quiet glance card so the
              kitchen sees what's brewing before it lands as "Active orders".
              Hidden when nothing's coming up to keep the page calm. */}
          {upcoming.length > 0 && (
            <Card className="border-0 shadow-md mb-4">
              <CardHeader className="px-3 sm:px-4 md:px-6 pb-2">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-slate-700">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  What's coming up
                  <InfoTooltip content="Confirmed orders for the next two days. Not yet in the active board -- this is your prep-ahead heads-up." />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {upcoming.map((day) => {
                    const d = new Date(day.date);
                    const isTomorrow = d.toDateString() === new Date(Date.now() + 86400000).toDateString();
                    const label = isTomorrow ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
                    return (
                      <div key={day.date} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-semibold text-slate-900">{label}</div>
                          <div className="flex items-center gap-3 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" />{day.orders}</span>
                            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{day.guests}</span>
                            {day.earliest_event_time && (
                              <span className="inline-flex items-center gap-1 tabular-nums"><Clock className="w-3 h-3" />{day.earliest_event_time.slice(0, 5)}</span>
                            )}
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {day.items.slice(0, 4).map((it) => (
                            <li key={it.id} className="text-xs text-slate-600 flex items-center gap-2">
                              <span className="tabular-nums text-slate-400 w-10 shrink-0">{it.event_time?.slice(0, 5) || "--"}</span>
                              <span className="font-medium text-slate-700 truncate flex-1 min-w-0">{it.event_name || it.client_name}</span>
                              <span className="text-slate-500 tabular-nums shrink-0">{it.guest_count} pax</span>
                            </li>
                          ))}
                          {day.items.length > 4 && (
                            <li className="text-[11px] text-slate-400 italic">+ {day.items.length - 4} more</li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active orders -- kanban (Confirmed / In prep / Ready) */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-4 md:px-6">
              <CardTitle className="text-base sm:text-lg md:text-xl flex items-center gap-2">
                Active orders
                <InfoTooltip content="Three columns: Confirmed (waiting to start) → In prep (cooking now) → Ready (waiting for driver). Move cards by completing tasks. Tap Mark ready to notify the driver." />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 md:px-6">
              {loading ? (
                <div className="text-center py-8 text-sm text-slate-600">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
                  <p className="text-sm text-slate-600">No live orders. Use the breather to deep-clean or restock.</p>
                </div>
              ) : (() => {
                const byStatus: Record<string, Order[]> = {
                  confirmed: orders.filter(o => o.status === "confirmed"),
                  preparing: orders.filter(o => o.status === "preparing"),
                  ready:     orders.filter(o => o.status === "ready"),
                };
                const COLUMNS: Array<{
                  key: keyof typeof byStatus;
                  label: string;
                  empty: string;
                  tone: string;
                }> = [
                  { key: "confirmed", label: "Confirmed",  empty: "Nothing confirmed yet",     tone: "border-l-blue-400 bg-blue-50/50" },
                  { key: "preparing", label: "In prep",    empty: "No prep in flight",         tone: "border-l-amber-400 bg-amber-50/50" },
                  { key: "ready",     label: "Ready",      empty: "Nothing ready yet",         tone: "border-l-emerald-400 bg-emerald-50/50" },
                ];

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {COLUMNS.map(col => (
                      <div key={col.key} className="flex flex-col">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {col.label}
                          </p>
                          <Badge variant="outline" className="text-[10px] tabular-nums">
                            {byStatus[col.key].length}
                          </Badge>
                        </div>
                        <div className="space-y-2 min-h-[100px]">
                          {byStatus[col.key].length === 0 ? (
                            <div className="text-xs text-slate-400 italic px-2 py-3 border border-dashed border-slate-200 rounded-md text-center">
                              {col.empty}
                            </div>
                          ) : byStatus[col.key].map((order: any) => {
                            const eventDt = order.event_time
                              ? new Date(`${order.event_date}T${order.event_time}`)
                              : new Date(`${order.event_date}T12:00`);
                            const minsToEvent = isNaN(eventDt.getTime())
                              ? null
                              : (eventDt.getTime() - now.getTime()) / 60_000;
                            const tone =
                              minsToEvent != null && minsToEvent < 0     ? "border-l-red-500 bg-red-50/50" :
                              minsToEvent != null && minsToEvent < 120   ? "border-l-amber-500 bg-amber-50/50" :
                                                                            col.tone;

                            const prog = progressByOrder[order.id] || { total: 0, done: 0 };
                            const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

                            return (
                              <div
                                key={order.id}
                                className={`p-3 rounded-md border-l-4 border border-slate-200 bg-white hover:shadow transition-all ${tone}`}
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm font-semibold text-slate-900 truncate flex-1">
                                    {order.event_name || order.client_name || "Order"}
                                  </p>
                                  <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                                    {order.order_number}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="w-3 h-3" />{order.guest_count} pax
                                  </span>
                                  {minsToEvent != null && (
                                    <span className={`inline-flex items-center gap-1 tabular-nums font-medium ${
                                      minsToEvent < 0    ? "text-red-700"   :
                                      minsToEvent < 120  ? "text-amber-700" :
                                                            "text-slate-600"
                                    }`}>
                                      <Clock className="w-3 h-3" />
                                      {minsToEvent < 0
                                        ? `${formatCountdown(minsToEvent).replace("-", "")} late`
                                        : `T-${formatCountdown(minsToEvent)}`}
                                    </span>
                                  )}
                                </div>

                                {/* Task progress bar */}
                                {prog.total > 0 && (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                                      <span>Prep tasks</span>
                                      <span className="tabular-nums">{prog.done} of {prog.total}</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          pct >= 100 ? "bg-emerald-500" :
                                          pct >= 50  ? "bg-blue-500"    :
                                                       "bg-slate-400"
                                        }`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Kitchen instructions inline (compact) */}
                                {order.kitchen_instructions && (
                                  <p className="mt-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1 line-clamp-2">
                                    {order.kitchen_instructions}
                                  </p>
                                )}

                                {/* Mark ready -- one click, only when In prep */}
                                {col.key === "preparing" && (
                                  <Button
                                    size="sm"
                                    className="w-full mt-2 h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => handleMarkReady(order.id, order.client_name || order.event_name)}
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    Mark ready (notify driver)
                                  </Button>
                                )}
                                {col.key === "ready" && (() => {
                                  // Phase 4: hot-hold warning. Once a Ready
                                  // order has sat past the threshold the
                                  // chef sees a clear red bar instead of
                                  // the calm "waiting for pickup" line.
                                  const hold = kitchenPrepService.computeHoldTime(
                                    order.ready_at,
                                    order.picked_up_at,
                                    maxHotHoldMin,
                                    now,
                                  );
                                  if (!hold) {
                                    return (
                                      <p className="mt-2 text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                                        <Truck className="w-3 h-3" />Waiting for pickup
                                      </p>
                                    );
                                  }
                                  if (hold.overdue) {
                                    return (
                                      <div className="mt-2 text-[11px] font-semibold text-red-800 bg-red-100 border border-red-300 rounded px-2 py-1 inline-flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Hot {hold.holdMin}m -- past {maxHotHoldMin}m hold
                                      </div>
                                    );
                                  }
                                  return (
                                    <p className={`mt-2 text-[11px] font-medium inline-flex items-center gap-1 ${
                                      hold.holdMin > maxHotHoldMin * 0.7 ? "text-amber-700" : "text-emerald-700"
                                    }`}>
                                      <Truck className="w-3 h-3" />Waiting {hold.holdMin}m -- pickup soon
                                    </p>
                                  );
                                })()}

                                {/* Per-task tick UI lives inside TaskCompletionButtons (existing component) */}
                                {col.key === "preparing" && (
                                  <details className="mt-2 group">
                                    <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-900 select-none">
                                      Tasks ▾
                                    </summary>
                                    <div className="mt-1 pt-1 border-t border-slate-200">
                                      <TaskCompletionButtons
                                        orderId={order.id}
                                        orderNumber={order.order_number}
                                        clientName={order.client_name || order.event_name}
                                      />
                                    </div>
                                  </details>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {/* AI Chatbot */}
      <ChatBot userRole="kitchen" companyId={user?.company_id} />

      {/* Allergen safety gate -- blocks Mark Ready if dietary requirements
          collide with an item's allergen codes. Forces a deliberate override
          that's audit-stamped on the prep tasks. */}
      <AlertDialog open={!!allergenDialog} onOpenChange={(open) => { if (!open) setAllergenDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Allergen warning -- check before serving
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <div className="font-semibold text-red-900 mb-1">Customer dietary note</div>
                  <div className="text-red-800 italic">"{allergenDialog?.dietary}"</div>
                </div>
                <div>
                  <div className="font-semibold mb-2">Items that may conflict:</div>
                  <ul className="space-y-2">
                    {allergenDialog?.conflicts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-medium">{c.menuItem}:</span>
                        <span className="text-red-700">{c.allergens.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-xs text-slate-600">
                  Confirming will record an override against this order. Cancel to revisit the recipe or speak to the customer.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel -- recheck</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (allergenDialog) {
                  const { orderId, clientName } = allergenDialog;
                  setAllergenDialog(null);
                  finishMarkReady(orderId, clientName, "overridden");
                }
              }}
            >
              I have checked -- mark ready anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}