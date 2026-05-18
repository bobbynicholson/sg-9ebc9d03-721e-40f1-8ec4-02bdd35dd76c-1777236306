/**
 * MenuTopSellersWidget - top 5 menu items by quantity sold in the
 * last 30 days.
 *
 * Phase 11 #4. The dashboard told the owner how the business was
 * doing in aggregate but said nothing about which dishes were
 * actually pulling. Owners chasing menu performance had to scroll
 * orders or spreadsheet-export.
 *
 * Wave 43 hotfix: previous query asked for orders.menu_items, a
 * column that doesn't exist on orders - it's only on quotes.
 * Line items live in order_items (item_name, quantity, ...) keyed
 * by order_id. Net result: the widget silently returned zero
 * results forever (failed query was swallowed pre-Wave 43 sweep).
 * Switched to order_items + an inner join filter on orders for the
 * status + event_date + company guard.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChefHat, TrendingUp } from "lucide-react";

interface Entry {
  name: string;
  quantity: number;
  appearances: number;
}

export function MenuTopSellersWidget({ companyId }: { companyId: string | null }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        // Wave 43 hotfix: query order_items + inner join to orders
        // for the status / event_date / company filter. Each
        // order_items row already has item_name + quantity, so no
        // JSON unwrap needed - one row per dish per order.
        const { data, error } = await (supabase as any)
          .from("order_items")
          .select(
            "item_name, quantity, order_id, orders!inner(company_id, status, event_date, deleted_at)",
          )
          .eq("orders.company_id", companyId)
          .is("orders.deleted_at", null)
          .in("orders.status", ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"])
          .gte("orders.event_date", since)
          .limit(5000);
        if (error) {
          console.error("[MenuTopSellersWidget] order_items fetch failed:", error);
        }

        const totals = new Map<string, { qty: number; orders: Set<string> }>();
        for (const row of (data || []) as Array<{ item_name: string | null; quantity: number | null; order_id: string }>) {
          const name = String(row.item_name || "").trim();
          if (!name) continue;
          const qty = Number(row.quantity ?? 1);
          const existing = totals.get(name) || { qty: 0, orders: new Set<string>() };
          existing.qty += qty;
          existing.orders.add(row.order_id);
          totals.set(name, existing);
        }
        const ranked: Entry[] = Array.from(totals.entries())
          .map(([name, v]) => ({ name, quantity: v.qty, appearances: v.orders.size }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);
        if (!cancelled) setEntries(ranked);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const topQty = useMemo(() => entries[0]?.quantity || 1, [entries]);

  if (!companyId) return null;
  if (!loading && entries.length === 0) return null;

  return (
    <Card className="mb-6 border-emerald-200 bg-emerald-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ChefHat className="w-4 h-4 text-emerald-600" />
          Top sellers, last 30 days
        </CardTitle>
        <CardDescription className="text-xs">
          Menu items moving most by quantity across confirmed-and-onwards orders.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e, i) => {
              const share = Math.max(8, Math.round((e.quantity / topQty) * 100));
              // Phase 24 #4: deep-link to /admin/menu pre-filtered
              // by the dish name. The matching ?q seam in menu.tsx
              // wires that up.
              return (
                <li key={e.name}>
                  <Link
                    href={`/admin/menu?q=${encodeURIComponent(e.name)}`}
                    className="flex items-center gap-3 py-1 -mx-1 px-1 rounded hover:bg-emerald-50/60 transition"
                  >
                    <div className="w-6 text-xs font-semibold text-emerald-900 tabular-nums">#{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">{e.name}</span>
                        <span className="text-xs tabular-nums text-slate-700 font-semibold shrink-0">
                          {e.quantity} sold
                        </span>
                      </div>
                      <div className="h-1.5 bg-emerald-100 rounded overflow-hidden mt-1">
                        <div className="h-full bg-emerald-500" style={{ width: `${share}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums inline-flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        on {e.appearances} order{e.appearances === 1 ? "" : "s"}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
