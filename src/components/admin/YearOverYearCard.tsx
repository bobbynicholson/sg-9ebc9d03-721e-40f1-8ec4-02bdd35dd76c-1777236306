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
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { toLocalISO } from "@/lib/localDate";

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
        const { data, error } = await (supabase as any)
          .from("orders")
          .select("total_amount, status, payment_status, deposit_paid, confirmed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", fromIso)
          .lte("event_date", toIso)
          .limit(5000);
        if (error) {
          console.error("[YearOverYearCard] orders fetch failed:", error);
        }
        if (cancelled) return;
        let revenue = 0;
        let count = 0;
        for (const o of (data || []) as any[]) {
          const status = String(o.status || "").toLowerCase();
          if (status === "cancelled") continue;
          const pay = String(o.payment_status || "").toLowerCase();
          const isBooked = o.deposit_paid === true || !!o.confirmed_at || pay === "paid" || pay === "partial";
          if (!isBooked) continue;
          revenue += Number(o.total_amount || 0);
          count += 1;
        }
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
    delta > 0 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : delta < 0 ? "text-rose-700 bg-rose-50 border-rose-200"
    : "text-slate-600 bg-slate-50 border-slate-200";
  const Icon = (delta: number) =>
    delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const RevIcon = Icon(revenueDelta.delta);
  const OrdIcon = Icon(orderDelta.delta);

  return (
    <Card className="mb-6 border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Year-over-year</CardTitle>
        <CardDescription className="text-xs">
          {range.label} this year vs the same window last year.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500 mb-1">Booked revenue</p>
              <p className="text-xl font-bold tabular-nums text-slate-900">
                {tenantCurrency.format(thisYearRevenue, 0)}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-500 tabular-nums">
                  was {tenantCurrency.format(prior?.revenue || 0, 0)}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2 py-0.5 ${tone(revenueDelta.delta)}`}>
                  <RevIcon className="w-3 h-3" />
                  {revenueDelta.label}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500 mb-1">Booked orders</p>
              <p className="text-xl font-bold tabular-nums text-slate-900">
                {thisYearOrders}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-500 tabular-nums">
                  was {prior?.count ?? 0}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2 py-0.5 ${tone(orderDelta.delta)}`}>
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
