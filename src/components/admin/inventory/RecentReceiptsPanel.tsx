/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RecentReceiptsPanel -- the last ten supplier slips that fed
 * inventory. Surfaces on /admin/inventory so the operator can quickly
 * trace which slip a stock bump came from.
 *
 * Read-only. The actual reconciliation lives in
 * /components/shopping/ReconcileSlipDrawer; this panel just shows the
 * audit trail.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, ChevronDown, ChevronUp, ExternalLink, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ReceiptLine {
  id: string;
  description: string;
  quantity: number | null;
  unit_of_measure: string | null;
  unit_price: number | null;
  inventory_item_id: string | null;
  inventory_received_at: string | null;
  inventory_items?: { item_name: string } | null;
}

interface ReceiptRow {
  id: string;
  vendor: string | null;
  receipt_date: string | null;
  total: number | null;
  created_at: string;
  items: ReceiptLine[];
}

const fmtR = (v: number | null | undefined) =>
  v == null ? "—" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const relativeTime = (iso: string | null) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.floor(ms / 60_000);
  return `${Math.max(1, mins)}m ago`;
};

export function RecentReceiptsPanel({ companyId }: { companyId: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("purchase_receipts")
        .select(`
          id, vendor, receipt_date, total, created_at,
          items:purchase_receipt_items(
            id, description, quantity, unit_of_measure, unit_price,
            inventory_item_id, inventory_received_at,
            inventory_items(item_name)
          )
        `)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      // Only keep slips that actually fed stock at least once.
      const fed = ((data || []) as ReceiptRow[]).filter((r) =>
        (r.items || []).some((it) => !!it.inventory_received_at),
      ).slice(0, 10);
      setRows(fed);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm mb-5">
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4 text-purple-600" />
            Recent receipts feeding inventory
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
              {rows.length}
            </Badge>
          </CardTitle>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-2 space-y-2">
          {rows.map((r) => {
            const stockLines = (r.items || []).filter((it) => !!it.inventory_received_at);
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{r.vendor || "(supplier unknown)"}</p>
                    <p className="text-xs text-slate-500">
                      {r.receipt_date || "no date"} · {stockLines.length} stock line{stockLines.length === 1 ? "" : "s"}
                      {" · "}
                      <span className="text-slate-400">{relativeTime(r.created_at)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-emerald-700">{fmtR(r.total)}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-3 py-2 space-y-1.5">
                    {stockLines.map((it) => (
                      <div key={it.id} className="flex items-start justify-between text-xs gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <Package className="w-3 h-3 mt-0.5 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-slate-900 truncate">
                              {it.inventory_items?.item_name || it.description}
                            </p>
                            <p className="text-slate-500 text-[11px]">
                              +{it.quantity} {it.unit_of_measure || "ea"} @ {fmtR(it.unit_price)}
                            </p>
                          </div>
                        </div>
                        {it.inventory_item_id && (
                          <Link
                            href={`/admin/inventory?focus=${it.inventory_item_id}`}
                            className="text-slate-400 hover:text-slate-700"
                            title="Jump to inventory item"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    ))}
                    <div className="pt-1.5 border-t border-slate-100">
                      <Link
                        href="/admin/shopping?tab=receipts"
                        className="text-[11px] text-purple-600 hover:underline inline-flex items-center gap-1"
                      >
                        Manage slips on Shopping <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
