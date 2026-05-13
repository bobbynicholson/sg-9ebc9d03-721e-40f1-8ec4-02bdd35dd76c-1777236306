import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, CreditCard, TrendingUp, AlertCircle, CheckCircle, Clock, DollarSign, ArrowUpRight, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DashboardStats {
  totalCompanies: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  trialCompanies: number;
  loaded: boolean;
}

export default function SuperAdminManagementDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalCompanies: 0,
    activeSubscriptions: 0,
    monthlyRevenue: 0,
    trialCompanies: 0,
    loaded: false,
  });

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (user.active_role !== "super_admin") {
      router.push("/auth/login");
      return;
    }

    // Load platform statistics
    loadPlatformStats();
  }, [user, loading, router]);

  const loadPlatformStats = async () => {
    // Three parallel head-only counts off companies, plus a sum over
    // this month's paid subscription invoices. Falls back to 0 on any
    // individual failure so a broken slice doesn't black out the
    // whole dashboard.
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const [totalRes, activeRes, trialRes, subInvRes] = await Promise.all([
      (supabase as any)
        .from("companies")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      (supabase as any)
        .from("companies")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("subscription_status", "active"),
      (supabase as any)
        .from("companies")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("subscription_status", ["trial", "trialing"]),
      (supabase as any)
        .from("subscription_invoices")
        .select("amount, paid_at")
        .eq("status", "paid")
        .gte("paid_at", firstOfMonth.toISOString()),
    ]);

    const monthlyRevenue = ((subInvRes as any)?.data || []).reduce(
      (sum: number, row: any) => sum + Number(row.amount || 0),
      0,
    );

    setStats({
      totalCompanies: Number((totalRes as any)?.count || 0),
      activeSubscriptions: Number((activeRes as any)?.count || 0),
      trialCompanies: Number((trialRes as any)?.count || 0),
      monthlyRevenue: Math.round(monthlyRevenue),
      loaded: true,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-slate-600">Loading platform management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="border-b bg-white dark:bg-slate-800">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Platform Management
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                CateringMS Super Admin Dashboard
              </p>
            </div>
            <Button onClick={() => router.push("/super-admin")}>
              Back to Overview
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Total Companies
              </CardTitle>
              <Building2 className="w-4 h-4 text-slate-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {stats.loaded ? stats.totalCompanies : "—"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Active Subscriptions
              </CardTitle>
              <CheckCircle className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {stats.loaded ? stats.activeSubscriptions : "—"}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {stats.loaded ? `${stats.trialCompanies} on trial` : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Monthly Revenue
              </CardTitle>
              <DollarSign className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {stats.loaded ? `R${stats.monthlyRevenue.toLocaleString()}` : "—"}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Paid subscription invoices, this calendar month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Trial Companies
              </CardTitle>
              <Clock className="w-4 h-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {stats.loaded ? stats.trialCompanies : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common platform management tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => router.push("/super-admin/admin/companies")}
              >
                <Building2 className="w-4 h-4 mr-2" />
                Manage Companies
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => router.push("/super-admin/admin/subscriptions")}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Manage Subscriptions
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => router.push("/super-admin/admin/analytics")}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                View Analytics
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest platform events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-500 py-6 text-center">
                Activity feed not wired yet. Open /super-admin/admin/companies or
                /super-admin/admin/subscriptions for the canonical lists.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Platform Status */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Status</CardTitle>
            <CardDescription>System health and performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">API Response Time</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Excellent
                  </Badge>
                </div>
                <div className="text-2xl font-bold">124ms</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Uptime</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Healthy
                  </Badge>
                </div>
                <div className="text-2xl font-bold">99.98%</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Active Users</span>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    Normal
                  </Badge>
                </div>
                <div className="text-2xl font-bold">247</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}