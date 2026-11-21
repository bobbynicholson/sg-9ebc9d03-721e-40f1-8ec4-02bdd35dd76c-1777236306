import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle , CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Banknote, AlertTriangle, Calendar, Users, Package, CreditCard, ArrowUpRight, ArrowDownRight, Trophy, Download, RefreshCw, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { fixedCostsService } from "@/services/fixedCostsService";
import { orderService } from "@/services/orderService";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { aiFinancialService } from "@/services/aiFinancialService";
import { formatZAR } from "@/lib/formatters";
import { formatLocalDate } from "@/lib/localFormat";
import { isBookedRevenue, isPipelineRevenue } from "@/lib/orderRevenueClassification";
import { completeOrderMenuCogs, isReportableOrder, orderGrossValue, orderNetCollected, orderRevenueExcludingTax, sumBookedOutstanding, sumNetCollected } from "@/lib/orderRevenueMath";
import { DEFAULT_TENANT_TIMEZONE, parseLocalDay, tenantToday, toLocalISO } from "@/lib/localDate";
import { computeCurrentCashPosition } from "@/lib/cashflowMath";
import type { Order } from "@/types";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { GetServerSideProps } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useCompanyKitchens } from "@/hooks/useCompanyKitchens";
import { Building2 } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { BulkRemindDialog } from "@/components/admin/financial/BulkRemindDialog";
import { CashflowContextBanner } from "@/components/admin/financial/CashflowContextBanner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { canAccessFinance } from "@/lib/authGuards";
import { PageLoader } from "@/components/ui/loading-skeleton";
import { DashboardDateRange, getDateRangeLabel, resolvePreset, DateRange } from "@/components/dashboard/DashboardDateRange";
import { ProfitabilityOrderReview } from "@/components/admin/ProfitabilityOrderReview";

type FinancialSection = "overview" | "projections" | "expenses" | "orders" | "branches";

interface FinancialMetrics {
  currentCashFlow: number;
  /** Net cash still held on reportable orders, including unrefunded cancellations. */
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
  // Menu COGS from delivered/completed orders with complete saved
  // item costs. This is separate from supplier invoices and payroll.
  inventoryCosts: number | null;
  grossProfit: number | null;
  profitMargin: number | null;
  /** Orders in the selected profitability range with incomplete item costs. */
  ordersMissingCost: number;
  /** Orders that DID have cost data and were included in the
   *  margin calculation. */
  ordersCounted: number;
  missingCostOrderDetails: Array<{
    id: string;
    order_number?: string | null;
    client_name?: string | null;
    event_name?: string | null;
    event_date?: string | null;
    missingLineCount: number;
  }>;
  profitabilityAuditAvailable: boolean;
  healthScore: number;
}

interface CashFlowAlert {
  severity: "high" | "medium" | "low";
  message: string;
  suggestedAction: string;
  predictedDate?: string;
}

function FinancialDashboardInner() {
  const { user, company } = useAuth();
  const companyTimezone = String((company as any)?.timezone || DEFAULT_TENANT_TIMEZONE);
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id);
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  // FIN-C (financial dashboard follow-ups): respect the global region
  // filter so a multi-region tenant can scope KPIs to a single branch.
  // Pre-FIN-C the page aggregated company-wide with no way to focus.
  const { regionFilterId } = useRegionFilter();
  const [profitabilityRange, setProfitabilityRange] = useState<DateRange>(() =>
    resolvePreset("this_month", tenantToday(companyTimezone)),
  );
  useEffect(() => {
    setProfitabilityRange((current) => current.presetId === "custom"
      ? current
      : resolvePreset(current.presetId, tenantToday(companyTimezone)));
  }, [companyTimezone]);
  const [loading, setLoading] = useState(true);
  const [activeFinancialSection, setActiveFinancialSection] = useState<FinancialSection>("overview");
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showCelebration] = useState(false);
  // FIN-C: bulk-remind dialog state. Confirmation gate before the
  // page fires POST /api/admin/invoices/bulk-remind. CASH-D extracted
  // the dialog into a shared component so the cashflow-dashboard
  // can fire the same flow.
  const [remindDialogOpen, setRemindDialogOpen] = useState(false);
  // Admin persona follow-up (admin.md section 5): mirror the
  // cashflow-dashboard pattern. Track load errors so we can show
  // a recovery card instead of a wall of zeros that looks broken.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Audit fix: the best-effort feeds (fixed costs, payables, peak
  // season, COGS) used to log-and-zero in silence. Collect failures
  // and surface a partial-load banner so a broken feed never reads
  // as an honest R0.
  const [partialFailures, setPartialFailures] = useState<string[]>([]);

  // Cashflow Forecast Card is gated to operator / director roles per
  // the finance-visibility rule. TIGHTEN I.7 (2026-05-26): the
  // previous inline check granted UserRole.ADMIN, which canAccessRoute
  // already refuses on this entire route - dead branch in practice
  // but the wrong shape. Going through canAccessFinance keeps the
  // gate in step with the canonical helper everywhere.
  const activeRole = String(user?.active_role || user?.role || "").toLowerCase() as UserRole;
  const canSeeFinanceForecast = canAccessFinance(activeRole);

  // Per-branch P&L sources from useCompanyKitchens. Cross-branch
  // operators see a "Branches" tab; single-branch tenants don't get
  // it (one row would just duplicate the Overview).
  const { kitchens } = useCompanyKitchens(user?.company_id ?? null);
  const branches = kitchens.filter((k) => k.source === "region");
  const showBranchesTab = branches.length > 1;
  const selectedFinancialSection: FinancialSection =
    activeFinancialSection === "branches" && !showBranchesTab ? "overview" : activeFinancialSection;

  const loadFinancialData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      const failures: string[] = [];

      // Tenant timezone + peak-season config in one round trip. The
      // timezone anchors every "today" comparison below to the
      // tenant's wall clock (companies.timezone) instead of the
      // operator's browser clock. FIN-C originally fetched only the
      // peak-season columns further down; merged here so the anchor
      // exists before the projection maths runs.
      let tenantTz: string = DEFAULT_TENANT_TIMEZONE;
      let peakSeasonStartMonth: number | null = null;
      let peakSeasonEndMonth: number | null = null;
      if (user.company_id) {
        try {
          const { data: companyRow, error: companyErr } = await (supabase as any)
            .from("companies")
            .select("timezone, peak_season_start_month, peak_season_end_month")
            .eq("id", user.company_id)
            .maybeSingle();
          if (companyErr) throw companyErr;
          tenantTz = (companyRow as any)?.timezone || DEFAULT_TENANT_TIMEZONE;
          peakSeasonStartMonth = (companyRow as any)?.peak_season_start_month ?? null;
          peakSeasonEndMonth = (companyRow as any)?.peak_season_end_month ?? null;
        } catch (peakErr) {
          captureException(peakErr, {
            level: "warning",
            tags: { companyId: user.company_id, route: "/admin/financial-dashboard", step: "company_config" },
          });
        }
      }
      const todayAnchor = tenantToday(tenantTz);

      // Load all financial data. SHAPE-A (task #97, 2026-05-24):
      // dashboard reads order columns + computes totals; never
      // touches the joined client / order_items / driver / chef /
      // vehicle objects. Pull the light shape so we don't haul
      // hundreds of order_items(*) rows we'll never look at.
      // Page through the complete history so cash, balances and branch
      // totals never silently stop at the service's one-page limit.
      const ordersData = await orderService.getAllOrdersForFinancialReports(user.company_id);

      // FIN-E (financial dashboard tabs audit): dropped the
      // aiFinancialService.getPredictiveAnalytics call entirely.
      // PR #308 replaced the Projections tab's AI Prediction
      // paragraph with the inline Cashflow read-out that reads
      // straight off metrics.*, so the returned `aiPredictions`
      // value was unused. The call also had two production
      // hazards: (1) when orders=[] it fell back to a cross-tenant
      // `from('orders').select('*').limit(100)` with no company_id
      // filter, leaning on RLS to scope - belt-and-braces
      // missing; (2) it upserted 90 rows into financial_predictions
      // per page load using a hardcoded 65% expense ratio and a
      // hardcoded seasonal curve that ignored the per-tenant peak-
      // season columns we just shipped in PR #309. The table is
      // not surfaced anywhere; the rows were write-only garbage.
      const ledgerData = await paymentLedgerService.getPaymentLedger(user.company_id);

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
      const projectedRevenue30Days = calculateProjectedRevenue(scopedOrders, 30, todayAnchor);
      const projectedRevenue90Days = calculateProjectedRevenue(scopedOrders, 90, todayAnchor);
      const pendingPayments = calculatePendingPayments(scopedOrders);
      const unpaidSessionsCount = (ledgerData.unpaidSessions || []).length;
      const unpaidStaffCount = ledgerData.staffCount || 0;

      // Bug fix (financial-summary parity): mirror the cost feeds the
      // CashflowForecastCard reads (fixed_costs + supplier_payables)
      // so the Financial Summary's Net Cash Flow ties out with the
      // forecast chart's R0 line dipping. Both loads tolerant of
      // RLS / missing tables - we default to 0 on failure so the
      // summary still renders.
      const todayIso = toLocalISO(todayAnchor);
      const thirtyIso = toLocalISO(new Date(todayAnchor.getTime() + 30 * 24 * 60 * 60 * 1000));
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
          // FIN-D (console cleanup): route through the observability
          // helper so Sentry (when wired) gets a tagged event. Locally
          // this is still console.error under the hood; the tags +
          // company_id are what matter once the DSN lands.
          captureException(fcErr, {
            level: "warning",
            tags: { companyId: user.company_id, route: "/admin/financial-dashboard", step: "fixed_costs" },
          });
          failures.push("fixed costs");
        }
        try {
          // Audit fix: PostgREST returns errors in the result, it
          // does not throw - the old destructure-data-only shape
          // meant a failed query silently zeroed the payables row.
          const { data: payables, error: spQueryErr } = await (supabase as any)
            .from("supplier_payables")
            .select("amount_cents, due_date")
            .eq("company_id", user.company_id)
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
            tags: { companyId: user.company_id, route: "/admin/financial-dashboard", step: "supplier_payables" },
          });
          failures.push("supplier payables");
        }
      }

      // Peak-season config now rides the companies fetch at the top
      // of this function (merged with the timezone read).

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
      const cogsSince = new Date(todayAnchor);
      cogsSince.setDate(cogsSince.getDate() - 89);
      const inventoryCogsFrom = toLocalISO(cogsSince);
      const inventoryCogsTo = toLocalISO(todayAnchor);
      const profitabilityFrom = toLocalISO(profitabilityRange.from);
      const profitabilityTo = toLocalISO(profitabilityRange.to);
      const inventoryCogsData = user.company_id
        ? await fetchRealCogs(user.company_id, inventoryCogsFrom, inventoryCogsTo, regionFilterId)
        : null;
      const sameAsInventoryWindow = profitabilityFrom === inventoryCogsFrom && profitabilityTo === inventoryCogsTo;
      const profitabilityData = !user.company_id
        ? null
        : sameAsInventoryWindow
          ? inventoryCogsData
          : await fetchRealCogs(user.company_id, profitabilityFrom, profitabilityTo, regionFilterId);
      // Inventory cost remains on a rolling 90-day basis for the cash
      // position estimate. Profitability figures follow the chosen range.
      if (user.company_id && inventoryCogsData === null) failures.push("inventory COGS");
      if (user.company_id && profitabilityData === null) failures.push("profitability costs");
      const inventoryCosts = inventoryCogsData ? inventoryCogsData.cogs : null;
      const grossProfit = profitabilityData && profitabilityData.ordersCounted > 0
        ? profitabilityData.revenue - profitabilityData.cogs
        : null;
      const profitMargin = calculateProfitMargin(scopedOrders, profitabilityData);
      const healthScore = calculateHealthScore({
        currentCashFlow,
        projectedRevenue30Days,
        pendingPayments,
        staffPaymentsOwed,
        // FIN-F: pass the missing outflows so the score reads the
        // real net, not the cash-minus-wages partial.
        fixedCostsNext30,
        supplierPayablesNext30,
        inventoryCosts,
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
        grossProfit,
        profitMargin,
        ordersMissingCost: profitabilityData?.ordersMissingCost ?? 0,
        ordersCounted: profitabilityData?.ordersCounted ?? 0,
        missingCostOrderDetails: profitabilityData?.missingCostOrders ?? [],
        profitabilityAuditAvailable: profitabilityData !== null,
        healthScore,
        fixedCostsNext30,
        supplierPayablesNext30,
      });
      setPartialFailures(failures);

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
      captureException(error, {
        level: "error",
        tags: { companyId: user?.company_id, route: "/admin/financial-dashboard", step: "loadFinancialData" },
      });
      setLoadError(error?.message || "Couldn't load the financial figures. Try again.");
    } finally {
      setLoading(false);
    }
  }, [user, regionFilterId, profitabilityRange.from.getTime(), profitabilityRange.to.getTime()]);

  useEffect(() => {
    if (user) {
      loadFinancialData();
    }
  }, [user, loadFinancialData, refreshSignal]);

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

  // FIN-C: per-order revenue / paid / outstanding breakdown for the
  // Order Analysis tab. Pre-FIN-C this tab was a 5-row "Order Revenue"
  // list that duplicated /admin/orders without surfacing finance
  // specifics. New shape sorts by largest outstanding so the operator
  // sees the biggest cash-to-collect at the top, and shows the paid
  // / outstanding split per order alongside the gross revenue.
  const ordersByOutstanding = useMemo(() => {
    return orders
      .filter((o) => isReportableOrder(o) && isBookedRevenue(o))
      .map((o) => {
        const total = orderGrossValue(o);
        const paid = orderNetCollected(o);
        return { order: o, total, paid, outstanding: Math.max(0, total - paid) };
      })
      .sort((a, b) => b.outstanding - a.outstanding || b.total - a.total)
      .slice(0, 12);
  }, [orders]);

  // Cash received is the net amount still held on all orders, including
  // cancelled bookings until a refund is completed. The order payment
  // projection is reconciled from the payments ledger and includes refunds.
  const calculateCashReceived = (orders: Order[]) => {
    return sumNetCollected(orders);
  };

  // `anchor` is the tenant-timezone "today" (local midnight) from
  // tenantToday(companies.timezone) so the window follows the
  // tenant's wall clock, not the operator's browser clock.
  const calculateProjectedRevenue = (orders: Order[], days: number, anchor: Date) => {
    const now = anchor;
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + days);

    // TIGHTEN I.70: shared canonical helper. Behaviour identical to
    // the prior "not cancelled" filter but locked in via the
    // classification module so future enum drift can't silently
    // change projection numbers. parseLocalDay pins the bare
    // event_date to local midnight so the compare lives in the same
    // space as the anchor (new Date("YYYY-MM-DD") parses as UTC
    // midnight, which slips a day for browsers west of UTC).
    return orders
      .filter(o => {
        if (!o.event_date) return false;
        if (!isReportableOrder(o)) return false;
        if (!isPipelineRevenue(o as any)) return false;
        const eventDate = parseLocalDay(o.event_date);
        if (!eventDate) return false;
        return eventDate >= now && eventDate <= futureDate;
      })
      .reduce((sum, o) => sum + orderGrossValue(o), 0);
  };

  // FIN-B: pending payments = actual outstanding balance, not gross.
  // Pre-FIN-B summed total_amount on every pending+partial order, so
  // a R10,587 order with R5,350 deposit received showed up as R10,587
  // "pending" instead of the R5,237 actually outstanding. The tile is
  // labelled "Outstanding from clients" - it should match.
  const calculatePendingPayments = (orders: Order[]) => {
    return sumBookedOutstanding(orders);
  };

  // COGS uses order_items.unit_cost snapshots for delivered/completed
  // orders with net cash held in a bounded 90-day event-date window.
  // An order contributes only when every positive-quantity line has a
  // valid saved cost; incomplete orders are excluded from both revenue
  // and COGS and counted as missing cost data.
  const fetchRealCogs = async (
    companyId: string,
    sinceDate: string,
    untilDate: string,
    regionId: string | null,
  ): Promise<{
    revenue: number;
    cogs: number;
    ordersCounted: number;
    ordersMissingCost: number;
    missingCostOrders: Array<{
      id: string;
      order_number?: string | null;
      client_name?: string | null;
      event_name?: string | null;
      event_date?: string | null;
      missingLineCount: number;
    }>;
  } | null> => {
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
    const data: any[] = [];
    let offset = 0;
    while (true) {
      let query = (supabase as any)
        .from("orders")
        .select("id, order_number, event_name, client_name, internal_notes, total_amount, tax_amount, amount_paid, payment_status, deposit_paid, deposit_amount, balance_paid, balance_amount, cancelled_at, status, event_date, order_items(quantity, unit_cost)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .is("cancelled_at", null)
        .in("status", ["delivered", "completed"])
        .gte("event_date", sinceDate)
        .lte("event_date", untilDate)
        .order("event_date", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (regionId) query = query.eq("region_id", regionId);
      const { data: page, error } = await query;
      if (error || !page) return null;
      data.push(...page);
      if (page.length < 1000) break;
      offset += page.length;
    }
    let revenue = 0;
    let cogs = 0;
    let ordersCounted = 0;
    let ordersMissingCost = 0;
    const missingCostOrders: Array<{
      id: string;
      order_number?: string | null;
      client_name?: string | null;
      event_name?: string | null;
      event_date?: string | null;
      missingLineCount: number;
    }> = [];
    for (const ord of data as any[]) {
      if (!isReportableOrder(ord) || orderNetCollected(ord) <= 0) continue;
      const items = (ord.order_items as any[]) || [];
      const orderCogs = completeOrderMenuCogs(items);
      if (orderCogs == null) {
        ordersMissingCost++;
        const missingLineCount = items.filter((item: any) => {
          const quantity = Number(item?.quantity) || 0;
          const unitCost = Number(item?.unit_cost);
          return quantity > 0 && (!Number.isFinite(unitCost) || unitCost <= 0);
        }).length;
        missingCostOrders.push({
          id: ord.id,
          order_number: ord.order_number,
          client_name: ord.client_name,
          event_name: ord.event_name,
          event_date: ord.event_date,
          missingLineCount,
        });
        continue;
      }
      revenue += orderRevenueExcludingTax(ord);
      cogs += orderCogs;
      ordersCounted++;
    }
    if (revenue <= 0) return { revenue: 0, cogs: 0, ordersCounted, ordersMissingCost, missingCostOrders };
    return { revenue, cogs, ordersCounted, ordersMissingCost, missingCostOrders };
  };

  const calculateProfitMargin = (
    _orders: Order[],
    cogsData: { revenue: number; cogs: number; ordersCounted: number; ordersMissingCost: number } | null,
  ): number | null => {
    if (!cogsData || cogsData.revenue <= 0 || cogsData.ordersCounted === 0) return null;
    return ((cogsData.revenue - cogsData.cogs) / cogsData.revenue) * 100;
  };

  const calculateHealthScore = (data: any) => {
    // Cash-flow-only heuristic, capped at 80. It does not include
    // profit margin and should not be read as a full financial rating.
    //
    // FIN-F (current cash flow tile audit): the "real net" expression
    // matches the Net Cash Flow row on the Financial Summary card and
    // the new Current Cash Flow tile - cashReceived less every known
    // outflow. Pre-FIN-F the score read currentCashFlow > 0 (cash
    // minus wages only), so Spit Braai with R7,989.82 received / R0
    // wages / R8,600 fixed costs scored 80 ("Healthy" green) while
    // the real net was -R610. Now the same signal everywhere.
    const realNet = (data.currentCashFlow || 0)
      - (data.fixedCostsNext30 || 0)
      - (data.supplierPayablesNext30 || 0)
      - (data.inventoryCosts || 0);
    let score = 40;
    if (realNet > 0) score += 20;
    if (data.projectedRevenue30Days > data.pendingPayments) score += 10;
    if (realNet > data.staffPaymentsOwed * 2) score += 10;
    return Math.min(80, score);
  };

  // Audit 2026-07-02: display goes through formatZAR (the platform
  // money formatter, thousand separators included) so this page reads
  // "R 12 500.00" like Payables / Fixed costs / every other finance
  // surface. currencyUtils.formatCurrency produced "R12500.00".
  const formatCurrency = (amount: number) => {
    return formatZAR(amount, { currency: (user?.currency as string) || "ZAR" });
  };

  if (!user) {
    return <div>Please log in to view financial dashboard</div>;
  }

  if (loading && !metrics) {
    // Matches the cashflow-dashboard loading shell: nav stays mounted
    // so the operator isn't dropped onto a bare spinner page.
    // Only take this path on the first load. Live order, payment and
    // invoice updates keep the current figures on screen while new
    // metrics are fetched.
    return (
      <>
        <Head><title>Financial dashboard - CateringMS</title></Head>
        <NoIndexMeta />
        <AdminNav />
        <div className="admin-page-shell admin-page-shell--center">
          <PageLoader
            label="Loading financial dashboard"
            detail="Preparing your latest financial figures."
            brandName={company?.company_name || user?.company_name || undefined}
            brandLogoUrl={company?.logo_url || null}
            className="mx-auto w-full max-w-md"
          />
        </div>
      </>
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
        <Head><title>Financial dashboard - CateringMS</title></Head>
        <NoIndexMeta />
        <AdminNav />
        <div className="admin-page-shell">
          <div className="max-w-md mx-auto mt-12 rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-rose-900 mb-2">Couldn't load financial data</h2>
            <p className="text-sm text-slate-600 mb-4">{loadError}</p>
            <Button onClick={loadFinancialData} className="bg-brand-primary hover:bg-brand-primary/90">
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
  // Audit fix (2026-07-02): the guard also checks wages / fixed costs
  // / supplier payables and requires zero partial failures. Before,
  // a tenant with no orders yet but R8,600 of fixed costs (or a
  // broken cost feed) hit the "No financial activity yet" page, which
  // hid real outflow data and masked the partial-failure banner. Same
  // guard class the cashflow-dashboard got in CASH-B.
  const isFinancialZero = !loadError
    && partialFailures.length === 0
    && orders.length === 0
    && (metrics?.cashReceived || 0) === 0
    && (metrics?.projectedRevenue30Days || 0) === 0
    && (metrics?.pendingPayments || 0) === 0
    && (metrics?.staffPaymentsOwed || 0) === 0
    && (metrics?.fixedCostsNext30 || 0) === 0
    && (metrics?.supplierPayablesNext30 || 0) === 0;

  // TIGHTEN I.29 (admin.md section 5): when the tenant is in the
  // zero-data state, return a dedicated empty-state page instead
  // of rendering the inline card alongside the wall of R0 tiles.
  // Pre-fix the card sat at the top with the entire 90-day
  // dashboard rendered below it as a stack of zero values,
  // contradicting the "No financial activity yet" copy. Now: header
  // + empty-state card only, no tiles, no charts, no R0 confusion.
  if (isFinancialZero && !loading) {
    return (
      <>
        <Head><title>Financial dashboard - CateringMS</title></Head>
        <NoIndexMeta />
        <AdminNav />
        <div className="admin-page-shell">
          <div className="max-w-2xl mx-auto mt-12 rounded-lg border border-brand-primary/20 bg-white p-8 shadow-sm text-center">
            <Banknote className="w-12 h-12 text-brand-primary mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Financial Dashboard</h1>
            <h2 className="text-base font-semibold text-slate-700 mb-2">No financial activity yet</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-5">
              Once you confirm your first order or take your first deposit, this page will fill with
              revenue, profit margin, and the next 30 / 90 days of projected income. Until then,
              start by sending a quote.
            </p>
            <div className="inline-flex gap-2">
              <Button asChild className="bg-brand-primary hover:bg-brand-primary/90">
                <Link href={withSlug("/admin/quotes/new")}>Start a quote</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={withSlug("/admin/orders")}>View orders</Link>
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Financial dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <CashflowContextBanner message="Margin, health score and per-order analysis. Use the cashflow forecast for the forward 30-day view." />
          {/* Header with Health Score */}
          <div className="mb-8">
            {/* Command-centre hero: dark band with the tenant's
                brand washes. The health-score card that used to sit
                in `actions` is now a meta chip; its dot stays
                SEMANTIC (emerald / amber / rose) on the FIN-B
                retuned 70 / 55 cutoffs, which match the score
                function's real 0-80 range. */}
            <PortalHeader
              variant="hero"
              title="Financial dashboard"
              icon={Banknote}
              subtitle={
                <>Profitability for the selected event-date range, alongside current balances and forward cashflow projections.</>
              }
              meta={
                metrics ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        metrics.healthScore >= 70 ? "bg-emerald-400" :
                        metrics.healthScore >= 55 ? "bg-amber-400" :
                        "bg-rose-400"
                      }`} />
                      Financial health {metrics.healthScore}%
                      <InfoTooltip
                        className="text-white/60 hover:text-white"
                        content={"A simple indicator, not a full financial rating. It starts at 40, adds 20 when current cash after known costs is positive, 10 when projected 30-day booking value exceeds committed balances due, and 10 when current cash after known costs is more than twice the staff wages owed. It is capped at 80.\n\nThe current calculation does not use profit margin. The cost inputs mix all-time net cash and wages owed, next-30-day fixed costs and supplier payables, and menu COGS from delivered/complete orders in the last 90 days. Treat it as a directional signal, not a same-period profit measure."}
                      />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                      {formatCurrency(metrics.cashReceived)} net cash held
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                      {formatCurrency(metrics.pendingPayments)} booked balances due
                    </span>
                  </>
                ) : undefined
              }
              actions={
                <>
                  {/* Phase 20 #6: financial snapshot CSV export. The
                      owner runs this page weekly for the team meeting
                      and monthly for the bookkeeper. Until now they
                      were copying numbers by hand. */}
                  {metrics && (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Export financial snapshot as CSV"
                      title="Export financial snapshot as CSV"
                      className="h-11 w-11 justify-self-end p-0 sm:h-9 sm:w-auto sm:px-3"
                      onClick={() => {
                      const esc = (v: any) => {
                        if (v == null) return "";
                        const s = String(v).replace(/"/g, '""');
                        return /[",\n]/.test(s) ? `"${s}"` : s;
                      };
                      // Audit fix (2026-07-02): the exported "Current
                      // cash flow" was cashReceived - wages only,
                      // which contradicted the on-page Current Cash
                      // Flow tile (full net via the canonical
                      // helper). The snapshot now exports every
                      // outflow line the tile shows plus the same
                      // canonical net, so the CSV ties out with the
                      // page it came from.
                      const csvNet = computeCurrentCashPosition({
                        cashReceived: metrics.cashReceived,
                        wages: metrics.staffPaymentsOwed,
                        fixedCostsNext30: metrics.fixedCostsNext30,
                        supplierPayablesNext30: metrics.supplierPayablesNext30,
                        inventoryCosts: metrics.inventoryCosts,
                      }).net;
                      const rows: Array<[string, number | string]> = [
                        ["Metric", "Value"],
                        ["Health score", metrics.healthScore],
                        ["Net cash held", metrics.cashReceived.toFixed(2)],
                        ["Projected revenue (30d)", metrics.projectedRevenue30Days.toFixed(2)],
                        ["Projected revenue (90d)", metrics.projectedRevenue90Days.toFixed(2)],
                        ["Booked balances due", metrics.pendingPayments.toFixed(2)],
                        ["Staff payments owed", metrics.staffPaymentsOwed.toFixed(2)],
                        ["Fixed costs (next 30d)", metrics.fixedCostsNext30.toFixed(2)],
                        ["Supplier payables (next 30d)", metrics.supplierPayablesNext30.toFixed(2)],
                        ["Unpaid sessions count", metrics.unpaidSessionsCount],
                        ["Unpaid staff count", metrics.unpaidStaffCount],
                        ["Inventory costs", metrics.inventoryCosts != null ? metrics.inventoryCosts.toFixed(2) : "not connected"],
                        ["Cash position estimate (mixed periods)", csvNet.toFixed(2)],
                        [`Gross profit estimate (${getDateRangeLabel(profitabilityRange)})`, metrics.grossProfit != null ? metrics.grossProfit.toFixed(2) : "not connected"],
                        [`Gross margin (${getDateRangeLabel(profitabilityRange)})`, metrics.profitMargin != null ? `${metrics.profitMargin.toFixed(1)}%` : "not connected"],
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
                      <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                      <span className="sr-only sm:not-sr-only">Export snapshot CSV</span>
                    </Button>
                  )}
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
                <Button variant="outline" size="sm" onClick={loadFinancialData} disabled={loading}>Retry</Button>
              </div>
            )}

            {/* Partial-load warning: one of the best-effort feeds
                failed and its line may read R0 by mistake. */}
            {!loadError && partialFailures.length > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
                <p className="flex-1 text-sm text-amber-900">
                  Some figures failed to load and may show 0 ({partialFailures.join(", ")}).
                </p>
                <Button variant="outline" size="sm" onClick={loadFinancialData} disabled={loading}>Retry</Button>
              </div>
            )}

            {/* TIGHTEN I.29: the inline zero-data card moved into a
                dedicated early-return at the top of the component.
                Renders that take this code path always have at least
                one of orders / cash / projected / pending non-zero,
                so the wall-of-R0 problem doesn't surface. */}

            {/* Celebration Message */}
            {showCelebration && (
              <div className="bg-brand-primary text-white p-4 rounded-lg mb-4 animate-pulse">
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
                  <Card key={index} className={`border ${
                    alert.severity === "high" ? "border-rose-200 bg-rose-50" :
                    alert.severity === "medium" ? "border-amber-200 bg-amber-50" :
                    "border-blue-200 bg-blue-50"
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                          alert.severity === "high" ? "text-rose-600" :
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
            <p className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              The 30-day forecast, payables and fixed costs are on the{" "}
              <Link href={withSlug("/admin/cashflow-dashboard")} className="font-semibold text-brand-primary hover:underline">Cashflow page</Link>.
            </p>
          )}

          <div id="financial-profitability-range" data-chat-section="admin.financial-dashboard.profitability-range" data-chat-section-label="Profitability date range" className="mb-4 flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Profitability date range</h2>
              <p className="mt-1 text-xs text-slate-600">
                Gross margin and the profitability figures in the CSV use event dates in this range. Other cards keep their labeled periods.
              </p>
            </div>
            <DashboardDateRange
              range={profitabilityRange}
              onChange={setProfitabilityRange}
              anchorDate={tenantToday(companyTimezone)}
              className="w-full justify-between sm:w-auto"
            />
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    Cash Position Estimate
                    {/* FIN-F (current cash flow tile audit): pre-FIN-F
                        the tile subtracted only wages owed and called
                        the result "Healthy" any time it was positive.
                        Bobby's screenshot showed +R7,989.82 received,
                        R0 wages, "Healthy" - while the Financial
                        Summary below correctly read -R610.18 net
                        because R8,600 of fixed costs and the COGS
                        already incurred weren't priced in. Now the
                        tile shows every cost line that's already in
                        metrics state (wages + fixed costs next 30d
                        + supplier payables next 30d + inventory
                        COGS 90d) and the status badge reads off the
                        real net, not the cash-minus-wages partial. */}
                    <InfoTooltip content={"All-time net cash held less logged wages owed, fixed costs due in the next 30 days, supplier payables due in the next 30 days, and menu COGS from eligible delivered/completed orders in the last 90 days. These are mixed time bases, so this is a directional cash-position estimate, not a period cash-flow statement or profit figure. See Financial Summary below for the components."} />
                  </CardTitle>
                  <Banknote className="w-5 h-5 text-brand-primary" />
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  // FIN-F: real net cash flow. CASH-C: now routes
                  // through the canonical computeCurrentCashPosition
                  // helper so this tile, the Financial Summary "Net
                  // Cash Flow (30d)" row, and the cashflow-dashboard
                  // page all return the same number for the same
                  // inputs.
                  const position = computeCurrentCashPosition({
                    cashReceived: metrics?.cashReceived || 0,
                    wages: metrics?.staffPaymentsOwed || 0,
                    fixedCostsNext30: metrics?.fixedCostsNext30 || 0,
                    supplierPayablesNext30: metrics?.supplierPayablesNext30 || 0,
                    inventoryCosts: metrics?.inventoryCosts ?? null,
                  });
                  const net = position.net;
                  const noActivity = position.noActivity;
                  return (
                    <>
                      <div className={`break-words text-lg font-bold leading-tight tabular-nums sm:text-2xl ${net < 0 ? "text-rose-700" : "text-slate-900"}`}>
                        {formatCurrency(net)}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">See Financial Summary below for the component breakdown.</p>
                      <div className="flex items-center gap-1 mt-2">
                        {noActivity ? (
                          <span className="text-sm text-slate-500">No activity yet</span>
                        ) : net > 0 ? (
                          <>
                            <ArrowUpRight className="w-4 h-4 text-brand-primary" />
                            <span className="text-sm text-brand-primary">Positive estimate</span>
                          </>
                        ) : net === 0 ? (
                            <span className="text-sm text-slate-500">Estimate is zero</span>
                        ) : (
                          <>
                            <ArrowDownRight className="w-4 h-4 text-rose-600" />
                            <span className="text-sm text-rose-600">Negative estimate</span>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    Net Profit
                    <InfoTooltip content={"A dependable net profit figure is not available yet. Payroll, recurring fixed costs, supplier payables, and order costs are stored on different period bases and may overlap. Subtracting them here could omit costs or count them twice. The Gross Margin tile below subtracts complete menu COGS only; it is not net profit."} />
                  </CardTitle>
                  <Banknote className="w-5 h-5 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold leading-tight text-slate-500 sm:text-xl">Not reconciled</div>
                <p className="text-sm text-slate-500 mt-2">Expense periods and sources need reconciliation</p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    30-Day Projection
                    <InfoTooltip content={"Total order value for reportable pending, booked and completed events in the next 30 days. This is a forecast, so unconfirmed pipeline orders are included; cancelled and automated test orders are excluded."} />
                  </CardTitle>
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="break-words text-lg font-bold leading-tight tabular-nums text-slate-900 sm:text-2xl">
                  {formatCurrency(metrics?.projectedRevenue30Days || 0)}
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  {/* FIN-B: label honesty. calculateProjectedRevenue is
                      called with days=30 and filters event_date in
                      [today, today+30). That's a 30-day rolling
                      window, NOT "next month" - a quote booked today
                      for an event in 21 days counts, but one for 35
                      days does not. */}
                  Projected order value, next 30 days
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    Booked Balances Due
                    <InfoTooltip content={"Unpaid order value on committed bookings. Pending pipeline orders and cancelled orders are excluded."} />
                  </CardTitle>
                  <CreditCard className="w-5 h-5 text-yellow-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="break-words text-lg font-bold leading-tight tabular-nums text-slate-900 sm:text-2xl">
                  {formatCurrency(metrics?.pendingPayments || 0)}
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  On committed bookings
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
                    Gross Margin
                  <InfoTooltip content={`(Order revenue after recorded tax - menu COGS) / order revenue after recorded tax, for delivered/completed orders with net cash held and event dates in ${getDateRangeLabel(profitabilityRange).toLowerCase()}. Menu COGS sums quantity multiplied by saved order_items.unit_cost snapshots. An order is included only when every positive-quantity item has a valid saved cost; orders with missing or incomplete item costs are excluded from both revenue and cost and counted below. The calculation follows the selected branch filter; choose All branches to compare with the main Dashboard and choose the same date range on both pages.\n\nPayroll, supplier costs and fixed costs are not included, so this is an operational gross-margin estimate, not net profit or a statutory P&L. See Cashflow for the operating cash picture.`} />
                  </CardTitle>
                  <TrendingUp className={`w-5 h-5 ${metrics?.profitMargin != null ? "text-slate-600" : "text-slate-400"}`} />
                </div>
              </CardHeader>
              <CardContent>
                {metrics?.profitMargin != null ? (
                  <>
                    <div className="break-words text-lg font-bold leading-tight tabular-nums text-slate-900 sm:text-2xl">
                      {metrics.profitMargin.toFixed(1)}%
                    </div>
                    <p className="text-sm text-slate-600 mt-2">
                      Gross margin · {getDateRangeLabel(profitabilityRange)}
                    </p>
                    {(metrics?.ordersMissingCost || 0) > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle className="w-3 h-3" />
                        {metrics.ordersMissingCost} order{metrics.ordersMissingCost === 1 ? "" : "s"} missing cost data
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold leading-tight text-slate-400 sm:text-xl">
                      No data yet
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                      {/* FIN-E (financial dashboard tabs audit):
                          widened the empty-state branching. Pre-FIN-E
                          a tenant whose orders were all in `confirmed`
                          / `ready` (no delivered or completed rows
                          yet) saw the "no paid delivered orders" copy
                          which is technically true but useless - the
                          actionable next step is filling in
                          cost_per_unit so margin can be measured ONCE
                          the orders deliver. The new branching covers
                          three states. */}
                      {(metrics?.ordersMissingCost || 0) > 0
                        ? `${metrics?.ordersMissingCost} delivered orders in ${getDateRangeLabel(profitabilityRange).toLowerCase()} are missing complete item costs. Add costs for every menu item.`
                        : (orders.length > 0
                          ? `No delivered orders with net cash held and complete item costs in ${getDateRangeLabel(profitabilityRange).toLowerCase()} yet.`
                          : "Once you confirm and deliver your first order, profit margin will appear here.")}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <ProfitabilityOrderReview
            orders={orders}
            missingCostOrders={metrics?.missingCostOrderDetails || []}
            fromDate={toLocalISO(profitabilityRange.from)}
            toDate={toLocalISO(profitabilityRange.to)}
            costAuditAvailable={metrics?.profitabilityAuditAvailable ?? false}
          />

          {/* A single section picker keeps finance navigation compact at
              every width while leaving each analysis view one tap away. */}
          <div className="mb-4 max-w-full rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex sm:items-center sm:gap-3 sm:p-3">
            <div className="mb-2 flex min-w-0 items-center gap-2 sm:mb-0 sm:w-36 sm:shrink-0">
              <LayoutDashboard className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
              <label htmlFor="financial-section-select" className="text-sm font-semibold text-slate-700">Finance view</label>
            </div>
            <Select
              value={selectedFinancialSection}
              onValueChange={(value) => setActiveFinancialSection(value as FinancialSection)}
            >
              <SelectTrigger id="financial-section-select" aria-label="Choose a finance view" className="h-11 w-full min-w-0 bg-white text-sm sm:max-w-sm">
                <SelectValue placeholder="Choose a finance view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overview">Overview</SelectItem>
                <SelectItem value="projections">Projections</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
                <SelectItem value="orders">Order analysis</SelectItem>
                {showBranchesTab && <SelectItem value="branches">Branches</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {selectedFinancialSection === "overview" && (
            <section id="financial-overview" data-chat-section="admin.financial-dashboard.overview" data-chat-section-label="Financial overview" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <Card collapsible defaultOpen={true} collapseLabel="Financial Summary">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">Financial Summary <InfoTooltip content={"Cash held and recorded cost components from orders, the staff wage ledger, recurring costs, suppliers, and menu cost snapshots. Each line shows its own period basis; the components do not form a reconciled net-profit statement."} /></CardTitle>
<CardDescription>Cash held and tracked cost components, each with its own time basis.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* FIN-E (financial dashboard tabs audit): the
                        pre-FIN-E row computed its OWN sum by filtering
                        payment_status === "paid" and summing
                        total_amount. Every catering tenant whose
                        orders sit in `partial` (deposit paid, balance
                        outstanding) saw R0 here while Current Cash
                        Flow above correctly showed the real money in.
                        Reads the canonical metrics.cashReceived now -
                        same source as the KPI tile. Label renamed to
                        match the new semantics (it's cash actually
                        received, not "total paid orders revenue"). */}
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">Net Cash Held <InfoTooltip content={"Net amount still held across all bookings, including cancelled orders until their refund is completed. This is an all-time cash balance, not event-date revenue."} /></span>
                      <span className="break-words font-semibold tabular-nums">{formatCurrency(metrics?.cashReceived || 0)}</span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">Booked Balances Due <InfoTooltip content={"Outstanding balance on committed and completed orders only. Unconfirmed pipeline orders and cancelled orders are excluded."} /></span>
                      <span className="break-words font-semibold tabular-nums text-yellow-600">
                        {formatCurrency(metrics?.pendingPayments || 0)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">Staff Payments Owed <InfoTooltip content={"Wages already logged for staff that you have not paid out yet."} /></span>
                      <span className="break-words font-semibold tabular-nums text-rose-600">
                        {formatCurrency(metrics?.staffPaymentsOwed || 0)}
                      </span>
                    </div>
                    {/* Bug fix: surface fixed costs + supplier payables
                        the forecast chart already subtracts so the
                        summary's Net line ties out with the projected
                        balance trend instead of contradicting it. */}
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">Fixed Costs (next 30d) <InfoTooltip content={"Recurring rent / software / vehicle costs falling due in the next 30 days. Pulled from the Fixed Costs page. Subtracted from Net Cash Flow."} /></span>
                      <span className="break-words font-semibold tabular-nums text-rose-600">
                        {formatCurrency(metrics?.fixedCostsNext30 || 0)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">Supplier Payables (next 30d) <InfoTooltip content={"Unpaid supplier invoices with a due date in the next 30 days. Pulled from the Payables page. Subtracted from Net Cash Flow."} /></span>
                      <span className="break-words font-semibold tabular-nums text-rose-600">
                        {formatCurrency(metrics?.supplierPayablesNext30 || 0)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">Inventory Costs <InfoTooltip content={"Menu COGS from delivered/completed orders with net cash still held and event dates in the last 90 days. Calculated as quantity multiplied by saved order_items.unit_cost snapshots. Orders with any missing item cost are excluded. This is not a supplier-invoice or payroll total."} /></span>
                      {metrics?.inventoryCosts != null ? (
                        <span className="break-words font-semibold tabular-nums">
                          {formatCurrency(metrics.inventoryCosts)}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-400">
                          No usage data yet
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card collapsible defaultOpen={false} collapseLabel="Quick Actions">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      Quick Actions
                      <InfoTooltip content={"Shortcuts to the pages you'll need next when the cash-flow numbers above flag a problem.\n\nEach button drops you on the relevant working surface. Nothing fires until you take action there."} />
                    </CardTitle>
<CardDescription>Shortcuts to create work or open the related working page.</CardDescription>
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
                      onClick={() => { setRemindDialogOpen(true); }}
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
            </section>

          )}

          {selectedFinancialSection === "projections" && (
            <section id="financial-projections" data-chat-section="admin.financial-dashboard.projections" data-chat-section-label="Financial projections" className="space-y-4">
              <Card collapsible defaultOpen={false} collapseLabel="Revenue Projections">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Order Value Projections <InfoTooltip content={"Gross order totals for reportable pipeline and booked events grouped by event date. This includes unconfirmed pipeline value for forecasting, whether paid or not, and excludes cancelled/test orders."} /></CardTitle>
<CardDescription>Forecast gross order value across the next 30 and 90 days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-slate-600">Next 30 Days</span>
                        <span className="break-words text-base font-semibold leading-tight tabular-nums sm:text-lg">
                          {formatCurrency(metrics?.projectedRevenue30Days || 0)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-slate-500"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-slate-600">Next 90 Days</span>
                        <span className="break-words text-base font-semibold leading-tight tabular-nums sm:text-lg">
                          {formatCurrency(metrics?.projectedRevenue90Days || 0)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-brand-primary"
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
                          ? `Booked balances due (${formatCurrency(pending)}) exceed projected order value for the next 30 days (${formatCurrency(p30)}). Chase collections first - the bulk-remind action above is the fastest path.`
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
            </section>
          )}

          {selectedFinancialSection === "expenses" && (
            <section id="financial-expenses" data-chat-section="admin.financial-dashboard.expenses" data-chat-section-label="Financial expenses" className="space-y-4">
              <Card collapsible defaultOpen={false} collapseLabel="Expense Tracking">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Expense Tracking <InfoTooltip content={"Two cost lines side by side: real wages owed to staff, plus a rough inventory cost estimate based on in-flight orders.\n\nIngredient costs become accurate once recipes and live stock data are wired in."} /></CardTitle>
<CardDescription>Recorded wages and estimated inventory costs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                      <div className="min-w-0">
                        <h4 className="font-semibold">Staff Payments</h4>
                        <p className="text-sm text-slate-600">
                          {(metrics?.unpaidSessionsCount ?? 0) === 0
                            ? "All staff sessions paid"
                            : `${metrics?.unpaidSessionsCount} unpaid session${metrics?.unpaidSessionsCount === 1 ? "" : "s"} across ${metrics?.unpaidStaffCount ?? 0} staff member${(metrics?.unpaidStaffCount ?? 0) === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <span className="break-words text-base font-bold leading-tight tabular-nums sm:text-lg">
                        {formatCurrency(metrics?.staffPaymentsOwed || 0)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                      <div className="min-w-0">
                        <h4 className="font-semibold">Inventory Costs (90 days)</h4>
                        <p className="text-sm text-slate-600">
                          Real ingredient cost on paid orders. Supplier + payroll feeds still pending.
                        </p>
                      </div>
                      {metrics?.inventoryCosts != null ? (
                        <span className="break-words text-base font-bold leading-tight tabular-nums sm:text-lg">
                          {formatCurrency(metrics.inventoryCosts)}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold leading-tight text-slate-400 sm:text-base">
                          No usage data yet
                        </span>
                      )}
                    </div>

                    {/* FIN-E (financial dashboard tabs audit): added
                        Fixed Costs + Supplier Payables rows. Pre-
                        FIN-E the Expenses tab only listed staff +
                        inventory while the Overview tab's Financial
                        Summary card already had the other two. The
                        Expenses tab is the natural home for them -
                        moving them here doesn't remove them from
                        Overview (the operator gets the full picture
                        on both surfaces). */}
                    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                      <div className="min-w-0">
                        <h4 className="font-semibold">Fixed Costs (next 30 days)</h4>
                        <p className="text-sm text-slate-600">
                          Recurring rent / software / vehicle costs expanded from the Fixed Costs page.
                        </p>
                      </div>
                      <span className="break-words text-base font-bold leading-tight tabular-nums sm:text-lg">
                        {formatCurrency(metrics?.fixedCostsNext30 || 0)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                      <div className="min-w-0">
                        <h4 className="font-semibold">Supplier Payables (next 30 days)</h4>
                        <p className="text-sm text-slate-600">
                          Unpaid supplier invoices due in the window. From /admin/payables.
                        </p>
                      </div>
                      <span className="break-words text-base font-bold leading-tight tabular-nums sm:text-lg">
                        {formatCurrency(metrics?.supplierPayablesNext30 || 0)}
                      </span>
                    </div>

                    {/* FIN-E: replaced the dead "View Detailed Expense
                        Report" button (no onClick, no Link, no asChild
                        - pure decoration since at least the May 2026
                        audit) with two deep-links to the actual
                        sources. */}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button asChild variant="outline" className="flex-1">
                        <Link href={withSlug("/admin/fixed-costs")}>
                          Open Fixed Costs
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="flex-1">
                        <Link href={withSlug("/admin/payables")}>
                          Open Payables
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {selectedFinancialSection === "orders" && (
            <section id="financial-orders" data-chat-section="admin.financial-dashboard.orders" data-chat-section-label="Financial order analysis" className="space-y-4">
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
                          <div key={order.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900 truncate">
                                  {order.client_name || "Unknown client"}
                                </p>
                                {orderNumber && (
                                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                                    #{orderNumber}
                                  </span>
                                )}
                                <Badge variant="outline" className="text-xs capitalize">
                                  {String(status).replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatLocalDate(order.event_date)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-baseline justify-between gap-3 text-left sm:flex-col sm:items-end sm:text-right">
                              <p className="text-sm font-bold text-amber-700 tabular-nums">
                                {formatCurrency(outstanding)}
                              </p>
                              <p className="text-xs text-slate-500 tabular-nums">
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
            </section>
          )}

            {showBranchesTab && selectedFinancialSection === "branches" && (
              <section id="financial-branches" data-chat-section="admin.financial-dashboard.branches" data-chat-section-label="Financial branches" className="space-y-4">
                <Card collapsible defaultOpen={false} collapseLabel="Booked revenue by branch">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Booked revenue by branch
                      <InfoTooltip content={"Booked revenue, net cash held, outstanding and booked-order count by branch. Unassigned rows are bookings without a branch."} />
                    </CardTitle>
<CardDescription>Committed booking value and balances grouped by operating branch.</CardDescription>
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
                        if (!isReportableOrder(o) || !isBookedRevenue(o)) return;
                        const branch = branches.find((b) => b.id === o.region_id);
                        const bucket = ensure(
                          o.region_id || null,
                          branch?.name || (o.region_id ? "Unknown branch" : "Unassigned"),
                          branch?.address ?? null,
                        );
                        const total = orderGrossValue(o);
                        // FIN-E: same enum-drift class as the
                        // Financial Summary row. amount_paid is the
                        // single source of truth for cash received;
                        // the payment_status ternary above pre-FIN-E
                        // collapsed every paid order to its full
                        // total even when the deposit hadn't been
                        // banked yet (and vice-versa for partial
                        // orders that genuinely held cash). Just
                        // sum amount_paid - it's been the column of
                        // record since FIN-B landed.
                        const paid = orderNetCollected(o);
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
                        <>
                        <div className="space-y-3 md:hidden">
                          {rows.length === 0 ? (
                            <p className="rounded-lg border border-slate-200 p-4 text-center text-sm text-slate-500">No orders to break down yet.</p>
                          ) : rows.map((r) => (
                            <article key={r.regionId || "__unassigned__"} className="rounded-lg border border-slate-200 p-3">
                              <div className="mb-3 min-w-0">
                                <h3 className="break-words text-sm font-semibold text-slate-900">{r.name}</h3>
                                {r.address && <p className="mt-0.5 break-words text-xs text-slate-500">{r.address}</p>}
                              </div>
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div><dt className="text-xs text-slate-500">Orders</dt><dd className="font-medium tabular-nums">{r.count}</dd></div>
                                <div><dt className="text-xs text-slate-500">Booked revenue</dt><dd className="break-words font-semibold tabular-nums">{formatCurrency(r.revenue)}</dd></div>
                                <div><dt className="text-xs text-slate-500">Paid</dt><dd className="break-words font-medium tabular-nums text-brand-primary">{formatCurrency(r.paid)}</dd></div>
                                <div><dt className="text-xs text-slate-500">Outstanding</dt><dd className="break-words font-medium tabular-nums text-amber-700">{formatCurrency(r.outstanding)}</dd></div>
                              </dl>
                            </article>
                          ))}
                          {rows.length > 0 && (
                            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <h3 className="mb-3 text-sm font-semibold text-slate-900">All branches</h3>
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div><dt className="text-xs text-slate-500">Orders</dt><dd className="font-medium tabular-nums">{totals.count}</dd></div>
                                <div><dt className="text-xs text-slate-500">Booked revenue</dt><dd className="break-words font-semibold tabular-nums">{formatCurrency(totals.revenue)}</dd></div>
                                <div><dt className="text-xs text-slate-500">Paid</dt><dd className="break-words font-medium tabular-nums text-brand-primary">{formatCurrency(totals.paid)}</dd></div>
                                <div><dt className="text-xs text-slate-500">Outstanding</dt><dd className="break-words font-medium tabular-nums text-amber-700">{formatCurrency(totals.outstanding)}</dd></div>
                              </dl>
                            </article>
                          )}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                                <th className="py-2 pr-3 font-medium">Branch</th>
                                <th className="py-2 px-3 font-medium text-right">Orders</th>
                                <th className="py-2 px-3 font-medium text-right">Booked revenue</th>
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
                                  <td className="py-2.5 px-3 text-right font-mono text-brand-primary">{formatCurrency(r.paid)}</td>
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
                                  <td className="py-2.5 px-3 text-right font-mono text-brand-primary">{formatCurrency(totals.paid)}</td>
                                  <td className="py-2.5 pl-3 text-right font-mono text-amber-700">{formatCurrency(totals.outstanding)}</td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </section>
            )}
        </PortalShell>
      </div>

      {/* FIN-C / CASH-D: bulk-remind dialog. Extracted into a shared
          component so the cashflow-dashboard can fire the same flow. */}
      <BulkRemindDialog open={remindDialogOpen} onOpenChange={setRemindDialogOpen} />
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
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN]}>
      <FinancialDashboardInner />
    </ProtectedRoute>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {},
  };
};
