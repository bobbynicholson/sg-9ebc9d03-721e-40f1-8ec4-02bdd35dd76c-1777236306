/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, ChefHat, Loader2, Calendar, Users, MapPin, Clock,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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

export default function KitchenPrepListPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [outlook, setOutlook] = useState<Record<string, OutlookRow>>({});
  const [orderMeta, setOrderMeta] = useState<Record<string, OrderRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);

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

      // grab venue + time per order so prep cards have something useful
      const orderIds = Array.from(new Set(demandRows.map((d) => d.order_id)));
      if (orderIds.length) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, venue_address, event_time, client_name")
          .in("id", orderIds);
        const map: Record<string, OrderRow> = {};
        (orders || []).forEach((o: any) => { map[o.id] = o; });
        if (!cancelled) setOrderMeta(map);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  // Group by order
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
      menu: Map<string, { menu_item_name: string; portions: number }>;
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
      // unique menu items (the same menu_item shows up once per ingredient)
      if (!entry.menu.has(r.menu_item_name)) {
        // portions = max quantity_required across rows is wrong; we need raw portions
        // Re-derive by checking rows with same order + menu_item: use first row but
        // we don't have portions in this view -- use NaN, we'll add a different approach
        entry.menu.set(r.menu_item_name, { menu_item_name: r.menu_item_name, portions: 0 });
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

  const stockHealth = (inv_id: string | null, qty: number) => {
    if (!inv_id) return "unknown";
    const o = outlook[inv_id];
    if (!o) return "unknown";
    return Number(o.current_stock) >= qty ? "ok" : "short";
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Daily Prep List - CateringMS</title></Head>
      <KitchenNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-orange-50 to-red-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6 sm:mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <ClipboardList className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-slate-900 flex items-center gap-2">
                  Prep List
                  <InfoTooltip content="Everything you need to pull from stores, broken down per order.\n\nCovers every confirmed event from today onwards." />
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Per-order ingredient call-out from confirmed bookings
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading prep list...
              </CardContent>
            </Card>
          ) : grouped.length === 0 ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 text-center">
                <ChefHat className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700 mb-1">No prep needed</p>
                <p className="text-sm text-slate-500">No confirmed orders coming up. Enjoy the breather.</p>
              </CardContent>
            </Card>
          ) : (
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
                      // collapse ingredients that repeat across menu items (sum)
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
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1">
                                Menu
                                <InfoTooltip content="The dishes the client ordered for this event." />
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {menuItems.map((m) => (
                                  <Badge key={m.menu_item_name} variant="secondary" className="text-xs">
                                    {m.menu_item_name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1">
                                Ingredients to pull
                                <InfoTooltip content="Total quantity needed for this order, added up across every dish.\n\nA red warning means stock is short, a green tick means you have enough." />
                              </p>
                              <ul className="text-sm divide-y divide-slate-100">
                                {ingredients.map((ing) => {
                                  const health = stockHealth(ing.inventory_item_id, ing.quantity);
                                  return (
                                    <li key={ing.ingredient_name} className="py-1.5 flex items-center justify-between gap-2">
                                      <span className="text-slate-700 truncate">{ing.ingredient_name}</span>
                                      <span className="flex items-center gap-2 flex-shrink-0">
                                        <span className="tabular-nums text-slate-900 font-medium">
                                          {Number(ing.quantity).toFixed(ing.quantity % 1 === 0 ? 0 : 2)} {ing.unit}
                                        </span>
                                        {health === "short" ? (
                                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                        ) : health === "ok" ? (
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
