/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/platform/financial-dashboard - platform-level revenue.
 *
 * NOT a tenant page. This is the SaaS owner's view of CateringMS's
 * own books - subscription MRR / ARR across every catering company,
 * trial conversion, churn, payment-gateway take. The bare
 * /admin/financial-dashboard route is the per-tenant version.
 *
 * Money figures come from analyticsService.getDashboardMetrics(), the
 * same source the platform dashboard uses, so MRR/ARR/churn always
 * agree between the two surfaces (no data inconsistency).
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { TrendingUp, Users, AlertTriangle, RefreshCw, Crown, Activity, Repeat, CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { analyticsService } from "@/services/analyticsService";

interface CompanyRow {
  id: string;
  company_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  is_active: boolean | null;
  created_at: string | null;
  currency: string | null;
}

export default function ProtectedPlatformFinancialDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PlatformFinancialDashboard />
    </ProtectedRoute>
  );
}

function PlatformFinancialDashboard() {
  void useAuth();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // super_admin RLS bypass means this returns every tenant. Metrics
      // come from the shared analytics service so the figures here match
      // the platform dashboard exactly.
      const [companiesRes, metricsData] = await Promise.all([
        supabase
          .from("companies")
          .select("id, company_name, subscription_status, trial_ends_at, is_active, created_at, currency"),
        analyticsService.getDashboardMetrics(),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      setCompanies(((companiesRes.data || []) as any[]) as CompanyRow[]);
      setMetrics(metricsData);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load platform finances. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sub = (s: string | null) => (s || "").toLowerCase();
    const trialing  = companies.filter((c) => sub(c.subscription_status) === "trial");
    const active    = companies.filter((c) => sub(c.subscription_status) === "active");
    const cancelled = companies.filter((c) =>
      ["cancelled", "canceled", "churned"].includes(sub(c.subscription_status)),
    );
    const expiringSoon = trialing.filter((c) => {
      if (!c.trial_ends_at) return false;
      const days = (new Date(c.trial_ends_at).getTime() - today.getTime()) / 86_400_000;
      return days >= 0 && days <= 7;
    });
    return {
      total: companies.length,
      active: active.length,
      trialing: trialing.length,
      cancelled: cancelled.length,
      expiringSoon: expiringSoon.length,
    };
  }, [companies]);

  const fmt = (v: number) => analyticsService.formatCurrency(v || 0);
  const pct = (v: number) => analyticsService.formatPercentage(v || 0);

  return (
    <>
      <Head>
        <title>Platform financial dashboard - CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Platform finances"
            subtitle="CateringMS's own recurring revenue across every catering company on the platform. Per-tenant books live under each tenant's admin, this view is the SaaS owner's."
            icon={Crown}
            meta={
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {stats.active} active
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {stats.trialing} on trial
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {stats.total} tenants total
                </span>
              </>
            }
            actions={
              <Button onClick={load} disabled={loading} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            }
          />
          <PageWorkbench />

          {loadError && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{loadError}</span>
                <Button variant="outline" size="sm" onClick={load}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Money row: shared analytics source, matches the platform dashboard. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatTile
              label="Monthly recurring revenue"
              value={loading ? "-" : fmt(metrics?.monthlyRecurringRevenue)}
              hint="Active monthly subscriptions"
              icon={Repeat}
            />
            <StatTile
              label="Annual recurring revenue"
              value={loading ? "-" : fmt(metrics?.annualRecurringRevenue)}
              hint="Active annual subscriptions"
              icon={CalendarClock}
            />
            <StatTile
              label="Total subscription revenue"
              value={loading ? "-" : fmt(metrics?.totalRevenue)}
              hint="Monthly and annual combined"
              icon={TrendingUp}
            />
            <StatTile
              label="Churn (30 days)"
              value={loading ? "-" : pct(metrics?.churnRate)}
              hint={loading ? undefined : `Trial to paid conversion ${pct(metrics?.conversionRate)}`}
              icon={Activity}
            />
          </div>

          {/* Tenant mix row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile label="Total tenants" value={loading ? "-" : stats.total} icon={Users} />
            <StatTile label="Active subs" value={loading ? "-" : <span className="text-brand-primary dark:text-brand-primary">{stats.active}</span>} icon={Activity} />
            <StatTile label="On trial" value={loading ? "-" : <span className="text-amber-600 dark:text-amber-500">{stats.trialing}</span>} icon={TrendingUp} />
            <StatTile label="Cancelled / churned" value={loading ? "-" : <span className="text-rose-600 dark:text-rose-500">{stats.cancelled}</span>} icon={AlertTriangle} />
          </div>

          {/* Trial expiry alert */}
          {stats.expiringSoon > 0 && (
            <PortalCard className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 mb-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {stats.expiringSoon} trial{stats.expiringSoon === 1 ? "" : "s"} expiring within 7 days
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Use Trials in the sidebar to extend or convert before the cutoff.
                </p>
              </div>
            </PortalCard>
          )}

          {/* Tenants list */}
          <PortalCard>
            <PortalCardHeader title="Tenants on the books" />
            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">Loading...</p>
            ) : companies.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                No tenants yet. Once a company signs up, they'll show here.
              </p>
            ) : (
              <CompaniesSortableTable companies={companies} />
            )}
          </PortalCard>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4">
            Pricing tiers and the invoice-level MRR breakdown live behind the Pricing and Subscriptions pages in the sidebar.
          </p>
        </PortalShell>
      </div>
    </>
  );
}

function CompaniesSortableTable({ companies }: { companies: CompanyRow[] }) {
  const sortColumns: ColumnDef<CompanyRow>[] = [
    { key: "name",     accessor: (c) => c.company_name || "",                            type: "string" },
    { key: "status",   accessor: (c) => (c.subscription_status || "").toLowerCase(),     type: "string" },
    { key: "trial",    accessor: (c) => c.trial_ends_at,                                 type: "date" },
    { key: "currency", accessor: (c) => c.currency || "",                                type: "string" },
    { key: "joined",   accessor: (c) => c.created_at,                                    type: "date" },
  ];
  const { rows, sortKey, sortDir, toggle } = useSortable<CompanyRow>(companies, sortColumns, { defaultKey: "joined", defaultDir: "desc" });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th className="text-left py-2 pr-3">
              <SortHeader sortKey="name" activeKey={sortKey} activeDir={sortDir} onToggle={toggle}>Company</SortHeader>
            </th>
            <th className="text-left py-2 px-3">
              <SortHeader sortKey="status" activeKey={sortKey} activeDir={sortDir} onToggle={toggle}>Status</SortHeader>
            </th>
            <th className="text-left py-2 px-3">
              <SortHeader sortKey="trial" activeKey={sortKey} activeDir={sortDir} onToggle={toggle}>Trial ends</SortHeader>
            </th>
            <th className="text-left py-2 px-3">
              <SortHeader sortKey="currency" activeKey={sortKey} activeDir={sortDir} onToggle={toggle}>Currency</SortHeader>
            </th>
            <th className="text-left py-2 px-3">
              <SortHeader sortKey="joined" activeKey={sortKey} activeDir={sortDir} onToggle={toggle}>Joined</SortHeader>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const status = (c.subscription_status || "").toLowerCase();
            const tone =
              status === "active"   ? "bg-brand-primary/15 text-brand-primary border-brand-primary/20" :
              status === "trial"    ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" :
              status.includes("cancel") || status === "churned"
                ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
                : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
            return (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">
                  {c.company_name || "(unnamed)"}
                </td>
                <td className="py-2 px-3">
                  <Badge className={`border ${tone}`}>{status || "unknown"}</Badge>
                </td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                  {c.trial_ends_at
                    ? new Date(c.trial_ends_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
                    : "-"}
                </td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{c.currency || "-"}</td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                  {c.created_at
                    ? new Date(c.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
                    : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
