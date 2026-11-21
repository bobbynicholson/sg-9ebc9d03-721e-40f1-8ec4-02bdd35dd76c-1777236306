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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Badge } from "@/components/ui/badge";
import { XCircle, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysAgoIso, daysSince } from "@/lib/dashboardWindows";
import { staffOrderHref } from "@/lib/orderUrls";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";

interface CancelRow {
  id: string;
  order_number: string | null;
  event_name: string | null;
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
        const allRows: CancelRow[] = [];
        let offset = 0;
        while (true) {
          const { data, error } = await (supabase as any)
            .from("orders")
            .select("id, order_number, event_name, client_name, total_amount, cancelled_at, cancellation_reason")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .eq("status", "cancelled")
            .gte("cancelled_at", since)
            .order("cancelled_at", { ascending: false })
            .order("id", { ascending: true })
            .range(offset, offset + 999);
          if (error) throw error;
          const page = (data || []) as CancelRow[];
          allRows.push(...page);
          if (page.length < 1000) break;
          offset += page.length;
        }
        const list = allRows
          .filter((r) => !!r.cancelled_at)
          .filter((r) => !isAutomatedTestOrder(r));
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
    <Card className="mb-6 min-w-0 max-w-full overflow-hidden border-slate-200 bg-slate-50/30">
      <CardHeader className="min-w-0 px-3 py-3 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-5 sm:gap-2 sm:text-base">
              <XCircle className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="sm:hidden">Cancellations</span>
              <span className="hidden sm:inline">Cancellations (last 30 days)</span>
              <InfoTooltip content={"The cancelled orders shown here were cancelled during the last 30 days. The Lost amount is their gross total_amount (including tax), not cash lost or refunded: some cancelled orders may still have cash held, and completed refunds are tracked separately."} />
              {totalLost > 0 && (
                <span className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 sm:ml-1 sm:px-2 sm:text-xs">
                  <span className="opacity-70">Cancelled value</span>
                  <span className="font-semibold tabular-nums">{tenantCurrency.format(totalLost, 0)}</span>
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1 text-[10px] leading-4 sm:text-xs">
              Orders cancelled in the last 30 days, newest first. Watch for repeat reasons.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/orders")} aria-label="View all orders" title="All orders" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-200 sm:h-8 sm:w-auto sm:gap-1 sm:px-2">
            <span className="sr-only sm:not-sr-only">All orders</span><ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-3 py-3 sm:p-5">
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="min-w-0 divide-y divide-slate-100">
            {rows.map((r) => (
              // Phase 23 #1: full-row link, same pattern as the
              // overdue / refunds / leads chase widgets from
              // Phase 22.
              <li key={r.id}>
                <Link
                  href={withSlug(staffOrderHref(r.id, "admin"))}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 rounded px-1 py-2.5 hover:bg-slate-100/60 sm:flex sm:items-center sm:gap-3 sm:px-2"
                >
                  <Badge className="row-start-1 w-fit shrink-0 whitespace-nowrap border-slate-200 bg-slate-100 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700 sm:text-[10px]">
                    {fmtAge(r.cancelled_at)}
                  </Badge>
                  <div className="row-start-2 min-w-0 sm:row-auto sm:flex-1">
                    <p className="break-words text-xs font-medium leading-4 text-slate-900 sm:text-sm">
                      {r.client_name || "Unknown client"}
                      {r.order_number && (
                        <span className="text-[10px] font-normal text-slate-500 tabular-nums sm:ml-1 sm:text-[11px]">
                          {" · "}
                          {r.order_number}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 break-words text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                      {r.cancellation_reason || "No reason recorded"}
                    </p>
                  </div>
                  <span className="col-start-2 row-start-1 row-span-2 max-w-28 break-words text-right text-xs font-bold tabular-nums text-slate-700 sm:row-auto sm:shrink-0 sm:whitespace-nowrap sm:text-sm">
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
