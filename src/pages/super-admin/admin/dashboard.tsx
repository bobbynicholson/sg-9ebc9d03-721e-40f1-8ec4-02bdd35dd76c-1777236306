import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, CreditCard, TrendingUp, CheckCircle, Clock, DollarSign, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageWorkbench, PortalHeader, PortalShell } from "@/components/portal/ui";

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
        .eq("subscription_status", "trial"),
      // A.17 #2 (2026-05-18): was querying subscription_invoices
      // (table doesn't exist), filtering on paid_at (column doesn't
      // exist) and status='paid' (not in billing_history's CHECK).
      // Three drift bugs at once - the as-any cast hid them all and
      // monthlyRevenue silently always read 0. The actual platform-
      // subscription ledger is billing_history; status='completed'
      // is the CHECK-allowed success terminal; created_at is the
      // event timestamp. Empty today (the subscription-billing
      // webhook path hasn't shipped yet) but at least the query
      // now hits the right table so it'll work the moment rows
      // start landing.
      (supabase as any)
        .from("billing_history")
        .select("amount, created_at")
        .eq("status", "completed")
        .gte("created_at", firstOfMonth.toISOString()),
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
      <PortalShell width="narrow">
        <PortalHeader
          title="Platform Management"
          subtitle="Loading the super-admin management dashboard."
          icon={Activity}
        />
        <PageWorkbench />
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-4 text-brand-primary" />
          <p className="text-slate-600">Loading platform management...</p>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <PortalHeader
        title="Platform Management"
        subtitle="CateringMS super-admin dashboard for companies, subscriptions and revenue."
        icon={Activity}
        actions={(
          <Button onClick={() => router.push("/admin/platform/dashboard")}>
            Back to Overview
          </Button>
        )}
      />
      <PageWorkbench />
      <div className="w-full py-6">
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
                {stats.loaded ? stats.totalCompanies : "-"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Active Subscriptions
              </CardTitle>
              <CheckCircle className="w-4 h-4 text-brand-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {stats.loaded ? stats.activeSubscriptions : "-"}
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
                <DollarSign className="w-4 h-4 text-brand-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {stats.loaded ? `R${stats.monthlyRevenue.toLocaleString()}` : "-"}
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
                {stats.loaded ? stats.trialCompanies : "-"}
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
                onClick={() => router.push("/admin/platform/company-database")}
              >
                <Building2 className="w-4 h-4 mr-2" />
                Manage Companies
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push("/admin/platform/subscription-management")}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Manage Subscriptions
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push("/admin/platform/financial-dashboard")}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Platform Financials
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
                Activity feed not wired yet. Open /admin/platform/company-database
                or /admin/platform/subscription-management for the canonical lists.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Platform Status - external monitoring panel. The numbers
            below used to be hardcoded fiction (124ms / 99.98% / 247
            users). Real telemetry lives outside this app; surface the
            canonical sources so the super admin can drill in. */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Status</CardTitle>
            <CardDescription>External monitoring sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                <div className="text-sm font-medium">Vercel deployments + analytics</div>
                <div className="text-xs text-slate-500 mt-0.5">Response time, edge errors, build status</div>
              </a>
              <a
                href="https://status.supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                <div className="text-sm font-medium">Supabase status</div>
                <div className="text-xs text-slate-500 mt-0.5">Database, auth, storage availability</div>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
