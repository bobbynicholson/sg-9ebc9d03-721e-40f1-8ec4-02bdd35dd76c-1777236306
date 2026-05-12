/**
 * InventoryExpiryWidget -- inventory_batches expiring within the
 * next 14 days, plus already-expired batches that still have stock.
 *
 * Phase 12 #7. Perishable items (proteins, dairy, prepped salads)
 * carry an expiry_date on each batch. Without surfacing this on
 * the dashboard, batches were quietly going off in the cold room
 * and only being noticed when the kitchen pulled them for prep.
 *
 * Self-hides when no batches are tracked or nothing is close to
 * expiry.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, ArrowRight, AlertCircle } from "lucide-react";

interface BatchRow {
  id: string;
  expiry_date: string | null;
  quantity: number | null;
  inventory_item_id: string;
}

interface ItemLite {
  id: string;
  item_name: string | null;
  unit_of_measure: string | null;
}

interface Entry {
  id: string;
  itemName: string;
  unit: string;
  quantity: number;
  expiry: string;
  daysUntil: number;
}

const WINDOW_DAYS = 14;

export function InventoryExpiryWidget({ companyId }: { companyId: string | null }) {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [items, setItems] = useState<Record<string, ItemLite>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const horizonIso = new Date(Date.now() + WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
        const { data: batchData } = await (supabase as any)
          .from("inventory_batches")
          .select("id, expiry_date, quantity, inventory_item_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .not("expiry_date", "is", null)
          .gt("quantity", 0)
          .lte("expiry_date", horizonIso)
          .order("expiry_date", { ascending: true })
          .limit(50);
        if (cancelled) return;
        const rows = (batchData || []) as BatchRow[];
        setBatches(rows);
        // Hydrate item names in a single IN query.
        const itemIds = Array.from(new Set(rows.map((b) => b.inventory_item_id)));
        if (itemIds.length > 0) {
          const { data: itemData } = await (supabase as any)
            .from("inventory_items")
            .select("id, item_name, unit_of_measure")
            .in("id", itemIds);
          if (cancelled) return;
          const map: Record<string, ItemLite> = {};
          for (const i of (itemData || []) as ItemLite[]) map[i.id] = i;
          setItems(map);
        }
      } catch {
        if (!cancelled) {
          setBatches([]);
          setItems({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const entries = useMemo<Entry[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return batches.slice(0, 5).map((b) => {
      const item = items[b.inventory_item_id];
      const exp = b.expiry_date ? new Date(b.expiry_date) : null;
      const days = exp ? Math.floor((exp.getTime() - today.getTime()) / 86_400_000) : 0;
      return {
        id: b.id,
        itemName: item?.item_name || "Unknown item",
        unit: item?.unit_of_measure || "",
        quantity: Number(b.quantity || 0),
        expiry: b.expiry_date || "",
        daysUntil: days,
      };
    });
  }, [batches, items]);

  if (!companyId) return null;
  if (!loading && entries.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="w-4 h-4 text-amber-600" />
              Stock expiring soon
            </CardTitle>
            <CardDescription className="text-xs">
              Batches with stock on hand expiring within {WINDOW_DAYS} days. Soonest first.
            </CardDescription>
          </div>
          <Link href="/team-portal/shopping/inventory">
            <Button variant="ghost" size="sm" className="text-amber-700">
              All inventory <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-amber-100">
            {entries.map((e) => {
              const tone = e.daysUntil < 0
                ? "text-rose-700 bg-rose-100 border-rose-200"
                : e.daysUntil <= 3
                  ? "text-orange-700 bg-orange-100 border-orange-200"
                  : "text-amber-700 bg-amber-100 border-amber-200";
              const label = e.daysUntil < 0
                ? `${Math.abs(e.daysUntil)}d overdue`
                : e.daysUntil === 0
                  ? "today"
                  : `${e.daysUntil}d`;
              // Phase 24 #1: full-row link into /admin/inventory
              // where batch-level expiry can be triaged or written
              // off.
              return (
                <li key={e.id}>
                  <Link
                    href="/admin/inventory"
                    className="py-2 flex items-center gap-3 hover:bg-amber-50/60 rounded transition"
                  >
                    <div className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tone}`}>
                      {e.daysUntil < 0 && <AlertCircle className="w-3 h-3" />}
                      {label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{e.itemName}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {e.quantity} {e.unit} on hand
                        {e.expiry && (
                          <span className="ml-2 text-slate-400">
                            expires {new Date(e.expiry).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{e.unit}</Badge>
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
