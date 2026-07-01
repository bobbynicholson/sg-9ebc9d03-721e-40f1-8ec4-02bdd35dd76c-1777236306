/**
 * PendingRefundsWidget - refund payments still awaiting payout or retry.
 *
 * Only pending / processing / failed refunds belong here. Rows already
 * marked refunded or completed are settled and should not appear as
 * awaiting payout.
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
import { daysSince } from "@/lib/dashboardWindows";
import { OPEN_REFUND_STATUSES } from "@/lib/refundStatus";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";

interface RefundRow {
  id: string;
  amount: number | null;
  payment_status: string | null;
  payment_method: string | null;
  created_at: string | null;
  order: {
    order_number: string | null;
    event_name: string | null;
    internal_notes: string | null;
    client_name: string | null;
  } | null;
}

const daysAgo = (iso: string | null): number => daysSince(iso);

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
            order:order_id ( order_number, event_name, internal_notes, client_name )
          `)
          .eq("company_id", companyId)
          .eq("payment_type", "refund")
          .in("payment_status", OPEN_REFUND_STATUSES)
          .order("created_at", { ascending: true })
          .limit(5);
        if (error) throw error;
        if (!cancelled) {
          setRows(((data || []) as RefundRow[]).filter((r) => !isAutomatedTestOrder(r.order)));
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
              Refund payment rows still pending, processing, or failed. Refunded/completed rows are already settled.
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
                        {r.payment_method || "method tbc"} - {r.payment_status || "pending"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-amber-800">
                      {tenantCurrency.format(Math.abs(Number(r.amount || 0)), 0)}
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
