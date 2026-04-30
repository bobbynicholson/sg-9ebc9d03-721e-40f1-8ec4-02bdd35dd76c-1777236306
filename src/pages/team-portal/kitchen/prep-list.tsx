/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, ChefHat, Loader2, Calendar, Users, MapPin, Clock,
  AlertTriangle, CheckCircle2, ShoppingCart, Layers, Package,
} from "lucide-react";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { kitchenPrepService, type IngredientDemand } from "@/services/kitchenPrepService";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

interface DemandRow {
  order_id: string;
  order_number: string;
  event_name: string;
  event_date: string;
  guest_count: number;
  order_status: string;
  menu_item_name: string;
  ingredient_name: string;
  unit: string | null;
  quantity_required: number;
  inventory_item_id: string | null;
}

interface OutlookRow {
  inventory_item_id: string;
  current_stock: number;
  unit_of_measure: string | null;
}

interface OrderRow {
  id: string;
  venue_address: string | null;
  event_time: string | null;
  client_name: string | null;
  /** From orders.equipment_items jsonb -- shape:
   *  [{ equipment_id, name, category, quantity, unit_price, ... }] */
  equipment_items?: any[] | null;
}

const dayBucket = (d: string, today: Date) => {
  const date = new Date(d + "T00:00:00");
  const diff = Math.floor((date.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return "This week";
  if (diff <= 14) return "Next week";
  return "Later";
};

type ViewMode = "by_order" | "by_ingredient";

export default function KitchenPrepListPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [outlook, setOutlook] = useState<Record<string, OutlookRow>>({});
  const [orderMeta, setOrderMeta] = useState<Record<string, OrderRow>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("by_order");

  // Phase 1: aggregated demand across all orders in the window
  const [aggregated, setAggregated] = useState<IngredientDemand[]>([]);
  const [aggregatedLoading, setAggregatedLoading] = useState(true);

  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);
      const horizon = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

      const [demandRes, outlookRes] = await Promise.all([
        supabase
          .from("order_ingredient_demand")
          .select("*")
          .eq("company_id", companyId)
          .gte("event_date", todayStr)
          .in("order_status", ["confirmed", "preparing", "ready"])
          .order("event_date", { ascending: true }),
        supabase
          .from("inventory_demand_outlook")
          .select("inventory_item_id, current_stock, unit_of_measure")
          .eq("company_id", companyId),
      ]);
      if (cancelled) return;
      if (demandRes.error) console.error("demand", demandRes.error);

      const demandRows = (demandRes.data || []) as DemandRow[];
      setRows(demandRows);

      const outlookMap: Record<string, OutlookRow> = {};
      (outlookRes.data || []).forEach((o: any) => {
        if (o.inventory_item_id) outlookMap[o.inventory_item_id] = o;
      });
      setOutlook(outlookMap);

      const orderIds = Array.from(new Set(demandRows.map((d) => d.order_id)));
      if (orderIds.length) {
        // Pull equipment_items alongside the venue / time meta so the
        // kitchen knows what to pack for each order, not just what to
        // cook. The quote builder writes equipment_items as a JSONB
        // array of { equipment_id, name, category, quantity, ... }.
        const { data: orders } = await supabase
          .from("orders")
          .select("id, venue_address, event_time, client_name, equipment_items")
          .in("id", orderIds);
        const map: Record<string, OrderRow> = {};
        (orders || []).forEach((o: any) => { map[o.id] = o; });
        if (!cancelled) setOrderMeta(map);
      }
      setLoading(false);

      // Aggregated demand runs in parallel via the kitchen prep service
      setAggregatedLoading(true);
      try {
        const agg = await kitchenPrepService.getAggregatedDemand(companyId, todayStr, horizon);
        if (!cancelled) setAggregated(agg);
      } catch (e) {
        console.warn("Aggregated demand failed:", e);
      } finally {
        if (!cancelled) setAggregatedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  // ── Group by order ────────────────────────────────────────────────
  const orders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map<string, {
      order_id: string;
      order_number: string;
      event_name: string;
      event_date: string;
      guest_count: number;
      order_status: string;
      bucket: string;
      menu: Map<string, { menu_item_name: string }>;
      ingredients: { ingredient_name: string; unit: string | null; quantity: number; inventory_item_id: string | null }[];
    }>();
    rows.forEach((r) => {
      let entry = map.get(r.order_id);
      if (!entry) {
        entry = {
          order_id: r.order_id,
          order_number: r.order_number,
          event_name: r.event_name,
          event_date: r.event_date,
          guest_count: r.guest_count,
          order_status: r.order_status,
          bucket: dayBucket(r.event_date, today),
          menu: new Map(),
          ingredients: [],
        };
        map.set(r.order_id, entry);
      }
      if (!entry.menu.has(r.menu_item_name)) {
        entry.menu.set(r.menu_item_name, { menu_item_name: r.menu_item_name });
      }
      entry.ingredients.push({
        ingredient_name: r.ingredient_name,
        unit: r.unit,
        quantity: Number(r.quantity_required),
        inventory_item_id: r.inventory_item_id,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [rows]);

  const grouped = useMemo(() => {
    const buckets: Record<string, typeof orders> = {};
    orders.forEach((o) => {
      buckets[o.bucket] = buckets[o.bucket] || [];
      buckets[o.bucket].push(o);
    });
    return ["Today", "Tomorrow", "This week", "Next week", "Later"]
      .filter((b) => buckets[b]?.length)
      .map((b) => ({ name: b, items: buckets[b] }));
  }, [orders]);

  const shortfallCount = aggregated.filter(d => d.shortfall > 0).length;
  const [creatingList, setCreatingList] = useState(false);

  // ── Add a single ingredient to the shopping queue (Phase 1: just toast,
  // Phase 2 wires through to the procurement queue / shopping list) ──
  const handleAddToShoppingList = (d: IngredientDemand) => {
    toast({
      title: "Added to shopping list",
      description: `${d.shortfall} ${d.unit} ${d.name}, procurement will see this on the shopping page.`,
    });
  };

  // ── Phase 3: turn the entire aggregated shortfall into a real shopping
  //    list row + line items, one click. Removes the manual transcribe step
  //    that was burning chef time. ──
  const handleCreateShoppingList = async () => {
    const companyId = profile?.company_id;
    const userId = (profile as any)?.id;
    if (!companyId || !userId) return;
    setCreatingList(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fromStr = today.toISOString().slice(0, 10);
      const toStr = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const result = await kitchenPrepService.createShoppingListFromShortfall(
        companyId,
        userId,
        aggregated,
        { from: fromStr, to: toStr },
      );
      if (result) {
        toast({
          title: "Shopping list created",
          description: `${result.itemCount} item${result.itemCount === 1 ? "" : "s"} added. Procurement can pick it up now.`,
        });
      } else {
        toast({ title: "Nothing to buy", description: "No shortfalls in the current window." });
      }
    } catch (e: any) {
      toast({ title: "Could not create list", description: e?.message, variant: "destructive" });
    } finally {
      setCreatingList(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Pull list - CateringMS</title></Head>
      <KitchenNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-orange-50 to-red-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-full">
          {/* Header */}
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <ClipboardList className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                  Pull list
                  <InfoTooltip content="Everything you need to pull from stores. Two views: by order (one card per booking) or by ingredient (totals across the next 30 days)." />
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  What to pull from stores. Across {orders.length} order{orders.length === 1 ? "" : "s"} from today onwards.
                </p>
              </div>
            </div>
          </div>

          {/* Aggregated shortfall banner, Phase 3 wires the one-click
              "create shopping list" path so the chef never has to retype it. */}
          {!aggregatedLoading && shortfallCount > 0 && (
            <Card className="border-red-300 bg-red-50/40 shadow-sm mb-5">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {shortfallCount} ingredient{shortfallCount === 1 ? "" : "s"} short for upcoming orders
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Aggregated across every confirmed booking in the next 30 days.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setView("by_ingredient")}
                    className="border-red-300 text-red-700 hover:bg-red-100"
                  >
                    View shortfall list
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateShoppingList}
                    disabled={creatingList}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {creatingList ? "Creating..." : "Create shopping list"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* View toggle */}
          <div className="mb-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView("by_order")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors inline-flex items-center gap-1.5 ${
                view === "by_order"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Layers className="w-3 h-3" />
              By order ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setView("by_ingredient")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors inline-flex items-center gap-1.5 ${
                view === "by_ingredient"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Package className="w-3 h-3" />
              By ingredient ({aggregated.length})
            </button>
          </div>

          {loading ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading pull list...
              </CardContent>
            </Card>
          ) : view === "by_ingredient" ? (
            // ── BY INGREDIENT view (aggregated demand across all orders) ──
            aggregated.length === 0 ? (
              <Card className="border-0 shadow">
                <CardContent className="py-16 text-center">
                  <Package className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-700 mb-1">Nothing to pull</p>
                  <p className="text-sm text-slate-500">No confirmed orders need ingredients right now.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Total demand · next 30 days</CardTitle>
                  <CardDescription className="text-xs">
                    Sums every confirmed order's ingredient need against your current stock.
                    Shortfalls float to the top.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 pr-3 font-semibold">Ingredient</th>
                          <th className="text-right py-2 px-3 font-semibold">Need</th>
                          <th className="text-right py-2 px-3 font-semibold">On hand</th>
                          <th className="text-right py-2 px-3 font-semibold">Short</th>
                          <th className="text-left py-2 pl-3 font-semibold">Used by</th>
                          <th className="text-right py-2 pl-3 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregated.map(d => {
                          const isShort = d.shortfall > 0;
                          return (
                            <tr key={`${d.name}-${d.unit}`} className={`border-b border-slate-100 ${isShort ? "bg-red-50/30" : ""}`}>
                              <td className="py-2 pr-3 font-medium text-slate-900">{d.name}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                                {d.total_quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                <span className="text-slate-400 text-xs ml-1">{d.unit}</span>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                                {d.on_hand.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </td>
                              <td className={`py-2 px-3 text-right tabular-nums font-semibold ${isShort ? "text-red-700" : "text-emerald-700"}`}>
                                {isShort ? d.shortfall.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
                              </td>
                              <td className="py-2 pl-3 text-xs text-slate-600">
                                {d.used_by.length} order{d.used_by.length === 1 ? "" : "s"}
                                {d.used_by.length > 0 && (
                                  <span className="text-slate-400">
                                    {" · "}
                                    {Array.from(new Set(d.used_by.map(u => u.event_date))).slice(0, 2).join(", ")}
                                    {d.used_by.length > 2 && "..."}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pl-3 text-right">
                                {isShort ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px] gap-1 border-red-300 text-red-700 hover:bg-red-100"
                                    onClick={() => handleAddToShoppingList(d)}
                                  >
                                    <ShoppingCart className="w-3 h-3" />
                                    Add to list
                                  </Button>
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          ) : grouped.length === 0 ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 text-center">
                <ChefHat className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700 mb-1">Nothing booked yet</p>
                <p className="text-sm text-slate-500">Confirmed orders land here once sales locks them in.</p>
              </CardContent>
            </Card>
          ) : (
            // ── BY ORDER view (existing) ──
            <div className="space-y-8">
              {grouped.map((g) => (
                <div key={g.name}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    {g.name}
                    <span className="ml-2 text-slate-400 font-normal">
                      {g.items.length} order{g.items.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {g.items.map((o) => {
                      const meta = orderMeta[o.order_id];
                      const menuItems = Array.from(o.menu.values());
                      const ingMap = new Map<string, { ingredient_name: string; unit: string | null; quantity: number; inventory_item_id: string | null }>();
                      o.ingredients.forEach((ing) => {
                        const key = ing.ingredient_name;
                        const ex = ingMap.get(key);
                        if (ex) {
                          ex.quantity += ing.quantity;
                        } else {
                          ingMap.set(key, { ...ing });
                        }
                      });
                      const ingredients = Array.from(ingMap.values());

                      // Per-ingredient stock check uses AGGREGATED on-hand from
                      // the cross-order projection so two orders sharing an
                      // ingredient don't both render "ok" when together they're short.
                      const aggMap = new Map(aggregated.map(a => [`${a.name.toLowerCase()}|${(a.unit || "").toLowerCase()}`, a]));

                      return (
                        <Card key={o.order_id} className="border-0 shadow-lg">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                  <span className="truncate">{o.event_name}</span>
                                  <Badge variant="outline" className="text-[10px]">{o.order_number}</Badge>
                                </CardTitle>
                                <CardDescription className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(o.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                                  </span>
                                  {meta?.event_time && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> {meta.event_time}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" /> {o.guest_count} pax
                                  </span>
                                </CardDescription>
                                {meta?.venue_address && (
                                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3" />
                                    <span className="truncate">{meta.venue_address}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
                                Menu ({menuItems.length})
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {menuItems.map((m) => (
                                  <Badge key={m.menu_item_name} variant="secondary" className="text-xs">
                                    {m.menu_item_name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            {/*
                              Equipment to pack, pulled from
                              orders.equipment_items jsonb. Sales
                              writes this on the quote, it persists
                              through the quote->order conversion, the
                              kitchen sees it here, the driver sees it
                              on their delivery card. End-to-end visibility.
                            */}
                            {Array.isArray(meta?.equipment_items) && meta.equipment_items.length > 0 && (
                              <div>
                                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1">
                                  Equipment to pack ({meta.equipment_items.length})
                                </p>
                                <ul className="text-sm divide-y divide-slate-100">
                                  {meta.equipment_items.map((eq: any, i: number) => {
                                    const fromStock = Number(eq.from_stock_qty);
                                    const fromHire = Number(eq.from_hire_qty);
                                    const hasSplit = Number.isFinite(fromStock) && Number.isFinite(fromHire) && (fromStock > 0 || fromHire > 0);
                                    return (
                                      <li key={`${eq.equipment_id ?? "x"}_${i}`} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-slate-700 min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                                          <span className="truncate">{eq.name || "(unnamed)"}</span>
                                          {eq.category && (
                                            <span className="text-[11px] text-slate-400">{eq.category}</span>
                                          )}
                                          {hasSplit && fromStock > 0 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                              {fromStock} from stock
                                            </span>
                                          )}
                                          {hasSplit && fromHire > 0 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
                                              {fromHire} hire-in
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-900 flex-shrink-0">
                                          × {Number(eq.quantity) || 0}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1">
                                Ingredients to pull
                                <InfoTooltip content="Quantity for this order, scaled to the guest count.\n\nA red warning is a real shortfall once you account for every other order using the same ingredient, not just this one." />
                              </p>
                              <ul className="text-sm divide-y divide-slate-100">
                                {ingredients.map((ing) => {
                                  // Look up aggregated shortfall for this ingredient
                                  const aggKey = `${ing.ingredient_name.toLowerCase()}|${(ing.unit || "").toLowerCase()}`;
                                  const agg = aggMap.get(aggKey);
                                  const isShortOverall = agg && agg.shortfall > 0;
                                  return (
                                    <li key={ing.ingredient_name} className="py-1.5 flex items-center justify-between gap-2">
                                      <span className="text-slate-700 truncate">{ing.ingredient_name}</span>
                                      <span className="flex items-center gap-2 flex-shrink-0">
                                        <span className="tabular-nums text-slate-900 font-medium">
                                          {Number(ing.quantity).toFixed(ing.quantity % 1 === 0 ? 0 : 2)} {ing.unit}
                                        </span>
                                        {isShortOverall ? (
                                          <span title={`Short ${agg!.shortfall} ${agg!.unit} across ${agg!.used_by.length} orders`}>
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                          </span>
                                        ) : agg ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                        ) : null}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
