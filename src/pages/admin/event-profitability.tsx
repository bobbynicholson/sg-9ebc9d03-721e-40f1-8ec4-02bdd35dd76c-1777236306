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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import { toLocalISO } from "@/lib/localDate";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";
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
        typeof window !== "undefined" &&
        process.env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(window.location.hostname);
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
        let ordersQuery = (supabase as any)
          .from("orders")
          .select(
            "id, order_number, event_name, client_name, event_date, total_amount, quote_id, status",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", appliedRange.from)
          .lte("event_date", appliedRange.to)
          .order("event_date", { ascending: false });
        ordersQuery =
          viewMode === "completed"
            ? ordersQuery.in("status", ["delivered", "completed"])
            : ordersQuery.neq("status", "cancelled");
        const { data: orders, error: orderError } = await ordersQuery;
        if (orderError) throw orderError;
        orderRows = (orders || []) as any[];

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
        const value =
          item.actual_cost != null
            ? n(item.actual_cost)
            : n(item.estimated_cost);
        foodByOrder.set(
          item.source_order_id,
          (foodByOrder.get(item.source_order_id) || 0) + value,
        );
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
        const value =
          item.total_earnings != null
            ? n(item.total_earnings)
            : n(item.base_fee) + n(item.distance_fee);
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
          revenue: n(order.total_amount),
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
          acc.profit += row.revenue - cost;
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
      "Revenue",
      "Food/shopping",
      "Equipment hire",
      "Driver/delivery",
      "Staff",
      "Payment fees",
      "Profit",
      "Profit %",
    ];
    const lines = rows.map((row) => {
      const cost =
        row.food + row.equipment + row.driver + row.staff + row.paymentFees;
      const profit = row.revenue - cost;
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
        row.staff,
        row.paymentFees,
        profit,
        row.revenue ? (profit / row.revenue) * 100 : 0,
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
  const margin = summary.revenue ? (summary.profit / summary.revenue) * 100 : 0;

  return (
    <>
      <Head>
        <title>Event profitability - CateringMS</title>
      </Head>
      <AdminNav />
      <div className="min-h-screen pt-16 lg:pl-72 lg:pt-0 xl:pl-80">
        <PortalShell>
          <PortalHeader
            variant="hero"
            title="Event profitability"
            subtitle="See what completed events actually earned after recorded operating costs."
            icon={BarChart3}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={exportCsv}
                  disabled={!rows.length}
                  variant="outline"
                  className="gap-2 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  onClick={() => void load()}
                  disabled={loading}
                  variant="outline"
                  className="gap-2 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            }
          />
          <PageWorkbench />
          <PortalCard className="mb-5 border-brand-primary/20 bg-brand-primary/5">
            <div className="grid gap-3 sm:grid-cols-[180px_180px_auto_1fr] sm:items-end">
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
                className="w-fit gap-2 bg-brand-primary text-white hover:bg-brand-primary/90"
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
                  className="mt-1.5 h-10 w-full rounded-md border border-brand-primary/20 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                >
                  <option value="completed">Completed & delivered</option>
                  <option value="all">All non-cancelled events</option>
                </select>
              </div>
              <p className="text-xs text-slate-500">
                {viewMode === "completed"
                  ? "Completed and delivered events only."
                  : "Includes confirmed, preparing, ready, in-transit, delivered, and completed events."}{" "}
                Shopping and hire costs use actual values where recorded;
                estimates are used when no actual shopping total exists.
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
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Quoted" value={fmt(summary.quoted)} />
            <SummaryCard label="Revenue" value={fmt(summary.revenue)} />
            <SummaryCard label="Recorded cost" value={fmt(summary.cost)} />
            <SummaryCard
              label="Profit"
              value={fmt(summary.profit)}
              tone={summary.profit >= 0 ? "positive" : "negative"}
            />
            <SummaryCard
              label="Profit %"
              value={`${margin.toFixed(1)}%`}
              tone={margin >= 0 ? "positive" : "negative"}
            />
          </div>
          <PortalCard className="mb-5 border-brand-primary/20 bg-gradient-to-r from-brand-primary/10 via-brand-secondary/5 to-brand-accent/10">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-brand-primary" />
              <div>
                <p className="font-semibold text-brand-primary dark:text-white">
                  Cost coverage
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Linked now: shopping, equipment hire, and driver/delivery
                  costs. Staff labor is not yet attributable to individual
                  orders, and payment fees appear only when the gateway response
                  records them. Those missing categories are excluded rather
                  than guessed.
                </p>
              </div>
            </div>
          </PortalCard>
          <PortalCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="border-b border-brand-primary/20 bg-brand-primary/5 text-xs uppercase tracking-wide text-brand-primary dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-3 py-3 text-right">Quoted</th>
                    <th className="px-3 py-3 text-right">Revenue</th>
                    <th className="px-3 py-3 text-right">Food</th>
                    <th className="px-3 py-3 text-right">Hire</th>
                    <th className="px-3 py-3 text-right">Driver</th>
                    <th className="px-3 py-3 text-right">Staff</th>
                    <th className="px-3 py-3 text-right">Fees</th>
                    <th className="px-3 py-3 text-right">Profit</th>
                    <th className="px-4 py-3 text-right">Margin</th>
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
                            {fmt(profit)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                          >
                            {row.revenue
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
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <PortalCard className="relative overflow-hidden border-brand-primary/20 bg-white/90 dark:bg-slate-900/90">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent"
      />
      <p className="text-xs font-medium uppercase tracking-wide text-brand-primary/75">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-bold tabular-nums ${tone === "positive" ? "text-brand-primary" : tone === "negative" ? "text-rose-700" : "text-slate-900 dark:text-white"}`}
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
