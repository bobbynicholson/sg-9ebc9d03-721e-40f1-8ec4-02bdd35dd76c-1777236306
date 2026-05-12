/**
 * InventoryLowStockWidget -- dashboard card listing the inventory
 * items that are at or below their minimum_stock threshold.
 *
 * Phase 10 #4. The dashboard already had a 'Low stock items' count
 * in priority actions, but no detail. The shopping team had to
 * jump into /team-portal/shopping/inventory and re-filter to see
 * which items were actually short. This widget puts the top 5 right
 * on the admin dashboard with a quick-link to the inventory page.
 *
 * Eligible: current_stock <= minimum_stock AND minimum_stock > 0.
 * Sorted by ratio (most-short first) so the bag-of-flour at 0kg
 * sits above the box-of-napkins at 5/10.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, Package } from "lucide-react";

interface LowStockRow {
  id: string;
  item_name: string;
  current_stock: number | null;
  minimum_stock: number | null;
  unit_of_measure: string | null;
  category: string | null;
}

const LIMIT = 5;

export function InventoryLowStockWidget({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<LowStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        // We can't compare two columns in PostgREST without an RPC,
        // so pull rows where minimum_stock > 0 and filter client-side.
        // The set is small (single-tenant inventory rarely > a few
        // hundred items) so this is cheap.
        const { data } = await (supabase as any)
          .from("inventory_items")
          .select("id, item_name, current_stock, minimum_stock, unit_of_measure, category")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gt("minimum_stock", 0)
          .limit(500);
        const all = (data || []) as LowStockRow[];
        const short = all
          .filter((r) => Number(r.current_stock || 0) <= Number(r.minimum_stock || 0))
          .map((r) => {
            const cur = Number(r.current_stock || 0);
            const min = Number(r.minimum_stock || 1);
            const ratio = min > 0 ? cur / min : 0;
            return { row: r, ratio };
          })
          .sort((a, b) => a.ratio - b.ratio)
          .slice(0, LIMIT)
          .map((x) => x.row);
        if (!cancelled) setRows(short);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 border-orange-200 bg-orange-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              Stock running low
            </CardTitle>
            <CardDescription className="text-xs">
              Items at or below their minimum reorder level. Most-short first.
            </CardDescription>
          </div>
          <Link href="/team-portal/shopping/inventory">
            <Button variant="ghost" size="sm" className="text-orange-700">
              All inventory <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {rows.map((r) => {
              const cur = Number(r.current_stock || 0);
              const min = Number(r.minimum_stock || 0);
              const out = cur <= 0;
              // Phase 23 #9: deep-link straight to /admin/shopping
              // since the action on a short item is always 'top up'.
              // The shopping page's buy-now tab is the right next
              // stop.
              return (
                <li key={r.id}>
                  <Link
                    href="/admin/shopping"
                    className="py-2 flex items-center gap-3 hover:bg-orange-50/60 rounded transition"
                  >
                    <div className="w-8 h-8 rounded-md bg-orange-100 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-orange-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm truncate">{r.item_name}</span>
                        {r.category && (
                          <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                        )}
                        {out && (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">Out</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                        {cur} / {min} {r.unit_of_measure || ""} on hand
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
