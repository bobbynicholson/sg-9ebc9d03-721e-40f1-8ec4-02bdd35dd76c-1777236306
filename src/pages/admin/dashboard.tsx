/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LayoutDashboard, TrendingUp, Users, DollarSign, Package, Clock,
  AlertCircle, CheckCircle, Loader2, Calendar, ShoppingCart,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { DashboardDateRange, resolvePreset, DateRange } from "@/components/dashboard/DashboardDateRange";
import { MetricCard } from "@/components/dashboard/MetricCard";

interface Stats {
  bookedRevenue: number;
  collectedRevenue: number;
  outstandingRevenue: number;
  bookedOrders: number;
  collectedOrders: number;
  activeOrders: number;
  upcomingEvents: number;
  totalOrdersInRange: number;
  completedOrdersInRange: number;
  averageOrderValue: number;
  completionRate: number;
  pendingQuotes: number;
  lowStockItems: number;
  activeUsers: number;
}

const EMPTY: Stats = {
  bookedRevenue: 0, collectedRevenue: 0, outstandingRevenue: 0,
  bookedOrders: 0, collectedOrders: 0, activeOrders: 0,
  upcomingEvents: 0, totalOrdersInRange: 0, completedOrdersInRange: 0,
  averageOrderValue: 0, completionRate: 0,
  pendingQuotes: 0, lowStockItems: 0, activeUsers: 0,
};

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready", "in_transit"];
const COUNTS_AS_BOOKED = ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"];

function AdminDashboardPage() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id || (user as any)?.company_id;

  const [range, setRange] = useState<DateRange>(() => resolvePreset("this_month"));
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fmt = useMemo(
    () => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }),
    [],
  );

  const loadMetrics = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);

      const fromISO = range.from.toISOString().slice(0, 10);
      const toISO   = range.to.toISOString().slice(0, 10);
      const todayISO = new Date().toISOString().slice(0, 10);

      // Pull every order whose event falls in the range, plus the always-on
      // counters (low stock, pending quotes, team size) which don't bind to range.
      const [ordersRes, quotesRes, usersRes, invRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, status, payment_status, total_amount, deposit_paid, deposit_amount, balance_paid, balance_amount, amount_paid, event_date")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", fromISO)
          .lte("event_date", toISO),
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["draft", "sent"]),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("inventory_items")
          .select("current_stock, minimum_stock")
          .eq("company_id", companyId)
          .is("deleted_at", null),
      ]);

      if (ordersRes.error) throw ordersRes.error;

      const orders = ordersRes.data || [];

      // -- Revenue maths --------------------------------------------------
      // BOOKED: order is locked in (not cancelled, not draft) -- the catering
      //   business has committed kitchen time. Counts for total_amount.
      // COLLECTED: money actually received so far. Sum of:
      //   - amount_paid when set
      //   - else deposit_amount when deposit_paid AND balance_amount when balance_paid
      //   - else total_amount when payment_status='paid' and no breakdown exists
      // OUTSTANDING = booked - collected for non-cancelled orders.

      let bookedRevenue = 0;
      let collectedRevenue = 0;
      let bookedOrders = 0;
      let collectedOrders = 0;

      for (const o of orders) {
        const status = String(o.status || "").toLowerCase();
        const pay    = String(o.payment_status || "").toLowerCase();
        const total  = Number(o.total_amount || 0);
        if (status === "cancelled") continue;

        // Booked: confirmed onwards OR has a paid deposit OR fully paid
        const isBooked =
          COUNTS_AS_BOOKED.includes(status) ||
          o.deposit_paid === true ||
          pay === "paid" ||
          pay === "partial";
        if (isBooked) {
          bookedRevenue += total;
          bookedOrders += 1;
        }

        // Collected: actual money in the bank
        let received = 0;
        if (Number(o.amount_paid || 0) > 0) {
          received = Number(o.amount_paid);
        } else {
          if (o.deposit_paid && Number(o.deposit_amount || 0) > 0) received += Number(o.deposit_amount);
          if (o.balance_paid && Number(o.balance_amount || 0) > 0) received += Number(o.balance_amount);
          // If we have nothing recorded but the order is marked fully paid, take total
          if (received === 0 && pay === "paid") received = total;
        }
        if (received > 0) collectedOrders += 1;
        collectedRevenue += received;
      }

      const outstandingRevenue = Math.max(0, bookedRevenue - collectedRevenue);

      const activeOrders = orders.filter((o: any) =>
        ACTIVE_STATUSES.includes(String(o.status || "").toLowerCase()),
      ).length;

      const upcomingEvents = orders.filter((o: any) => {
        const status = String(o.status || "").toLowerCase();
        return o.event_date >= todayISO && status !== "cancelled" && status !== "completed";
      }).length;

      const completedOrdersInRange = orders.filter((o: any) =>
        String(o.status || "").toLowerCase() === "completed",
      ).length;

      const totalOrdersInRange = orders.filter((o: any) =>
        String(o.status || "").toLowerCase() !== "cancelled",
      ).length;

      const averageOrderValue = bookedOrders > 0 ? bookedRevenue / bookedOrders : 0;
      const completionRate = totalOrdersInRange > 0
        ? (completedOrdersInRange / totalOrdersInRange) * 100
        : 0;

      const lowStockItems = (invRes.data || []).filter(
        (r: any) => Number(r.current_stock || 0) <= Number(r.minimum_stock || 0),
      ).length;

      setStats({
        bookedRevenue, collectedRevenue, outstandingRevenue,
        bookedOrders, collectedOrders,
        activeOrders, upcomingEvents,
        totalOrdersInRange, completedOrdersInRange,
        averageOrderValue, completionRate,
        pendingQuotes: quotesRes.count ?? 0,
        activeUsers: usersRes.count ?? 0,
        lowStockItems,
      });
    } catch (err: any) {
      console.error("Dashboard load error:", err);
      setError(err?.message || "Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;
    loadMetrics();
    // Realtime: any order change refetches the current range.
    const sub = supabase
      .channel("admin-dashboard-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadMetrics())
      .subscribe();
    return () => { sub.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, range.from.getTime(), range.to.getTime()]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Admin Dashboard - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-screen-2xl">

          {/* Header + date range -- date controls every metric below */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Live metrics for events in <span className="font-semibold text-slate-900">{range.label}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
              <DashboardDateRange range={range} onChange={setRange} />
              <Button
                variant="outline"
                size="sm"
                onClick={loadMetrics}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Refresh
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
              <Button onClick={loadMetrics} size="sm" className="mt-2">Retry</Button>
            </div>
          )}

          {/* Priority Actions -- not date-bound, always-on attention items */}
          {(stats.pendingQuotes > 0 || stats.lowStockItems > 0 || stats.upcomingEvents > 0) && (
            <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-amber-50 to-orange-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  Priority Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {stats.pendingQuotes > 0 && (
                    <PriorityRow
                      icon={AlertCircle} accent="border-red-500" iconColor="text-red-600"
                      title={`${stats.pendingQuotes} Pending Quote${stats.pendingQuotes !== 1 ? "s" : ""}`}
                      sub="Require immediate attention"
                      cta={{ href: "/admin/quotes", label: "Review", variant: "default" }}
                    />
                  )}
                  {stats.lowStockItems > 0 && (
                    <PriorityRow
                      icon={Package} accent="border-orange-500" iconColor="text-orange-600"
                      title={`${stats.lowStockItems} Low Stock Item${stats.lowStockItems !== 1 ? "s" : ""}`}
                      sub="Need restocking"
                      cta={{ href: "/admin/inventory", label: "View", variant: "outline" }}
                    />
                  )}
                  {stats.upcomingEvents > 0 && (
                    <PriorityRow
                      icon={Calendar} accent="border-green-500" iconColor="text-green-600"
                      title={`${stats.upcomingEvents} Upcoming Event${stats.upcomingEvents !== 1 ? "s" : ""}`}
                      sub={`${stats.activeOrders} currently active in range`}
                      cta={{ href: "/admin/calendar", label: "Calendar", variant: "outline" }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key revenue metrics -- all bound to the date range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6">
            <MetricCard
              label="Booked Revenue"
              value={fmt.format(stats.bookedRevenue)}
              hint={`${stats.bookedOrders} confirmed booking${stats.bookedOrders === 1 ? "" : "s"}`}
              tooltip={`Total value of orders that are confirmed (deposit secured, partial, or fully paid) with event_date in ${range.label}. Source: orders.total_amount where status is confirmed/preparing/ready/in_transit/delivered/completed OR deposit_paid=true OR payment_status in (paid, partial). Cancelled orders excluded.`}
              icon={DollarSign}
              iconColor="text-green-600"
              badge={{ text: `${stats.bookedOrders} booked`, tone: "green" }}
              loading={loading}
            />
            <MetricCard
              label="Collected"
              value={fmt.format(stats.collectedRevenue)}
              hint={`Money received in ${range.label}`}
              tooltip="Money actually received: amount_paid if recorded, otherwise deposit_amount where deposit_paid=true plus balance_amount where balance_paid=true. Falls back to total_amount when payment_status='paid' with no breakdown."
              icon={CheckCircle}
              iconColor="text-emerald-600"
              badge={{ text: `${stats.collectedOrders} paid`, tone: "green" }}
              loading={loading}
            />
            <MetricCard
              label="Outstanding"
              value={fmt.format(stats.outstandingRevenue)}
              hint="Booked minus collected"
              tooltip="Money still owed across confirmed bookings in this range. Calculated as booked revenue minus collected revenue. The Tollie balance, partial deposits and unpaid invoices show up here."
              icon={TrendingUp}
              iconColor="text-blue-600"
              badge={{ text: "Owed", tone: "blue" }}
              loading={loading}
            />
            <MetricCard
              label="Active Orders"
              value={stats.activeOrders}
              hint="Currently in progress"
              tooltip="Orders with status confirmed, preparing, ready, or in_transit, with event_date in range. The kitchen and drivers are working on these right now."
              icon={ShoppingCart}
              iconColor="text-purple-600"
              badge={{ text: "In progress", tone: "purple" }}
              loading={loading}
            />
          </div>

          {/* Performance metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6">
            <MetricCard
              label="Avg Order Value"
              value={fmt.format(stats.averageOrderValue)}
              hint="Per booked order"
              tooltip="Booked revenue divided by booked order count for the selected range. Higher AOV = bigger events / more profitable mix."
              icon={TrendingUp}
              iconColor="text-emerald-600"
              loading={loading}
            />
            <MetricCard
              label="Completion Rate"
              value={`${stats.completionRate.toFixed(1)}%`}
              hint={`${stats.completedOrdersInRange} of ${stats.totalOrdersInRange} done`}
              tooltip="Orders with status='completed' divided by all non-cancelled orders in this range. Anything below 95% is worth digging into."
              icon={CheckCircle}
              iconColor="text-green-600"
              loading={loading}
            />
            <MetricCard
              label="Upcoming Events"
              value={stats.upcomingEvents}
              hint="Confirmed, event_date >= today"
              tooltip="Confirmed events in the selected range whose event_date is today or later and that haven't been completed or cancelled. These are what your team is heading into."
              icon={Calendar}
              iconColor="text-indigo-600"
              loading={loading}
            />
            <MetricCard
              label="Team Members"
              value={stats.activeUsers}
              hint="Active users"
              tooltip="All profiles attached to this company. Not bound to date range -- represents your current team size."
              icon={Users}
              iconColor="text-cyan-600"
              loading={loading}
            />
          </div>

          {/* Quick Actions */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                <Link
                  href="/admin/orders"
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg hover:shadow-md transition-all"
                >
                  <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Manage Orders</div>
                    <div className="text-xs text-slate-600">{stats.activeOrders} active in range</div>
                  </div>
                </Link>
                <Link
                  href="/admin/users"
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg hover:shadow-md transition-all"
                >
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Team Management</div>
                    <div className="text-xs text-slate-600">{stats.activeUsers} members</div>
                  </div>
                </Link>
                <Link
                  href="/admin/financial-dashboard"
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg hover:shadow-md transition-all"
                >
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Financial Reports</div>
                    <div className="text-xs text-slate-600">Deeper analytics</div>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ChatBot userRole="admin" companyId={companyId} />
    </>
  );
}

function PriorityRow({
  icon: Icon, accent, iconColor, title, sub, cta,
}: any) {
  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-lg border-l-4 ${accent}`}>
      <div className="flex items-center gap-2 sm:gap-3">
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColor} flex-shrink-0`} />
        <div>
          <p className="font-semibold text-sm sm:text-base text-slate-900">{title}</p>
          <p className="text-xs text-slate-600">{sub}</p>
        </div>
      </div>
      <Link href={cta.href}>
        <Button size="sm" variant={cta.variant} className="w-full sm:w-auto">{cta.label}</Button>
      </Link>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <AdminDashboardPage />
    </ProtectedRoute>
  );
}
