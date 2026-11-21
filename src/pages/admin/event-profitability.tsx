import { isLocalAuthBypassEnabled } from "@/lib/localAuthBypass";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  PortalCard,
  PortalHeader,
  PortalShell,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import { toLocalISO } from "@/lib/localDate";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";
import { isBookedRevenue } from "@/lib/orderRevenueClassification";
import { isReportableOrder, orderGrossValue } from "@/lib/orderRevenueMath";
import { useRouter } from "next/router";

type ProfitRow = {
  id: string;
  orderNumber: string;
  eventName: string;
  clientName: string;
  eventDate: string;
  quoted: number;
  revenue: number;
  food: number;
  equipment: number;
  driver: number;
  staff: number;
  paymentFees: number;
  staffLinked: boolean;
  paymentFeesLinked: boolean;
  status: string;
};

const n = (value: unknown) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toLocalISO(date);
}

function feeFromGatewayResponse(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const row = value as Record<string, unknown>;
  for (const key of [
    "fee",
    "fees",
    "processing_fee",
    "processingFee",
    "transaction_fee",
    "transactionFee",
  ]) {
    if (typeof row[key] === "number" || typeof row[key] === "string")
      return Math.max(0, n(row[key]));
  }
  return 0;
}

function money(
  value: number,
  format: (amount: number, decimals?: number) => string,
): string {
  return format(value, 2);
}

function EventProfitabilityPageInner() {
  const router = useRouter();
  const { user, profile } = useAuth() as any;
  const routeTenantSlug = getTenantSlugFromPathname(router.asPath);
  const [routeCompanyId, setRouteCompanyId] = useState<string | null>(null);
  const companyId = routeTenantSlug
    ? routeCompanyId
    : profile?.company_id || user?.company_id || null;
  const currency = useTenantCurrency(companyId);
  const { withSlug } = useTenantHref();
  const [from, setFrom] = useState(() => dateDaysAgo(90));
  const [to, setTo] = useState(() => toLocalISO(new Date()));
  const [appliedRange, setAppliedRange] = useState(() => ({
    from: dateDaysAgo(90),
    to: toLocalISO(new Date()),
  }));
  const [viewMode, setViewMode] = useState<"completed" | "all">("completed");
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!routeTenantSlug) {
      setRouteCompanyId(null);
      return () => {
        cancelled = true;
      };
    }
    setRouteCompanyId(null);
    void (async () => {
      const { data, error: lookupError } = await (supabase.rpc as any)(
        "get_company_branding",
        { p_slug: routeTenantSlug },
      );
      if (cancelled) return;
      const brand = (Array.isArray(data) ? data[0] : data) as {
        id?: string;
      } | null;
      if (lookupError || !brand?.id) {
        setError(
          lookupError?.message || "Could not resolve the selected company.",
        );
        return;
      }
      setRouteCompanyId(brand.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [routeTenantSlug]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const localDev =
        typeof window !== "undefined" && isLocalAuthBypassEnabled(window.location.hostname);
      let orderRows: any[] = [];
      let quotesData: any[] = [];
      let shoppingData: any[] = [];
      let hireData: any[] = [];
      let driverData: any[] = [];
      let paymentsData: any[] = [];

      if (localDev) {
        const params = new URLSearchParams({
          company_id: companyId,
          from: appliedRange.from,
          to: appliedRange.to,
          view: viewMode === "completed" ? "completed" : "all",
        });
        const response = await fetch(
          `/api/admin/event-profitability?${params.toString()}`,
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload?.error || "Could not load local event data.");
        orderRows = payload.orders || [];
        quotesData = payload.quotes || [];
        shoppingData = payload.shopping || [];
        hireData = payload.hire || [];
        driverData = payload.drivers || [];
        paymentsData = payload.payments || [];
      } else {
        let offset = 0;
        while (true) {
          let ordersQuery = (supabase as any)
            .from("orders")
            .select(
              "id, order_number, event_name, client_name, internal_notes, event_date, total_amount, quote_id, status, payment_status, deposit_paid, confirmed_at, cancelled_at, order_items(quantity, unit_cost, line_total)",
            )
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("event_date", appliedRange.from)
            .lte("event_date", appliedRange.to)
            .order("event_date", { ascending: false })
            .order("id", { ascending: false });
          ordersQuery = viewMode === "completed"
            ? ordersQuery.in("status", ["delivered", "completed"])
            : ordersQuery.neq("status", "cancelled");
          const { data: page, error: orderError } = await ordersQuery.range(offset, offset + 999);
          if (orderError) throw orderError;
          const pageRows = (page || []) as any[];
          orderRows.push(...pageRows);
          if (pageRows.length < 1000) break;
          offset += pageRows.length;
        }

        const orderIds = orderRows.map((row) => row.id).filter(Boolean);
        const quoteIds = orderRows.map((row) => row.quote_id).filter(Boolean);
        const [quotesRes, shoppingRes, hireRes, driverRes, paymentsRes] =
          await Promise.all([
            quoteIds.length
              ? (supabase as any)
                  .from("quotes")
                  .select("id, total_amount, total")
                  .in("id", quoteIds)
              : Promise.resolve({ data: [], error: null }),
            (supabase as any)
              .from("shopping_list_items")
              .select(
                "source_order_id, actual_cost, estimated_cost, removed_at",
              )
              .in("source_order_id", orderIds),
            (supabase as any)
              .from("equipment_hire_orders")
              .select("order_id, total_cost, status")
              .in("order_id", orderIds),
            (supabase as any)
              .from("driver_assignments")
              .select("order_id, total_earnings, base_fee, distance_fee")
              .in("order_id", orderIds),
            (supabase as any)
              .from("payments")
              .select("order_id, gateway_response, payment_status")
              .in("order_id", orderIds)
              .eq("payment_status", "completed"),
          ]);
        for (const result of [
          quotesRes,
          shoppingRes,
          hireRes,
          driverRes,
          paymentsRes,
        ]) {
          if (result.error) throw result.error;
        }
        quotesData = quotesRes.data || [];
        shoppingData = shoppingRes.data || [];
        hireData = hireRes.data || [];
        driverData = driverRes.data || [];
        paymentsData = paymentsRes.data || [];
      }

      // Both views use the shared committed-booking definition. In
      // "all" view, unconfirmed pipeline rows are not reported as revenue.
      orderRows = orderRows.filter((row) => isReportableOrder(row) && isBookedRevenue(row));
      const orderIds = orderRows.map((row) => row.id).filter(Boolean);
      if (orderIds.length === 0) {
        setRows([]);
        return;
      }

      const quoteById = new Map<string, number>(
        quotesData.map((row: any) => [
          row.id as string,
          n(row.total_amount ?? row.total),
        ]),
      );
      const foodByOrder = new Map<string, number>();
      for (const item of shoppingData) {
        if (!item.source_order_id || item.removed_at) continue;
        if (item.actual_cost == null && item.estimated_cost == null) continue;
        const value =
          item.actual_cost != null
            ? n(item.actual_cost)
            : n(item.estimated_cost);
        foodByOrder.set(
          item.source_order_id,
          (foodByOrder.get(item.source_order_id) || 0) + value,
        );
      }
      // Use the accepted menu-cost snapshot when shopping lines have not
      // yet been priced. unit_cost is per item; multiply by quantity.
      for (const order of orderRows) {
        if (foodByOrder.has(order.id)) continue;
        const items = Array.isArray(order.order_items) ? order.order_items : [];
        let orderFoodCost = 0;
        let hasUnitCost = false;
        for (const item of items) {
          if (item.unit_cost == null || n(item.quantity) <= 0) continue;
          orderFoodCost += n(item.quantity) * n(item.unit_cost);
          hasUnitCost = true;
        }
        if (hasUnitCost) foodByOrder.set(order.id, orderFoodCost);
      }
      const equipmentByOrder = new Map<string, number>();
      for (const item of hireData) {
        if (item.status === "cancelled") continue;
        equipmentByOrder.set(
          item.order_id,
          (equipmentByOrder.get(item.order_id) || 0) + n(item.total_cost),
        );
      }
      const driverByOrder = new Map<string, number>();
      for (const item of driverData) {
        const savedTotal = n(item.total_earnings);
        const componentTotal = n(item.base_fee) + n(item.distance_fee);
        const value = savedTotal > 0 ? savedTotal : componentTotal;
        driverByOrder.set(
          item.order_id,
          (driverByOrder.get(item.order_id) || 0) + value,
        );
      }
      const paymentFeesByOrder = new Map<string, number>();
      for (const payment of paymentsData) {
        const fee = feeFromGatewayResponse(payment.gateway_response);
        paymentFeesByOrder.set(
          payment.order_id,
          (paymentFeesByOrder.get(payment.order_id) || 0) + fee,
        );
      }

      setRows(
        orderRows.map((order) => ({
          id: order.id,
          orderNumber: order.order_number || "-",
          eventName: order.event_name || "Untitled event",
          clientName: order.client_name || "-",
          eventDate: order.event_date,
          quoted: quoteById.get(order.quote_id) ?? n(order.total_amount),
          revenue: orderGrossValue(order),
          food: foodByOrder.get(order.id) || 0,
          equipment: equipmentByOrder.get(order.id) || 0,
          driver: driverByOrder.get(order.id) || 0,
          // Staff ledger rows currently have no order_id, so assigning them
          // to an event would create false profitability.
          staff: 0,
          staffLinked: false,
          paymentFees: paymentFeesByOrder.get(order.id) || 0,
          paymentFeesLinked: paymentFeesByOrder.has(order.id),
          status: order.status || "-",
        })),
      );
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load event profitability.");
    } finally {
      setLoading(false);
    }
  }, [companyId, appliedRange.from, appliedRange.to, viewMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          const cost =
            row.food + row.equipment + row.driver + row.staff + row.paymentFees;
          acc.quoted += row.quoted;
          acc.revenue += row.revenue;
          acc.cost += cost;
          if (cost > 0) {
            acc.costedRevenue += row.revenue;
            acc.profit += row.revenue - cost;
          }
          acc.food += row.food;
          acc.equipment += row.equipment;
          acc.driver += row.driver;
          acc.paymentFees += row.paymentFees;
          return acc;
        },
        {
          quoted: 0,
          revenue: 0,
          cost: 0,
          costedRevenue: 0,
          profit: 0,
          food: 0,
          equipment: 0,
          driver: 0,
          paymentFees: 0,
        },
      ),
    [rows],
  );

  const exportCsv = () => {
    const header = [
      "Order",
      "Event",
      "Client",
      "Event date",
      "Quoted",
      "Booked revenue",
      "Food/shopping",
      "Equipment hire",
      "Driver/delivery",
      "Staff",
      "Payment fees",
      "Profit estimate (recorded costs only)",
      "Gross margin estimate %",
    ];
    const lines = rows.map((row) => {
      const cost =
        row.food + row.equipment + row.driver + row.staff + row.paymentFees;
      const profit = row.revenue - cost;
      const hasCostData = cost > 0;
      return [
        row.orderNumber,
        row.eventName,
        row.clientName,
        row.eventDate,
        row.quoted,
        row.revenue,
        row.food,
        row.equipment,
        row.driver,
        row.staffLinked ? row.staff : "N/A - staff not linked to orders",
        row.paymentFees,
        hasCostData ? profit : "N/A - no cost data",
        hasCostData && row.revenue ? (profit / row.revenue) * 100 : "N/A - no cost data",
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `event-profitability-${appliedRange.from}-to-${appliedRange.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (value: number) => money(value, currency.format);
  const costedEventCount = rows.filter(
    (row) => row.food + row.equipment + row.driver + row.staff + row.paymentFees > 0,
  ).length;
  const margin = summary.costedRevenue
    ? (summary.profit / summary.costedRevenue) * 100
    : null;

  return (
    <>
      <Head>
        <title>Event profitability - CateringMS</title>
      </Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell>
          <PortalHeader
            variant="hero"
            title="Event profitability"
            subtitle="Compare booked event value with recorded operating costs."
            icon={BarChart3}
            actions={
              <div className="flex w-full items-center justify-end gap-2 xl:w-auto">
                <Button
                  onClick={exportCsv}
                  disabled={!rows.length}
                  variant="outline"
                  title="Export event profitability as CSV"
                  aria-label="Export event profitability as CSV"
                  className="h-11 w-11 justify-self-end p-0 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:h-9 sm:w-auto sm:px-3"
                >
                  <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Export CSV</span>
                </Button>
                <Button
                  onClick={() => void load()}
                  disabled={loading}
                  variant="outline"
                  title="Refresh event profitability"
                  aria-label="Refresh event profitability"
                  className="h-11 w-11 justify-self-end p-0 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:h-9 sm:w-auto sm:px-3"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="sr-only sm:not-sr-only">Refresh</span>
                </Button>
              </div>
            }
          />
          <PageWorkbench />
          <PortalCard className="mb-5 border-brand-primary/20 bg-brand-primary/5">
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(13rem,1.2fr)]">
              <div>
                <Label htmlFor="profit-from">From</Label>
                <Input
                  id="profit-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="profit-to">To</Label>
                <Input
                  id="profit-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <Button
                type="button"
                onClick={() => setAppliedRange({ from, to })}
                disabled={loading || !from || !to || from > to}
                className="h-11 w-full gap-2 bg-brand-primary text-white hover:bg-brand-primary/90 sm:w-fit"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Apply range
              </Button>
              <div>
                <Label htmlFor="profit-view">Events to show</Label>
                <select
                  id="profit-view"
                  value={viewMode}
                  onChange={(e) =>
                    setViewMode(e.target.value as "completed" | "all")
                  }
                  className="mt-1.5 h-11 w-full rounded-md border border-brand-primary/20 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                >
                  <option value="completed">Completed & delivered</option>
                  <option value="all">All booked events</option>
                </select>
              </div>
              <p className="col-span-full text-xs text-slate-500">
                {viewMode === "completed"
                  ? "Completed and delivered events only."
                  : "Includes committed bookings from confirmation through completion. Unconfirmed pipeline and cancelled orders are excluded."}{" "}
                Priced shopping totals take priority; menu item cost snapshots fill gaps.
              </p>
            </div>
          </PortalCard>
          {error && (
            <PortalCard className="mb-5 border-rose-200 bg-rose-50">
              <div className="flex items-start gap-3 text-rose-900">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-semibold">Could not load the report</p>
                  <p className="mt-1 text-sm">{error}</p>
                </div>
              </div>
            </PortalCard>
          )}
          <div className="mb-5 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Quoted"
              value={fmt(summary.quoted)}
              tooltip="Sum of the original quote totals linked to the report's bookings. If a booking has no linked quote, its current order total is used instead."
            />
            <SummaryCard
              label="Booked revenue"
              value={fmt(summary.revenue)}
              tooltip="Gross order total (total_amount, including tax) for reportable committed orders in the selected event-date range. Unconfirmed pipeline, cancelled and automated test orders are excluded."
            />
            <SummaryCard
              label="Recorded cost"
              value={fmt(summary.cost)}
              tooltip="Costs linked to these orders: priced shopping totals (estimated when actual is unavailable), menu-cost snapshots when no priced shopping total exists, equipment hire, driver earnings, and recorded payment gateway fees. Staff labour is not linked to individual orders here."
            />
            <SummaryCard
              label="Profit estimate on costed events"
              value={costedEventCount > 0 ? fmt(summary.profit) : "Awaiting cost data"}
              tone={costedEventCount === 0 ? undefined : summary.profit >= 0 ? "positive" : "negative"}
              tooltip="Booked revenue minus the recorded order costs listed in the Recorded Cost chip, summed only for events with at least one recorded cost. This estimate can omit unrecorded or partially priced costs and excludes staff labour, so it is not net profit."
            />
            <SummaryCard
              label="Margin estimate on costed events"
              value={margin != null ? `${margin.toFixed(1)}%` : "Awaiting cost data"}
              tone={margin == null ? undefined : margin >= 0 ? "positive" : "negative"}
              tooltip="Profit estimate divided by booked revenue for costed events only. The revenue denominator includes tax. This is a partial cost-coverage estimate, not a net margin; events with no recorded costs are excluded."
            />
          </div>
          <p className="mb-4 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" />
            Food costs use recorded shopping totals, or menu cost snapshots when shopping is not priced. Profit and margin exclude events with no recorded costs ({costedEventCount} of {rows.length} costed); staff labour is not linked to individual events yet.
          </p>
          <PortalCard className="overflow-hidden p-0">
            <div className="space-y-3 p-3 xl:hidden">
              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Loading events…
                </div>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  {viewMode === "completed"
                    ? "No completed or delivered events in this date range. Try All non-cancelled events if this booking is still in progress."
                    : "No non-cancelled events in this date range."}
                </p>
              ) : rows.map((row) => {
                const cost = row.food + row.equipment + row.driver + row.staff + row.paymentFees;
                const profit = row.revenue - cost;
                const hasCostData = cost > 0;
                return (
                  <article key={row.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-3 min-w-0">
                      <Link
                        href={withSlug(`/admin/orders?orderId=${encodeURIComponent(row.id)}`)}
                        className="font-semibold text-brand-primary hover:underline"
                      >
                        {row.orderNumber}
                      </Link>
                      <p className="mt-0.5 break-words text-sm font-medium text-slate-900">{row.eventName}</p>
                      <p className="break-words text-xs text-slate-500">{row.clientName} · {row.eventDate}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div><dt className="text-xs text-slate-500">Quoted</dt><dd className="break-words font-medium tabular-nums">{fmt(row.quoted)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Booked revenue</dt><dd className="break-words font-medium tabular-nums">{fmt(row.revenue)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Food</dt><dd className="break-words tabular-nums">{fmt(row.food)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Hire</dt><dd className="break-words tabular-nums">{fmt(row.equipment)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Driver</dt><dd className="break-words tabular-nums">{fmt(row.driver)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Staff</dt><dd className="tabular-nums text-slate-400" title="Staff labor is not currently linked to individual orders">—</dd></div>
                      <div><dt className="text-xs text-slate-500">Fees</dt><dd className="break-words tabular-nums">{row.paymentFeesLinked ? fmt(row.paymentFees) : <span className="text-slate-400" title="No gateway fee recorded">—</span>}</dd></div>
                      <div><dt className="text-xs text-slate-500">Margin</dt><dd className={`font-semibold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{hasCostData && row.revenue ? `${((profit / row.revenue) * 100).toFixed(1)}%` : <span className="text-slate-400" title="Margin is shown after at least one event cost is recorded">—</span>}</dd></div>
                      <div className="col-span-2 border-t border-slate-100 pt-2">
                        <dt className="text-xs text-slate-500">Profit</dt>
                        <dd className={`text-base font-semibold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{hasCostData ? fmt(profit) : <span className="text-slate-400" title="No event costs are recorded yet">—</span>}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="border-b border-brand-primary/20 bg-brand-primary/5 text-xs uppercase tracking-wide text-brand-primary dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-3 py-3 text-right">Quoted</th>
                    <th className="px-3 py-3 text-right"><span className="inline-flex items-center gap-1">Booked revenue <InfoTooltip content="Gross total_amount, including tax, for reportable committed orders in the selected event-date range." /></span></th>
                    <th className="px-3 py-3 text-right">Food</th>
                    <th className="px-3 py-3 text-right">Hire</th>
                    <th className="px-3 py-3 text-right">Driver</th>
                    <th className="px-3 py-3 text-right">Staff</th>
                    <th className="px-3 py-3 text-right">Fees</th>
                    <th className="px-3 py-3 text-right"><span className="inline-flex items-center gap-1">Profit estimate <InfoTooltip content="Booked revenue minus recorded order-linked costs. Staff labour is not currently linked to orders, and some cost records may be incomplete, so treat this as a contribution estimate rather than net profit." /></span></th>
                    <th className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1">Margin estimate <InfoTooltip content="Profit estimate divided by gross booked revenue (including tax), for events with at least one recorded cost. Missing event costs and staff labour are not included." /></span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-12 text-center text-slate-500"
                      >
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        Loading completed events…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-12 text-center text-slate-500"
                      >
                        {viewMode === "completed"
                          ? "No completed or delivered events in this date range. Try All non-cancelled events if this booking is still in progress."
                          : "No non-cancelled events in this date range."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const cost =
                        row.food +
                        row.equipment +
                        row.driver +
                        row.staff +
                        row.paymentFees;
                      const profit = row.revenue - cost;
                      const hasCostData = cost > 0;
                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-brand-primary/5 dark:hover:bg-slate-900"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={withSlug(
                                `/admin/orders?orderId=${encodeURIComponent(row.id)}`,
                              )}
                              className="font-semibold text-brand-primary hover:underline"
                            >
                              {row.orderNumber}
                            </Link>
                            <p className="max-w-[240px] truncate text-xs text-slate-500">
                              {row.eventName} · {row.clientName} ·{" "}
                              {row.eventDate}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {fmt(row.quoted)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {fmt(row.revenue)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {fmt(row.food)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {fmt(row.equipment)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {fmt(row.driver)}
                          </td>
                          <td
                            className="px-3 py-3 text-right tabular-nums text-slate-400"
                            title="Staff labor is not currently linked to individual orders"
                          >
                            —
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {row.paymentFeesLinked ? (
                              fmt(row.paymentFees)
                            ) : (
                              <span
                                className="text-slate-400"
                                title="No gateway fee recorded"
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td
                            className={`px-3 py-3 text-right font-semibold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                          >
                            {hasCostData ? fmt(profit) : <span className="text-slate-400" title="No event costs are recorded yet">—</span>}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                          >
                            {hasCostData && row.revenue
                              ? `${((profit / row.revenue) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </PortalCard>
        </PortalShell>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  tooltip,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  tooltip?: string;
}) {
  return (
    <PortalCard className="relative overflow-hidden border-brand-primary/20 bg-white/90 dark:bg-slate-900/90">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent"
      />
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-brand-primary/75">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </p>
      <p
        className={`mt-2 break-words text-lg font-bold leading-tight tabular-nums sm:text-xl ${tone === "positive" ? "text-brand-primary" : tone === "negative" ? "text-rose-700" : "text-slate-900 dark:text-white"}`}
      >
        {value}
      </p>
    </PortalCard>
  );
}

export default function EventProfitabilityPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
      ]}
    >
      <EventProfitabilityPageInner />
    </ProtectedRoute>
  );
}
