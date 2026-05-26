/**
 * /team-portal/shopping/buy-list - Wave 70.30
 *
 * Canonical "what needs buying" surface. Reframes the alerts page
 * (which presented inventory_demand_outlook as a passive status
 * table) as an action page: each row has a checkbox + a single
 * "Add to list" button, with a sticky footer action bar for
 * bulk-add when items are selected.
 *
 * The /alerts route stays in place for backwards compatibility --
 * this page is the new canonical surface that the nav points at.
 *
 * Source: inventory_demand_outlook view, which already folds in
 * recipe pull (demand_next_7/14/30) + par-driven shortfall into
 * one status column (shortfall / below_minimum / low / ok).
 *
 * Action flow:
 *   1. User ticks rows OR taps "Add to list" per row
 *   2. Items append to current user's active shopping_list
 *      (auto-creates one if none, auto-assigns shopper_id)
 *   3. Sticky footer shows running selection count + estimated cost
 *   4. After add, user navigates to dashboard to tick items off
 *      as they buy.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ListChecks,
  Search,
  AlertTriangle,
  AlertCircle,
  Package,
  Loader2,
  ShoppingCart,
  Plus,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import { useActiveShoppingList } from "@/hooks/useActiveShoppingList";

interface OutlookRow {
  inventory_item_id: string;
  item_name: string;
  category: string | null;
  unit_of_measure: string | null;
  current_stock: number;
  minimum_stock: number;
  reorder_quantity: number | null;
  demand_next_7_days: number;
  shortfall_next_7_days: number;
  upcoming_order_count: number;
  status: "shortfall" | "below_minimum" | "low" | "ok";
  cost_per_unit?: number | null;
}

const STATUS_META: Record<string, { label: string; tone: string; icon: typeof AlertTriangle; sort: number }> = {
  shortfall:     { label: "Shortfall",  tone: "bg-rose-100 text-rose-800 border-rose-200",       icon: AlertTriangle, sort: 0 },
  below_minimum: { label: "Below par",  tone: "bg-amber-100 text-amber-800 border-amber-200",    icon: AlertCircle,   sort: 1 },
  low:           { label: "Low",        tone: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: AlertCircle,   sort: 2 },
  ok:            { label: "OK",         tone: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Package,    sort: 3 },
};

type FilterKey = "all" | "shortfall" | "below_par" | "low";

export default function ShoppingBuyListPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const companyId = (profile as any)?.company_id || (user as any)?.company_id;
  const tenantCurrency = useTenantCurrency(companyId ?? null);

  const [rows, setRows] = useState<OutlookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const activeList = useActiveShoppingList();

  // Load outlook rows. inventory_demand_outlook view already does
  // the heavy lifting: status, shortfall calc, projected stock.
  // We join cost_per_unit from inventory_items so we can show the
  // running estimate in the sticky footer.
  //
  // Shopping persona follow-up (shopping.md 5.1): the demand outlook
  // is now refreshed when:
  //   - The page first mounts (always)
  //   - Realtime: any order_items insert / update / delete for this
  //     company (the kitchen / admin adding items to an order
  //     re-computes the demand)
  //   - Polled fallback: every 60 seconds
  // Together these mean a shopper mid-trip sees new demand land
  // without a hard refresh.
  const loadRows = async () => {
    if (!companyId) return;
    const sb = supabase as any;
    const [outlookRes, inventoryRes] = await Promise.all([
      sb.from("inventory_demand_outlook").select("*").eq("company_id", companyId),
      sb.from("inventory_items").select("id, cost_per_unit").eq("company_id", companyId).is("deleted_at", null),
    ]);
    const costMap = new Map<string, number>();
    for (const r of (inventoryRes.data || []) as Array<{ id: string; cost_per_unit: number | null }>) {
      costMap.set(r.id, Number(r.cost_per_unit || 0));
    }
    const enriched = ((outlookRes.data || []) as OutlookRow[]).map(r => ({
      ...r,
      cost_per_unit: costMap.get(r.inventory_item_id) ?? 0,
    }));
    setRows(enriched);
  };

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadRows();
      if (!cancelled) setLoading(false);
    })();

    // Realtime: order_items changes trigger a re-fetch of the demand
    // outlook view. We don't try to mutate rows in-place - the view
    // has too many derived columns (shortfall_next_7_days et al.) -
    // so we just re-poll the view on any signal.
    const sb = supabase as any;
    const channel = sb
      .channel(`buy-list:${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => { void loadRows(); },
      )
      .subscribe();

    // Polled fallback every 60s for cases where realtime is mid-
    // reconnect or the row mutated server-side without a channel
    // emit (cron jobs, bulk imports).
    const t = setInterval(() => { void loadRows(); }, 60_000);

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
      clearInterval(t);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Filtering + sorting.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter(r => {
        if (filter === "shortfall" && r.status !== "shortfall") return false;
        if (filter === "below_par" && r.status !== "below_minimum") return false;
        if (filter === "low" && r.status !== "low") return false;
        if (filter === "all" && r.status === "ok") return false;
        return true;
      })
      .filter(r => !term || r.item_name.toLowerCase().includes(term) || (r.category || "").toLowerCase().includes(term))
      .sort((a, b) => {
        const sa = STATUS_META[a.status]?.sort ?? 9;
        const sb = STATUS_META[b.status]?.sort ?? 9;
        if (sa !== sb) return sa - sb;
        return Number(b.shortfall_next_7_days || 0) - Number(a.shortfall_next_7_days || 0);
      });
  }, [rows, search, filter]);

  // Compute the qty to buy for a single row - prefer shortfall if
  // positive, otherwise reorder_quantity, otherwise min - on_hand.
  const buyQtyFor = (r: OutlookRow): number => {
    const short = Number(r.shortfall_next_7_days || 0);
    if (short > 0) return Math.ceil(short * 100) / 100;
    const reorder = Number(r.reorder_quantity || 0);
    if (reorder > 0) return reorder;
    const gap = Math.max(0, Number(r.minimum_stock || 0) - Number(r.current_stock || 0));
    return gap;
  };

  // Selection totals for the sticky footer.
  const selectedTotals = useMemo(() => {
    let cost = 0;
    let count = 0;
    for (const r of rows) {
      if (!selected.has(r.inventory_item_id)) continue;
      const qty = buyQtyFor(r);
      cost += qty * Number(r.cost_per_unit || 0);
      count += 1;
    }
    return { count, cost };
  }, [rows, selected]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddOne = async (r: OutlookRow) => {
    const qty = buyQtyFor(r);
    if (qty <= 0) {
      toast({ title: "Nothing to buy", description: "This item already covers the next 7 days." });
      return;
    }
    setAdding(true);
    try {
      const result = await activeList.addItem({
        name: r.item_name,
        quantity: qty,
        unit: r.unit_of_measure,
        item_id: r.inventory_item_id,
        notes: `Need ${qty} ${r.unit_of_measure || "unit"}, have ${r.current_stock}`,
      });
      if (result) {
        toast({ title: "Added to list", description: `${r.item_name} (${qty} ${r.unit_of_measure || ""})` });
        setSelected(prev => {
          const next = new Set(prev);
          next.delete(r.inventory_item_id);
          return next;
        });
      }
    } finally {
      setAdding(false);
    }
  };

  const handleAddSelected = async () => {
    if (selected.size === 0) return;
    const inputs = rows
      .filter(r => selected.has(r.inventory_item_id))
      .map(r => ({
        name: r.item_name,
        quantity: buyQtyFor(r),
        unit: r.unit_of_measure,
        item_id: r.inventory_item_id,
        notes: `Need ${buyQtyFor(r)} ${r.unit_of_measure || "unit"}, have ${r.current_stock}`,
      }))
      .filter(i => i.quantity > 0);

    if (inputs.length === 0) {
      toast({ title: "Nothing to add", description: "Selected items already cover next 7 days." });
      return;
    }

    setAdding(true);
    try {
      const result = await activeList.addItems(inputs);
      if (result) {
        toast({
          title: `Added ${result.itemCount} item${result.itemCount === 1 ? "" : "s"} to your list`,
          description: "Open the dashboard to start ticking them off as you buy.",
        });
        setSelected(new Set());
      }
    } finally {
      setAdding(false);
    }
  };

  const activeLabel = activeList.list
    ? activeList.list.isYours
      ? "Your active list"
      : "Team active list"
    : "No active list - a new one will start when you add an item";

  return (
    <>
      <NoIndexMeta />
      <Head><title>Buy list - CateringMS</title></Head>
      <ShoppingNav />

      <main className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full pb-24">
          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <ListChecks className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-slate-900 flex items-center gap-2">
                  Buy list
                  <InfoTooltip content="Everything that needs buying, pulled live from confirmed orders + par levels. Tick rows to bulk-add, or use the per-row 'Add' button. Items land on your active shopping list." />
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  What needs buying right now, ranked by urgency. Tick to add to your list.
                </p>
              </div>
            </div>
          </div>

          {/* Active list status banner */}
          <Card className={`border-0 shadow-sm mb-5 ${activeList.list ? "bg-gradient-to-r from-emerald-50 to-green-50" : "bg-slate-50"}`}>
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${activeList.list ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{activeLabel}</p>
                  {activeList.list && (
                    <p className="text-xs text-slate-600 truncate">
                      {activeList.items.length} item{activeList.items.length === 1 ? "" : "s"} on the list ·
                      {" "}{activeList.items.filter(i => i.purchased).length} bought
                    </p>
                  )}
                </div>
              </div>
              {activeList.list && (
                <Link href={withSlug("/team-portal/shopping/dashboard")}>
                  <Button variant="outline" size="sm" className="gap-1">
                    Open list <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Filter + search */}
          <Card className="border-0 shadow-sm mb-4">
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by item or category..."
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ["all",        "All (not OK)", "bg-slate-700 hover:bg-slate-800"],
                  ["shortfall",  "Shortfall",    "bg-rose-600 hover:bg-rose-700"],
                  ["below_par",  "Below par",    "bg-amber-600 hover:bg-amber-700"],
                  ["low",        "Low",          "bg-yellow-600 hover:bg-yellow-700"],
                ] as Array<[FilterKey, string, string]>).map(([k, label, activeClass]) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={filter === k ? "default" : "outline"}
                    onClick={() => setFilter(k)}
                    className={filter === k ? activeClass : ""}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Buy list rows */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="w-4 h-4 text-emerald-600" />
                {visible.length} item{visible.length === 1 ? "" : "s"} to consider
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 flex items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading buy list...
                </div>
              ) : visible.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Sparkles className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="font-medium text-slate-700">
                    {rows.length === 0
                      ? "No inventory configured yet."
                      : filter === "all"
                        ? "Stock looks good. Nothing pressing to buy."
                        : "Nothing in this category. Try a different filter."}
                  </p>
                  {rows.length === 0 && (
                    <p className="text-xs mt-2 max-w-md mx-auto">
                      Add items in <Link href={withSlug("/team-portal/shopping/inventory")} className="text-emerald-700 hover:text-emerald-800 underline">Inventory</Link> to get a buy list.
                    </p>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visible.map(r => {
                    const meta = STATUS_META[r.status] || STATUS_META.ok;
                    const Icon = meta.icon;
                    const qty = buyQtyFor(r);
                    const cost = qty * Number(r.cost_per_unit || 0);
                    const isSelected = selected.has(r.inventory_item_id);
                    const alreadyOnList = activeList.items.some(i => i.item_id === r.inventory_item_id && !i.purchased);

                    return (
                      <li key={r.inventory_item_id} className={`p-3 sm:p-4 flex items-center gap-3 ${isSelected ? "bg-emerald-50/60" : ""}`}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(r.inventory_item_id)}
                          className="flex-shrink-0"
                          aria-label={`Select ${r.item_name}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 truncate">{r.item_name}</span>
                            <Badge variant="outline" className={`${meta.tone} text-[10px] gap-1`}>
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </Badge>
                            {alreadyOnList && (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Already on list
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                            <span>{r.category || "Uncategorised"}</span>
                            <span>have {Number(r.current_stock).toLocaleString()} {r.unit_of_measure}</span>
                            <span>par {Number(r.minimum_stock).toLocaleString()}</span>
                            {r.upcoming_order_count > 0 && (
                              <span>{r.upcoming_order_count} order{r.upcoming_order_count === 1 ? "" : "s"} pulling</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">Buy</div>
                          <div className="text-lg font-bold tabular-nums text-slate-900">
                            {qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500">{r.unit_of_measure}</div>
                          {cost > 0 && (
                            <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                              ~{tenantCurrency.format(cost, 0)}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddOne(r)}
                          disabled={adding || qty <= 0}
                          className="flex-shrink-0 gap-1"
                          title={`Add ${qty} ${r.unit_of_measure || ""} to your list`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Helper line */}
          <p className="text-xs text-slate-500 mt-4 text-center">
            Buy quantity = shortfall over the next 7 days. For OK items, it's the reorder quantity or the gap to par.
          </p>
        </div>

        {/* Sticky bulk-add footer */}
        {selected.size > 0 && (
          <div
            className="fixed bottom-12 left-0 right-0 lg:left-64 xl:left-72 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 shadow-lg"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="max-w-full mx-auto px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedTotals.count} selected
                </p>
                <p className="text-xs text-slate-600 tabular-nums">
                  ~{tenantCurrency.format(selectedTotals.cost, 0)} estimated
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set())}
                disabled={adding}
              >
                Clear
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={adding}
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 gap-1"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {activeList.list ? "Add to your list" : "Start list with selected"}
              </Button>
            </div>
          </div>
        )}

        <Footer />
      </main>
    </>
  );
}
