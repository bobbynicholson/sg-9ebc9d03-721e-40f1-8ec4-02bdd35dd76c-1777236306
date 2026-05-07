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
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { useToast } from "@/hooks/use-toast";
import {
  kitchenPrepService,
  type IngredientDemand,
} from "@/services/kitchenPrepService";

// ── Helpers ──────────────────────────────────────────────────────────────

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const HORIZONS = [
  { key: 7, label: "Next 7 days" },
  { key: 14, label: "Next 14 days" },
  { key: 30, label: "Next 30 days" },
];

export default function ShoppingKitchenDemandPage() {
  const { user, profile } = useAuth();
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const companyId = (profile as any)?.company_id || user?.company_id;

  const [horizon, setHorizon] = useState(14);
  const [demand, setDemand] = useState<IngredientDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [shortfallOnly, setShortfallOnly] = useState(true);
  const [creating, setCreating] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
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
      <Head><title>Kitchen Demand, Shopping</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                  Kitchen demand
                  <InfoTooltip content="What the kitchen needs to cook every confirmed order in your selected window, aggregated across all bookings.\n\nRecipes power the math, if a menu item has no recipe attached, its ingredients won't appear here. Owner adds recipes in /admin/menu." />
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Aggregated ingredient need from confirmed orders in the next {horizon} days.
                </p>
              </div>
            </div>
            <Button
              onClick={handleCreateList}
              disabled={creating || stats.shortfall === 0}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
            >
              {creating ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Creating</> : (
                <><ShoppingCart className="w-4 h-4 mr-2" />Create shopping list</>
              )}
            </Button>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Ingredients in play</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.ingredients}</p>
              </CardContent>
            </Card>
            <Card className={`border-0 shadow-sm ${stats.shortfall > 0 ? "bg-red-50" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                  Short
                  {stats.shortfall > 0 && <AlertTriangle className="w-3 h-3 text-red-600" />}
                </p>
                <p className={`text-2xl font-bold tabular-nums ${stats.shortfall > 0 ? "text-red-700" : "text-slate-900"}`}>
                  {stats.shortfall}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Need to buy</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Orders feeding this</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.orders}</p>
              </CardContent>
            </Card>
          </div>

          {/* Horizon picker + filter bar */}
          <Card className="border-0 shadow-sm mb-5">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {HORIZONS.map(h => (
                  <Button
                    key={h.key}
                    size="sm"
                    variant={horizon === h.key ? "default" : "outline"}
                    onClick={() => setHorizon(h.key)}
                    className={horizon === h.key ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                  >{h.label}</Button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                  className={shortfallOnly ? "bg-red-600 hover:bg-red-700" : ""}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />Shortfall only
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* List */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm flex items-center justify-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />Reading the kitchen's pull list...
            </div>
          ) : visible.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-10 text-center">
                <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-700 font-medium">
                  {demand.length === 0
                    ? "No kitchen demand in this window"
                    : shortfallOnly
                      ? "No shortfalls, the kitchen is covered for this window"
                      : "No matches"}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {demand.length === 0
                    ? "No confirmed orders yet, or none of the menu items have recipes attached."
                    : shortfallOnly
                      ? "Toggle 'Shortfall only' off to see everything in play."
                      : "Try a different search."}
                </p>
                {demand.length === 0 && (
                  <Link href="/admin/menu" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800 mt-4 font-medium">
                    Open menu builder <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100">
                  {visible.map((d, idx) => {
                    const isShort = d.shortfall > 0;
                    const orderCount = d.used_by?.length || 0;
                    return (
                      <li key={`${d.name}-${idx}`} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isShort ? "bg-red-100" : "bg-emerald-100"
                          }`}>
                            <Package className={`w-4 h-4 ${isShort ? "text-red-700" : "text-emerald-700"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900 truncate">{d.name}</span>
                              {isShort && (
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                                  Short {Number(d.shortfall).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit}
                                </Badge>
                              )}
                              {!isShort && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                  Covered
                                </Badge>
                              )}
                              {!d.inventory_item_id && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                  Free-text
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 inline-flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
                                {d.used_by.slice(0, 3).map((u, ui) => (
                                  <span key={`${u.order_id}-${ui}`} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 inline-flex items-center gap-1">
                                    <Calendar className="w-2.5 h-2.5" />
                                    {u.event_date}, {u.client_name || "client"} ({u.qty} {d.unit})
                                  </span>
                                ))}
                                {d.used_by.length > 3 && (
                                  <span className="text-[10px] text-slate-500">+{d.used_by.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">Buy</div>
                            <div className={`text-lg font-bold tabular-nums ${isShort ? "text-red-700" : "text-slate-400"}`}>
                              {isShort ? Number(d.shortfall).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
                            </div>
                            <div className="text-[10px] text-slate-500">{d.unit}</div>
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
          <p className="text-xs text-slate-500 mt-4 text-center">
            Demand math comes from menu item recipes, if something's missing, ask the owner to attach a recipe in
            <Link href="/admin/menu" className="text-emerald-700 hover:text-emerald-800 ml-1 underline">/admin/menu</Link>.
          </p>
        </div>
        <Footer />
      </main>
    </>
  );
}
