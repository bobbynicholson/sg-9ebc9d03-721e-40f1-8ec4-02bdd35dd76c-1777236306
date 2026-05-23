import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, DollarSign, AlertTriangle, Calendar, Users, Package, CreditCard, ArrowUpRight, ArrowDownRight, Sparkles, Trophy, Download, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fixedCostsService } from "@/services/fixedCostsService";
import { orderService } from "@/services/orderService";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { analyticsService } from "@/services/analyticsService";
import { aiFinancialService } from "@/services/aiFinancialService";
import * as currencyUtils from "@/lib/currencyUtils";
import { formatLocalDate } from "@/lib/localFormat";
import { toLocalISO } from "@/lib/localDate";
import type { Order, Profile } from "@/types";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { GetServerSideProps } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useCompanyKitchens } from "@/hooks/useCompanyKitchens";
import { Building2 } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { CashflowForecastCard } from "@/components/admin/financial/CashflowForecastCard";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

interface FinancialMetrics {
  currentCashFlow: number;
  /** Cash received from paid orders (the positive side of currentCashFlow). */
  cashReceived: number;
  projectedRevenue30Days: number;
  projectedRevenue90Days: number;
  pendingPayments: number;
  staffPaymentsOwed: number;
  /** How many unpaid clock-in sessions the staffPaymentsOwed total covers. */
  unpaidSessionsCount: number;
  /** Distinct staff with at least one unpaid session. */
  unpaidStaffCount: number;
  /** Bug fix (financial-summary parity with CashflowForecastCard):
   *  sum of fixed_costs occurrences and unpaid supplier_payables
   *  due in the next 30 days. Both feed into the forecast chart
   *  above the summary; before this fix the summary ignored them
   *  and Net Cash Flow contradicted the projected balance trend. */
  fixedCostsNext30: number;
  supplierPayablesNext30: number;
  // null until a real COGS pipeline is wired (inventory_transactions
  // + supplier invoices + payroll). Previous fixed-multiplier maths
  // was removed in the May 2026 audit because it produced a constant
  // 35% margin and a health-score celebration off invented numbers.
  inventoryCosts: number | null;
  profitMargin: number | null;
  /** PR-F (cashflow cost mapping) - orders within the 90d window
   *  whose order_items rows had no unit_cost snapshot. Surface as
   *  a "X orders missing cost data" caveat on the Profit Margin
   *  tile so the owner sees the limitation. */
  ordersMissingCost: number;
  /** Orders that DID have cost data and were included in the
   *  margin calculation. */
  ordersCounted: number;
  healthScore: number;
}

interface CashFlowAlert {
  severity: "high" | "medium" | "low";
  message: string;
  suggestedAction: string;
  predictedDate?: string;
}

function FinancialDashboardInner() {
  const { user } = useAuth();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  // FIN-C (financial dashboard follow-ups): respect the global region
  // filter so a multi-region tenant can scope KPIs to a single branch.
  // Pre-FIN-C the page aggregated company-wide with no way to focus.
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showCelebration] = useState(false);
  // FIN-C: bulk-remind dialog state. Confirmation gate before the
  // page fires POST /api/admin/invoices/bulk-remind.
  const [remindDialogOpen, setRemindDialogOpen] = useState(false);
  const [remindScope, setRemindScope] = useState<"outstanding" | "overdue">("overdue");
  const [reminding, setReminding] = useState(false);
  // Admin persona follow-up (admin.md section 5): mirror the
  // cashflow-dashboard pattern. Track load errors so we can show
  // a recovery card instead of a wall of zeros that looks broken.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped when the metrics finish loading so the Cashflow Forecast
  // Card refetches its cash_on_hand value alongside the page refresh.
  const [loadedAt, setLoadedAt] = useState<number>(0);

  // Cashflow Forecast Card is gated to operator / director roles per
  // the finance-visibility rule. Read off the auth user's active
  // role; super_admin always sees the card (cross-tenant support).
  const role = String(user?.active_role || user?.role || "").toLowerCase();
  const canSeeFinanceForecast =
    role === "owner" || role === "company_admin" || role === "admin" || role === "super_admin";

  // Per-branch P&L sources from useCompanyKitchens. Cross-branch
  // operators see a "Branches" tab; single-branch tenants don't get
  // it (one row would just duplicate the Overview).
  const { kitchens } = useCompanyKitchens(user?.company_id ?? null);
  const branches = kitchens.filter((k) => k.source === "region");
  const showBranchesTab = branches.length > 1;

  const loadFinancialData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);

      // Load all financial data
      const ordersData = await orderService.getAllOrders(user.company_id);

      const [ledgerData, aiPredictions] = await Promise.all([
        paymentLedgerService.getPaymentLedger(user.company_id),
        aiFinancialService.getPredictiveAnalytics(ordersData),
      ]);

      // FIN-C: scope to the active region when set. Metrics are
      // computed client-side, so we filter the orders array once here
      // and every downstream calc reflects the same scope. Staff /
      // fixed-cost / supplier-payable totals stay company-wide
      // because they aren't region-tagged.
      const scopedOrders = regionFilterId
        ? ordersData.filter((o) => (o as { region_id?: string | null }).region_id === regionFilterId)
        : ordersData;
      setOrders(scopedOrders);

      // Calculate metrics
      const cashReceived = calculateCashReceived(scopedOrders);
      const staffPaymentsOwed = ledgerData.totalOwed || 0;
      const projectedRevenue30Days = calculateProjectedRevenue(scopedOrders, 30);
      const projectedRevenue90Days = calculateProjectedRevenue(scopedOrders, 90);
      const pendingPayments = calculatePendingPayments(scopedOrders);
      const unpaidSessionsCount = (ledgerData.unpaidSessions || []).length;
      const unpaidStaffCount = ledgerData.staffCount || 0;

      // Bug fix (financial-summary parity): mirror the cost feeds the
      // CashflowForecastCard reads (fixed_costs + supplier_payables)
      // so the Financial Summary's Net Cash Flow ties out with the
      // forecast chart's R0 line dipping. Both loads tolerant of
      // RLS / missing tables - we default to 0 on failure so the
      // summary still renders.
      const todayIso = toLocalISO(new Date());
      const thirtyIso = toLocalISO(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      let fixedCostsNext30 = 0;
      let supplierPayablesNext30 = 0;
      if (user.company_id) {
        try {
          const fixedRows = await fixedCostsService.list(
            user.company_id,
            { activeOnly: true },
          );
          const expanded = fixedCostsService.expandOccurrences(fixedRows, 30);
          fixedCostsNext30 = expanded.reduce(
            (sum, o) => sum + o.amount_cents / 100,
            0,
          );
        } catch (fcErr) {
          console.warn("[financial-dashboard] fixed_costs load failed:", fcErr);
        }
        try {
          const { data: payables } = await (supabase as any)
            .from("supplier_payables")
            .select("amount_cents, due_date")
            .eq("company_id", user.company_id)
            .eq("status", "pending")
            .is("deleted_at", null)
            .gte("due_date", todayIso)
            .lte("due_date", thirtyIso);
          supplierPayablesNext30 = ((payables as Array<{ amount_cents: number }>) || [])
            .reduce((sum, r) => sum + (Number(r.amount_cents) || 0) / 100, 0);
        } catch (spErr) {
          console.warn("[financial-dashboard] supplier_payables load failed:", spErr);
        }
      }

      // FIN-C: pull the tenant's peak-season config (NULL = SA wedding
      // default). Drives the Peak Season banner copy + trigger window.
      let peakSeasonStartMonth: number | null = null;
      let peakSeasonEndMonth: number | null = null;
      if (user.company_id) {
        try {
          const { data: companyRow } = await (supabase as any)
            .from("companies")
            .select("peak_season_start_month, peak_season_end_month")
            .eq("id", user.company_id)
            .maybeSingle();
          peakSeasonStartMonth = (companyRow as any)?.peak_season_start_month ?? null;
          peakSeasonEndMonth = (companyRow as any)?.peak_season_end_month ?? null;
        } catch (peakErr) {
          console.warn("[financial-dashboard] peak_season config load failed:", peakErr);
        }
      }

      // The 4-tile strip above keeps its simpler currentCashFlow
      // breakdown (Received / Wages owed). The Financial Summary
      // card recomputes Net inline against the new fixedCostsNext30
      // and supplierPayablesNext30 fields so the two surfaces stay
      // labelled honestly: one is "right now", the other is "30d
      // matches the forecast".
      const currentCashFlow = cashReceived - staffPaymentsOwed;
      // 90-day lookback for COGS so the tile aggregates enough usage
      // transactions to be meaningful. Synced with the projected-
      // revenue horizon below.
      const cogsSince = new Date();
      cogsSince.setDate(cogsSince.getDate() - 90);
      const cogsData = user.company_id
        ? await fetchRealCogs(user.company_id, cogsSince.toISOString())
        : null;
      const inventoryCosts = cogsData ? cogsData.cogs : null;
      const profitMargin = calculateProfitMargin(ordersData, cogsData);
      const healthScore = calculateHealthScore({
        currentCashFlow,
        projectedRevenue30Days,
        pendingPayments,
        staffPaymentsOwed,
      });

      setMetrics({
        currentCashFlow,
        cashReceived,
        projectedRevenue30Days,
        projectedRevenue90Days,
        pendingPayments,
        staffPaymentsOwed,
        unpaidSessionsCount,
        unpaidStaffCount,
        inventoryCosts,
        profitMargin,
        ordersMissingCost: cogsData?.ordersMissingCost ?? 0,
        ordersCounted: cogsData?.ordersCounted ?? 0,
        healthScore,
        fixedCostsNext30,
        supplierPayablesNext30,
      });
      setLoadedAt(Date.now());

      // Generate AI-powered alerts. FIN-C threads peak-season config
      // through so the seasonal banner respects tenant configuration.
      const generatedAlerts = await aiFinancialService.generateCashFlowAlerts(scopedOrders, {
        currentCashFlow,
        projectedRevenue30Days,
        upcomingExpenses: staffPaymentsOwed + (inventoryCosts ?? 0),
        peakSeasonStartMonth,
        peakSeasonEndMonth,
      });
      setAlerts(generatedAlerts);

      // Celebration disabled: the old gate (healthScore >= 85) fired
      // off a hardcoded 35% profit margin and rewarded every paid
      // tenant with confetti. Honest signal requires real COGS first.
    } catch (error: any) {
      console.error("Error loading financial data:", error);
      setLoadError(error?.message || "Couldn't load the financial figures. Try again.");
    } finally {
      setLoading(false);
    }
  }, [user, regionFilterId]);

  useEffect(() => {
    if (user) {
      loadFinancialData();
    }
  }, [user, loadFinancialData]);

  // FIN-B (financial dashboard audit): realtime channel scoped to the
  // caller's company so a payment captured in /admin/invoices or an
  // order confirmed in /admin/quotes lands here without a manual
  // Refresh. Subscribes to orders + payments + invoices since each
  // mutates one of the visible KPIs. Pattern mirrors the rest of the
  // admin pages (orders, leads, quotes, packages, regions, vehicles).
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const channelKey = `admin-financial-dashboard:${companyId}`;
    const channel = (supabase as any)
      .channel(channelKey)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => { loadFinancialData(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `company_id=eq.${companyId}` },
        () => { loadFinancialData(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `company_id=eq.${companyId}` },
        () => { loadFinancialData(); },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // FIN-C: handler for the bulk payment-reminder action. Calls the
  // already-shipped /api/admin/invoices/bulk-remind endpoint with the
  // operator-chosen scope (outstanding | overdue). Pre-FIN-C the
  // "Send Payment Reminders" button on this page just deep-linked to
  // /admin/invoices?status=unpaid - the copy implied a one-click send
  // but nothing was actually sent.
  const handleSendReminders = useCallback(async () => {
    setReminding(true);
    try {
      const r = await fetch("/api/admin/invoices/bulk-remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: remindScope }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to send reminders");
      const sent = Number(data?.sent ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const failed = Number(data?.failed ?? 0);
      toast({
        title: failed > 0 ? "Reminders partly sent" : "Reminders sent",
        description: `${sent} sent, ${skipped} skipped${failed > 0 ? `, ${failed} failed` : ""}. Scope: ${remindScope}.`,
        variant: failed > 0 ? "destructive" : "default",
      });
      setRemindDialogOpen(false);
    } catch (e) {
      toast({
        title: "Couldn't send reminders",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setReminding(false);
    }
  }, [remindScope, toast]);

  // FIN-C: per-order revenue / paid / outstanding breakdown for the
  // Order Analysis tab. Pre-FIN-C this tab was a 5-row "Order Revenue"
  // list that duplicated /admin/orders without surfacing finance
  // specifics. New shape sorts by largest outstanding so the operator
  // sees the biggest cash-to-collect at the top, and shows the paid
  // / outstanding split per order alongside the gross revenue.
  const ordersByOutstanding = useMemo(() => {
    return orders
      .filter((o) => o.status !== "cancelled")
      .map((o) => {
        const total = Number(o.total_amount) || 0;
        const paid = Number((o as { amount_paid?: number | string | null }).amount_paid) || 0;
        return { order: o, total, paid, outstanding: Math.max(0, total - paid) };
      })
      .sort((a, b) => b.outstanding - a.outstanding || b.total - a.total)
      .slice(0, 12);
  }, [orders]);

  // FIN-B (financial dashboard audit): cash received now sums the real
  // amount_paid column across non-cancelled orders. Pre-FIN-B this
  // filtered on payment_status === "paid" and summed total_amount,
  // which excluded every deposit-paid order (every Spit Braai order
  // sits in `partial` state - deposit received, balance outstanding)
  // and double-counted the unpaid balance as cash received on fully-
  // paid orders. The result was the Current Cash Flow + Total Revenue
  // tiles always reading R0.00 for any tenant that takes deposits
  // (i.e. every catering tenant).
  const calculateCashReceived = (orders: Order[]) => {
    return orders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + (Number((o as any).amount_paid) || 0), 0);
  };

  const calculateProjectedRevenue = (orders: Order[], days: number) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + days);

    return orders
      .filter(o => {
        if (!o.event_date) return false;
        const eventDate = new Date(o.event_date);
        if (isNaN(eventDate.getTime())) return false;
        // Only count events that haven't happened yet AND fall within the window.
        return eventDate >= now && eventDate <= futureDate && o.status !== "cancelled";
      })
      .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  };

  // FIN-B: pending payments = actual outstanding balance, not gross.
  // Pre-FIN-B summed total_amount on every pending+partial order, so
  // a R10,587 order with R5,350 deposit received showed up as R10,587
  // "pending" instead of the R5,237 actually outstanding. The tile is
  // labelled "Outstanding from clients" - it should match.
  const calculatePendingPayments = (orders: Order[]) => {
    return orders
      .filter((o) => o.status !== "cancelled"
        && (o.payment_status === "pending" || o.payment_status === "partial"))
      .reduce((sum, o) => {
        const total = Number(o.total_amount) || 0;
        const paid = Number((o as any).amount_paid) || 0;
        return sum + Math.max(0, total - paid);
      }, 0);
  };

  // Audit (May 2026, Wave 9 Item 3): real COGS pipeline. The deduction
  // service now stamps unit_cost + order_id on every 'usage'
  // inventory_transactions row. Sum (quantity * unit_cost) over usage
  // rows joined to PAID orders in the period to get real cost-of-
  // sales. When no rows exist (tenant hasn't billed paid orders yet
  // or hasn't enabled recipe deductions), returns null and the UI
  // shows "No usage data yet" honestly.
  //
  // Helpers are now closures so we can read companyId + the period
  // PR-F (cashflow cost mapping): real COGS from order_items.
  // unit_cost. The previous inventory_transactions-based path was
  // returning null for tenants who never populated that pipeline.
  // unit_cost is snapshotted at quote-accept (PR-B), so margins
  // are honest about which orders have cost data and which don't.
  //
  // Walks order_items where parent order is paid + delivered/
  // completed and created_at >= sinceIso. SUM(line_total) is the
  // revenue side; SUM(quantity * unit_cost) is the COGS. Orders
  // where every line has unit_cost=NULL are excluded from both
  // sides (legacy data, pre-snapshot) and surfaced as the "missing
  // cost data" count returned alongside the figures.
  const fetchRealCogs = async (
    companyId: string,
    sinceIso: string,
  ): Promise<{ revenue: number; cogs: number; ordersCounted: number; ordersMissingCost: number } | null> => {
    if (!companyId) return null;
    // FIN-B (financial dashboard audit): include partial-paid orders
    // in the margin sample. Pre-FIN-B this filtered .eq("payment_
    // status","paid") which excluded every deposit-paid order (the
    // majority of catering orders). Status gate stays delivered/
    // completed so we only measure margin on revenue actually
    // realised - amount_paid > 0 ensures we don't include free
    // orders. The full enum is pending / processing / completed /
    // failed / refunded / partially_refunded / disputed / partial /
    // paid; "paid" + "partial" are the two states where money
    // actually came in.
    const { data, error } = await (supabase as any)
      .from("orders")
      .select("id, total_amount, amount_paid, payment_status, status, order_items(quantity, unit_cost, line_total)")
      .eq("company_id", companyId)
      .in("payment_status", ["paid", "partial"])
      .gt("amount_paid", 0)
      .in("status", ["delivered", "completed"])
      .gte("created_at", sinceIso);
    if (error || !data) return null;
    let revenue = 0;
    let cogs = 0;
    let ordersCounted = 0;
    let ordersMissingCost = 0;
    for (const ord of data as any[]) {
      const items = (ord.order_items as any[]) || [];
      let orderRevenue = 0;
      let orderCogs = 0;
      let hasCost = false;
      for (const oi of items) {
        const qty = Number(oi.quantity) || 0;
        const lineTotal = Number(oi.line_total) || 0;
        const cost = Number(oi.unit_cost);
        orderRevenue += lineTotal;
        if (Number.isFinite(cost) && cost > 0 && qty > 0) {
          orderCogs += qty * cost;
          hasCost = true;
        }
      }
      if (!hasCost) {
        ordersMissingCost++;
        continue;
      }
      revenue += orderRevenue;
      cogs += orderCogs;
      ordersCounted++;
    }
    if (revenue <= 0) return { revenue: 0, cogs: 0, ordersCounted, ordersMissingCost };
    return { revenue, cogs, ordersCounted, ordersMissingCost };
  };

  const calculateProfitMargin = (
    _orders: Order[],
    cogsData: { revenue: number; cogs: number; ordersCounted: number; ordersMissingCost: number } | null,
  ): number | null => {
    if (!cogsData || cogsData.revenue <= 0 || cogsData.ordersCounted === 0) return null;
    return ((cogsData.revenue - cogsData.cogs) / cogsData.revenue) * 100;
  };

  const calculateHealthScore = (data: any) => {
    // Cash-flow-only health score (margin removed). Scoring caps at 80
    // until a real COGS pipeline lands; that signals to the owner the
    // score is partial.
    let score = 40;
    if (data.currentCashFlow > 0) score += 20;
    if (data.projectedRevenue30Days > data.pendingPayments) score += 10;
    if (data.currentCashFlow > data.staffPaymentsOwed * 2) score += 10;
    return Math.min(80, score);
  };

  const formatCurrency = (amount: number) => {
    return currencyUtils.formatCurrency(amount, (user?.currency as currencyUtils.CurrencyCode) || "ZAR");
  };

  if (!user) {
    return <div>Please log in to view financial dashboard</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p>Loading financial data...</p>
        </div>
      </div>
    );
  }

  // Admin persona follow-up (admin.md section 5): load-failure
  // recovery card. When the load threw and no cached metrics exist,
  // show a rose-tinted "couldn't load" panel + retry button instead
  // of the page's normal R0 wall (which previously couldn't be told
  // apart from a fresh tenant with no data).
  if (loadError && !metrics) {
    return (
      <>
        <Head><title>Financial Dashboard - CateringMS</title></Head>
        <NoIndexMeta />
        <AdminNav />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-rose-50 p-4 md:p-8 lg:ml-64 xl:ml-72">
          <div className="max-w-md mx-auto mt-12 rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-rose-900 mb-2">Couldn't load financial data</h2>
            <p className="text-sm text-slate-600 mb-4">{loadError}</p>
            <Button onClick={loadFinancialData} className="bg-emerald-600 hover:bg-emerald-700">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Zero-data empty state. When the load succeeded but the tenant
  // has no orders + zero cash received + zero projected + zero pending,
  // render a "no financial activity yet" card explaining what'll
  // populate the page. Matches the cashflow-dashboard pattern.
  const isFinancialZero = !loadError
    && orders.length === 0
    && (metrics?.cashReceived || 0) === 0
    && (metrics?.projectedRevenue30Days || 0) === 0
    && (metrics?.pendingPayments || 0) === 0;

  return (
    <>
      <Head>
        <title>Financial Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <AdminNav />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8 lg:ml-64 xl:ml-72">
        <div className="max-w-full">
          {/* Header with Health Score */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
                  Financial Dashboard
                </h1>
                <p className="text-slate-600">
                  {/* FIN-B: honest hero copy. The page is a rolling
                      90-day snapshot, not a configurable daily /
                      weekly / monthly view - that affordance is the
                      Cashflow Dashboard (linked below). */}
                  Revenue, profitability and cashflow at a glance.
                  Rolling 90-day view with profit margin and
                  outstanding balances.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* Phase 27 #4: manual refresh. The page only
                      auto-loads on mount; a bookkeeper running
                      reconciliation throughout the day previously
                      had to hard-reload to pick up fresh payment
                      data. */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadFinancialData}
                    disabled={loading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  {/* Phase 20 #6: financial snapshot CSV export. The
                      owner runs this page weekly for the team meeting
                      and monthly for the bookkeeper. Until now they
                      were copying numbers by hand. */}
                  {metrics && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                      const esc = (v: any) => {
                        if (v == null) return "";
                        const s = String(v).replace(/"/g, '""');
                        return /[",\n]/.test(s) ? `"${s}"` : s;
                      };
                      const rows: Array<[string, number | string]> = [
                        ["Metric", "Value"],
                        ["Health score", metrics.healthScore],
                        ["Current cash flow", metrics.currentCashFlow.toFixed(2)],
                        ["Cash received", metrics.cashReceived.toFixed(2)],
                        ["Projected revenue (30d)", metrics.projectedRevenue30Days.toFixed(2)],
                        ["Projected revenue (90d)", metrics.projectedRevenue90Days.toFixed(2)],
                        ["Pending payments", metrics.pendingPayments.toFixed(2)],
                        ["Staff payments owed", metrics.staffPaymentsOwed.toFixed(2)],
                        ["Unpaid sessions count", metrics.unpaidSessionsCount],
                        ["Unpaid staff count", metrics.unpaidStaffCount],
                        ["Inventory costs", metrics.inventoryCosts != null ? metrics.inventoryCosts.toFixed(2) : "not connected"],
                        ["Profit margin", metrics.profitMargin != null ? `${metrics.profitMargin.toFixed(1)}%` : "not connected"],
                      ];
                      const lines = rows.map((r) => r.map(esc).join(","));
                      // FIN-B: UTF-8 BOM so Excel-ZA opens this as
                      // UTF-8 instead of Latin-1 (which mangles the
                      // Rand symbol if a tenant ever adds it to a
                      // metric label). Same fix as calendar / regions.
                      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `financial-snapshot-${toLocalISO(new Date())}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                  >
                      <Download className="w-4 h-4 mr-2" />
                      Export snapshot CSV
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-4 md:mt-0">
                {/* FIN-B (financial dashboard audit): retuned the
                    threshold cutoffs to match the score function's
                    actual range. calculateHealthScore caps at 80
                    (margin signal is disabled until a real COGS
                    pipeline lands) - the previous 85/70 cutoffs
                    meant the card could never go green and the green
                    branch was structurally unreachable. Retune to
                    70/55 so the score's 0-80 range produces the full
                    red/yellow/green spectrum honestly. */}
                <Card className={`border-2 ${
                  (metrics?.healthScore || 0) >= 70 ? "border-green-500 bg-green-50" :
                  (metrics?.healthScore || 0) >= 55 ? "border-yellow-500 bg-yellow-50" :
                  "border-red-500 bg-red-50"
                }`}>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center gap-2 justify-center mb-1">
                      {(metrics?.healthScore || 0) >= 70 ? (
                        <Trophy className="w-5 h-5 text-green-600" />
                      ) : (
                        <Sparkles className="w-5 h-5 text-yellow-600" />
                      )}
                      <span className="text-sm font-medium text-slate-600 flex items-center gap-1">
                        Financial Health
                        <InfoTooltip content={"A score out of 100 that blends cash flow, the next 30 days of bookings, what you owe staff, and profit margin into one quick health check.\n\nHigher is better."} />
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-slate-900">
                      {metrics?.healthScore || 0}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Admin persona follow-up (admin.md section 5):
                zero-data empty state. Slot a "no financial activity
                yet" card under the header when the load succeeded
                but the tenant has no orders, no cash, no projected
                revenue, no pending payments. Stops the page reading
                as a wall of R0 that looks broken. */}
            {isFinancialZero && (
              <div className="mb-6 rounded-lg border border-emerald-200 bg-white p-8 text-center shadow-sm">
                <DollarSign className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                <h2 className="text-lg font-bold text-slate-900 mb-2">No financial activity yet</h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Once you confirm your first order or take your first deposit, this page will start
                  showing revenue, profit margin, and the next 30 / 90 days of projected income.
                </p>
                <div className="mt-4 inline-flex gap-2">
                  <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                    <Link href={withSlug("/admin/quotes/new")}>Start a quote</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={withSlug("/admin/orders")}>View orders</Link>
                  </Button>
                </div>
              </div>
            )}

            {/* Celebration Message */}
            {showCelebration && (
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-lg mb-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <Trophy className="w-8 h-8" />
                  <div>
                    <h3 className="font-bold text-lg">Outstanding Financial Health! 🎉</h3>
                    <p className="text-sm">Your business is thriving! Keep up the excellent work.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Cash Flow Alerts */}
            {alerts.length > 0 && (
              <div className="space-y-2 mb-6">
                {alerts.map((alert, index) => (
                  <Card key={index} className={`border-l-4 ${
                    alert.severity === "high" ? "border-l-red-500 bg-red-50" :
                    alert.severity === "medium" ? "border-l-yellow-500 bg-yellow-50" :
                    "border-l-blue-500 bg-blue-50"
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                          alert.severity === "high" ? "text-red-600" :
                          alert.severity === "medium" ? "text-yellow-600" :
                          "text-blue-600"
                        }`} />
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900 mb-1">
                            {alert.message}
                          </h4>
                          <p className="text-sm text-slate-600 mb-2">
                            {alert.suggestedAction}
                          </p>
                          {alert.predictedDate && (
                            <Badge variant="outline" className="text-xs">
                              Expected: {formatLocalDate(alert.predictedDate)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Forecast moved to /admin/cashflow-dashboard. This page
              keeps the backward-looking health / margin / order
              story; the forecast chart + payables / fixed costs
              roll-up + cashflow alerts live on the focused page. */}
          {canSeeFinanceForecast && (
            <Card className="mb-6 border-2 border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Cashflow forecast moved</p>
                    <p className="text-sm text-slate-600">
                      The 30-day projected balance chart, payables and fixed costs now live on the Cashflow dashboard.
                    </p>
                  </div>
                </div>
                <Link href={withSlug("/admin/cashflow-dashboard")}>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap">
                    Open cashflow dashboard
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    Current Cash Flow
                    <InfoTooltip content={"Cash already received on paid orders, less wages still owed to staff.\n\nA quick read on cash actually available right now. The two lines below show the breakdown."} />
                  </CardTitle>
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(metrics?.currentCashFlow || 0)}
                </div>
                {/* Breakdown so the net number isn't a black box. */}
                <div className="mt-2 space-y-0.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Received</span>
                    <span className="tabular-nums text-green-700">+{formatCurrency(metrics?.cashReceived || 0)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Wages owed</span>
                    <span className="tabular-nums text-red-700">-{formatCurrency(metrics?.staffPaymentsOwed || 0)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {(metrics?.currentCashFlow || 0) > 0 ? (
                    <>
                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-600">Healthy</span>
                    </>
                  ) : (metrics?.currentCashFlow || 0) === 0 ? (
                    <span className="text-sm text-slate-500">No activity yet</span>
                  ) : (
                    <>
                      <ArrowDownRight className="w-4 h-4 text-red-600" />
                      <span className="text-sm text-red-600">Needs Attention</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    30-Day Projection
                    <InfoTooltip content={"Total value of every booked event happening in the next 30 days.\n\nCancelled orders are not counted."} />
                  </CardTitle>
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(metrics?.projectedRevenue30Days || 0)}
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  {/* FIN-B: label honesty. calculateProjectedRevenue is
                      called with days=30 and filters event_date in
                      [today, today+30). That's a 30-day rolling
                      window, NOT "next month" - a quote booked today
                      for an event in 21 days counts, but one for 35
                      days does not. */}
                  Expected revenue, next 30 days
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    Pending Payments
                    <InfoTooltip content={"Money still owed to you on orders that have not been paid in full yet.\n\nIncludes pending invoices and orders with only a deposit so far."} />
                  </CardTitle>
                  <CreditCard className="w-5 h-5 text-yellow-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(metrics?.pendingPayments || 0)}
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  Outstanding from clients
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    Profit Margin
                    <InfoTooltip content={"(Revenue - menu COGS) / revenue, on PAID delivered orders in the last 90 days.\n\nCOGS sourced from order_items.unit_cost - the per-unit cost snapshot from menu_items.cost_per_unit at quote-accept (PR-B). Orders whose line items have no unit_cost snapshot are excluded from both numerator and denominator (legacy data pre-snapshot); the count is surfaced below the tile so the limitation is visible.\n\nPayroll + supplier invoices + fixed costs are NOT folded in - the figure here is a top-line gross margin, not net. See /admin/financial-dashboard cashflow forecast for the net picture."} />
                  </CardTitle>
                  <TrendingUp className={`w-5 h-5 ${metrics?.profitMargin != null ? "text-purple-600" : "text-slate-400"}`} />
                </div>
              </CardHeader>
              <CardContent>
                {metrics?.profitMargin != null ? (
                  <>
                    <div className="text-2xl font-bold text-slate-900">
                      {metrics.profitMargin.toFixed(1)}%
                    </div>
                    <p className="text-sm text-slate-600 mt-2">
                      Gross margin (90 days)
                    </p>
                    {(metrics?.ordersMissingCost || 0) > 0 && (
                      <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {metrics.ordersMissingCost} order{metrics.ordersMissingCost === 1 ? "" : "s"} missing cost data
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-slate-400">
                      No data yet
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                      {(metrics?.ordersMissingCost || 0) > 0
                        ? `${metrics?.ordersMissingCost} paid orders in the last 90 days but none have menu costs set. Open /admin/menu to fill in cost_per_unit per item.`
                        : "No paid delivered orders in the last 90 days yet."}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed Tabs */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className={`grid w-full ${showBranchesTab ? "grid-cols-5" : "grid-cols-4"}`}>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="projections">Projections</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="orders">Order Analysis</TabsTrigger>
              {showBranchesTab && <TabsTrigger value="branches">Branches</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">Financial Summary <InfoTooltip content={"Quick snapshot of money in, money out, and what is still owed.\n\nPulled together from your orders and staff wage ledger."} /></CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1">Total Revenue (Paid) <InfoTooltip content={"Total money received across every order marked as paid in full."} /></span>
                      <span className="font-semibold">{formatCurrency(
                        orders.filter(o => o.payment_status === "paid")
                          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
                      )}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1">Pending Payments <InfoTooltip content={"Balance still owed on orders that are pending or only partly paid."} /></span>
                      <span className="font-semibold text-yellow-600">
                        {formatCurrency(metrics?.pendingPayments || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1">Staff Payments Owed <InfoTooltip content={"Wages already logged for staff that you have not paid out yet."} /></span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(metrics?.staffPaymentsOwed || 0)}
                      </span>
                    </div>
                    {/* Bug fix: surface fixed costs + supplier payables
                        the forecast chart already subtracts so the
                        summary's Net line ties out with the projected
                        balance trend instead of contradicting it. */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1">Fixed Costs (next 30d) <InfoTooltip content={"Recurring rent / software / vehicle costs falling due in the next 30 days. Pulled from the Fixed Costs page. Subtracted from Net Cash Flow."} /></span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(metrics?.fixedCostsNext30 || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1">Supplier Payables (next 30d) <InfoTooltip content={"Unpaid supplier invoices with a due date in the next 30 days. Pulled from the Payables page. Subtracted from Net Cash Flow."} /></span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(metrics?.supplierPayablesNext30 || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1">Inventory Costs <InfoTooltip content={"Sum of ingredient cost on PAID orders in the last 90 days (quantity * unit_cost on usage transactions). Supplier invoices / payroll not yet folded in."} /></span>
                      {metrics?.inventoryCosts != null ? (
                        <span className="font-semibold">
                          {formatCurrency(metrics.inventoryCosts)}
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-400">
                          No usage data yet
                        </span>
                      )}
                    </div>
                    {(() => {
                      // Net Cash Flow now matches the CashflowForecastCard:
                      // cashReceived - wages - fixed costs - supplier payables.
                      // currentCashFlow alone (the 4-tile breakdown above)
                      // does not include the recurring outflows the
                      // forecast already prices in.
                      const net = (metrics?.currentCashFlow || 0)
                        - (metrics?.fixedCostsNext30 || 0)
                        - (metrics?.supplierPayablesNext30 || 0);
                      return (
                        <div className="border-t pt-4 flex justify-between items-center">
                          <span className="font-semibold flex items-center gap-1">Net Cash Flow (30d) <InfoTooltip content={"Cash received less wages owed, fixed costs and supplier payables due in the next 30 days.\n\nMatches the projected balance trend shown in the chart above."} /></span>
                          <span className={`font-bold text-lg ${net > 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(net)}
                          </span>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      Quick Actions
                      <InfoTooltip content={"Shortcuts to the pages you'll need next when the cash-flow numbers above flag a problem.\n\nEach button drops you on the relevant working surface. Nothing fires until you take action there."} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* FIN-C (financial dashboard follow-ups): Send
                        Payment Reminders is now a real action. Pre-
                        FIN-C the button deep-linked to /admin/invoices
                        and pretended that opening the list was the
                        same as sending. Now it opens a scope picker
                        (outstanding vs overdue) and POSTs to
                        /api/admin/invoices/bulk-remind which actually
                        sends per-tenant branded reminder emails. */}
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => { setRemindScope("overdue"); setRemindDialogOpen(true); }}
                      title="Pick a scope and fire branded reminder emails to every client with an outstanding or overdue invoice."
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Send Payment Reminders
                    </Button>
                    <Link href={withSlug("/admin/wages")} className="block">
                      <Button className="w-full justify-start" variant="outline" title="Open the wages page to review staff hours and process the next pay run.">
                        <Users className="w-4 h-4 mr-2" />
                        Process Staff Payments
                      </Button>
                    </Link>
                    <Link href={withSlug("/admin/inventory")} className="block">
                      <Button className="w-full justify-start" variant="outline" title="Open the inventory page to review on-hand stock value and cost-per-unit, the biggest swing factor on margin.">
                        <Package className="w-4 h-4 mr-2" />
                        Review Inventory Costs
                      </Button>
                    </Link>
                    <Link href={withSlug("/admin/calendar")} className="block">
                      <Button className="w-full justify-start" variant="outline" title="Open the calendar to see upcoming events alongside their deposit / balance due dates: the next 30 days of cash inflow.">
                        <Calendar className="w-4 h-4 mr-2" />
                        View Payment Schedule
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="projections">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Revenue Projections <InfoTooltip content={"Revenue you can expect across upcoming booked events, grouped by event date.\n\nIncludes everything booked, paid or not."} /></CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-600">Next 30 Days</span>
                        <span className="font-semibold text-xl">
                          {formatCurrency(metrics?.projectedRevenue30Days || 0)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-600">Next 90 Days</span>
                        <span className="font-semibold text-xl">
                          {formatCurrency(metrics?.projectedRevenue90Days || 0)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                          style={{ 
                            width: `${Math.min(100, ((metrics?.projectedRevenue90Days || 0) / ((metrics?.projectedRevenue30Days || 1) * 3)) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>

                    {/* FIN-C (financial dashboard follow-ups): replace
                        the hard-coded "on track to exceed quarterly
                        target by ~15%" paragraph with a real summary
                        computed from the actual numbers on this page.
                        Pre-FIN-C the AI Prediction was identical for
                        every tenant on every visit, which made the
                        page feel decorative. */}
                    {(() => {
                      const p30 = metrics?.projectedRevenue30Days || 0;
                      const p90 = metrics?.projectedRevenue90Days || 0;
                      const pending = metrics?.pendingPayments || 0;
                      const cash = metrics?.cashReceived || 0;
                      const wages = metrics?.staffPaymentsOwed || 0;
                      const runway90 = p90 + cash - wages
                        - (metrics?.fixedCostsNext30 || 0)
                        - (metrics?.supplierPayablesNext30 || 0);
                      const note = p30 <= 0
                        ? "No future events are on the books in the next 30 days yet. Get a quote out the door to build the pipeline."
                        : pending > p30
                          ? `Outstanding from clients (${formatCurrency(pending)}) exceeds next-30-day projected revenue (${formatCurrency(p30)}). Chase collections first - the bulk-remind action above is the fastest path.`
                          : runway90 < 0
                            ? `90-day net (received + projected - wages - fixed costs - supplier payables) is ${formatCurrency(runway90)}. Tighten outgoing spend or accelerate collections.`
                            : `Next 30 days project ${formatCurrency(p30)} in event revenue against ${formatCurrency(pending)} outstanding from existing clients. 90-day net runway sits at ${formatCurrency(runway90)}.`;
                      return (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h4 className="font-semibold text-slate-900 mb-2">
                            Cashflow read-out
                          </h4>
                          <p className="text-sm text-slate-700">{note}</p>
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="expenses">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Expense Tracking <InfoTooltip content={"Two cost lines side by side: real wages owed to staff, plus a rough inventory cost estimate based on in-flight orders.\n\nIngredient costs become accurate once recipes and live stock data are wired in."} /></CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                      <div>
                        <h4 className="font-semibold">Staff Payments</h4>
                        <p className="text-sm text-slate-600">
                          {(metrics?.unpaidSessionsCount ?? 0) === 0
                            ? "All staff sessions paid"
                            : `${metrics?.unpaidSessionsCount} unpaid session${metrics?.unpaidSessionsCount === 1 ? "" : "s"} across ${metrics?.unpaidStaffCount ?? 0} staff member${(metrics?.unpaidStaffCount ?? 0) === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <span className="font-bold text-lg">
                        {formatCurrency(metrics?.staffPaymentsOwed || 0)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                      <div>
                        <h4 className="font-semibold">Inventory Costs (90 days)</h4>
                        <p className="text-sm text-slate-600">
                          Real ingredient cost on paid orders. Supplier + payroll feeds still pending.
                        </p>
                      </div>
                      {metrics?.inventoryCosts != null ? (
                        <span className="font-bold text-lg">
                          {formatCurrency(metrics.inventoryCosts)}
                        </span>
                      ) : (
                        <span className="font-bold text-lg text-slate-400">
                          No usage data yet
                        </span>
                      )}
                    </div>

                    <Button className="w-full">
                      View Detailed Expense Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Outstanding by order
                    <InfoTooltip content={"Top non-cancelled orders by outstanding balance. Sorted to put the biggest cash-to-collect at the top so finance knows who to chase first.\n\nThe Profit Margin column lives on the KPI tile above; this tab is the collections view, not a duplicate of /admin/orders."} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ordersByOutstanding.length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">
                      Nothing outstanding. Every non-cancelled order has been paid in full.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {ordersByOutstanding.map(({ order, total, paid, outstanding }) => {
                        const orderNumber = (order as { order_number?: string }).order_number;
                        const status = order.status || "pending";
                        return (
                          <div key={order.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900 truncate">
                                  {order.client_name || "Unknown client"}
                                </p>
                                {orderNumber && (
                                  <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                                    #{orderNumber}
                                  </span>
                                )}
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {String(status).replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatLocalDate(order.event_date)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-amber-700 tabular-nums">
                                {formatCurrency(outstanding)}
                              </p>
                              <p className="text-[10px] text-slate-500 tabular-nums">
                                {formatCurrency(paid)} paid of {formatCurrency(total)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {showBranchesTab && (
              <TabsContent value="branches" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Per-branch P&L
                      <InfoTooltip content={"Revenue, paid amount, outstanding and order count broken down by branch.\n\nUnassigned rows are orders that don't yet have a branch stamped."} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      // Group orders by region_id. Unassigned (NULL) rows get
                      // their own bucket so legacy / company-wide orders stay
                      // visible until they're tagged.
                      const buckets = new Map<string, {
                        regionId: string | null;
                        name: string;
                        address?: string | null;
                        revenue: number;
                        paid: number;
                        outstanding: number;
                        count: number;
                      }>();
                      const ensure = (id: string | null, name: string, address?: string | null) => {
                        const key = id || "__unassigned__";
                        if (!buckets.has(key)) {
                          buckets.set(key, { regionId: id, name, address: address ?? null, revenue: 0, paid: 0, outstanding: 0, count: 0 });
                        }
                        return buckets.get(key)!;
                      };
                      // Seed with every branch so empty branches render with zeros.
                      branches.forEach((b) => ensure(b.id, b.name, b.address));
                      orders.forEach((o: any) => {
                        const branch = branches.find((b) => b.id === o.region_id);
                        const bucket = ensure(
                          o.region_id || null,
                          branch?.name || (o.region_id ? "Unknown branch" : "Unassigned"),
                          branch?.address ?? null,
                        );
                        const total = Number(o.total_amount || 0);
                        const paid = o.payment_status === "paid" ? total : Number(o.amount_paid || 0);
                        bucket.revenue += total;
                        bucket.paid += paid;
                        bucket.outstanding += Math.max(total - paid, 0);
                        bucket.count += 1;
                      });
                      const rows = Array.from(buckets.values()).sort((a, b) => b.revenue - a.revenue);
                      const totals = rows.reduce(
                        (acc, r) => ({
                          revenue: acc.revenue + r.revenue,
                          paid: acc.paid + r.paid,
                          outstanding: acc.outstanding + r.outstanding,
                          count: acc.count + r.count,
                        }),
                        { revenue: 0, paid: 0, outstanding: 0, count: 0 },
                      );

                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                                <th className="py-2 pr-3 font-medium">Branch</th>
                                <th className="py-2 px-3 font-medium text-right">Orders</th>
                                <th className="py-2 px-3 font-medium text-right">Revenue</th>
                                <th className="py-2 px-3 font-medium text-right">Paid</th>
                                <th className="py-2 pl-3 font-medium text-right">Outstanding</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r) => (
                                <tr key={r.regionId || "__unassigned__"} className="border-b last:border-0 hover:bg-slate-50">
                                  <td className="py-2.5 pr-3">
                                    <div className="font-medium text-slate-900">{r.name}</div>
                                    {r.address && (
                                      <div className="text-xs text-slate-500 truncate max-w-[20rem]">{r.address}</div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono">{r.count}</td>
                                  <td className="py-2.5 px-3 text-right font-mono font-semibold">{formatCurrency(r.revenue)}</td>
                                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{formatCurrency(r.paid)}</td>
                                  <td className="py-2.5 pl-3 text-right font-mono text-amber-700">{formatCurrency(r.outstanding)}</td>
                                </tr>
                              ))}
                              {rows.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="py-6 text-center text-slate-500">No orders to break down yet.</td>
                                </tr>
                              )}
                            </tbody>
                            {rows.length > 0 && (
                              <tfoot>
                                <tr className="bg-slate-50 font-semibold">
                                  <td className="py-2.5 pr-3">All branches</td>
                                  <td className="py-2.5 px-3 text-right font-mono">{totals.count}</td>
                                  <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(totals.revenue)}</td>
                                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{formatCurrency(totals.paid)}</td>
                                  <td className="py-2.5 pl-3 text-right font-mono text-amber-700">{formatCurrency(totals.outstanding)}</td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* FIN-C (financial dashboard follow-ups): bulk-remind dialog. */}
      <Dialog open={remindDialogOpen} onOpenChange={setRemindDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send payment reminders</DialogTitle>
            <DialogDescription>
              Fires a per-tenant branded email to every client with an
              invoice in the chosen scope. Each send is logged in the
              email automation log and respects the suppression list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setRemindScope("overdue")}
              className={`w-full text-left rounded-md border p-3 transition ${
                remindScope === "overdue"
                  ? "border-purple-500 bg-purple-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="font-medium text-slate-900">Overdue only</p>
              <p className="text-xs text-slate-500">
                Invoices past their due date. Safer default - only chases clients who&apos;ve actually missed the deadline.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setRemindScope("outstanding")}
              className={`w-full text-left rounded-md border p-3 transition ${
                remindScope === "outstanding"
                  ? "border-purple-500 bg-purple-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="font-medium text-slate-900">All outstanding</p>
              <p className="text-xs text-slate-500">
                Every sent / partially-paid / overdue invoice. Use when chasing the whole AR book.
              </p>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemindDialogOpen(false)} disabled={reminding}>
              Cancel
            </Button>
            <Button onClick={handleSendReminders} disabled={reminding}>
              {reminding ? "Sending..." : `Send ${remindScope} reminders`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// FIN-A (financial-dashboard audit, FIN-7): defense-in-depth at the
// component layer. Page was previously bare default with only an
// in-render canSeeFinanceForecast gate around the Cashflow Forecast
// Card - revenue tiles + profit margin rendered before auth context
// resolved. Tight finance roles only per Skylight rule.
export default function FinancialDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <FinancialDashboardInner />
    </ProtectedRoute>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {},
  };
};
