/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Smart Shopping -- the procurement brain.
 *
 * Wires together:
 *  - inventory_items   (current_stock, minimum_stock, reorder_quantity,
 *                        cost_per_unit, is_perishable, shelf_life_days,
 *                        preferred_supplier_id)
 *  - inventory_demand_outlook view  (stock vs demand 7/14/30 days)
 *  - order_ingredient_demand view   (which orders are pulling on what)
 *  - suppliers                      (email/phone for one-click PO email)
 *
 * Three intelligent modes:
 *  1. Buy now     -- shortfalls + below-min items, urgency sorted
 *  2. Plan ahead  -- 14-day forward window, with a "buy by" date that
 *                    respects shelf_life_days for perishables
 *  3. By supplier -- rolled up so the admin can fire one PO email per
 *                    supplier with the items they actually need
 *
 * SV touches: tick rows -> live "PO total" pill in the header that
 * grows with each click, supplier groups expand with a per-supplier
 * subtotal + "Email this supplier" CTA, perishable items pulse amber
 * if their buy-by date is inside 48 hours.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShoppingCart, Package, AlertTriangle, Calendar, Clock, Truck, Mail,
  CheckCircle2, Loader2, Sparkles, TrendingDown, ChevronDown, ChevronUp,
  Building2, Snowflake, Flame, Receipt, ChevronRight, ListChecks,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { composeEmail } from "@/lib/composeEmail";

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
  projected_stock_after_7_days: number;
  shortfall_next_7_days: number;
  upcoming_order_count: number;
  status: "shortfall" | "below_minimum" | "low" | "ok";
}

interface InvDetail {
  id: string;
  is_perishable: boolean;
  shelf_life_days: number | null;
  cost_per_unit: number;
  preferred_supplier_id: string | null;
}

interface DemandLine {
  inventory_item_id: string;
  order_number: string;
  event_name: string;
  event_date: string;
  menu_item_name: string;
  quantity_required: number;
  unit: string | null;
}

interface Supplier {
  id: string;
  supplier_name: string;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
}

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const STATUS_META: Record<string, { label: string; tone: string; rank: number }> = {
  shortfall:     { label: "Shortfall",     tone: "bg-red-100 text-red-700 border-red-200",       rank: 0 },
  below_minimum: { label: "Below par",     tone: "bg-amber-100 text-amber-800 border-amber-200", rank: 1 },
  low:           { label: "Low",           tone: "bg-yellow-100 text-yellow-800 border-yellow-200", rank: 2 },
  ok:            { label: "OK",            tone: "bg-emerald-100 text-emerald-700 border-emerald-200", rank: 3 },
};

function SmartShoppingPage() {
  const { user, profile, company } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const { toast } = useToast();

  const [outlook, setOutlook] = useState<OutlookRow[]>([]);
  const [details, setDetails] = useState<Record<string, InvDetail>>({});
  const [demand, setDemand] = useState<DemandLine[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const todayISO = new Date().toISOString().slice(0, 10);
      const [outlookRes, invRes, demandRes, supRes] = await Promise.all([
        supabase
          .from("inventory_demand_outlook")
          .select("*")
          .eq("company_id", companyId),
        supabase
          .from("inventory_items")
          .select("id, is_perishable, shelf_life_days, cost_per_unit, preferred_supplier_id")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        supabase
          .from("order_ingredient_demand")
          .select("inventory_item_id, order_number, event_name, event_date, menu_item_name, quantity_required, unit, order_status")
          .eq("company_id", companyId)
          .gte("event_date", todayISO)
          .in("order_status", ["confirmed", "preparing", "ready"]),
        supabase
          .from("suppliers")
          .select("id, supplier_name, email, phone, contact_person")
          .eq("company_id", companyId)
          .is("deleted_at", null),
      ]);
      if (cancelled) return;
      setOutlook((outlookRes.data || []) as OutlookRow[]);
      const dMap: Record<string, InvDetail> = {};
      (invRes.data || []).forEach((r: any) => { dMap[r.id] = r as InvDetail; });
      setDetails(dMap);
      setDemand((demandRes.data || []) as DemandLine[]);
      const sMap: Record<string, Supplier> = {};
      (supRes.data || []).forEach((s: any) => { sMap[s.id] = s as Supplier; });
      setSuppliers(sMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Earliest event_date per inventory item -- drives buy-by date
  const earliestEvent: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    demand.forEach((d) => {
      if (!d.inventory_item_id) return;
      if (!m[d.inventory_item_id] || d.event_date < m[d.inventory_item_id]) {
        m[d.inventory_item_id] = d.event_date;
      }
    });
    return m;
  }, [demand]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().slice(0, 10);

  // Decorate every outlook row with derived fields
  const enriched = useMemo(() => {
    return outlook.map((r) => {
      const det = details[r.inventory_item_id];
      const earliest = earliestEvent[r.inventory_item_id] || null;
      const earliestDate = earliest ? new Date(earliest + "T00:00:00") : null;
      // Buy-by date: for perishables, event - shelf_life_days; for non-perishables, "any time" (null)
      let buyBy: Date | null = null;
      if (det?.is_perishable && det.shelf_life_days && earliestDate) {
        buyBy = new Date(earliestDate);
        buyBy.setDate(buyBy.getDate() - Math.max(0, det.shelf_life_days - 1));
        if (buyBy < today) buyBy = today; // already overdue, get it today
      }
      const buyByDays = buyBy ? Math.ceil((buyBy.getTime() - today.getTime()) / 86400000) : null;
      const reorderQty = Number(r.reorder_quantity) || Math.max(
        Number(r.minimum_stock) - Number(r.current_stock),
        Number(r.demand_next_14_days) - Number(r.current_stock),
        0,
      );
      const cost = Number(det?.cost_per_unit ?? 0) * reorderQty;
      const supplier = det?.preferred_supplier_id ? suppliers[det.preferred_supplier_id] : null;
      const isUrgent = buyByDays !== null && buyByDays <= 2;
      return {
        ...r,
        is_perishable: !!det?.is_perishable,
        shelf_life_days: det?.shelf_life_days ?? null,
        cost_per_unit: Number(det?.cost_per_unit ?? 0),
        preferred_supplier_id: det?.preferred_supplier_id ?? null,
        supplier,
        earliestEvent: earliest,
        buyBy,
        buyByDays,
        reorderQty,
        cost,
        isUrgent,
      };
    });
  }, [outlook, details, suppliers, earliestEvent, today]);

  // -- Buy-now list: shortfalls + below_minimum, urgency-sorted ---------
  const buyNow = useMemo(() => {
    return enriched
      .filter((r) => r.status === "shortfall" || r.status === "below_minimum")
      .sort((a, b) => {
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        const sa = STATUS_META[a.status]?.rank ?? 9;
        const sb = STATUS_META[b.status]?.rank ?? 9;
        if (sa !== sb) return sa - sb;
        return Number(b.shortfall_next_7_days) - Number(a.shortfall_next_7_days);
      });
  }, [enriched]);

  // -- Plan-ahead list: anything with demand in next 14 days that isn't OK
  const planAhead = useMemo(() => {
    return enriched
      .filter((r) => r.upcoming_order_count > 0 && Number(r.demand_next_14_days) > 0)
      .sort((a, b) => {
        if (!a.buyBy && !b.buyBy) return Number(b.demand_next_14_days) - Number(a.demand_next_14_days);
        if (!a.buyBy) return 1;
        if (!b.buyBy) return -1;
        return a.buyBy.getTime() - b.buyBy.getTime();
      });
  }, [enriched]);

  // -- By-supplier rollup
  const bySupplier = useMemo(() => {
    const groups: Record<string, {
      supplier: Supplier | null;
      items: typeof enriched;
      totalCost: number;
      totalShortfallCount: number;
    }> = {};
    enriched
      .filter((r) => r.status !== "ok")
      .forEach((r) => {
        const k = r.preferred_supplier_id || "_unassigned";
        if (!groups[k]) {
          groups[k] = {
            supplier: r.supplier ?? null,
            items: [],
            totalCost: 0,
            totalShortfallCount: 0,
          };
        }
        groups[k].items.push(r);
        groups[k].totalCost += r.cost;
        if (r.status === "shortfall") groups[k].totalShortfallCount += 1;
      });
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.totalShortfallCount - a.totalShortfallCount)
      .map(([id, g]) => ({ id, ...g }));
  }, [enriched]);

  // -- Cart maths
  const pickedTotal = useMemo(() => {
    return enriched
      .filter((r) => picked[r.inventory_item_id])
      .reduce((sum, r) => sum + r.cost, 0);
  }, [enriched, picked]);
  const pickedCount = Object.values(picked).filter(Boolean).length;

  const togglePick = (id: string) =>
    setPicked((p) => ({ ...p, [id]: !p[id] }));

  // Email supplier with the items in the cart that are theirs
  const emailSupplier = (group: { supplier: Supplier | null; items: typeof enriched }) => {
    if (!group.supplier?.email) {
      toast({ title: "No email on file", description: `Add an email for ${group.supplier?.supplier_name || "this supplier"} on the Suppliers page.`, variant: "destructive" });
      return;
    }
    const linesInScope = group.items.filter((r) => picked[r.inventory_item_id]);
    const lines = linesInScope.length > 0 ? linesInScope : group.items;
    const subject = `Order request from ${company?.company_name || "us"}`;
    const lineText = lines
      .map((r) => `- ${r.reorderQty} ${r.unit_of_measure} ${r.item_name}${r.buyBy ? ` (needed by ${r.buyBy.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })})` : ""}`)
      .join("\n");
    const body = `Hi ${group.supplier.contact_person || group.supplier.supplier_name},\n\nCould you put the following on order for us?\n\n${lineText}\n\nLet me know an ETA and the total when you're ready.\n\nThanks,\n${company?.company_name || "The team"}`;
    window.open(composeEmail.gmailUrl({ to: group.supplier.email, subject, body }), "_blank", "noopener");
  };

  // Mark items in the cart as purchased -- bumps current_stock by reorderQty
  const markPurchased = async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (ids.length === 0) return;
    if (!confirm(`Mark ${ids.length} item${ids.length === 1 ? "" : "s"} as purchased? This will bump their current_stock by the reorder quantity.`)) return;

    let updated = 0;
    for (const id of ids) {
      const row = enriched.find((r) => r.inventory_item_id === id);
      if (!row) continue;
      const newStock = Number(row.current_stock) + row.reorderQty;
      const { error } = await supabase
        .from("inventory_items")
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (!error) updated += 1;
    }
    toast({ title: "Stock updated", description: `${updated} item${updated === 1 ? "" : "s"} bumped.` });
    setPicked({});
    // refresh outlook
    const { data } = await supabase
      .from("inventory_demand_outlook")
      .select("*")
      .eq("company_id", companyId);
    setOutlook((data || []) as OutlookRow[]);
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Smart Shopping - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
        <div className="px-3 sm:px-4 md:px-6 py-6 max-w-screen-2xl">

          {/* Header + cart pill */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Smart Shopping
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Live procurement brain. Knows what to buy, when to buy it, and which supplier handles it.
                </p>
              </div>
            </div>
            {pickedCount > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Card className="border-0 shadow bg-emerald-50 px-4 py-2 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-xs text-emerald-700">In your PO list</p>
                    <p className="font-bold text-slate-900">{pickedCount} items - {fmtMoney.format(pickedTotal)}</p>
                  </div>
                  <Button size="sm" onClick={markPurchased} className="ml-2 gap-1">
                    <Truck className="w-3.5 h-3.5" /> Mark purchased
                  </Button>
                </Card>
              </div>
            )}
          </div>

          {/* Top stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <SummaryTile
              label="Shortfalls"
              value={enriched.filter((r) => r.status === "shortfall").length}
              accent="text-red-600"
              icon={AlertTriangle}
              hint="Below 7-day demand"
            />
            <SummaryTile
              label="Below par"
              value={enriched.filter((r) => r.status === "below_minimum").length}
              accent="text-amber-600"
              icon={TrendingDown}
              hint="Below minimum_stock"
            />
            <SummaryTile
              label="Urgent (≤2 days)"
              value={enriched.filter((r) => r.isUrgent && r.status !== "ok").length}
              accent="text-orange-600"
              icon={Flame}
              hint="Perishables expiring soon"
            />
            <SummaryTile
              label="Estimated PO total"
              value={fmtMoney.format(buyNow.reduce((s, r) => s + r.cost, 0))}
              accent="text-emerald-600"
              icon={Receipt}
              hint="Buy-now items at supplier prices"
              isMoney
            />
          </div>

          {loading ? (
            <Card className="border-0 shadow"><CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading procurement brain...
            </CardContent></Card>
          ) : outlook.length === 0 ? (
            <Card className="border-0 shadow"><CardContent className="py-16 text-center text-slate-500">
              <Package className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No inventory configured yet</p>
              <p className="text-sm">Add items in <Link href="/admin/inventory" className="text-emerald-600">Inventory</Link>, link them to recipes, and this page lights up.</p>
            </CardContent></Card>
          ) : (
            <Tabs defaultValue="buy_now">
              <TabsList className="grid w-full grid-cols-3 max-w-xl mb-4">
                <TabsTrigger value="buy_now" className="gap-1.5">
                  <Flame className="w-3.5 h-3.5" /> Buy now
                  {buyNow.length > 0 && <Badge className="ml-1 bg-red-100 text-red-700 text-[10px]">{buyNow.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="plan" className="gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Plan ahead
                </TabsTrigger>
                <TabsTrigger value="supplier" className="gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> By supplier
                </TabsTrigger>
              </TabsList>

              {/* BUY NOW */}
              <TabsContent value="buy_now">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-emerald-600" />
                      Buy now
                    </CardTitle>
                    <CardDescription>
                      Items below minimum stock or already short for the next 7 days. Tick to add to your PO list.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {buyNow.length === 0 ? (
                      <div className="py-12 text-center">
                        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                        <p className="font-semibold text-slate-700">All stocked up</p>
                        <p className="text-xs text-slate-500">Nothing to buy right now. Check back tomorrow.</p>
                      </div>
                    ) : (
                      <ItemTable
                        rows={buyNow}
                        picked={picked} togglePick={togglePick}
                        expandedItem={expandedItem} setExpandedItem={setExpandedItem}
                        demand={demand}
                        showBuyBy
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PLAN AHEAD */}
              <TabsContent value="plan">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Plan ahead (next 14 days)
                    </CardTitle>
                    <CardDescription>
                      Sorted by buy-by date. Perishables surface earliest -- non-perishables can wait. Urgent items pulse amber.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {planAhead.length === 0 ? (
                      <div className="py-12 text-center text-slate-500">
                        <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        No upcoming demand on inventory.
                      </div>
                    ) : (
                      <ItemTable
                        rows={planAhead}
                        picked={picked} togglePick={togglePick}
                        expandedItem={expandedItem} setExpandedItem={setExpandedItem}
                        demand={demand}
                        showBuyBy
                        showShelfLife
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* BY SUPPLIER */}
              <TabsContent value="supplier">
                <div className="space-y-3">
                  {bySupplier.length === 0 ? (
                    <Card className="border-0 shadow"><CardContent className="py-12 text-center text-slate-500">
                      <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      Nothing to order right now.
                    </CardContent></Card>
                  ) : (
                    bySupplier.map((g) => {
                      const isOpen = openSupplier === g.id;
                      return (
                        <Card key={g.id} className="border-0 shadow-lg">
                          <button
                            onClick={() => setOpenSupplier(isOpen ? null : g.id)}
                            className="w-full text-left"
                          >
                            <CardHeader className="hover:bg-slate-50 transition-colors">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0">
                                    <Building2 className="w-5 h-5 text-emerald-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">
                                      {g.supplier?.supplier_name || "No preferred supplier"}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {g.items.length} item{g.items.length === 1 ? "" : "s"} to order
                                      {g.totalShortfallCount > 0 && (
                                        <span className="ml-2 text-red-600 font-medium">
                                          - {g.totalShortfallCount} shortfall{g.totalShortfallCount === 1 ? "" : "s"}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className="font-bold tabular-nums text-slate-900">
                                    {fmtMoney.format(g.totalCost)}
                                  </span>
                                  {g.supplier?.email && (
                                    <Button
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); emailSupplier(g); }}
                                      className="gap-1.5"
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                      Email order
                                    </Button>
                                  )}
                                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </div>
                              </div>
                            </CardHeader>
                          </button>
                          {isOpen && (
                            <CardContent className="p-0">
                              <ItemTable
                                rows={g.items}
                                picked={picked} togglePick={togglePick}
                                expandedItem={expandedItem} setExpandedItem={setExpandedItem}
                                demand={demand}
                                hideSupplier
                                showBuyBy
                              />
                            </CardContent>
                          )}
                        </Card>
                      );
                    })
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}

          <p className="text-[11px] text-slate-500 text-center mt-6">
            Procurement maths derived from <code className="bg-slate-100 px-1 rounded">inventory_demand_outlook</code> +{" "}
            <code className="bg-slate-100 px-1 rounded">order_ingredient_demand</code> views.
            Updates the moment a stock change or new order lands.
          </p>
        </div>
      </div>
    </>
  );
}

function SummaryTile({ label, value, accent, icon: Icon, hint, isMoney }: any) {
  return (
    <Card className="border-0 shadow">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`text-2xl md:text-3xl font-bold mt-1 ${accent} ${isMoney ? "" : "tabular-nums"}`}>{value}</p>
          {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
        </div>
        <Icon className={`w-8 h-8 ${accent} opacity-30`} />
      </CardContent>
    </Card>
  );
}

function ItemTable({
  rows, picked, togglePick, expandedItem, setExpandedItem, demand,
  hideSupplier, showBuyBy, showShelfLife,
}: any) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="w-8 py-2"></th>
            <th className="text-left py-2 pr-3">Item</th>
            <th className="text-right py-2 px-3">On hand</th>
            <th className="text-right py-2 px-3">Need 7d</th>
            <th className="text-right py-2 px-3">Reorder</th>
            <th className="text-right py-2 px-3">Cost</th>
            {showBuyBy && <th className="text-left py-2 px-3">Buy by</th>}
            {!hideSupplier && <th className="text-left py-2 px-3">Supplier</th>}
            <th className="text-left py-2 pl-3">Status</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => {
            const meta = STATUS_META[r.status] || STATUS_META.ok;
            const isOpen = expandedItem === r.inventory_item_id;
            const lines = demand.filter((d: any) => d.inventory_item_id === r.inventory_item_id);
            return (
              <>
                <tr
                  key={r.inventory_item_id}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${r.isUrgent ? "bg-amber-50/40" : ""}`}
                >
                  <td className="py-3 pl-3">
                    <input
                      type="checkbox"
                      checked={!!picked[r.inventory_item_id]}
                      onChange={() => togglePick(r.inventory_item_id)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-start gap-2">
                      <div>
                        <div className="font-medium text-slate-900 flex items-center gap-1.5">
                          {r.item_name}
                          {r.is_perishable && <Snowflake className="w-3 h-3 text-cyan-500" title="Perishable" />}
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.category || "Uncategorised"}{showShelfLife && r.shelf_life_days ? ` - ${r.shelf_life_days}d shelf life` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    {Number(r.current_stock).toLocaleString()} <span className="text-slate-400 text-xs">{r.unit_of_measure}</span>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                    {Number(r.demand_next_7_days).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-slate-900">
                    {Number(r.reorderQty).toLocaleString()} <span className="text-slate-400 text-xs">{r.unit_of_measure}</span>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                    {fmtMoney.format(r.cost)}
                  </td>
                  {showBuyBy && (
                    <td className="py-3 px-3 text-xs">
                      {r.buyBy ? (
                        <span className={`flex items-center gap-1 ${r.isUrgent ? "text-orange-600 font-semibold" : "text-slate-600"}`}>
                          {r.isUrgent && (
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                            </span>
                          )}
                          {r.buyBy.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          {r.buyByDays !== null && (
                            <span className="text-slate-400 ml-1">({r.buyByDays}d)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">Any time</span>
                      )}
                    </td>
                  )}
                  {!hideSupplier && (
                    <td className="py-3 px-3 text-xs text-slate-600 truncate max-w-[180px]">
                      {r.supplier?.supplier_name || <span className="text-slate-400">—</span>}
                    </td>
                  )}
                  <td className="py-3 pl-3">
                    <Badge variant="outline" className={`${meta.tone} border`}>{meta.label}</Badge>
                  </td>
                  <td className="py-3 pr-3">
                    {lines.length > 0 && (
                      <button
                        onClick={() => setExpandedItem(isOpen ? null : r.inventory_item_id)}
                        className="text-slate-400 hover:text-slate-700"
                        title={`${lines.length} order${lines.length === 1 ? "" : "s"} pulling on this`}
                      >
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && lines.length > 0 && (
                  <tr key={`${r.inventory_item_id}-d`} className="bg-slate-50">
                    <td colSpan={showBuyBy ? (hideSupplier ? 9 : 10) : (hideSupplier ? 8 : 9)} className="px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Pulled by upcoming orders
                      </div>
                      <div className="space-y-1">
                        {lines.map((l: any, i: number) => (
                          <div key={`${l.order_number}-${i}`} className="flex items-center justify-between text-xs py-1">
                            <div className="flex items-center gap-3 min-w-0">
                              <Badge variant="outline" className="text-[10px]">{l.order_number}</Badge>
                              <span className="text-slate-700 truncate">{l.event_name}</span>
                              <span className="text-slate-500 hidden sm:inline">via {l.menu_item_name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600">
                              <span className="tabular-nums">{Number(l.quantity_required).toLocaleString()} {l.unit}</span>
                              <span className="text-slate-500">{new Date(l.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ProtectedShopping() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <SmartShoppingPage />
    </ProtectedRoute>
  );
}
