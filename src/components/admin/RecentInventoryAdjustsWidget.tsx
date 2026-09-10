/**
 * RecentInventoryAdjustsWidget - last 5 inventory_transactions
 * for the tenant.
 *
 * Phase 16 #10. Phase 7 #8 added a per-item movement history
 * dialog, but the dashboard never surfaced 'what was just
 * touched'. The shopping team coordinator wants to see a quick
 * read on stock activity without per-item drilling.
 *
 * Self-hides when no transactions exist in the last 7 days.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysAgoIso } from "@/lib/dashboardWindows";
import { useTenantHref } from "@/lib/tenantUrl";

interface TxRow {
  id: string;
  transaction_type: string | null;
  quantity: number | null;
  notes: string | null;
  created_at: string | null;
  inventory_items: {
    item_name: string | null;
    unit_of_measure: string | null;
  } | null;
}

const fmtRelative = (iso: string | null): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export function RecentInventoryAdjustsWidget({ companyId }: { companyId: string | null }) {
  const { reportError, retryNonce } = useReportWidgetError();
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = daysAgoIso(7);
        const { data, error } = await (supabase as any)
          .from("inventory_transactions")
          .select(`
            id, transaction_type, quantity, notes, created_at,
            inventory_items:inventory_item_id ( item_name, unit_of_measure )
          `)
          .eq("company_id", companyId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!cancelled) {
          setRows((data || []) as TxRow[]);
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load inventory movements");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 border-slate-200 bg-slate-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="w-4 h-4 text-slate-600" />
              Recent stock movements
            </CardTitle>
            <CardDescription className="text-xs">
              inventory_transactions in the last 7 days. Newest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/team-portal/shopping/inventory")}>
            <Button variant="ghost" size="sm" className="text-slate-700">
              Inventory <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const qty = Number(r.quantity || 0);
              const positive = qty >= 0;
              const Icon = positive ? ArrowUp : ArrowDown;
              const tone = positive ? "bg-brand-primary/10 text-brand-primary" : "bg-rose-50 text-rose-700";
              // Phase 24 #6: link to /admin/inventory pre-filtered
              // by the item name. The shopping team coordinator
              // scanning movements drops straight onto the item row.
              const itemName = r.inventory_items?.item_name || "";
              const href = itemName
                ? `/admin/inventory?q=${encodeURIComponent(itemName)}`
                : "/admin/inventory";
              return (
                <li key={r.id}>
                  <Link
                    href={href}
                    className="py-2 flex items-center gap-3 hover:bg-slate-50/60 rounded transition"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${tone}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.inventory_items?.item_name || "Unknown item"}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {(r.transaction_type || "movement").replace(/_/g, " ")}
                        </Badge>
                        <span className={`font-semibold ${positive ? "text-brand-primary" : "text-rose-700"}`}>
                          {positive ? "+" : ""}{qty} {r.inventory_items?.unit_of_measure || ""}
                        </span>
                        <span className="text-slate-400">{fmtRelative(r.created_at)}</span>
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
