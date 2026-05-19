/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/cashflow-dashboard - the forward-looking cash view.
 *
 * Split out of /admin/financial-dashboard so the operator question
 * "can I pay this week?" lives on a focused page. The Financial
 * dashboard keeps the backward-looking health / margin / order
 * analysis story; this page owns the projected balance chart and
 * everything that feeds it (payables, fixed costs, wages owed).
 *
 * Owner / company_admin / admin / super_admin only per the
 * finance-visibility rule. Gated upstream via ProtectedRoute.
 */
import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, DollarSign, AlertTriangle, RefreshCw,
  FileText, Wallet, Receipt, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fixedCostsService } from "@/services/fixedCostsService";
import { orderService } from "@/services/orderService";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { aiFinancialService } from "@/services/aiFinancialService";
import * as currencyUtils from "@/lib/currencyUtils";
import type { Order } from "@/types";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useTenantHref } from "@/lib/tenantUrl";
import { CashflowForecastCard } from "@/components/admin/financial/CashflowForecastCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

interface CashflowMetrics {
  /** Cash received from orders flagged paid_in_full. */
  cashReceived: number;
  /** Open wages already logged but not paid out. */
  staffPaymentsOwed: number;
  /** Sum of fixed_costs occurrences in the next 30 days. */
  fixedCostsNext30: number;
  /** Sum of pending supplier_payables due in the next 30 days. */
  supplierPayablesNext30: number;
  /** Pending invoice balances - paid surface for follow-ups. */
  pendingPayments: number;
}

interface CashFlowAlert {
  severity: "high" | "medium" | "low";
  message: string;
  suggestedAction: string;
  predictedDate?: string;
}

export default function ProtectedCashflowDashboardPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CashflowDashboardInner />
    </ProtectedRoute>
  );
}

function CashflowDashboardInner() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CashflowMetrics | null>(null);
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadedAt, setLoadedAt] = useState<number>(0);

  const currency = (user as any)?.currency || "ZAR";
  const fmt = currencyUtils.formatCurrency as (a: number, c: string) => string;

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      setLoading(true);

      const companyId = user.company_id;
      const ordersData = await orderService.getAllOrders(companyId);
      setOrders(ordersData);

      const ledger = await paymentLedgerService.getPaymentLedger(companyId);
      const cashReceived = ordersData
        .filter((o) => o.payment_status === "paid")
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const staffPaymentsOwed = ledger.totalOwed || 0;

      // Mirror the CashflowForecastCard cost feeds so the summary
      // and chart move in sync. Best-effort: a missing table / RLS
      // refusal logs and zeroes the row instead of nuking the page.
      const todayIso = new Date().toISOString().slice(0, 10);
      const thirtyIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      let fixedCostsNext30 = 0;
      let supplierPayablesNext30 = 0;
      try {
        const fixedRows = await fixedCostsService.list(companyId, { activeOnly: true });
        const expanded = fixedCostsService.expandOccurrences(fixedRows, 30);
        fixedCostsNext30 = expanded.reduce(
          (sum, o) => sum + o.amount_cents / 100,
          0,
        );
      } catch (fcErr) {
        console.warn("[cashflow-dashboard] fixed_costs load failed:", fcErr);
      }
      try {
        const { data: payables } = await (supabase as any)
          .from("supplier_payables")
          .select("amount_cents, due_date")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .is("deleted_at", null)
          .gte("due_date", todayIso)
          .lte("due_date", thirtyIso);
        supplierPayablesNext30 = ((payables as Array<{ amount_cents: number }>) || [])
          .reduce((sum, r) => sum + (Number(r.amount_cents) || 0) / 100, 0);
      } catch (spErr) {
        console.warn("[cashflow-dashboard] supplier_payables load failed:", spErr);
      }

      const pendingPayments = ordersData
        .filter((o) => ["pending", "partially_paid"].includes(o.payment_status || ""))
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      setMetrics({
        cashReceived,
        staffPaymentsOwed,
        fixedCostsNext30,
        supplierPayablesNext30,
        pendingPayments,
      });
      setLoadedAt(Date.now());

      // AI alerts use the same payload as the financial dashboard
      // so the narrative reads consistently across both pages.
      const generatedAlerts = await aiFinancialService.generateCashFlowAlerts(ordersData, {
        currentCashFlow: cashReceived - staffPaymentsOwed,
        projectedRevenue30Days: 0,
        upcomingExpenses: staffPaymentsOwed + fixedCostsNext30 + supplierPayablesNext30,
      });
      setAlerts(generatedAlerts);
    } catch (e) {
      console.error("[cashflow-dashboard] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user, load]);

  const net30 = (metrics?.cashReceived || 0)
    - (metrics?.staffPaymentsOwed || 0)
    - (metrics?.fixedCostsNext30 || 0)
    - (metrics?.supplierPayablesNext30 || 0);

  if (loading && !metrics) {
    return (
      <>
        <AdminNav />
        <div className="flex items-center justify-center min-h-screen lg:ml-64 xl:ml-72">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
            <p>Loading cashflow data...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Cashflow Dashboard - Admin</title>
      </Head>
      <NoIndexMeta />

      <AdminNav />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 p-4 md:p-8 lg:ml-64 xl:ml-72">
        <div className="max-w-full">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-8 h-8 text-emerald-600" />
                  Cashflow Dashboard
                </h1>
                <p className="text-slate-600">
                  Forward-looking view of cash in and cash out. Answer the question
                  &quot;can I pay this week?&quot; without doing the maths by hand.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={loading}
                className="self-start"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Cashflow forecast chart - the main attraction. Same
              component the old Financial dashboard mounted, now
              living on the focused page. */}
          {user?.company_id && (
            <div className="mb-6">
              <CashflowForecastCard
                companyId={user.company_id}
                loadedAt={loadedAt}
                orders={orders}
                staffPaymentsOwed={metrics?.staffPaymentsOwed || 0}
                currency={currency}
                userId={user.id}
              />
            </div>
          )}

          {/* Alerts - AI generated, same engine as the financial
              dashboard, focused here on cash gaps the forecast
              detects. */}
          {alerts.length > 0 && (
            <Card className="mb-6 border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Cashflow alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {alerts.map((a, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                        a.severity === "high" ? "bg-red-500"
                        : a.severity === "medium" ? "bg-amber-500"
                        : "bg-blue-500"
                      }`} />
                      <strong>{a.message}</strong>
                      {a.suggestedAction && (
                        <span className="text-slate-600"> - {a.suggestedAction}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Cashflow summary grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  30-day cashflow summary
                  <InfoTooltip content={"The same numbers the forecast chart subtracts.\n\nReceived: cash already in the bank from paid orders.\n\nWages owed, fixed costs and supplier payables are subtracted to get Net 30d."} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Row label="Received" value={fmt(metrics?.cashReceived || 0, currency)} tone="positive" />
                <Row label="Wages owed" value={`-${fmt(metrics?.staffPaymentsOwed || 0, currency)}`} tone="negative" />
                <Row label="Fixed costs (next 30d)" value={`-${fmt(metrics?.fixedCostsNext30 || 0, currency)}`} tone="negative" />
                <Row label="Supplier payables (next 30d)" value={`-${fmt(metrics?.supplierPayablesNext30 || 0, currency)}`} tone="negative" />
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-semibold flex items-center gap-1">
                    Net cash flow (30d)
                    <InfoTooltip content={"Matches the projected balance trend in the chart above."} />
                  </span>
                  <span className={`font-bold text-lg ${net30 >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmt(net30, currency)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  Quick actions
                  <InfoTooltip content={"Shortcuts to the working surfaces that feed the forecast.\n\nA scheduled cost only appears in the chart once it's recorded on one of these pages."} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <NavLink href={withSlug("/admin/payables")} icon={FileText} label="Manage payables" desc="Supplier invoices you owe" />
                <NavLink href={withSlug("/admin/fixed-costs")} icon={Wallet} label="Manage fixed costs" desc="Rent, software, recurring lines" />
                <NavLink href={withSlug("/admin/invoices?status=unpaid")} icon={Receipt} label="Chase unpaid invoices" desc={`${fmt(metrics?.pendingPayments || 0, currency)} outstanding from clients`} />
                <NavLink href={withSlug("/admin/financial-dashboard")} icon={DollarSign} label="Financial dashboard" desc="Margin, health score, order analysis" />
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-slate-500 text-center mt-8">
            Looking for revenue / profit margin / order analysis? Those live on the{" "}
            <Link href={withSlug("/admin/financial-dashboard")} className="text-emerald-700 underline">
              Financial dashboard
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "positive" | "negative" | "neutral" }) {
  const color = tone === "positive" ? "text-emerald-700"
    : tone === "negative" ? "text-red-700"
    : "text-slate-900";
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  desc,
}: {
  href: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  desc: string;
}) {
  return (
    <Link href={href} className="block">
      <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 hover:border-emerald-300 transition-colors">
        <div className="w-9 h-9 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500 truncate">{desc}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400" />
      </div>
    </Link>
  );
}
