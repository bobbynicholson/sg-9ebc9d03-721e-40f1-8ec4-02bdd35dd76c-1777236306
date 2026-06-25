/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/platform/financial-dashboard - platform-level revenue.
 *
 * NOT a tenant page. This is the SaaS owner's view of CateringMS's
 * own books - subscription MRR / ARR across every catering company,
 * trial conversion, churn, payment-gateway take. The bare
 * /admin/financial-dashboard route is the per-tenant version.
 *
 * Linking PlatformNav at the tenant route was leaking metrics across
 * companies. This page is the proper destination.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { TrendingUp, Users, AlertTriangle, RefreshCw, Crown, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CompanyRow {
  id: string;
  company_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  is_active: boolean | null;
  created_at: string | null;
  currency: string | null;
}

const fmtR = (v: number) =>
  `R ${(Number.isFinite(v) ? v : 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

export default function ProtectedPlatformFinancialDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PlatformFinancialDashboard />
    </ProtectedRoute>
  );
}

function PlatformFinancialDashboard() {
  void useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // super_admin RLS bypass means this returns every tenant.
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, subscription_status, trial_ends_at, is_active, created_at, currency");
      if (error) throw error;
      setCompanies(((data || []) as any[]) as CompanyRow[]);
    } catch (e: any) {
      toast({
        title: "Could not load platform metrics",
        description: e?.message ?? "",
        variant: "destructive",
      });
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

  return (
    <>
      <Head>
        <title>Platform financial dashboard - CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Platform finances"
            subtitle="CateringMS's own revenue across every catering company on the platform. This is NOT a tenant view, per-tenant books live on /admin/financial-dashboard."
            icon={Crown}
            actions={
              <Button onClick={load} disabled={loading} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            }
          />

          {/* Stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile label="Total tenants" value={stats.total} icon={Users} />
            <StatTile label="Active subs" value={<span className="text-brand-primary dark:text-brand-primary">{stats.active}</span>} icon={Activity} />
            <StatTile label="On trial" value={<span className="text-amber-600 dark:text-amber-500">{stats.trialing}</span>} icon={TrendingUp} />
            <StatTile label="Cancelled / churned" value={<span className="text-rose-600 dark:text-rose-500">{stats.cancelled}</span>} icon={AlertTriangle} />
          </div>

          {/* Trial expiry alert */}
          {stats.expiringSoon > 0 && (
            <PortalCard className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 mb-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
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

          <p className="text-[11px] text-slate-400 mt-4">
            Pricing tiers + invoice-level MRR breakdown live behind the Pricing and Subscriptions pages in the sidebar.
            Voiding a leaky shortcut here meant rebuilding this view from scratch, {fmtR(0)} of cross-tenant data leaked while it was wrong.
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
        <thead className="text-[10px] uppercase tracking-wide text-slate-500">
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
                          status === "trial"    ? "bg-amber-100 text-amber-800 border-amber-200" :
                          status.includes("cancel") || status === "churned"
                            ? "bg-rose-100 text-rose-700 border-rose-200"
                            : "bg-slate-100 text-slate-700 border-slate-200";
                        return (
                          <tr key={c.id} className="border-t border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-900">
                              {c.company_name || "(unnamed)"}
                            </td>
                            <td className="py-2 px-3">
                              <Badge className={`border ${tone}`}>{status || "unknown"}</Badge>
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {c.trial_ends_at
                                ? new Date(c.trial_ends_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
                                : "-"}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{c.currency || "-"}</td>
                            <td className="py-2 px-3 text-slate-500">
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
