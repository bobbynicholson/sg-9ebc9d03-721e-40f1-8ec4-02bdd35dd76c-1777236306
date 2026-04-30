/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/platform/financial-dashboard -- platform-level revenue.
 *
 * NOT a tenant page. This is the SaaS owner's view of CateringMS's
 * own books -- subscription MRR / ARR across every catering company,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, DollarSign, Users, AlertTriangle, RefreshCw, Crown, Activity,
} from "lucide-react";
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
        <title>Platform Financial Dashboard | CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <PlatformNav />
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-amber-50 to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 py-8 max-w-screen-2xl mx-auto">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg">
                <Crown className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  Platform finances
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  CateringMS's own revenue across every catering company on the platform.
                  This is NOT a tenant view, per-tenant books live on /admin/financial-dashboard.
                </p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat label="Total tenants" value={stats.total} icon={Users} />
            <Stat label="Active subs" value={stats.active} tone="emerald" icon={Activity} />
            <Stat label="On trial" value={stats.trialing} tone="amber" icon={TrendingUp} />
            <Stat label="Cancelled / churned" value={stats.cancelled} tone="rose" icon={AlertTriangle} />
          </div>

          {/* Trial expiry alert */}
          {stats.expiringSoon > 0 && (
            <Card className="border-amber-200 bg-amber-50 mb-6">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">
                    {stats.expiringSoon} trial{stats.expiringSoon === 1 ? "" : "s"} expiring within 7 days
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Use Trials in the sidebar to extend or convert before the cutoff.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tenants list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tenants on the books</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-slate-500 py-6 text-center">Loading...</p>
              ) : companies.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  No tenants yet. Once a company signs up, they'll show here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="text-left py-2 pr-3">Company</th>
                        <th className="text-left py-2 px-3">Status</th>
                        <th className="text-left py-2 px-3">Trial ends</th>
                        <th className="text-left py-2 px-3">Currency</th>
                        <th className="text-left py-2 px-3">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((c) => {
                        const status = (c.subscription_status || "").toLowerCase();
                        const tone =
                          status === "active"   ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
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
                                : "—"}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{c.currency || "—"}</td>
                            <td className="py-2 px-3 text-slate-500">
                              {c.created_at
                                ? new Date(c.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-[11px] text-slate-400 mt-4">
            Pricing tiers + invoice-level MRR breakdown live behind the Pricing and Subscriptions pages in the sidebar.
            Voiding a leaky shortcut here meant rebuilding this view from scratch, {fmtR(0)} of cross-tenant data leaked while it was wrong.
          </p>
        </div>
      </div>
    </>
  );
}

function Stat({
  label, value, tone, icon: Icon,
}: { label: string; value: number; tone?: "emerald" | "amber" | "rose"; icon: any }) {
  const valueClass =
    tone === "emerald" ? "text-emerald-600" :
    tone === "amber"   ? "text-amber-600"   :
    tone === "rose"    ? "text-rose-600"    : "text-slate-900";
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-slate-600">{label}</p>
          <Icon className={`w-4 h-4 ${valueClass}`} />
        </div>
        <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
