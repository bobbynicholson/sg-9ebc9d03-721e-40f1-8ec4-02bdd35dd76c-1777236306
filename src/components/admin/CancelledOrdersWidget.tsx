/**
 * CancelledOrdersWidget - recently cancelled orders in the last
 * 30 days, with the total revenue that walked away.
 *
 * Phase 20 #7. Cancellations were invisible on the dashboard --
 * the owner only saw them by accident when reviewing /admin/orders
 * and filtering by status. That's a problem because cancellations
 * are a leading indicator of operational issues (over-promising,
 * pricing problems, capacity mismatches) and the lost revenue
 * compounds quietly.
 *
 * Self-hides when zero cancellations in the window.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XCircle, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysAgoIso, daysSince } from "@/lib/dashboardWindows";

interface CancelRow {
  id: string;
  order_number: string | null;
  client_name: string | null;
  total_amount: number | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

const fmtAge = (iso: string | null): string => {
  const days = daysSince(iso);
  if (!iso) return "";
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return "30d+";
};

export function CancelledOrdersWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<CancelRow[]>([]);
  const [totalLost, setTotalLost] = useState(0);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = daysAgoIso(30);
        // TIGHTEN I.79: add the missing deleted_at guard. Soft-deleted
        // cancellations were inflating the "lost revenue" total and the
        // row list. Other widgets that query orders already filter; this
        // one was the outlier.
        const { data, error } = await (supabase as any)
          .from("orders")
          .select("id, order_number, client_name, total_amount, cancelled_at, cancellation_reason")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("status", "cancelled")
          .gte("cancelled_at", since)
          .order("cancelled_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        const list = ((data || []) as CancelRow[]).filter((r) => !!r.cancelled_at);
        if (cancelled) return;
        setRows(list.slice(0, 5));
        setTotalLost(list.reduce((s, r) => s + Number(r.total_amount || 0), 0));
        reportError(null);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setTotalLost(0);
          reportError(e?.message || "Could not load cancellations");
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
              <XCircle className="w-4 h-4 text-slate-500" />
              Cancellations (last 30 days)
              {totalLost > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-xs px-2 py-0.5">
                  <span className="opacity-70">lost</span>
                  <span className="font-semibold">{tenantCurrency.format(totalLost, 0)}</span>
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Orders cancelled in the last 30 days, newest first. Watch for repeat reasons.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/orders")}>
            <Button variant="ghost" size="sm" className="text-slate-700">
              All orders <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              // Phase 23 #1: full-row link, same pattern as the
              // overdue / refunds / leads chase widgets from
              // Phase 22.
              <li key={r.id}>
                <Link
                  href={withSlug(`/order/${r.id}`)}
                  className="py-2 flex items-center gap-3 hover:bg-slate-100/60 rounded transition"
                >
                  <Badge className="shrink-0 text-[10px] uppercase tracking-wide font-semibold bg-slate-100 text-slate-700 border-slate-200">
                    {fmtAge(r.cancelled_at)}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {r.client_name || "Unknown client"}
                      {r.order_number && (
                        <span className="ml-2 text-[11px] font-normal text-slate-500 tabular-nums">
                          {r.order_number}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {r.cancellation_reason || "No reason recorded"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-700">
                    {tenantCurrency.format(Number(r.total_amount || 0), 0)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
