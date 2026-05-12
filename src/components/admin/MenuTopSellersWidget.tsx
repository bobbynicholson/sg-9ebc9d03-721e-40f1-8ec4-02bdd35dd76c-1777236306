/**
 * MenuTopSellersWidget -- top 5 menu items by quantity sold in the
 * last 30 days.
 *
 * Phase 11 #4. The dashboard told the owner how the business was
 * doing in aggregate but said nothing about which dishes were
 * actually pulling. Owners chasing menu performance had to scroll
 * orders or spreadsheet-export.
 *
 * Reads orders.menu_items (JSONB array of {name, quantity, ...})
 * for orders whose event_date falls in the last 30 days, sums
 * quantities per item name client-side. No new RPC, no schema
 * change.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
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
        const { data } = await (supabase as any)
          .from("orders")
          .select("menu_items")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"])
          .gte("event_date", since)
          .limit(2000);

        const totals = new Map<string, { qty: number; appearances: number }>();
        for (const row of (data || []) as Array<{ menu_items: any }>) {
          const items = Array.isArray(row.menu_items) ? row.menu_items : [];
          for (const it of items) {
            const name = String(it?.name || it?.item_name || "").trim();
            if (!name) continue;
            const qty = Number(it?.quantity ?? 1);
            const existing = totals.get(name) || { qty: 0, appearances: 0 };
            existing.qty += qty;
            existing.appearances += 1;
            totals.set(name, existing);
          }
        }
        const ranked: Entry[] = Array.from(totals.entries())
          .map(([name, v]) => ({ name, quantity: v.qty, appearances: v.appearances }))
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
              return (
                <li key={e.name} className="flex items-center gap-3">
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
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
