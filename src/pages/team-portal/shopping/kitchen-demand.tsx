/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChefHat, ShoppingCart, Search, AlertTriangle, Calendar, Loader2, Package, ExternalLink } from "lucide-react";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { useToast } from "@/hooks/use-toast";
import { toLocalISO } from "@/lib/localDate";
import {
  kitchenPrepService,
  type IngredientDemand,
} from "@/services/kitchenPrepService";

// ── Helpers ──────────────────────────────────────────────────────────────

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}

const HORIZONS = [
  { key: 7, label: "Next 7 days" },
  { key: 14, label: "Next 14 days" },
  { key: 30, label: "Next 30 days" },
];

export default function ShoppingKitchenDemandPage() {
  const { user, profile } = useAuth();
  const { withSlug } = useTenantHref();
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const companyId = (profile as any)?.company_id || user?.company_id;

  const [horizon, setHorizon] = useState(14);
  const [demand, setDemand] = useState<IngredientDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [shortfallOnly, setShortfallOnly] = useState(true);
  const [creating, setCreating] = useState(false);

  const todayStr = useMemo(() => toLocalISO(new Date()), []);
  const horizonStr = useMemo(() => isoOffset(horizon), [horizon]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await kitchenPrepService.getAggregatedDemand(companyId, todayStr, horizonStr, regionFilterId);
      setDemand(data);
    } catch (e: any) {
      toast({ title: "Could not load kitchen demand", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId, todayStr, horizonStr, regionFilterId]);

  // ── Filtering ─────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return demand
      .filter(d => !shortfallOnly || d.shortfall > 0)
      .filter(d => !term
        || d.name.toLowerCase().includes(term)
        || (d.unit || "").toLowerCase().includes(term)
      )
      .sort((a, b) => b.shortfall - a.shortfall || a.name.localeCompare(b.name));
  }, [demand, shortfallOnly, search]);

  // Stat strip
  const stats = useMemo(() => {
    const shortfall = demand.filter(d => d.shortfall > 0);
    const ordersCovered = new Set<string>();
    for (const d of demand) for (const u of d.used_by || []) ordersCovered.add(u.order_id);
    return {
      ingredients: demand.length,
      shortfall: shortfall.length,
      orders: ordersCovered.size,
    };
  }, [demand]);

  const handleCreateList = async () => {
    if (!companyId || !user?.id) return;
    setCreating(true);
    try {
      const result = await kitchenPrepService.createShoppingListFromShortfall(
        companyId,
        user.id,
        demand,
        { from: todayStr, to: horizonStr },
        `Kitchen demand ${todayStr} -> ${horizonStr}`,
      );
      if (result) {
        toast({
          title: "Shopping list created",
          description: `${result.itemCount} item${result.itemCount === 1 ? "" : "s"} ready to buy.`,
        });
      } else {
        toast({ title: "Nothing to buy", description: "No shortfalls in this window." });
      }
    } catch (e: any) {
      toast({ title: "Could not create list", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Head><title>Kitchen demand - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">

          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center flex-shrink-0">
                <ChefHat className="w-5 h-5 text-amber-600 dark:text-amber-500" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  Kitchen demand
                  <InfoTooltip content="What the kitchen needs to cook every confirmed order in your selected window, aggregated across all bookings.\n\nRecipes power the math, if a menu item has no recipe attached, its ingredients won't appear here. Owner adds recipes in /admin/menu." />
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Aggregated ingredient need from confirmed orders in the next {horizon} days.
                </p>
              </div>
            </div>
            <Button
              onClick={handleCreateList}
              disabled={creating || stats.shortfall === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
            >
              {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating</> : (
                <><ShoppingCart className="w-4 h-4 mr-2" />Create shopping list</>
              )}
            </Button>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Ingredients in play</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">{stats.ingredients}</p>
              </CardContent>
            </Card>
            <Card className={`rounded-xl border shadow-sm ${
              stats.shortfall > 0
                ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            }`}>
              <CardContent className="p-4">
                <p className={`text-xs uppercase tracking-wider mb-1 inline-flex items-center gap-1 ${
                  stats.shortfall > 0 ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-400"
                }`}>
                  Short
                  {stats.shortfall > 0 && <AlertTriangle className="w-3 h-3" />}
                </p>
                <p className={`text-2xl font-semibold tabular-nums ${stats.shortfall > 0 ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-white"}`}>
                  {stats.shortfall}
                </p>
                <p className={`text-[11px] mt-1 ${stats.shortfall > 0 ? "text-rose-600/80 dark:text-rose-400/80" : "text-slate-500 dark:text-slate-400"}`}>Need to buy</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Orders feeding this</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">{stats.orders}</p>
              </CardContent>
            </Card>
          </div>

          {/* Horizon picker + filter bar */}
          <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm mb-5">
            <CardContent className="p-4 flex flex-col gap-3">
              {/* Segmented horizon picker: amber marks the active window only */}
              <div
                role="group"
                aria-label="Demand window"
                className="inline-flex w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/60 p-1"
              >
                {HORIZONS.map(h => {
                  const active = horizon === h.key;
                  return (
                    <button
                      key={h.key}
                      type="button"
                      onClick={() => setHorizon(h.key)}
                      aria-pressed={active}
                      className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 ${
                        active
                          ? "bg-amber-600 text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >{h.label}</button>
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search ingredient or unit..."
                    className="pl-9"
                  />
                </div>
                <Button
                  size="sm"
                  variant={shortfallOnly ? "default" : "outline"}
                  onClick={() => setShortfallOnly(v => !v)}
                  aria-pressed={shortfallOnly}
                  className={shortfallOnly ? "bg-rose-600 hover:bg-rose-700 text-white rounded-lg" : "rounded-lg"}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />Shortfall only
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* List */}
          {loading ? (
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-200/70 dark:bg-slate-800 animate-pulse shrink-0" />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="h-4 w-40 max-w-[60%] rounded bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
                          <div className="h-3 w-56 max-w-[80%] rounded bg-slate-200/60 dark:bg-slate-800/70 animate-pulse" />
                        </div>
                        <div className="w-12 h-9 rounded bg-slate-200/70 dark:bg-slate-800 animate-pulse shrink-0" />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : visible.length === 0 ? (
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <CardContent className="p-10 text-center">
                <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <ChefHat className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-slate-900 dark:text-white font-medium">
                  {demand.length === 0
                    ? "No kitchen demand in this window"
                    : shortfallOnly
                      ? "No shortfalls, the kitchen is covered for this window"
                      : "No matches"}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
                  {demand.length === 0
                    ? "This page pulls recipe ingredients from confirmed orders, then subtracts what's on hand. Once a confirmed order's menu items have recipes attached, their ingredients show up here, ready to buy."
                    : shortfallOnly
                      ? "Everything in this window is covered by stock. Toggle 'Shortfall only' off to see the full pull list."
                      : "Nothing matches that search. Try a different ingredient or unit."}
                </p>
                {demand.length === 0 && (
                  <Link
                    href="/admin/menu"
                    className="inline-flex items-center gap-1.5 mt-4 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
                  >
                    Open menu builder <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map((d, idx) => {
                    const isShort = d.shortfall > 0;
                    const orderCount = d.used_by?.length || 0;
                    return (
                      <li
                        key={`${d.name}-${idx}`}
                        className="p-4 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isShort
                              ? "bg-rose-100 dark:bg-rose-950/50"
                              : "bg-emerald-100 dark:bg-emerald-950/50"
                          }`}>
                            <Package className={`w-4 h-4 ${isShort ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900 dark:text-white truncate">{d.name}</span>
                              {isShort && (
                                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 text-[10px]">
                                  Short {Number(d.shortfall).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit}
                                </Badge>
                              )}
                              {!isShort && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 text-[10px]">
                                  Covered
                                </Badge>
                              )}
                              {!d.inventory_item_id && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 text-[10px]">
                                  Free-text
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 inline-flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span>Need {Number(d.total_quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit}</span>
                              <span>have {Number(d.on_hand).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit}</span>
                              {orderCount > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {orderCount} order{orderCount === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                            {/* Top 3 events feeding this ingredient, helps shopping understand
                                why we need it. */}
                            {d.used_by && d.used_by.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {/* ODOC G.5: each source-order chip
                                    deep-links into the doc with the
                                    shopping section auto-expanded. */}
                                {d.used_by.slice(0, 3).map((u, ui) => (
                                  <Link
                                    key={`${u.order_id}-${ui}`}
                                    href={withSlug(staffOrderHref(u.order_id, "shopping_staff"))}
                                    className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 dark:hover:border-amber-800 dark:hover:bg-amber-950/40 dark:hover:text-amber-300 inline-flex items-center gap-1 transition-colors duration-150"
                                    title="Open this order's shopping shortfalls"
                                  >
                                    <Calendar className="w-2.5 h-2.5" />
                                    {u.event_date}, {u.client_name || "client"} ({u.qty} {d.unit})
                                  </Link>
                                ))}
                                {d.used_by.length > 3 && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400">+{d.used_by.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Buy</div>
                            <div className={`text-lg font-semibold tabular-nums ${isShort ? "text-rose-700 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                              {isShort ? Number(d.shortfall).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{d.unit}</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Helper line */}
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-4 text-center">
            Demand math comes from menu item recipes, if something's missing, ask the owner to attach a recipe in
            <Link href="/admin/menu" className="text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400 ml-1 underline">/admin/menu</Link>.
          </p>
        </div>
        <Footer />
      </main>
    </>
  );
}
