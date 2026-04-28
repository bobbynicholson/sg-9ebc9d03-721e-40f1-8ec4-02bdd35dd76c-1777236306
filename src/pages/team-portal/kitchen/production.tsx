import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users as UsersIcon, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Order {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  status: string | null;
  special_instructions: string | null;
}

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string | null;
  quantity: number | null;
  special_instructions: string | null;
}

const STATUS_TONES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-purple-100 text-purple-800 border-purple-200",
  ready:      "bg-green-100 text-green-800 border-green-200",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}
function fmtFullDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}

export default function KitchenProductionPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [weekStart, setWeekStart] = useState<Date>(startOfDay(new Date()));
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, weekStart]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const from = isoDate(weekStart);
      const to = isoDate(addDays(weekStart, 7));
      const { data: ords, error } = await supabase
        .from("orders")
        .select("id, order_number, event_name, event_date, event_time, guest_count, status, special_instructions")
        .eq("company_id", user.company_id)
        .gte("event_date", from)
        .lt("event_date", to)
        .neq("status", "cancelled")
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
        .returns<Order[]>();
      if (error) throw error;
      setOrders(ords || []);

      const orderIds = (ords || []).map((o) => o.id);
      if (orderIds.length === 0) {
        setItems([]);
      } else {
        const { data: lineItems } = await supabase
          .from("order_items")
          .select("id, order_id, menu_item_id, item_name, quantity, special_instructions")
          .in("order_id", orderIds)
          .returns<OrderItem[]>();
        setItems(lineItems || []);
      }
    } catch (e) {
      toast({ title: "Could not load production schedule", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const ordersByDate = useMemo(() => {
    const map: Record<string, Order[]> = {};
    orders.forEach((o) => {
      if (!o.event_date) return;
      if (!map[o.event_date]) map[o.event_date] = [];
      map[o.event_date].push(o);
    });
    return map;
  }, [orders]);

  const itemsByOrder = useMemo(() => {
    const map: Record<string, OrderItem[]> = {};
    items.forEach((i) => {
      if (!map[i.order_id]) map[i.order_id] = [];
      map[i.order_id].push(i);
    });
    return map;
  }, [items]);

  const totals = useMemo(() => {
    const events = orders.length;
    const guests = orders.reduce((s, o) => s + Number(o.guest_count || 0), 0);
    const dishes = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    return { events, guests, dishes };
  }, [orders, items]);

  const fmtTime = (t?: string | null) => {
    if (!t) return "TBC";
    return t.slice(0, 5);
  };

  return (
    <>
      <Head><title>Production Schedule - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent flex items-center gap-3">
                <Calendar className="h-7 w-7 text-orange-600" />
                Production Schedule
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Week of {fmtFullDay(weekStart)} -- {fmtDay(addDays(weekStart, 6))}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, -7))}>
                <ChevronLeft className="h-4 w-4 mr-1" />Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfDay(new Date()))}>
                This week
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, 7))}>
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Events this week<InfoTooltip content="Non-cancelled orders with event_date inside the visible week. Source: orders.event_date between weekStart and weekStart + 7 days." /></p><p className="text-2xl font-bold tabular-nums">{totals.events}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Total guests<InfoTooltip content="Sum of orders.guest_count across the events visible this week. Drives bulk-prep maths." /></p><p className="text-2xl font-bold tabular-nums">{totals.guests}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Total portions<InfoTooltip content="Sum of order_items.quantity across this week's order line items -- one quantity per dish ordered, before plating splits." /></p><p className="text-2xl font-bold tabular-nums">{totals.dishes}</p></CardContent></Card>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading schedule...</div>
          ) : (
            <div className="space-y-4">
              {days.map((d) => {
                const key = isoDate(d);
                const list = ordersByDate[key] || [];
                const isToday = key === isoDate(new Date());
                return (
                  <div key={key}>
                    <div className={`flex items-center gap-2 mb-2 px-1`}>
                      <h2 className={`text-sm font-semibold ${isToday ? "text-orange-600" : "text-slate-700"}`}>
                        {fmtDay(d)}{isToday && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Today</span>}
                      </h2>
                      <span className="text-xs text-slate-500">{list.length} event{list.length === 1 ? "" : "s"}</span>
                    </div>
                    {list.length === 0 ? (
                      <Card><CardContent className="p-4 text-center text-sm text-slate-400">No production scheduled</CardContent></Card>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {list.map((o) => {
                          const lineItems = itemsByOrder[o.id] || [];
                          return (
                            <Card key={o.id} className={`${isToday ? "border-orange-200" : ""}`}>
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-slate-900 truncate">{o.event_name ?? o.order_number ?? "Event"}</div>
                                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(o.event_time)}</span>
                                      {o.guest_count != null && <span className="flex items-center gap-1"><UsersIcon className="h-3 w-3" />{o.guest_count} guests</span>}
                                      {o.order_number && <span className="font-mono text-[10px] text-slate-400">{o.order_number}</span>}
                                    </div>
                                  </div>
                                  {o.status && (
                                    <Badge variant="outline" className={`${STATUS_TONES[o.status] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-[10px] flex-shrink-0`}>
                                      {o.status}
                                    </Badge>
                                  )}
                                </div>
                                {lineItems.length > 0 && (
                                  <ul className="mt-2 space-y-1 text-sm border-t border-slate-100 pt-2">
                                    {lineItems.slice(0, 6).map((it) => (
                                      <li key={it.id} className="flex items-center justify-between gap-2">
                                        <span className="truncate text-slate-700">{it.item_name ?? "--"}</span>
                                        <span className="tabular-nums text-slate-500 flex-shrink-0">x{it.quantity ?? 0}</span>
                                      </li>
                                    ))}
                                    {lineItems.length > 6 && <li className="text-xs text-slate-400">+ {lineItems.length - 6} more</li>}
                                  </ul>
                                )}
                                {o.special_instructions && (
                                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{o.special_instructions}</p>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
