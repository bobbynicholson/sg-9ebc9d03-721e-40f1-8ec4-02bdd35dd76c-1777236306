import { useState, useEffect } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  DollarSign,
  Package,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Calendar,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import { analyticsService } from "@/services/analyticsService";
import { orderService } from "@/services/orderService";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";

interface DashboardStats {
  activeOrders: number;
  totalRevenue: number;
  pendingRevenue: number;
  completedOrders: number;
  upcomingEvents: number;
  activeUsers: number;
  pendingQuotes: number;
  lowStockItems: number;
  averageOrderValue: number;
  completionRate: number;
}

function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    activeOrders: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
    completedOrders: 0,
    upcomingEvents: 0,
    activeUsers: 0,
    pendingQuotes: 0,
    lowStockItems: 0,
    averageOrderValue: 0,
    completionRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadDashboardMetrics();
      
      // Set up real-time subscription for order updates
      const orderSubscription = supabase
        .channel('admin-dashboard-orders')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'orders' }, 
          () => {
            loadDashboardMetrics();
          }
        )
        .subscribe();

      return () => {
        orderSubscription.unsubscribe();
      };
    }
  }, [user]);

  const loadDashboardMetrics = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch financial analytics
      const financialData = await analyticsService.getFinancialAnalytics();

      // Fetch all orders for additional metrics
      const allOrders = await orderService.getOrders({ userId: user.id });

      // Count pending quotes
      const { data: quotes, error: quotesError } = await supabase
        .from("quotes")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (quotesError) {
        console.error("Error fetching quotes:", quotesError);
      }

      // Count active users (team members)
      const { count: userCount, error: userError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("company_id", user.user_metadata?.company_id || user.id);

      if (userError) {
        console.error("Error fetching users:", userError);
      }

      // Count low stock items (if inventory exists)
      const { data: inventory, error: invError } = await supabase
        .from("inventory_batches")
        .select("id", { count: "exact" })
        .eq("company_id", user.id)
        .lt("quantity_remaining", "5");

      if (invError) {
        console.error("Error fetching inventory:", invError);
      }

      setStats({
        activeOrders: allOrders.filter(o => 
          ["confirmed", "preparing", "ready", "in_transit"].includes(o.status || "")
        ).length,
        totalRevenue: financialData.totalRevenue,
        pendingRevenue: financialData.pendingRevenue,
        completedOrders: financialData.completedOrders,
        upcomingEvents: financialData.upcomingOrders,
        activeUsers: userCount || 0,
        pendingQuotes: quotes?.length || 0,
        lowStockItems: inventory?.length || 0,
        averageOrderValue: financialData.averageOrderValue,
        completionRate: financialData.completionRate,
      });
    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
      setError("Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <title>Admin Dashboard - CateringMS</title>
        </Head>
        <AdminNav />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
                <p className="text-slate-600">Loading dashboard metrics...</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Admin Dashboard - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-7xl">
          {/* Header */}
          <div className="mb-4 sm:mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Live company-wide metrics & insights
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm sm:text-base text-red-800">{error}</p>
              <Button onClick={loadDashboardMetrics} size="sm" className="mt-2">
                Retry
              </Button>
            </div>
          )}

          {/* Priority Tasks Section */}
          <Card className="border-0 shadow-lg mb-4 sm:mb-6 md:mb-8 bg-gradient-to-r from-amber-50 to-orange-50">
            <CardHeader className="pb-3 px-3 sm:px-6 pt-4 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                Priority Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="space-y-2 sm:space-y-3">
                {stats.pendingQuotes > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-lg border-l-4 border-red-500">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-sm sm:text-base text-slate-900">
                          {stats.pendingQuotes} Pending Quote{stats.pendingQuotes !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-slate-600">Require immediate attention</p>
                      </div>
                    </div>
                    <Link href="/admin/quotes">
                      <Button size="sm" className="w-full sm:w-auto">Review</Button>
                    </Link>
                  </div>
                )}

                {stats.lowStockItems > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-lg border-l-4 border-orange-500">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Package className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-sm sm:text-base text-slate-900">
                          {stats.lowStockItems} Low Stock Item{stats.lowStockItems !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-slate-600">Need restocking</p>
                      </div>
                    </div>
                    <Link href="/admin/inventory">
                      <Button size="sm" variant="outline" className="w-full sm:w-auto">View</Button>
                    </Link>
                  </div>
                )}

                {stats.upcomingEvents > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-lg border-l-4 border-green-500">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-sm sm:text-base text-slate-900">
                          {stats.upcomingEvents} Upcoming Event{stats.upcomingEvents !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-slate-600">
                          {stats.activeOrders} currently active
                        </p>
                      </div>
                    </div>
                    <Link href="/admin/calendar">
                      <Button size="sm" variant="outline" className="w-full sm:w-auto">Calendar</Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            {/* Total Revenue */}
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="flex items-center justify-between text-xs sm:text-sm font-medium">
                  <span className="flex items-center gap-1.5 sm:gap-2">
                    <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                    <span className="text-xs sm:text-sm">Total Revenue</span>
                  </span>
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    {stats.completedOrders} paid
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
                  {formatCurrency(stats.totalRevenue)}
                </div>
                <p className="text-xs text-slate-600 mt-1">All completed orders</p>
              </CardContent>
            </Card>

            {/* Pending Revenue */}
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="flex items-center justify-between text-xs sm:text-sm font-medium">
                  <span className="flex items-center gap-1.5 sm:gap-2">
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                    <span className="text-xs sm:text-sm">Pending Revenue</span>
                  </span>
                  <Badge className="bg-blue-100 text-blue-700 text-xs">Outstanding</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
                  {formatCurrency(stats.pendingRevenue)}
                </div>
                <p className="text-xs text-slate-600 mt-1">Awaiting payment</p>
              </CardContent>
            </Card>

            {/* Active Orders */}
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="flex items-center justify-between text-xs sm:text-sm font-medium">
                  <span className="flex items-center gap-1.5 sm:gap-2">
                    <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
                    <span className="text-xs sm:text-sm">Active Orders</span>
                  </span>
                  <Badge className="bg-purple-100 text-purple-700 text-xs">In Progress</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
                  {stats.activeOrders}
                </div>
                <p className="text-xs text-slate-600 mt-1">Currently processing</p>
              </CardContent>
            </Card>

            {/* Active Team Members */}
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="flex items-center justify-between text-xs sm:text-sm font-medium">
                  <span className="flex items-center gap-1.5 sm:gap-2">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-600" />
                    <span className="text-xs sm:text-sm">Team Members</span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
                  {stats.activeUsers}
                </div>
                <p className="text-xs text-slate-600 mt-1">Active users</p>
              </CardContent>
            </Card>
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            {/* Average Order Value */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                  Avg Order Value
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl font-bold text-slate-900">
                  {formatCurrency(stats.averageOrderValue)}
                </div>
                <p className="text-xs text-slate-600 mt-1">Per order average</p>
              </CardContent>
            </Card>

            {/* Completion Rate */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
                  <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                  Completion Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl font-bold text-slate-900">
                  {stats.completionRate.toFixed(1)}%
                </div>
                <p className="text-xs text-slate-600 mt-1">Orders completed</p>
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                  Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                <div className="text-xl sm:text-2xl font-bold text-slate-900">
                  {stats.upcomingEvents}
                </div>
                <p className="text-xs text-slate-600 mt-1">Scheduled ahead</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                <Link
                  href="/admin/orders"
                  className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg hover:shadow-md transition-all"
                >
                  <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Manage Orders</div>
                    <div className="text-xs text-slate-600">{stats.activeOrders} active</div>
                  </div>
                </Link>

                <Link
                  href="/admin/users"
                  className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg hover:shadow-md transition-all"
                >
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Team Management</div>
                    <div className="text-xs text-slate-600">{stats.activeUsers} members</div>
                  </div>
                </Link>

                <Link
                  href="/admin/financial-dashboard"
                  className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg hover:shadow-md transition-all"
                >
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Financial Reports</div>
                    <div className="text-xs text-slate-600">View analytics</div>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Chatbot */}
      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute requireAdmin={true}>
      <AdminDashboardPage />
    </ProtectedRoute>
  );
}