/**
 * DeliverySlaWidget -- on-time delivery rate over the last 30 days.
 *
 * Phase 13 #6. Phase 12's delivery sheet helps the day-of dispatch,
 * but the owner had no read on whether the team was actually
 * arriving on time across the period. SLA was a feel, not a number.
 *
 * On-time = delivered_at <= event_time on the same day, with a
 * 15-minute grace window. Late by > 15 minutes = late. Missing
 * delivered_at on a delivered/completed order counts as missed
 * (the system never recorded the actual arrival).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

interface OrderRow {
  event_date: string | null;
  event_time: string | null;
  delivered_at: string | null;
}

interface Stats {
  onTime: number;
  late: number;
  missing: number;
  total: number;
  medianMinutesEarly: number;
}

const GRACE_MIN = 15;

function combineEventDateTime(date: string | null, time: string | null): Date | null {
  if (!date) return null;
  // event_time is HH:mm or HH:mm:ss; if missing assume noon as a best
  // guess so the SLA isn't gamed by 'TBC' rows.
  const safeTime = time ? time.slice(0, 5) : "12:00";
  const [h, m] = safeTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  // Build in local time so the comparison matches the operator's view.
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export function DeliverySlaWidget({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        const { data } = await (supabase as any)
          .from("orders")
          .select("event_date, event_time, delivered_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["delivered", "completed"])
          .gte("event_date", sinceIso)
          .limit(2000);
        if (!cancelled) setRows((data || []) as OrderRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const stats = useMemo<Stats>(() => {
    let onTime = 0;
    let late = 0;
    let missing = 0;
    const earlyDeltas: number[] = [];
    for (const o of rows) {
      const target = combineEventDateTime(o.event_date, o.event_time);
      if (!target) {
        missing += 1;
        continue;
      }
      if (!o.delivered_at) {
        missing += 1;
        continue;
      }
      const actual = new Date(o.delivered_at);
      const deltaMin = (actual.getTime() - target.getTime()) / 60_000;
      if (deltaMin <= GRACE_MIN) {
        onTime += 1;
        if (deltaMin < 0) earlyDeltas.push(-deltaMin);
      } else {
        late += 1;
      }
    }
    const total = onTime + late + missing;
    return {
      onTime, late, missing, total,
      medianMinutesEarly: median(earlyDeltas),
    };
  }, [rows]);

  if (!companyId) return null;
  if (!loading && stats.total === 0) return null;

  const onTimePct = stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0;
  const tone = onTimePct >= 90
    ? "bg-emerald-50 border-emerald-200"
    : onTimePct >= 75
      ? "bg-blue-50 border-blue-200"
      : "bg-amber-50 border-amber-200";

  return (
    <Card className={`mb-6 ${tone}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-4 h-4 text-blue-600" />
          Delivery on-time, last 30 days
        </CardTitle>
        <CardDescription className="text-xs">
          delivered_at within {GRACE_MIN} minutes of the booked event_time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-white border border-slate-200 p-3">
              <p className="text-xs text-slate-500">On time</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-700">{onTimePct}%</p>
              <p className="text-[11px] text-slate-500 tabular-nums">{stats.onTime} of {stats.total}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Late</p>
              <p className="text-2xl font-bold tabular-nums text-amber-700">{stats.late}</p>
              <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> &gt; {GRACE_MIN}m past
              </p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3">
              <p className="text-xs text-slate-500">No record</p>
              <p className="text-2xl font-bold tabular-nums text-slate-700">{stats.missing}</p>
              <p className="text-[11px] text-slate-500">delivered_at empty</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Avg early arrival</p>
              <p className="text-2xl font-bold tabular-nums text-blue-700">
                {stats.medianMinutesEarly > 0 ? `${stats.medianMinutesEarly.toFixed(0)}m` : "—"}
              </p>
              <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> median when early
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
