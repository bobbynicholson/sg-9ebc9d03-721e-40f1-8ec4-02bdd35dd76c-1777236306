/**
 * InventoryLowStockWidget - smart low-stock card on /admin/dashboard.
 *
 * Wave 70.54 (Bobby brief 2026-05-22): the original widget just listed
 * "Item X - 1/1 unit on hand" with no context. The shopping team
 * couldn't tell which lows were urgent (covers a Saturday event) from
 * which lows were noise (a tub of cheese slices nobody's booked).
 *
 * This rebuild reads the inventory_demand_outlook view, which already
 * joins orders -> order_items -> recipes -> recipe_ingredients ->
 * inventory_items and aggregates demand over the next 7 / 14 / 30
 * days for confirmed/preparing/ready orders only (cancelled orders
 * are excluded server-side). For each short item we show:
 *
 *   - Status pill: shortfall (red) / below minimum (amber) / low
 *     (amber) / no demand (slate)
 *   - "Need X by Sat 23 May, you have Y -> short Z" on shortfall
 *   - "No upcoming orders need this" on items that are at the floor
 *     but nobody's actually using
 *   - Expand row -> per-order breakdown from order_ingredient_demand
 *     (order_number, event_name, event_date, qty required, status)
 *
 * Realtime: subscribes to orders + inventory_items on this tenant so
 * cancelling an order or recording a stock adjustment refreshes the
 * outlook immediately (no manual refresh).
 *
 * Phase 10 #4 originally; rebuilt Wave 70.54.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Package, ShoppingCart, CalendarDays, Info, ExternalLink,
} from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type DemandStatus = "shortfall" | "below_minimum" | "low" | "ok";

interface OutlookRow {
  inventory_item_id: string;
  item_name: string;
  category: string | null;
  unit_of_measure: string | null;
  current_stock: number;
  minimum_stock: number;
  reorder_quantity: number | null;
  demand_next_7_days: number;
  demand_next_14_days: number;
  demand_next_30_days: number;
  upcoming_order_count: number;
  projected_stock_after_7_days: number;
  shortfall_next_7_days: number;
  status: DemandStatus;
}

interface OrderDemandRow {
  order_id: string;
  order_number: string;
  event_name: string | null;
  event_date: string;
  order_status: string;
  quantity_required: number;
  unit: string | null;
}

interface Props {
  companyId: string | null;
}

const LIMIT = 5;

/* ------------------------------------------------------------------ */
/* Status -> chip mapping                                             */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<DemandStatus, {
  label: string;
  tone: string;
  reason: string;
}> = {
  shortfall: {
    label: "Shortfall",
    tone: "bg-rose-100 text-rose-800 border-rose-200",
    reason: "Confirmed orders in the next 7 days need more than you have on hand. Action: shop now.",
  },
  below_minimum: {
    label: "Below reorder",
    tone: "bg-amber-100 text-amber-900 border-amber-200",
    reason: "Below your reorder threshold but no confirmed orders in the next 7 days need it yet. Action: restock at the usual cadence.",
  },
  low: {
    label: "Tight (14d)",
    tone: "bg-amber-100 text-amber-900 border-amber-200",
    reason: "Covers the next 7 days but you won't make 14 if more bookings come in. Action: keep an eye on it.",
  },
  ok: {
    label: "At floor",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
    reason: "At your minimum but no upcoming demand. Action: safe to skip refill if you're trimming stock.",
  },
};

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  weekday: "short", day: "numeric", month: "short",
});
function formatEventDate(iso: string): string {
  try { return dateFmt.format(new Date(iso + "T00:00:00")); }
  catch { return iso; }
}

function formatQty(n: number, unit: string | null | undefined): string {
  const rounded = Math.round(Number(n) * 1000) / 1000;
  const stripped = rounded.toString().replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return unit ? `${stripped} ${unit}` : stripped;
}

/* ------------------------------------------------------------------ */
/* Widget                                                             */
/* ------------------------------------------------------------------ */

export function InventoryLowStockWidget({ companyId }: Props) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<OutlookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drilldownById, setDrilldownById] = useState<Record<string, OrderDemandRow[] | "loading">>({});

  /* Fetch outlook ---------------------------------------------------- */
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    // Pull every demand-outlook row for the tenant. RLS on the
    // underlying inventory_items + orders tables already filters to
    // this tenant, so the view inherits the scope. Set is small
    // (single-tenant inventory rarely > a few hundred items).
    const { data, error } = await (supabase as any)
      .from("inventory_demand_outlook")
      .select(
        "inventory_item_id, item_name, category, unit_of_measure, current_stock, minimum_stock, reorder_quantity, demand_next_7_days, demand_next_14_days, demand_next_30_days, upcoming_order_count, projected_stock_after_7_days, shortfall_next_7_days, status",
      )
      .eq("company_id", companyId)
      .limit(500);
    if (error) {
      setRows([]);
      setLoading(false);
      reportError(error.message || "Could not load low-stock outlook");
      return;
    }
    const all = ((data || []) as any[]).map((r): OutlookRow => ({
      inventory_item_id: r.inventory_item_id,
      item_name: r.item_name,
      category: r.category,
      unit_of_measure: r.unit_of_measure,
      current_stock: Number(r.current_stock || 0),
      minimum_stock: Number(r.minimum_stock || 0),
      reorder_quantity: r.reorder_quantity == null ? null : Number(r.reorder_quantity),
      demand_next_7_days: Number(r.demand_next_7_days || 0),
      demand_next_14_days: Number(r.demand_next_14_days || 0),
      demand_next_30_days: Number(r.demand_next_30_days || 0),
      upcoming_order_count: Number(r.upcoming_order_count || 0),
      projected_stock_after_7_days: Number(r.projected_stock_after_7_days || 0),
      shortfall_next_7_days: Number(r.shortfall_next_7_days || 0),
      status: (r.status as DemandStatus) || "ok",
    }));
    // Eligible: anything the operator should care about. That's a
    // real shortfall OR below the reorder threshold OR will go
    // short within 14 days OR sitting at the floor with the
    // minimum_stock guard set. Pure 'ok' with current > minimum is
    // skipped so the card stays focused.
    const eligible = all.filter((r) =>
      r.status !== "ok"
      || (r.minimum_stock > 0 && r.current_stock <= r.minimum_stock),
    );
    // Sort by severity: shortfall first (with biggest shortfall on
    // top), then below_minimum, then low, then ok-at-floor. Within
    // the same status, the smaller the ratio cur/min the more
    // urgent the visual.
    const severityRank: Record<DemandStatus, number> = {
      shortfall: 0, below_minimum: 1, low: 2, ok: 3,
    };
    eligible.sort((a, b) => {
      const s = severityRank[a.status] - severityRank[b.status];
      if (s !== 0) return s;
      if (a.status === "shortfall") return b.shortfall_next_7_days - a.shortfall_next_7_days;
      const ar = a.minimum_stock > 0 ? a.current_stock / a.minimum_stock : 9;
      const br = b.minimum_stock > 0 ? b.current_stock / b.minimum_stock : 9;
      return ar - br;
    });
    setRows(eligible.slice(0, LIMIT));
    setLoading(false);
    reportError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  useEffect(() => { load(); }, [load]);

  /* Realtime --------------------------------------------------------- */
  useEffect(() => {
    if (!companyId) return;
    // Per-tenant channel (Phase 6 audit ground rule). Refresh the
    // outlook whenever a) an order changes (status, deletion,
    // cancellation cascade, items added) or b) inventory_items stock
    // is adjusted. Refetching the whole view is cheap, the result
    // set is small.
    const ch = supabase
      .channel(`dashboard-low-stock:${companyId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${companyId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, load]);

  /* Drilldown: load the per-order breakdown lazily ------------------- */
  const loadDrilldown = useCallback(async (inventoryItemId: string) => {
    setDrilldownById((m) => ({ ...m, [inventoryItemId]: "loading" }));
    const { data, error } = await (supabase as any)
      .from("order_ingredient_demand")
      .select("order_id, order_number, event_name, event_date, order_status, quantity_required, unit")
      .eq("company_id", companyId)
      .eq("inventory_item_id", inventoryItemId)
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date", { ascending: true })
      .limit(20);
    if (error) {
      console.error("[InventoryLowStockWidget] drilldown failed:", error);
      setDrilldownById((m) => ({ ...m, [inventoryItemId]: [] }));
      return;
    }
    // Aggregate by order: an order may use the same ingredient in
    // multiple menu items (e.g. baby potatoes in two side dishes).
    // Group by order_id and sum the qty.
    const byOrder = new Map<string, OrderDemandRow>();
    for (const r of (data || []) as any[]) {
      const k = r.order_id as string;
      const prev = byOrder.get(k);
      const qty = Number(r.quantity_required || 0);
      if (prev) {
        prev.quantity_required += qty;
      } else {
        byOrder.set(k, {
          order_id: k,
          order_number: r.order_number,
          event_name: r.event_name,
          event_date: r.event_date,
          order_status: String(r.order_status || ""),
          quantity_required: qty,
          unit: r.unit,
        });
      }
    }
    setDrilldownById((m) => ({ ...m, [inventoryItemId]: Array.from(byOrder.values()) }));
  }, [companyId]);

  const toggle = (id: string) => {
    setExpanded((e) => {
      const next = e === id ? null : id;
      if (next && !drilldownById[next]) {
        void loadDrilldown(next);
      }
      return next;
    });
  };

  /* Aggregate signal across all visible rows ------------------------- */
  const shortfallCount = useMemo(
    () => rows.filter((r) => r.status === "shortfall").length,
    [rows],
  );

  /* Render ----------------------------------------------------------- */
  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className={`mb-6 border-orange-200 ${shortfallCount > 0 ? "bg-rose-50/40" : "bg-orange-50/40"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className={`w-4 h-4 ${shortfallCount > 0 ? "text-rose-600" : "text-orange-600"}`} />
              Stock running low
              {shortfallCount > 0 && (
                <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">
                  {shortfallCount} short for upcoming orders
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Items short of stock right now. Each line shows what you have, what confirmed orders need it in the next 7 days, and which specific bookings will run short.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/shopping")}>
            <Button variant="ghost" size="sm" className="text-orange-700">
              Buy now <ShoppingCart className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {rows.map((r) => {
              const meta = STATUS_META[r.status];
              const unit = r.unit_of_measure || "";
              const isOpen = expanded === r.inventory_item_id;
              const drill = drilldownById[r.inventory_item_id];
              // Headline reason line - the one-glance answer to
              // "why is this red?".
              let reason: string;
              if (r.status === "shortfall") {
                reason = `Need ${formatQty(r.demand_next_7_days, unit)} for ${r.upcoming_order_count} upcoming order${r.upcoming_order_count === 1 ? "" : "s"} - short ${formatQty(r.shortfall_next_7_days, unit)}.`;
              } else if (r.upcoming_order_count > 0) {
                reason = `${r.upcoming_order_count} upcoming order${r.upcoming_order_count === 1 ? "" : "s"} need${r.upcoming_order_count === 1 ? "s" : ""} ${formatQty(r.demand_next_14_days, unit)} over the next 14 days.`;
              } else {
                reason = "No confirmed orders need this in the next 14 days.";
              }
              return (
                <li key={r.inventory_item_id} className="py-2">
                  <button
                    type="button"
                    onClick={() => toggle(r.inventory_item_id)}
                    className="w-full text-left flex items-start gap-3 hover:bg-orange-50/60 rounded transition px-1"
                    aria-expanded={isOpen}
                  >
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${r.status === "shortfall" ? "bg-rose-100" : "bg-orange-100"}`}>
                      <Package className={`w-4 h-4 ${r.status === "shortfall" ? "text-rose-700" : "text-orange-700"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm truncate">{r.item_name}</span>
                        {r.category && (
                          <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                        )}
                        <Badge className={`${meta.tone} text-[10px]`}>{meta.label}</Badge>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        <span className="tabular-nums">
                          {formatQty(r.current_stock, unit)} on hand
                        </span>
                        <span className="text-slate-400"> · min {formatQty(r.minimum_stock, unit)}</span>
                        {r.upcoming_order_count > 0 && (
                          <>
                            <span className="text-slate-400"> · </span>
                            <span className={r.status === "shortfall" ? "text-rose-700 font-medium" : "text-slate-700"}>
                              {formatQty(r.demand_next_7_days, unit)} needed in 7d
                            </span>
                          </>
                        )}
                      </div>
                      <div className={`text-[11px] mt-1 ${r.status === "shortfall" ? "text-rose-700" : "text-slate-600"}`}>
                        {reason}
                      </div>
                    </div>
                    <div className="shrink-0 text-slate-400 mt-1">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="ml-11 mt-2 mb-1 rounded-md bg-white border border-slate-200 p-2.5">
                      {/* Why */}
                      <p className="text-[11px] text-slate-500 flex gap-1.5 items-start mb-2">
                        <Info className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{meta.reason}</span>
                      </p>

                      {/* Per-order breakdown */}
                      {drill === "loading" || drill === undefined ? (
                        <p className="text-[11px] text-slate-400 py-1">Loading orders...</p>
                      ) : drill.length === 0 ? (
                        <p className="text-[11px] text-slate-500 py-1">
                          No confirmed, preparing or ready orders in the pipeline use this item. Cancelled and draft orders are excluded.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
                            Orders that need this ({drill.length})
                          </p>
                          <ul className="space-y-1.5">
                            {drill.map((d) => (
                              // Canonical drill route is /admin/orders?orderId={id}
                              // which opens the orders list with the order's
                              // detail drawer auto-popped. The earlier
                              // /admin/orders/{id} path 404'd because there's
                              // no dedicated detail page at that route.
                              <li
                                key={d.order_id}
                                className="flex items-center gap-2 text-xs rounded-md border border-slate-200 bg-white px-2 py-1.5 hover:border-slate-300 hover:shadow-sm transition"
                              >
                                <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[10px] text-slate-500">{d.order_number}</span>
                                    <span className="truncate text-slate-900 font-medium">
                                      {d.event_name || "(no event name)"}
                                    </span>
                                    <Badge variant="outline" className="text-[9px] uppercase tracking-wide">
                                      {d.order_status}
                                    </Badge>
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {formatEventDate(d.event_date)}
                                    <span className="text-slate-400"> · needs </span>
                                    <span className="tabular-nums text-slate-700 font-medium">
                                      {formatQty(d.quantity_required, d.unit || unit)}
                                    </span>
                                  </div>
                                </div>
                                <Link href={withSlug(`/order/${d.order_id}?role=shopping_staff`)} className="shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px] gap-1 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5"
                                  >
                                    View order <ExternalLink className="w-3 h-3" />
                                  </Button>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={withSlug("/admin/shopping")}>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                            <ShoppingCart className="w-3 h-3" /> Add to shopping
                          </Button>
                        </Link>
                        <Link href={withSlug(`/admin/inventory?item=${r.inventory_item_id}`)}>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1">
                            Adjust stock <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
