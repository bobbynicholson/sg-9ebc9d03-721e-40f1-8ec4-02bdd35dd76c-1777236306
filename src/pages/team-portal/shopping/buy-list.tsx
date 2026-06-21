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
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";

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
  shortfall:     { label: "Shortfall",  tone: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",          icon: AlertTriangle, sort: 0 },
  below_minimum: { label: "Below par",  tone: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",     icon: AlertCircle,   sort: 1 },
  low:           { label: "Low",        tone: "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900", icon: AlertCircle,   sort: 2 },
  ok:            { label: "OK",         tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900", icon: Package,    sort: 3 },
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

  // Status counts across all non-OK rows, for the summary stat tiles.
  // Pure derivation from `rows`; conveys real urgency at a glance.
  const statusCounts = useMemo(() => {
    let shortfall = 0;
    let belowPar = 0;
    let low = 0;
    for (const r of rows) {
      if (r.status === "shortfall") shortfall += 1;
      else if (r.status === "below_minimum") belowPar += 1;
      else if (r.status === "low") low += 1;
    }
    return { shortfall, belowPar, low, toBuy: shortfall + belowPar + low };
  }, [rows]);

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
        toast({ title: "Added to list", description: `${r.item_name} (${qty} ${r.unit_of_measure || ""}) added. Open your list to tick it off as you buy.` });
        setSelected(prev => {
          const next = new Set(prev);
          next.delete(r.inventory_item_id);
          return next;
        });
      } else {
        // addItem returns null on failure (e.g. list create blocked).
        // Without an else the click looked dead - no toast at all.
        toast({
          title: "Could not add",
          description: activeList.error || "Something went wrong adding that item. Try again.",
          variant: "destructive",
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
      } else {
        toast({
          title: "Could not add",
          description: activeList.error || "Something went wrong adding those items. Try again.",
          variant: "destructive",
        });
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

      <main className="min-h-screen lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="pb-24">
          <PortalHeader
            icon={ListChecks}
            title={
              <span className="flex items-center gap-2">
                Buy list
                <InfoTooltip content="Everything that needs buying, pulled live from confirmed orders + par levels. Tick rows to bulk-add, or use the per-row 'Add' button. Items land on your active shopping list." />
              </span>
            }
            subtitle="What needs buying right now, ranked by urgency. Tick to add to your list."
          />

          {/* Status summary */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="To buy" value={statusCounts.toBuy} hint="not OK" icon={ListChecks} />
            <StatTile label="Shortfall" value={statusCounts.shortfall} hint="next 7 days" icon={AlertTriangle} />
            <StatTile label="Below par" value={statusCounts.belowPar} icon={AlertCircle} />
            <StatTile label="Low" value={statusCounts.low} icon={AlertCircle} />
          </div>

          {/* Active list status */}
          <PortalCard className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center" padded>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${activeList.list ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                <ShoppingCart className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{activeLabel}</p>
                {activeList.list && (
                  <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                    {activeList.items.length} item{activeList.items.length === 1 ? "" : "s"} on the list ·
                    {" "}{activeList.items.filter(i => i.purchased).length} bought
                  </p>
                )}
              </div>
            </div>
            {activeList.list && (
              <Link href={withSlug("/team-portal/shopping/dashboard")} className="shrink-0">
                <Button variant="outline" size="sm" className="gap-1">
                  Open list <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            )}
          </PortalCard>

          {/* Filter + search */}
          <PortalCard className="mb-5 flex flex-col gap-2 sm:flex-row" padded>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by item or category..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["all",        "All (not OK)"],
                ["shortfall",  "Shortfall"],
                ["below_par",  "Below par"],
                ["low",        "Low"],
              ] as Array<[FilterKey, string]>).map(([k, label]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={filter === k ? "default" : "outline"}
                  onClick={() => setFilter(k)}
                  className={filter === k ? "bg-amber-600 text-white hover:bg-amber-700" : ""}
                >
                  {label}
                </Button>
              ))}
            </div>
          </PortalCard>

          {/* Buy list rows */}
          <PortalCard padded={false}>
            <PortalCardHeader
              className="mb-0 p-5"
              title={
                <span className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                  {visible.length} item{visible.length === 1 ? "" : "s"} to consider
                </span>
              }
            />
            <div className="border-t border-slate-200 dark:border-slate-800">
              {loading ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 p-4 sm:p-5">
                      <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-40 max-w-[60%] animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-56 max-w-[80%] animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
                      </div>
                      <div className="h-8 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
                      <div className="h-8 w-16 shrink-0 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </li>
                  ))}
                </ul>
              ) : visible.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                    {rows.length === 0
                      ? <Package className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                      : <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {rows.length === 0
                      ? "No inventory configured yet."
                      : filter === "all"
                        ? "Stock looks good. Nothing pressing to buy."
                        : "Nothing in this category. Try a different filter."}
                  </p>
                  {rows.length === 0 && (
                    <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
                      Add items in <Link href={withSlug("/team-portal/shopping/inventory")} className="text-amber-700 underline underline-offset-2 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400">Inventory</Link> to get a buy list.
                    </p>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map(r => {
                    const meta = STATUS_META[r.status] || STATUS_META.ok;
                    const Icon = meta.icon;
                    const qty = buyQtyFor(r);
                    const cost = qty * Number(r.cost_per_unit || 0);
                    const isSelected = selected.has(r.inventory_item_id);
                    const alreadyOnList = activeList.items.some(i => i.item_id === r.inventory_item_id && !i.purchased);

                    return (
                      <li
                        key={r.inventory_item_id}
                        className={`flex items-center gap-3 p-4 transition-colors duration-150 sm:p-5 ${
                          isSelected
                            ? "bg-amber-50 dark:bg-amber-950/30"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(r.inventory_item_id)}
                          className="flex-shrink-0"
                          aria-label={`Select ${r.item_name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-semibold text-slate-900 dark:text-white">{r.item_name}</span>
                            <Badge variant="outline" className={`${meta.tone} gap-1 text-[10px]`}>
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                            {alreadyOnList && (
                              <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" />
                                Already on list
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-600 dark:text-slate-400">
                            <span>{r.category || "Uncategorised"}</span>
                            <span className="tabular-nums">have {Number(r.current_stock).toLocaleString()} {r.unit_of_measure}</span>
                            <span className="tabular-nums">par {Number(r.minimum_stock).toLocaleString()}</span>
                            {r.upcoming_order_count > 0 && (
                              <span>{r.upcoming_order_count} order{r.upcoming_order_count === 1 ? "" : "s"} pulling</span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Buy</div>
                          <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                            {qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{r.unit_of_measure}</div>
                          {cost > 0 && (
                            <div className="mt-0.5 text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                              ~{tenantCurrency.format(cost, 0)}
                            </div>
                          )}
                        </div>
                        {alreadyOnList ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            className="flex-shrink-0 gap-1 border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
                            title="Already on your active list"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            On list
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddOne(r)}
                            disabled={adding || qty <= 0}
                            className="flex-shrink-0 gap-1"
                            title={`Add ${qty} ${r.unit_of_measure || ""} to your list`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </PortalCard>

          {/* Helper line */}
          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            Buy quantity = shortfall over the next 7 days. For OK items, it's the reorder quantity or the gap to par.
          </p>
        </PortalShell>

        {/* Sticky bulk-add footer */}
        {selected.size > 0 && (
          <div
            className="fixed bottom-12 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 shadow-lg backdrop-blur lg:left-64 xl:left-72 dark:border-slate-800 dark:bg-slate-900/95"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {selectedTotals.count} selected
                </p>
                <p className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
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
                className="gap-1 bg-amber-600 text-white hover:bg-amber-700"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
