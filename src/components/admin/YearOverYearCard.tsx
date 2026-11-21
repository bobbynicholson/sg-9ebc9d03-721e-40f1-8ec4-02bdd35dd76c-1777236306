/**
 * YearOverYearCard - compares booked revenue + order count for
 * the selected dashboard range vs the same range one year ago.
 *
 * Phase 12 #4. The dashboard tells the operator how this month
 * looks but says nothing about whether that's up or down on the
 * same window last year. Owners doing year-end reviews were
 * spreadsheet-pivoting their orders to find this number.
 *
 * Self-hides when the company has no orders in the prior-year
 * window (fresh tenants don't see a meaningless 'no comparison
 * available' card).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { toLocalISO } from "@/lib/localDate";
import { isBookedRevenue } from "@/lib/orderRevenueClassification";
import { isReportableOrder, sumBookedRevenue } from "@/lib/orderRevenueMath";

interface PriorStats {
  revenue: number;
  count: number;
}

function shiftYear(d: Date, years: number): Date {
  const out = new Date(d);
  out.setFullYear(out.getFullYear() + years);
  return out;
}

const fmtPct = (now: number, prior: number): { delta: number; label: string } => {
  if (prior <= 0) return { delta: 0, label: "-" };
  const delta = ((now - prior) / prior) * 100;
  return { delta, label: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%` };
};

export function YearOverYearCard({
  companyId,
  range,
  thisYearRevenue,
  thisYearOrders,
}: {
  companyId: string | null;
  range: { from: Date; to: Date; label: string };
  thisYearRevenue: number;
  thisYearOrders: number;
}) {
  const [prior, setPrior] = useState<PriorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const fromIso = toLocalISO(shiftYear(range.from, -1));
        const toIso = toLocalISO(shiftYear(range.to, -1));
        const rows: any[] = [];
        let offset = 0;
        while (true) {
          const { data, error } = await (supabase as any)
            .from("orders")
            .select("id, order_number, event_name, client_name, internal_notes, total_amount, status, payment_status, deposit_paid, confirmed_at, cancelled_at")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("event_date", fromIso)
            .lte("event_date", toIso)
            .order("event_date", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + 999);
          if (error) throw error;
          const page = data || [];
          rows.push(...page);
          if (page.length < 1000) break;
          offset += page.length;
        }
        if (cancelled) return;
        const bookedRows = rows.filter((o) => isReportableOrder(o) && isBookedRevenue(o));
        const revenue = sumBookedRevenue(bookedRows);
        const count = bookedRows.length;
        setPrior({ revenue, count });
      } catch {
        if (!cancelled) setPrior(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.from.getTime(), range.to.getTime()]);

  if (!companyId) return null;
  if (!loading && (!prior || (prior.revenue === 0 && prior.count === 0))) return null;

  const revenueDelta = prior ? fmtPct(thisYearRevenue, prior.revenue) : { delta: 0, label: "-" };
  const orderDelta = prior ? fmtPct(thisYearOrders, prior.count) : { delta: 0, label: "-" };

  const tone = (delta: number) =>
    delta > 0 ? "text-brand-primary bg-brand-primary/10 border-brand-primary/20"
    : delta < 0 ? "text-rose-700 bg-rose-50 border-rose-200"
    : "text-slate-600 bg-slate-50 border-slate-200";
  const Icon = (delta: number) =>
    delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const RevIcon = Icon(revenueDelta.delta);
  const OrdIcon = Icon(orderDelta.delta);

  return (
    <Card className="mb-6 min-w-0 max-w-full overflow-hidden border-slate-200">
      <CardHeader className="min-w-0 px-3 py-3 sm:p-5">
        <CardTitle className="flex items-center gap-1.5 text-sm sm:text-base">
          Year-over-year
          <InfoTooltip content={`Booked order totals and counts in ${range.label.toLowerCase()} compared with the same event-date window one year earlier. Revenue uses total_amount (including tax); only reportable committed orders count. Cancelled and automated test orders are excluded.`} />
        </CardTitle>
        <CardDescription className="mt-1 text-[10px] leading-4 sm:text-xs">
          {range.label} this year vs the same window last year.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 px-3 py-3 sm:p-5">
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="min-w-0 rounded-lg border border-slate-200 p-2.5 sm:p-3">
              <p className="mb-1 text-[10px] text-slate-500 sm:text-xs">Booked revenue</p>
              <p className="break-words text-sm font-bold tabular-nums text-slate-900 sm:text-xl">
                {tenantCurrency.format(thisYearRevenue, 0)}
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                <span className="min-w-0 break-words text-[10px] text-slate-500 tabular-nums sm:text-[11px]">
                  was {tenantCurrency.format(prior?.revenue || 0, 0)}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs ${tone(revenueDelta.delta)}`}>
                  <RevIcon className="w-3 h-3" />
                  {revenueDelta.label}
                </span>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-200 p-2.5 sm:p-3">
              <p className="mb-1 text-[10px] text-slate-500 sm:text-xs">Booked orders</p>
              <p className="break-words text-sm font-bold tabular-nums text-slate-900 sm:text-xl">
                {thisYearOrders}
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                <span className="min-w-0 break-words text-[10px] text-slate-500 tabular-nums sm:text-[11px]">
                  was {prior?.count ?? 0}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs ${tone(orderDelta.delta)}`}>
                  <OrdIcon className="w-3 h-3" />
                  {orderDelta.label}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
