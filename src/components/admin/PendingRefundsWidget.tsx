/**
 * PendingRefundsWidget - list of refund payments still awaiting
 * payout (status != completed).
 *
 * Phase 14 #6. The dashboard's stat card shows the count + total
 * but no row-level detail. The bookkeeping team had to open
 * /admin/refunds and filter by hand to see which clients were
 * waiting.
 *
 * Self-hides when no refunds are pending.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CircleDollarSign, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";

interface RefundRow {
  id: string;
  amount: number | null;
  payment_status: string | null;
  payment_method: string | null;
  created_at: string | null;
  order: {
    order_number: string | null;
    client_name: string | null;
  } | null;
}

const daysAgo = (iso: string | null): number => {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
};

export function PendingRefundsWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("payments")
          .select(`
            id, amount, payment_status, payment_method, created_at,
            order:order_id ( order_number, client_name )
          `)
          .eq("company_id", companyId)
          .eq("payment_type", "refund")
          .neq("payment_status", "completed")
          .order("created_at", { ascending: true })
          .limit(5);
        if (error) throw error;
        if (!cancelled) {
          setRows((data || []) as RefundRow[]);
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load pending refunds");
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
    <Card className="mb-6 border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleDollarSign className="w-4 h-4 text-amber-600" />
              Refunds awaiting payout
            </CardTitle>
            <CardDescription className="text-xs">
              Refund rows on payments where payment_status hasn't reached completed.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/refunds")}>
            <Button variant="ghost" size="sm" className="text-amber-700">
              All refunds <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-amber-100">
            {rows.map((r) => {
              const age = daysAgo(r.created_at);
              const tone = age >= 7
                ? "bg-rose-100 text-rose-800 border-rose-200"
                : age >= 3
                  ? "bg-orange-100 text-orange-800 border-orange-200"
                  : "bg-amber-100 text-amber-800 border-amber-200";
              // Phase 22 #9: each row now deep-links into the
              // refunds page with the row's payment id so the
              // bookkeeper can act in one click. Mirrors the
              // Phase 22 #8 OverdueInvoicesWidget pattern.
              return (
                <li key={r.id}>
                  <Link
                    href={withSlug(`/admin/refunds?paymentId=${r.id}`)}
                    className="py-2 flex items-center gap-3 hover:bg-amber-50/60 rounded transition"
                  >
                    <Badge className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold ${tone}`}>
                      {age}d
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.order?.client_name || "Unknown client"}
                        {r.order?.order_number && (
                          <span className="ml-2 text-[11px] font-normal text-slate-500 tabular-nums">
                            {r.order.order_number}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 capitalize">
                        {r.payment_method || "method tbc"} · {r.payment_status || "pending"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-amber-800">
                      {tenantCurrency.format(Number(r.amount || 0), 0)}
                    </span>
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
