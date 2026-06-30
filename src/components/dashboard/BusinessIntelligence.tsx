/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Business Intelligence section - the big bottom band of charts on
 * /admin/dashboard. Owns its own data fetch (24-month window of orders
 * + quotes + leads, narrowed by the global region filter), passes
 * extracted shapes into individual chart components.
 *
 * Tiered render:
 *   Tier 1: Revenue trend + YoY strip (this commit)
 *   Tier 2-3: Pressure + Customers (next commit)
 *   Tier 4-5: Lead intelligence + Operations
 *   Tier 6: Multi-branch (only when >1 active region)
 *
 * Collapsible. Default expanded; persists in localStorage per-tenant.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import {
  aggregateRevenueByMonth,
  type RevenueByMonthInput,
} from "./extractors/aggregateRevenueByMonth";
import {
  aggregateYoYStrip,
  type LeadForYoY,
  type QuoteForYoY,
} from "./extractors/aggregateYoYStrip";
import { aggregateSeasonalityHeatmap } from "./extractors/aggregateSeasonalityHeatmap";
import { aggregateCapacityLoad } from "./extractors/aggregateCapacityLoad";
import { aggregateConversionFunnel } from "./extractors/aggregateConversionFunnel";
import {
  aggregateTopClients,
  type ClientLookupRow,
  type OrderForClientLTV,
} from "./extractors/aggregateTopClients";
import { aggregateRetentionCohort } from "./extractors/aggregateRetentionCohort";
import { aggregateNewVsRepeat } from "./extractors/aggregateNewVsRepeat";
import { aggregateLeadSourceFunnel } from "./extractors/aggregateLeadSourceFunnel";
import { aggregateQuoteAcceptTime } from "./extractors/aggregateQuoteAcceptTime";
import {
  aggregateCancellationReasons,
  type CancelledOrder,
} from "./extractors/aggregateCancellationReasons";
import {
  aggregateReceivablesAging,
  type InvoiceForAging,
} from "./extractors/aggregateReceivablesAging";
import {
  aggregateTopProducts,
  type OrderItemForProducts,
} from "./extractors/aggregateTopProducts";
import {
  aggregateBranchSpider,
  type BranchOption,
} from "./extractors/aggregateBranchSpider";
import { aggregateBranchCapacityGrid } from "./extractors/aggregateBranchCapacityGrid";
import { RevenueTrendChart } from "./charts/RevenueTrendChart";
import { YoYStripCard } from "./charts/YoYStripCard";
import { SeasonalityHeatmap } from "./charts/SeasonalityHeatmap";
import { CapacityLoadCalendar } from "./charts/CapacityLoadCalendar";
import { ConversionFunnelChart } from "./charts/ConversionFunnelChart";
import { TopClientsBarChart } from "./charts/TopClientsBarChart";
import { RetentionCohortGrid } from "./charts/RetentionCohortGrid";
import { NewVsRepeatDonut } from "./charts/NewVsRepeatDonut";
import { LeadSourceFunnelChart } from "./charts/LeadSourceFunnelChart";
import { QuoteAcceptTimeHistogram } from "./charts/QuoteAcceptTimeHistogram";
import { CancellationReasonsChart } from "./charts/CancellationReasonsChart";
import { ReceivablesAgingChart } from "./charts/ReceivablesAgingChart";
import { TopProductsBarChart } from "./charts/TopProductsBarChart";
import { BranchSpiderChart } from "./charts/BranchSpiderChart";
import { BranchCapacityHeatmap } from "./charts/BranchCapacityHeatmap";
import { toLocalISO } from "@/lib/localDate";

interface Props {
  companyId: string | null | undefined;
  /** Date range from the dashboard's preset picker. Drives the
   *  conversion funnel (and future range-bound charts). The trend +
   *  seasonality charts run on a fixed 12-month window regardless. */
  dateRange?: { from: Date; to: Date } | null;
}

const STORAGE_KEY = (companyId: string) => `cms.bi.collapsed.${companyId}`;
const ROW_CAP = 5000;

export function BusinessIntelligence({ companyId, dateRange }: Props) {
  const { regionFilterId, options: branchOptions, hasMultipleBranches } = useRegionFilter();

  // Collapsed state - per tenant so a new tenant doesn't inherit
  // somebody else's preference.
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    if (!companyId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(companyId));
      setCollapsed(raw === "1");
    } catch { /* noop */ }
  }, [companyId]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (companyId && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY(companyId), next ? "1" : "0");
      } catch { /* noop */ }
    }
  };

  // ── Data fetch ──────────────────────────────────────────────────
  // 24-month window so the YoY strip has its prior period. Narrow by
  // region filter when set. Tier 3 also fetches clients for the
  // top-clients bar + retention cohort.
  const [orders, setOrders] = useState<RevenueByMonthInput[]>([]);
  const [quotes, setQuotes] = useState<QuoteForYoY[]>([]);
  const [leads, setLeads] = useState<LeadForYoY[]>([]);
  const [clients, setClients] = useState<ClientLookupRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceForAging[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemForProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setOverflow(false);

    const now = new Date();
    const startISO = (() => {
      const d = new Date(now.getFullYear(), now.getMonth() - 23, 1);
      return toLocalISO(d);
    })();
    // Capacity-load chart needs the next 90 days. Stretch the orders
    // and quotes windows out so a single fetch covers history + future.
    const futureCapISO = (() => {
      const d = new Date(now);
      d.setDate(d.getDate() + 95); // small buffer
      return toLocalISO(d);
    })();

    (async () => {
      try {
        const ordersBase = supabase
          .from("orders")
          .select("id, status, payment_status, total_amount, amount_paid, deposit_paid, deposit_amount, balance_paid, balance_amount, event_date, region_id, client_id, cancelled_at, cancellation_reason")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", startISO)
          .lte("event_date", futureCapISO)
          .limit(ROW_CAP);

        const quotesBase = supabase
          .from("quotes")
          // TIGHTEN I.61: select converted_to_order_id so the
          // accept-time / YoY / conversion-funnel / branch-spider
          // aggregators can fall back to "linked order exists" as
          // the won signal.
          // TIGHTEN I.71: select lost_reason too so the same
          // aggregators can detect won-then-cancelled
          // (lost_reason='order_cancelled' + converted_to_order_id
          // set) and net it out of conversion rates.
          .select("id, status, total_amount, event_date, created_at, sent_at, accepted_at, region_id, converted_to_order_id, lost_reason")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("created_at", startISO)
          .limit(ROW_CAP);

        const leadsBase = supabase
          .from("leads")
          .select("id, status, source, created_at, region_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("created_at", startISO)
          .limit(ROW_CAP);

        // Clients: ALL of them (no date floor) so the cohort grid can
        // walk historical signups. region_id filtering applied where
        // possible - region_admins only see clients linked to their
        // branch, but the query doesn't fail-closed for company_admins.
        const clientsBase = supabase
          .from("clients")
          .select("id, client_name, email, outstanding_balance, created_at, region_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .limit(ROW_CAP);

        // Invoices: open balances drive the receivables-aging chart.
        // No date floor - old debts are exactly what we want to surface.
        const invoicesBase = supabase
          .from("invoices")
          .select("id, status, due_date, balance_due, total_amount, client_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .neq("status", "paid")
          .limit(ROW_CAP);

        // Order items: inner join orders for company + region filter.
        // RLS enforces the relationship server-side; we still pass the
        // explicit filter for index hits.
        const orderItemsBase = supabase
          .from("order_items")
          .select("id, order_id, menu_item_id, item_name, quantity, line_total, orders!inner(company_id, event_date, region_id, status, deleted_at)")
          .eq("orders.company_id", companyId)
          .is("orders.deleted_at", null)
          .gte("orders.event_date", startISO)
          .lte("orders.event_date", futureCapISO)
          .limit(ROW_CAP);

        const [ordersRes, quotesRes, leadsRes, clientsRes, invoicesRes, orderItemsRes] = await Promise.all([
          regionFilterId ? ordersBase.or(`region_id.eq.${regionFilterId},region_id.is.null`) : ordersBase,
          regionFilterId ? quotesBase.or(`region_id.eq.${regionFilterId},region_id.is.null`) : quotesBase,
          regionFilterId ? leadsBase.or(`region_id.eq.${regionFilterId},region_id.is.null`) : leadsBase,
          regionFilterId ? clientsBase.or(`region_id.eq.${regionFilterId},region_id.is.null`) : clientsBase,
          invoicesBase,
          regionFilterId ? orderItemsBase.or(`region_id.eq.${regionFilterId},region_id.is.null`, { foreignTable: "orders" }) : orderItemsBase,
        ]);

        if (cancelled) return;
        const oRows = (ordersRes.data || []) as any as RevenueByMonthInput[];
        const qRows = (quotesRes.data || []) as any as QuoteForYoY[];
        const lRows = (leadsRes.data || []) as any as LeadForYoY[];
        const cRows = (clientsRes.data || []) as any as ClientLookupRow[];
        const iRows = (invoicesRes.data || []) as any as InvoiceForAging[];
        const oiRows = (orderItemsRes.data || []) as any as OrderItemForProducts[];

        if (
          oRows.length >= ROW_CAP || qRows.length >= ROW_CAP ||
          lRows.length >= ROW_CAP || cRows.length >= ROW_CAP ||
          iRows.length >= ROW_CAP || oiRows.length >= ROW_CAP
        ) {
          setOverflow(true);
        }

        setOrders(oRows);
        setQuotes(qRows);
        setLeads(lRows);
        setClients(cRows);
        setInvoices(iRows);
        setOrderItems(oiRows);
      } catch (e) {
        console.warn("[BusinessIntelligence] fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [companyId, regionFilterId]);

  // ── Extractors (memoised so re-renders don't recompute) ─────────
  const revenueByMonth = useMemo(
    () => aggregateRevenueByMonth(orders),
    [orders],
  );
  const yoyStrip = useMemo(
    () => aggregateYoYStrip(orders, quotes, leads),
    [orders, quotes, leads],
  );
  const seasonality = useMemo(
    () => aggregateSeasonalityHeatmap(orders),
    [orders],
  );
  const capacity = useMemo(
    () => aggregateCapacityLoad(orders, quotes as any),
    [orders, quotes],
  );
  const funnel = useMemo(() => {
    const start = dateRange?.from ?? new Date(new Date().setDate(new Date().getDate() - 30));
    const end = dateRange?.to ?? new Date();
    return aggregateConversionFunnel(leads, quotes, orders, start, end);
  }, [leads, quotes, orders, dateRange]);
  const topClients = useMemo(
    () => aggregateTopClients(orders as any as OrderForClientLTV[], clients),
    [orders, clients],
  );
  const cohort = useMemo(
    () => aggregateRetentionCohort(clients, orders as any as OrderForClientLTV[]),
    [clients, orders],
  );
  const newVsRepeat = useMemo(() => {
    const start = dateRange?.from ?? new Date(new Date().setDate(new Date().getDate() - 30));
    const end = dateRange?.to ?? new Date();
    return aggregateNewVsRepeat(orders as any as OrderForClientLTV[], start, end);
  }, [orders, dateRange]);
  const leadSourceFunnel = useMemo(
    () => aggregateLeadSourceFunnel(leads, quotes),
    [leads, quotes],
  );
  const quoteAcceptTime = useMemo(
    () => aggregateQuoteAcceptTime(quotes),
    [quotes],
  );
  const cancellationReasons = useMemo(
    () => aggregateCancellationReasons(orders as any as CancelledOrder[]),
    [orders],
  );
  const receivablesAging = useMemo(
    () => aggregateReceivablesAging(invoices),
    [invoices],
  );
  const topProducts = useMemo(() => {
    // Exclude line items from cancelled orders - those don't represent
    // realised revenue, only intent.
    const cancelledIds = new Set<string>();
    for (const o of orders as any as CancelledOrder[]) {
      if (o.status === "cancelled" || o.cancelled_at) cancelledIds.add(o.id);
    }
    return aggregateTopProducts(orderItems, cancelledIds);
  }, [orderItems, orders]);

  // Tier 6 - multi-branch only. branchOptions comes from the global
  // region filter context: it's already narrowed to "real" regions
  // visible to this user.
  const branchList: BranchOption[] = useMemo(
    () => branchOptions.map((o) => ({ id: o.id, name: o.name })),
    [branchOptions],
  );
  const branchSpider = useMemo(
    () => aggregateBranchSpider(branchList, orders, quotes, leads),
    [branchList, orders, quotes, leads],
  );
  const branchCapacity = useMemo(
    () => aggregateBranchCapacityGrid(branchList, orders),
    [branchList, orders],
  );

  return (
    <section className="mb-6" aria-labelledby="bi-section-heading">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 text-left group"
          aria-expanded={!collapsed}
          aria-controls="bi-section-content"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-slate-500 flex items-center justify-center shadow">
            <BarChart3 className="w-4 h-4 text-white" />
          </span>
          <span>
            <h2 id="bi-section-heading" className="text-lg font-semibold text-slate-900 leading-tight">
              Business intelligence
            </h2>
            <p className="text-xs text-slate-500">
              Revenue trend, year-over-year shape, and the rest of the deep-dive charts.
            </p>
          </span>
          <span className="ml-2 text-slate-400 group-hover:text-slate-600 transition-colors">
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </span>
        </button>
      </div>

      {!collapsed && (
        <div id="bi-section-content" className="space-y-4">
          {overflow && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              You have more than {ROW_CAP.toLocaleString()} records in the last 24 months. The charts use the most recent
              {" "}{ROW_CAP.toLocaleString()} rows for performance. Older trends may be slightly understated.
            </div>
          )}
          <RevenueTrendChart data={revenueByMonth} loading={loading} />
          <YoYStripCard data={loading ? null : yoyStrip} loading={loading} />

          {/* Tier 2 - pressure */}
          <SeasonalityHeatmap data={seasonality} loading={loading} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CapacityLoadCalendar data={capacity} loading={loading} />
            <ConversionFunnelChart data={funnel} loading={loading} />
          </div>

          {/* Tier 3 - customers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopClientsBarChart data={topClients} loading={loading} />
            <NewVsRepeatDonut data={newVsRepeat} loading={loading} />
          </div>
          <RetentionCohortGrid data={cohort} loading={loading} />

          {/* Tier 4 - lead intelligence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LeadSourceFunnelChart data={leadSourceFunnel} loading={loading} />
            <QuoteAcceptTimeHistogram data={quoteAcceptTime} loading={loading} />
          </div>

          {/* Tier 5 - operations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CancellationReasonsChart data={cancellationReasons} loading={loading} />
            <ReceivablesAgingChart data={receivablesAging} loading={loading} />
          </div>
          <TopProductsBarChart data={topProducts} loading={loading} />

          {/* Tier 6 - multi-branch comparison. Hidden for single-branch
              tenants (no value) AND while a single branch is filtered
              in (the comparison would be against itself, since the
              region filter has already pruned other branches' rows
              from the fetch). */}
          {hasMultipleBranches && !regionFilterId && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BranchSpiderChart data={branchSpider} loading={loading} />
              <BranchCapacityHeatmap data={branchCapacity} loading={loading} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
