/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, AlertTriangle, AlertCircle, ShoppingCart, Loader2,
  Package, Calendar, ChevronDown, ChevronUp,
} from "lucide-react";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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

interface DemandLine {
  inventory_item_id: string;
  order_id: string;
  order_number: string;
  event_name: string;
  event_date: string;
  menu_item_name: string;
  quantity_required: number;
  unit: string | null;
}

const STATUS_META: Record<string, { label: string; tone: string; icon: typeof AlertTriangle }> = {
  shortfall:     { label: "Shortfall",     tone: "bg-red-100 text-red-800 border-red-200",       icon: AlertTriangle },
  below_minimum: { label: "Below par",     tone: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertCircle },
  low:           { label: "Low",           tone: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: AlertCircle },
  ok:            { label: "OK",            tone: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Package },
};

export default function ShoppingAlertsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<OutlookRow[]>([]);
  const [demand, setDemand] = useState<DemandLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [outlookRes, demandRes] = await Promise.all([
        supabase
          .from("inventory_demand_outlook")
          .select("*")
          .eq("company_id", companyId),
        supabase
          .from("order_ingredient_demand")
          .select("inventory_item_id, order_id, order_number, event_name, event_date, menu_item_name, quantity_required, unit, order_status")
          .eq("company_id", companyId)
          .gte("event_date", new Date().toISOString().slice(0, 10))
          .in("order_status", ["confirmed", "preparing", "ready"]),
      ]);
      if (cancelled) return;
      if (outlookRes.error) console.error("outlook", outlookRes.error);
      if (demandRes.error)  console.error("demand",  demandRes.error);
      setRows((outlookRes.data || []) as OutlookRow[]);
      setDemand((demandRes.data  || []) as DemandLine[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  const sorted = useMemo(() => {
    const order = { shortfall: 0, below_minimum: 1, low: 2, ok: 3 } as const;
    return [...rows].sort((a, b) => {
      const sa = order[a.status] ?? 9;
      const sb = order[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return Number(b.shortfall_next_7_days || 0) - Number(a.shortfall_next_7_days || 0);
    });
  }, [rows]);

  const tally = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      },
      { shortfall: 0, below_minimum: 0, low: 0, ok: 0 } as Record<string, number>,
    );
  }, [rows]);

  const linesFor = (id: string) =>
    demand
      .filter((d) => d.inventory_item_id === id)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <>
      <NoIndexMeta />
      <Head><title>Stock Alerts - CateringMS</title></Head>
      <ShoppingNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-emerald-50 to-green-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6 sm:mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold text-slate-900">Stock Alerts</h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  What needs shopping for, based on confirmed orders coming up
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatTile label="Shortfall (7d)"   value={tally.shortfall}     accent="text-red-600"     icon={AlertTriangle} tooltip="Items where you'll run out within 7 days based on confirmed orders.\n\nThese need buying urgently." />
            <StatTile label="Below par"        value={tally.below_minimum} accent="text-amber-600"   icon={AlertCircle} tooltip="Items already sitting below their minimum stock level." />
            <StatTile label="Low"              value={tally.low}           accent="text-yellow-600"  icon={AlertCircle} tooltip="Items on track to drop below their minimum within the next 7 days." />
            <StatTile label="OK"               value={tally.ok}            accent="text-emerald-600" icon={Package} tooltip="Items with enough stock to cover the next 7 days of confirmed orders." />
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                Procurement outlook
              </CardTitle>
              <CardDescription>
                Sorted by urgency. Click an item to see which orders are pulling on stock.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 flex items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading outlook...
                </div>
              ) : sorted.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  No inventory items configured yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2 pr-3"><span className="inline-flex items-center gap-1">Item <InfoTooltip content="The item's name, category and minimum stock level." /></span></th>
                        <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1">On hand <InfoTooltip content="How much of this item is in stock right now." /></span></th>
                        <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1">Need 7d <InfoTooltip content="How much of this item confirmed orders need over the next 7 days." /></span></th>
                        <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1">Need 14d <InfoTooltip content="How much of this item confirmed orders need over the next 14 days." /></span></th>
                        <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1">After 7d <InfoTooltip content="What stock will look like once 7 days of orders are taken out.\n\nA negative number means you'll run out." /></span></th>
                        <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1">Orders <InfoTooltip content="How many upcoming orders rely on this item." /></span></th>
                        <th className="text-left py-2 pl-3"><span className="inline-flex items-center gap-1">Status <InfoTooltip content="How urgent the item is: shortfall, below par, low, or OK." /></span></th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => {
                        const meta = STATUS_META[r.status] || STATUS_META.ok;
                        const Icon = meta.icon;
                        const isOpen = expanded === r.inventory_item_id;
                        const lines = linesFor(r.inventory_item_id);
                        return (
                          <>
                            <tr
                              key={r.inventory_item_id}
                              className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                              onClick={() =>
                                setExpanded(isOpen ? null : r.inventory_item_id)
                              }
                            >
                              <td className="py-3 pr-3">
                                <div className="font-medium text-slate-900">{r.item_name}</div>
                                <div className="text-xs text-slate-500">
                                  {r.category || "Uncategorised"} - min {Number(r.minimum_stock).toLocaleString()} {r.unit_of_measure}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums">
                                {Number(r.current_stock).toLocaleString()} <span className="text-slate-400 text-xs">{r.unit_of_measure}</span>
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                                {Number(r.demand_next_7_days).toLocaleString()}
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                                {Number(r.demand_next_14_days).toLocaleString()}
                              </td>
                              <td className={`py-3 px-3 text-right tabular-nums font-medium ${Number(r.projected_stock_after_7_days) < 0 ? "text-red-600" : Number(r.projected_stock_after_7_days) < Number(r.minimum_stock) ? "text-amber-600" : "text-slate-900"}`}>
                                {Number(r.projected_stock_after_7_days).toLocaleString()}
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums text-slate-500">
                                {r.upcoming_order_count}
                              </td>
                              <td className="py-3 pl-3">
                                <Badge className={`${meta.tone} border gap-1`} variant="outline">
                                  <Icon className="w-3 h-3" />
                                  {meta.label}
                                </Badge>
                              </td>
                              <td className="py-3 text-right text-slate-400">
                                {lines.length > 0 ? (isOpen ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />) : null}
                              </td>
                            </tr>
                            {isOpen && lines.length > 0 && (
                              <tr key={`${r.inventory_item_id}-detail`} className="bg-slate-50">
                                <td colSpan={8} className="px-4 py-3">
                                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Pulled by upcoming orders
                                  </div>
                                  <div className="space-y-1">
                                    {lines.map((l, i) => (
                                      <div
                                        key={`${l.order_id}-${l.menu_item_name}-${i}`}
                                        className="flex items-center justify-between text-sm py-1"
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          <Badge variant="outline" className="text-xs">{l.order_number}</Badge>
                                          <span className="text-slate-700 truncate">{l.event_name}</span>
                                          <span className="text-xs text-slate-500 hidden sm:inline">via {l.menu_item_name}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-600">
                                          <span className="tabular-nums">
                                            {Number(l.quantity_required).toLocaleString()} {l.unit}
                                          </span>
                                          <span className="text-xs text-slate-500">
                                            {new Date(l.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                          </span>
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
              )}
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    </>
  );
}

function StatTile({
  label, value, accent, icon: Icon, tooltip,
}: { label: string; value: number; accent: string; icon: React.ComponentType<{ className?: string }>; tooltip?: string }) {
  return (
    <Card className="border-0 shadow">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">
            {label}
            {tooltip && <InfoTooltip content={tooltip} />}
          </p>
          <p className={`text-2xl md:text-3xl font-bold mt-1 ${accent}`}>{value}</p>
        </div>
        <Icon className={`w-8 h-8 ${accent} opacity-30`} />
      </CardContent>
    </Card>
  );
}
