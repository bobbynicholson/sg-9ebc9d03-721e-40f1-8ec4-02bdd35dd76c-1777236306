import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    activeUsers: 0,
    pendingQuotes: 0,
    lowStockItems: 0,
    upcomingEvents: 0,
  });

  useEffect(() => {
    // Load dashboard statistics
    // This would normally fetch from your backend
    setStats({
      totalOrders: 156,
      totalRevenue: 2847000,
      activeUsers: 45,
      pendingQuotes: 12,
      lowStockItems: 8,
      upcomingEvents: 23,
    });
  }, [user]);

  if (authLoading) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <title>Admin Dashboard - CateringMS</title>
        </Head>
        <AdminNav />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-4" />
            <p className="text-slate-600">Loading dashboard...</p>
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
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                <p className="text-slate-600 mt-1">
                  Welcome back, {user?.full_name || "Admin"}
                </p>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    Total Orders
                  </span>
                  <Badge className="bg-green-100 text-green-700">Active</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{stats.totalOrders}</div>
                <p className="text-xs text-slate-600 mt-1">This month</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    Revenue
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">
                  R{(stats.totalRevenue / 1000).toFixed(0)}k
                </div>
                <p className="text-xs text-slate-600 mt-1">Monthly revenue</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-600" />
                    Active Users
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{stats.activeUsers}</div>
                <p className="text-xs text-slate-600 mt-1">Team members</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-600" />
                    Pending Quotes
                  </span>
                  <Badge className="bg-orange-100 text-orange-700">Pending</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{stats.pendingQuotes}</div>
                <p className="text-xs text-slate-600 mt-1">Awaiting response</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-red-600" />
                    Low Stock Items
                  </span>
                  {stats.lowStockItems > 0 && (
                    <Badge className="bg-red-100 text-red-700">Alert</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{stats.lowStockItems}</div>
                <p className="text-xs text-slate-600 mt-1">Need restocking</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-cyan-600" />
                    Upcoming Events
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">{stats.upcomingEvents}</div>
                <p className="text-xs text-slate-600 mt-1">Next 30 days</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  href="/admin/orders"
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg hover:shadow-md transition-all"
                >
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                  <div>
                    <div className="font-semibold text-slate-900">View Orders</div>
                    <div className="text-xs text-slate-600">Manage all orders</div>
                  </div>
                </Link>

                <Link
                  href="/admin/users"
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg hover:shadow-md transition-all"
                >
                  <Users className="w-6 h-6 text-blue-600" />
                  <div>
                    <div className="font-semibold text-slate-900">Manage Users</div>
                    <div className="text-xs text-slate-600">Add or edit users</div>
                  </div>
                </Link>

                <Link
                  href="/admin/settings"
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg hover:shadow-md transition-all"
                >
                  <AlertCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <div className="font-semibold text-slate-900">System Settings</div>
                    <div className="text-xs text-slate-600">Configure platform</div>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
      <AdminDashboardPage />
    </ProtectedRoute>
  );
}
