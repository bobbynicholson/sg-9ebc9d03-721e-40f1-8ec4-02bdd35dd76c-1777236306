/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin-only "Receipts for this order" block on the order doc.
 *
 * Shows every purchase_receipts row linked to this order (order_id set when
 * the shopper reconciled the slip in ReceiptScanner -> ReconcileSlipDrawer),
 * with the slip image, spend, and the SCAN OUTCOME (ok / partial / manual /
 * failed) so an operator can see at a glance whether the receipt read cleanly
 * or needs a re-scan.
 *
 * Gated to ADMIN_ROLES only - this is spend + supplier data, not for staff or
 * clients. Renders nothing for non-admins and nothing when there are no
 * linked receipts, so it's invisible until it has something to show.
 *
 * Best-effort: the query is wrapped so a pre-migration DB (no order_id /
 * scan_status columns) just renders nothing instead of breaking the doc.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_ROLES } from "@/lib/authGuards";
import { formatZAR } from "@/lib/formatters";
import { UserRole } from "@/types/app";
import { Receipt as ReceiptIcon, ExternalLink, CheckCircle2, AlertTriangle, PencilLine, XCircle } from "lucide-react";

interface Props {
  orderId: string;
}

interface ReceiptRow {
  id: string;
  vendor: string | null;
  total: number | null;
  receipt_date: string | null;
  image_url: string | null;
  scan_status: string | null;
  scan_result: any | null;
  created_at: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "Scan OK", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900", Icon: CheckCircle2 },
  partial: { label: "Partial scan", cls: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900", Icon: AlertTriangle },
  manual: { label: "Keyed by hand", cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700", Icon: PencilLine },
  failed: { label: "Scan failed", cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900", Icon: XCircle },
  pending: { label: "Not scanned", cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700", Icon: AlertTriangle },
};

export function OrderReceiptsAdmin({ orderId }: Props) {
  const { user, userRoles } = useAuth();
  const [rows, setRows] = useState<ReceiptRow[]>([]);

  const isAdmin = useMemo(() => {
    const role = (user as { role?: UserRole } | null)?.role;
    const activeRole = (user as { active_role?: UserRole } | null)?.active_role;
    const roles = [role, activeRole, ...(Array.isArray(userRoles) ? userRoles : [])].filter(Boolean) as UserRole[];
    return roles.some((r) => ADMIN_ROLES.includes(r));
  }, [user, userRoles]);

  useEffect(() => {
    if (!isAdmin || !orderId) { setRows([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("purchase_receipts")
          .select("id, vendor, total, receipt_date, image_url, scan_status, scan_result, created_at")
          .eq("order_id", orderId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (error || !data) { if (!cancelled) setRows([]); return; }
        if (!cancelled) setRows(data as ReceiptRow[]);
      } catch {
        if (!cancelled) setRows([]);
      }
    };
    void load();

    // Live-refresh so a slip reconciled against this order while the doc
    // is open appears without a manual reload. Random channel suffix +
    // removeChannel cleanup per the channel-suffix rule.
    const channel = supabase
      .channel(`order-receipts-${orderId}-${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "purchase_receipts", filter: `order_id=eq.${orderId}` }, () => { void load(); })
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [isAdmin, orderId]);

  if (!isAdmin || rows.length === 0) return null;

  const totalSpend = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          <ReceiptIcon className="h-3.5 w-3.5" />
          Receipts for this order
          <span className="text-[10px] font-medium normal-case text-slate-400">(admin only)</span>
        </span>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {rows.length} slip{rows.length === 1 ? "" : "s"} · {formatZAR(totalSpend)}
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const meta = STATUS_META[r.scan_status || "pending"] || STATUS_META.pending;
          const lineCount = Number(r.scan_result?.line_item_count) || null;
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
              {r.image_url ? (
                <a href={r.image_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0" title="View receipt image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.image_url} alt={r.vendor || "Receipt"} className="h-12 w-12 rounded object-cover border border-slate-200 dark:border-slate-700" />
                </a>
              ) : (
                <div className="h-12 w-12 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <ReceiptIcon className="h-5 w-5 text-slate-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{r.vendor || "Unknown vendor"}</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.cls}`}>
                    <meta.Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatZAR(r.total)}
                  {r.receipt_date && <span> · {new Date(r.receipt_date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                  {lineCount != null && <span> · {lineCount} item{lineCount === 1 ? "" : "s"}</span>}
                </div>
              </div>
              {r.image_url && (
                <a href={r.image_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-slate-400 hover:text-brand-primary" title="Open receipt">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default OrderReceiptsAdmin;
