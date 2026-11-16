/**
 * WeeklyOrdersChart - 7-day mini bar chart of confirmed-and-
 * onwards order count by event_date.
 *
 * Phase 14 #9. The dashboard's KPI tiles answer 'how many'
 * across the period but never show the day-by-day shape. The
 * kitchen lead wants to see 'which days are bunching up' so
 * they can pre-prep on quiet days for busy ones.
 *
 * Self-hides when no orders exist in the past 7 days.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { ALL_ACTIVE_AND_REALISED_STATUSES } from "@/lib/orderRevenueClassification";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";

interface OrderRow {
  event_date: string | null;
  order_number: string | null;
  event_name: string | null;
  client_name: string | null;
}

interface DayBucket {
  date: string;
  label: string;
  weekday: string;
  count: number;
  isToday: boolean;
  isPast: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeeklyOrdersChart({ companyId }: { companyId: string | null }) {
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        // 7 days back through 7 days forward - shows past trend
        // and upcoming load on a single strip.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        const end = new Date(today);
        end.setDate(end.getDate() + 7);
        const startIso = toLocalISO(start);
        const endIso = toLocalISO(end);
        const { data, error } = await (supabase as any)
          .from("orders")
          .select("event_date, order_number, event_name, client_name")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ALL_ACTIVE_AND_REALISED_STATUSES as unknown as string[])
          .gte("event_date", startIso)
          .lte("event_date", endIso)
          .limit(2000);
        if (error) throw error;
        if (!cancelled) {
          setRows(((data || []) as OrderRow[]).filter((r) => !isAutomatedTestOrder(r)));
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load order load chart");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  const buckets = useMemo<DayBucket[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: DayBucket[] = [];
    for (let offset = -6; offset <= 7; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      const iso = toLocalISO(d);
      out.push({
        date: iso,
        label: d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
        weekday: WEEKDAYS[d.getDay()],
        count: 0,
        isToday: offset === 0,
        isPast: offset < 0,
      });
    }
    const idx: Record<string, DayBucket> = {};
    for (const b of out) idx[b.date] = b;
    for (const r of rows) {
      if (!r.event_date) continue;
      const b = idx[r.event_date];
      if (b) b.count += 1;
    }
    return out;
  }, [rows]);

  const max = Math.max(1, ...buckets.map((b) => b.count));

  if (!companyId) return null;
  if (!loading && buckets.every((b) => b.count === 0)) return null;

  return (
    <Card className="mb-6 min-w-0 max-w-full overflow-hidden">
      <CardHeader className="min-w-0 px-3 py-3 sm:p-5">
        <CardTitle className="flex flex-wrap items-center gap-1.5 text-sm leading-5 sm:gap-2 sm:text-base">
          <BarChart3 className="h-4 w-4 shrink-0 text-slate-600" />
          Order load, past + next 7 days
        </CardTitle>
        <CardDescription className="mt-1 text-[10px] leading-4 sm:text-xs">
          Confirmed-and-onwards orders by event_date. Today highlighted.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 px-3 py-3 sm:p-5">
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <div className="flex h-28 min-w-0 items-end gap-0.5 sm:gap-1.5">
            {buckets.map((b) => {
              const heightPct = b.count > 0 ? Math.max(8, Math.round((b.count / max) * 100)) : 4;
              const tone = b.isToday
                ? "bg-blue-500"
                : b.isPast
                  ? "bg-slate-300"
                  : "bg-brand-primary/70";
              return (
                <div key={b.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[9px] font-semibold tabular-nums text-slate-700 sm:text-[10px]">
                    {b.count > 0 ? b.count : ""}
                  </span>
                  <div
                    className={`w-full rounded-t-sm ${tone} ${b.isToday ? "ring-2 ring-blue-300" : ""}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${b.weekday} ${b.label}: ${b.count} order${b.count === 1 ? "" : "s"}`}
                  />
                  <span className={`text-[9px] tabular-nums sm:text-[10px] ${b.isToday ? "text-blue-700 font-semibold" : "text-slate-500"}`}>
                    {b.weekday}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
