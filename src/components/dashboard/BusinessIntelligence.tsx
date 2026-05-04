/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Business Intelligence section -- the big bottom band of charts on
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
import { RevenueTrendChart } from "./charts/RevenueTrendChart";
import { YoYStripCard } from "./charts/YoYStripCard";

interface Props {
  companyId: string | null | undefined;
}

const STORAGE_KEY = (companyId: string) => `cms.bi.collapsed.${companyId}`;
const ROW_CAP = 5000;

export function BusinessIntelligence({ companyId }: Props) {
  const { regionFilterId } = useRegionFilter();

  // Collapsed state -- per tenant so a new tenant doesn't inherit
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
  // region filter when set.
  const [orders, setOrders] = useState<RevenueByMonthInput[]>([]);
  const [quotes, setQuotes] = useState<QuoteForYoY[]>([]);
  const [leads, setLeads] = useState<LeadForYoY[]>([]);
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
      return d.toISOString().slice(0, 10);
    })();

    (async () => {
      try {
        const ordersBase = supabase
          .from("orders")
          .select("id, status, payment_status, total_amount, amount_paid, deposit_paid, deposit_amount, balance_paid, balance_amount, event_date, region_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", startISO)
          .limit(ROW_CAP);

        const quotesBase = supabase
          .from("quotes")
          .select("id, status, total_amount, created_at, accepted_at, region_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("created_at", startISO)
          .limit(ROW_CAP);

        const leadsBase = supabase
          .from("leads")
          .select("id, status, created_at, region_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("created_at", startISO)
          .limit(ROW_CAP);

        const [ordersRes, quotesRes, leadsRes] = await Promise.all([
          regionFilterId ? ordersBase.or(`region_id.eq.${regionFilterId},region_id.is.null`) : ordersBase,
          regionFilterId ? quotesBase.or(`region_id.eq.${regionFilterId},region_id.is.null`) : quotesBase,
          regionFilterId ? leadsBase.or(`region_id.eq.${regionFilterId},region_id.is.null`) : leadsBase,
        ]);

        if (cancelled) return;
        const oRows = (ordersRes.data || []) as any as RevenueByMonthInput[];
        const qRows = (quotesRes.data || []) as any as QuoteForYoY[];
        const lRows = (leadsRes.data || []) as any as LeadForYoY[];

        if (oRows.length >= ROW_CAP || qRows.length >= ROW_CAP || lRows.length >= ROW_CAP) {
          setOverflow(true);
        }

        setOrders(oRows);
        setQuotes(qRows);
        setLeads(lRows);
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
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow">
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
        </div>
      )}
    </section>
  );
}
