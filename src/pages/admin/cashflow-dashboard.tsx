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
 * Owner / company_admin / super_admin only per the finance-visibility
 * rule (canAccessFinance; plain admin is deliberately excluded).
 * Gated via ProtectedRoute below.
 */
import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, Banknote, AlertTriangle, RefreshCw,
  FileText, Wallet, Receipt, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { DEFAULT_TENANT_TIMEZONE, parseLocalDay, tenantToday, toLocalISO } from "@/lib/localDate";
import { computeCurrentCashPosition } from "@/lib/cashflowMath";
import { isPipelineRevenue } from "@/lib/orderRevenueClassification";
import { fixedCostsService } from "@/services/fixedCostsService";
import { orderService } from "@/services/orderService";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { aiFinancialService } from "@/services/aiFinancialService";
import { formatZAR } from "@/lib/formatters";
import type { Order } from "@/types";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useTenantHref } from "@/lib/tenantUrl";
import { CashflowForecastCard } from "@/components/admin/financial/CashflowForecastCard";
import { BulkRemindDialog } from "@/components/admin/financial/BulkRemindDialog";
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
  // CASH-B (cashflow follow-ups): row counts on the cost feeds the
  // CashflowForecastCard renders separately. Used only by the page-
  // level empty-state guard so a tenant with no orders but 8 draft
  // equipment hire rows doesn't see the "No cashflow activity yet"
  // card while the chart below correctly shows the R518.75 of
  // upcoming hire costs.
  equipmentHireUpcomingCount: number;
  shoppingUpcomingCount: number;
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
        // CASH-A (cashflow dashboard audit): the OWNER role landed in
        // task #104 but never picked up this gate. Owners are the
        // single most likely persona to want a "can I pay this week?"
        // forecast yet were locked out of the page.
        UserRole.OWNER,
      ]}
    >
      <CashflowDashboardInner />
    </ProtectedRoute>
  );
}

function CashflowDashboardInner() {
  const { user } = useAuth();
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id);
  const { withSlug } = useTenantHref();
  // CASH-A: region scoping. Without this, a multi-branch tenant sees
  // the company-wide forecast even when the global region filter is
  // set; the financial-dashboard page already respects this filter
  // (FIN-C) so the two pages disagreed on what "Net 30d" means.
  const { regionFilterId } = useRegionFilter();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CashflowMetrics | null>(null);
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadedAt, setLoadedAt] = useState<number>(0);
  // Admin persona follow-up (admin.md section 5): money pages
  // previously silently rendered zeros on failure. Now we track a
  // load-error so the page can show "couldn't load - retry" instead
  // of pretending everything's R0.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Audit fix: the per-feed catches below (fixed costs, payables,
  // hire / shopping counts, invoices) used to log-and-zero in
  // silence, so a broken feed read as "R0 due" forever. Collect the
  // failures and surface a partial-load banner instead.
  const [partialFailures, setPartialFailures] = useState<string[]>([]);
  // CASH-D: Quick Action "Chase unpaid invoices" now opens the same
  // bulk-remind dialog the financial-dashboard uses. Pre-CASH-D the
  // button label was a verb ("Chase") but the action was just a
  // deep-link to /admin/invoices?status=unpaid - the operator had to
  // click again on the destination to actually send anything.
  const [remindDialogOpen, setRemindDialogOpen] = useState(false);
  // CASH-D: invoice-derived outstanding total. The Quick Action
  // subtitle has to match what bulk-remind will actually act on, and
  // bulk-remind operates on the `invoices` table - not on orders.
  // Pre-CASH-D this read `metrics.pendingPayments` which is computed
  // from orders.total_amount - amount_paid; the two can drift on
  // write-offs / deposit-only orders without a matching invoice row,
  // making the subtitle promise a number the action couldn't deliver.
  const [invoicesOutstanding, setInvoicesOutstanding] = useState<number | null>(null);

  const currency = (user as any)?.currency || "ZAR";
  // Audit 2026-07-02: display goes through formatZAR (thousand
  // separators, "R 12 500.00") so this page matches Payables / Fixed
  // costs / the financial dashboard instead of the old "R12500.00".
  const fmt = (a: number, c: string) => formatZAR(a, { currency: c });

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      setLoading(true);
      setLoadError(null);
      const failures: string[] = [];

      const companyId = user.company_id;

      // Tenant timezone anchor. Every "today" comparison below follows
      // the tenant's wall clock (companies.timezone), not the
      // operator's browser clock - a JHB tenant's 30-day window
      // shouldn't shift because the bookkeeper is travelling.
      let tenantTz: string = DEFAULT_TENANT_TIMEZONE;
      try {
        const { data: companyRow, error: tzErr } = await (supabase as any)
          .from("companies")
          .select("timezone")
          .eq("id", companyId)
          .maybeSingle();
        if (tzErr) throw tzErr;
        tenantTz = (companyRow as any)?.timezone || DEFAULT_TENANT_TIMEZONE;
      } catch (tzErr) {
        // Fall back to the SA default; not worth a user-facing banner.
        captureException(tzErr, {
          level: "warning",
          tags: { companyId, route: "/admin/cashflow-dashboard", step: "tenant_timezone" },
        });
      }
      // SHAPE-A (task #97, 2026-05-24): cashflow projections read
      // order columns + region_id only. No nested data is touched.
      // Drop to light mode to skip the joins that this tenant's
      // 1000+ orders would otherwise stream uselessly.
      // Audit fix (2026-07-02): explicit limit. The service default
      // is the 500 most recent rows, which silently truncated the
      // received / outstanding totals once a tenant passed 500
      // orders. 2000 is the service ceiling; past that this page
      // needs a server-side aggregate (flagged, not yet built).
      const ordersData = await orderService.getAllOrders(companyId, { mode: "light", limit: 2000 });
      // CASH-A: filter the orders array by the active region filter
      // BEFORE every downstream calc. Staff / fixed costs / supplier
      // payables totals stay company-wide because none of those tables
      // carry region_id - same trade-off as the financial-dashboard
      // FIN-C scoping.
      const scopedOrders = regionFilterId
        ? ordersData.filter((o) => (o as { region_id?: string | null }).region_id === regionFilterId)
        : ordersData;
      setOrders(scopedOrders);

      const ledger = await paymentLedgerService.getPaymentLedger(companyId);
      // CASH-A: same enum-drift fix the financial dashboard got in
      // FIN-B. payment_status="paid" misses every deposit-paid order
      // (which is most catering orders); amount_paid on non-cancelled
      // rows is the source of truth for cash actually received.
      const cashReceived = scopedOrders
        .filter((o) => o.status !== "cancelled")
        .reduce((sum, o) => sum + (Number((o as { amount_paid?: number | string | null }).amount_paid) || 0), 0);
      const staffPaymentsOwed = ledger.totalOwed || 0;
      // CASH-A: projected revenue feeds the AI alert engine. Pre-CASH-A
      // this passed 0, which made cashFlowRatio = 0 / upcomingExpenses
      // = 0 in aiFinancialService.generateCashFlowAlerts:88, tripping
      // the "Tight Cash Flow Expected" warning on every page load
      // regardless of actual inflow. Real projection is the sum of
      // non-cancelled orders with event_date in [today, today+30].
      // Tenant-timezone "today" (local midnight) rather than browser
      // midnight - see the timezone fetch above.
      const today = tenantToday(tenantTz);
      const horizon = new Date(today.getTime() + 30 * 86_400_000);
      // TIGHTEN I.70 (2026-06-01): use isPipelineRevenue so
      // projection counts pipeline + booked + realised but excludes
      // churned. Previously the filter was just "not cancelled",
      // which is the same set today but locks the semantic in via
      // the shared helper - future enum drift won't silently change
      // this projection.
      // parseLocalDay pins the bare event_date to local midnight so
      // the compare lives in the same local-midnight space as the
      // tenantToday anchor (new Date("YYYY-MM-DD") parses as UTC
      // midnight, which slips a day for browsers west of UTC).
      const projectedRevenue30Days = scopedOrders
        .filter((o) => {
          if (!o.event_date) return false;
          if (!isPipelineRevenue(o as any)) return false;
          const d = parseLocalDay(o.event_date);
          return !!d && d >= today && d <= horizon;
        })
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      // Mirror the CashflowForecastCard cost feeds so the summary
      // and chart move in sync. Best-effort: a missing table / RLS
      // refusal logs and zeroes the row instead of nuking the page.
      const todayIso = toLocalISO(today);
      const thirtyIso = toLocalISO(horizon);
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
        captureException(fcErr, {
          level: "warning",
          tags: { companyId, route: "/admin/cashflow-dashboard", step: "fixed_costs" },
        });
        failures.push("fixed costs");
      }
      try {
        // Audit fix: PostgREST returns errors in the result, it does
        // not throw - the old destructure-data-only shape meant a
        // failed query silently zeroed the payables row.
        const { data: payables, error: spQueryErr } = await (supabase as any)
          .from("supplier_payables")
          .select("amount_cents, due_date")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .is("deleted_at", null)
          .gte("due_date", todayIso)
          .lte("due_date", thirtyIso);
        if (spQueryErr) throw spQueryErr;
        supplierPayablesNext30 = ((payables as Array<{ amount_cents: number }>) || [])
          .reduce((sum, r) => sum + (Number(r.amount_cents) || 0) / 100, 0);
      } catch (spErr) {
        captureException(spErr, {
          level: "warning",
          tags: { companyId, route: "/admin/cashflow-dashboard", step: "supplier_payables" },
        });
        failures.push("supplier payables");
      }

      // CASH-B: feed the empty-state guard. Without these counts the
      // page rendered "No cashflow activity yet" for any tenant whose
      // only signal was upcoming equipment hire or a buy-list - while
      // the CashflowForecastCard below correctly drew those costs into
      // the chart. The two surfaces disagreed.
      let equipmentHireUpcomingCount = 0;
      let shoppingUpcomingCount = 0;
      try {
        const { count: hireCount, error: hireQueryErr } = await (supabase as any)
          .from("equipment_hire_orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("expected_pickup_date", todayIso)
          .not("status", "in", "(completed,cancelled,returned)");
        if (hireQueryErr) throw hireQueryErr;
        equipmentHireUpcomingCount = hireCount || 0;
      } catch (hireErr) {
        captureException(hireErr, {
          level: "warning",
          tags: { companyId, route: "/admin/cashflow-dashboard", step: "equipment_hire_count" },
        });
        failures.push("equipment hire count");
      }
      try {
        const { count: shopCount, error: shopQueryErr } = await (supabase as any)
          .from("shopping_lists")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("list_date", todayIso)
          .not("status", "in", "(completed,cancelled)");
        if (shopQueryErr) throw shopQueryErr;
        shoppingUpcomingCount = shopCount || 0;
      } catch (shopErr) {
        captureException(shopErr, {
          level: "warning",
          tags: { companyId, route: "/admin/cashflow-dashboard", step: "shopping_count" },
        });
        failures.push("shopping list count");
      }

      // CASH-A: pending payments = outstanding balance, not gross
      // total. Pre-CASH-A this summed total_amount on every pending+
      // partial order, so a R10,587 order with a R5,350 deposit
      // showed up as R10,587 "outstanding" instead of R5,237. Same
      // mismatch the financial-dashboard had at FIN-B.
      const pendingPayments = scopedOrders
        .filter((o) => o.status !== "cancelled"
          && (o.payment_status === "pending" || o.payment_status === "partial"))
        .reduce((sum, o) => {
          const total = Number(o.total_amount) || 0;
          const paid = Number((o as { amount_paid?: number | string | null }).amount_paid) || 0;
          return sum + Math.max(0, total - paid);
        }, 0);

      setMetrics({
        cashReceived,
        staffPaymentsOwed,
        fixedCostsNext30,
        supplierPayablesNext30,
        pendingPayments,
        equipmentHireUpcomingCount,
        shoppingUpcomingCount,
      });

      // CASH-D: invoice-derived "outstanding from clients" total.
      // Same filter as /api/admin/invoices/bulk-remind (sent +
      // partially_paid + overdue with balance > 0) so the Quick
      // Action subtitle promises exactly what the action will chase.
      // Region scoping is NOT applied: invoices don't carry region_id
      // (the underlying order does), matching the /admin/invoices
      // tile behaviour.
      try {
        const { data: invRows, error: invErr } = await (supabase as any)
          .from("invoices")
          .select("balance_due, status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["sent", "partially_paid", "overdue"]);
        if (invErr) throw invErr;
        const total = ((invRows as Array<{ balance_due: number | string | null }>) || [])
          .reduce((sum, r) => sum + Math.max(0, Number(r.balance_due ?? 0)), 0);
        setInvoicesOutstanding(total);
      } catch (invErr) {
        captureException(invErr, {
          level: "warning",
          tags: { companyId, route: "/admin/cashflow-dashboard", step: "invoices_outstanding" },
        });
        setInvoicesOutstanding(null);
        failures.push("outstanding invoices total");
      }

      setPartialFailures(failures);
      setLoadedAt(Date.now());

      // AI alerts use the same payload as the financial dashboard
      // so the narrative reads consistently across both pages.
      // CASH-A: projectedRevenue30Days is now a real number (was 0
      // pre-CASH-A, which made the "Tight Cash Flow Expected" branch
      // always trip).
      const generatedAlerts = await aiFinancialService.generateCashFlowAlerts(scopedOrders, {
        currentCashFlow: cashReceived - staffPaymentsOwed,
        projectedRevenue30Days,
        upcomingExpenses: staffPaymentsOwed + fixedCostsNext30 + supplierPayablesNext30,
      });
      setAlerts(generatedAlerts);
    } catch (e: any) {
      captureException(e, {
        level: "error",
        tags: { companyId: user?.company_id, route: "/admin/cashflow-dashboard", step: "load" },
      });
      setLoadError(e?.message || "Couldn't load the cashflow figures. Try again.");
    } finally {
      setLoading(false);
    }
  }, [user, regionFilterId]);

  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user, load, refreshSignal]);

  // CASH-A: realtime channel scoped to the caller's company so the
  // forecast updates when orders / payments / fixed_costs / supplier_
  // payables / equipment_hire_orders mutate in another tab. Pre-CASH-A
  // the operator had to hit Refresh manually.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const channelKey = `admin-cashflow-dashboard:${companyId}`;
    const channel = (supabase as any)
      .channel(channelKey)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => { void load(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `company_id=eq.${companyId}` },
        () => { void load(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fixed_costs", filter: `company_id=eq.${companyId}` },
        () => { void load(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supplier_payables", filter: `company_id=eq.${companyId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // CASH-C: canonical Net-30 via the shared helper. inventoryCosts
  // is null here because this page doesn't fetch 90d COGS; the
  // helper treats null as "unknown" and omits it from the
  // subtraction, which is the honest thing to do. The financial
  // dashboard knows COGS and passes the real number, so its net
  // will be lower by the inventory amount. That asymmetry is real
  // (different surfaces have different data) and intentional, not a
  // formula drift.
  const net30 = computeCurrentCashPosition({
    cashReceived: metrics?.cashReceived || 0,
    wages: metrics?.staffPaymentsOwed || 0,
    fixedCostsNext30: metrics?.fixedCostsNext30 || 0,
    supplierPayablesNext30: metrics?.supplierPayablesNext30 || 0,
    inventoryCosts: null,
  }).net;

  if (loading && !metrics) {
    // Audit fix (2026-07-02): the first-load branch was missing the
    // page title + noindex meta the other three states carry.
    return (
      <>
        <Head><title>Cashflow dashboard - CateringMS</title></Head>
        <NoIndexMeta />
        <AdminNav />
        <div className="admin-page-shell admin-page-shell--center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary/80 mx-auto mb-4" />
            <p>Loading cashflow data...</p>
          </div>
        </div>
      </>
    );
  }

  // Admin persona follow-up: when the load failed AND we have no
  // cached metrics, show a recovery card instead of a wall of zeros.
  if (loadError && !metrics) {
    return (
      <>
        <Head><title>Cashflow dashboard - CateringMS</title></Head>
        <NoIndexMeta />
        <AdminNav />
        <div className="admin-page-shell">
          <div className="max-w-md mx-auto mt-12 rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-rose-900 mb-2">Couldn't load cashflow</h2>
            <p className="text-sm text-slate-600 mb-4">{loadError}</p>
            <Button onClick={() => { void load(); }} className="bg-brand-primary hover:bg-brand-primary/90">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Cashflow dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          {/* Command-centre hero: dark band with the tenant's brand
              washes. Chips read live values off the loaded metrics;
              the net chip stays semantic (emerald good, rose bad). */}
          <PortalHeader
            variant="hero"
            title="Cashflow"
            icon={TrendingUp}
            subtitle={'Forward-looking view of cash in and cash out. Answers "can I pay this week?" without doing the maths by hand.'}
            meta={
              metrics ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${net30 >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                    Net 30d {fmt(net30, currency)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {fmt(metrics.pendingPayments, currency)} outstanding
                  </span>
                  {alerts.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {alerts.length} alert{alerts.length === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
            <>
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
            </>
            }
          />
          <PageWorkbench />

          {/* Reload failed but we still hold the previous figures:
              say so instead of silently showing stale numbers. */}
          {loadError && metrics && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <p className="flex-1 text-sm text-rose-900">Couldn't refresh: {loadError} The figures below may be stale.</p>
              <Button variant="outline" size="sm" onClick={() => { void load(); }} disabled={loading}>Retry</Button>
            </div>
          )}

          {/* Partial-load warning: one of the cost feeds failed and
              its row may read R0 by mistake. */}
          {!loadError && partialFailures.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
              <p className="flex-1 text-sm text-amber-900">
                Some figures failed to load and may show 0 ({partialFailures.join(", ")}).
              </p>
              <Button variant="outline" size="sm" onClick={() => { void load(); }} disabled={loading}>Retry</Button>
            </div>
          )}

          {/* Admin follow-up (admin.md): zero-data empty state.
              Replace the chart + KPI tiles with a "no activity yet"
              card when the tenant has no orders + no inflows + no
              outflows. Otherwise the page renders a wall of R0
              that looks broken. */}
          {/* CASH-B: also check equipment hire + shopping counts so a
              tenant with no orders but upcoming hire or a buy-list
              doesn't see the empty-state while the chart below
              renders real costs. */}
          {/* Guarded on partialFailures too: a failed feed must not
              masquerade as a genuinely empty tenant. */}
          {orders.length === 0
            && partialFailures.length === 0
            && (metrics?.cashReceived || 0) === 0
            && (metrics?.pendingPayments || 0) === 0
            && (metrics?.fixedCostsNext30 || 0) === 0
            && (metrics?.supplierPayablesNext30 || 0) === 0
            && (metrics?.equipmentHireUpcomingCount || 0) === 0
            && (metrics?.shoppingUpcomingCount || 0) === 0 ? (
            <div className="mb-6 rounded-lg border border-brand-primary/20 bg-white p-8 text-center shadow-sm">
              <TrendingUp className="w-10 h-10 text-brand-primary mx-auto mb-3" />
              <h2 className="text-lg font-bold text-slate-900 mb-2">No cashflow activity yet</h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Once you confirm your first order or record your first payment, this dashboard
                will start projecting your cash position forward 30 days.
              </p>
              <div className="mt-4 inline-flex gap-2">
                <Button asChild className="bg-brand-primary hover:bg-brand-primary/90">
                  <Link href={withSlug("/admin/quotes/new")}>Start a quote</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={withSlug("/admin/payables")}>Add a payable</Link>
                </Button>
              </div>
            </div>
          ) : null}

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
                        a.severity === "high" ? "bg-rose-500"
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
                  <Banknote className="w-5 h-5 text-brand-primary" />
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
                  <span className={`font-bold text-lg ${net30 >= 0 ? "text-brand-primary" : "text-rose-600"}`}>
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
                {/* CASH-D: live subtitles + ?from=cashflow on every
                    href so the destination page can show a contextual
                    banner explaining why the operator landed there. */}
                <NavLink
                  href={withSlug("/admin/payables?from=cashflow")}
                  icon={FileText}
                  label="Manage payables"
                  desc={
                    (metrics?.supplierPayablesNext30 || 0) > 0
                      ? `${fmt(metrics?.supplierPayablesNext30 || 0, currency)} due in 30d`
                      : "Supplier invoices you owe"
                  }
                />
                <NavLink
                  href={withSlug("/admin/fixed-costs?from=cashflow")}
                  icon={Wallet}
                  label="Manage fixed costs"
                  desc={
                    (metrics?.fixedCostsNext30 || 0) > 0
                      ? `${fmt(metrics?.fixedCostsNext30 || 0, currency)} recurring in 30d`
                      : "Rent, software, recurring lines"
                  }
                />
                {/* CASH-D: "Chase unpaid invoices" now opens the
                    bulk-remind dialog instead of deep-linking to a
                    filtered list. Subtitle uses the invoice-derived
                    outstanding total so the figure matches what the
                    action will actually chase. Shows "..." while the
                    invoice fetch is in flight rather than lying with
                    a zero. */}
                <ActionLink
                  icon={Receipt}
                  label="Chase unpaid invoices"
                  desc={
                    invoicesOutstanding == null
                      ? "Loading outstanding total..."
                      : invoicesOutstanding > 0
                        ? `${fmt(invoicesOutstanding, currency)} outstanding from clients`
                        : "No unpaid invoices right now"
                  }
                  onClick={() => setRemindDialogOpen(true)}
                  disabled={invoicesOutstanding != null && invoicesOutstanding <= 0}
                />
                <NavLink
                  href={withSlug("/admin/financial-dashboard?from=cashflow")}
                  icon={Banknote}
                  label="Financial dashboard"
                  desc="Margin, health score, order analysis"
                />
              </CardContent>
            </Card>
          </div>
        </PortalShell>
      </div>

      <BulkRemindDialog open={remindDialogOpen} onOpenChange={setRemindDialogOpen} />
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "positive" | "negative" | "neutral" }) {
  const color = tone === "positive" ? "text-brand-primary"
    : tone === "negative" ? "text-rose-700"
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
      <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 hover:border-brand-primary/30 transition-colors">
        <div className="w-9 h-9 rounded-md bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
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

// CASH-D: button variant of NavLink for Quick Actions that fire an
// action (e.g. open a dialog) instead of navigating. Same visual
// shape so the card reads as one consistent stack.
function ActionLink({
  icon: Icon,
  label,
  desc,
  onClick,
  disabled,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="block w-full text-left disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 hover:border-brand-primary/30 transition-colors">
        <div className="w-9 h-9 rounded-md bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500 truncate">{desc}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400" />
      </div>
    </button>
  );
}
