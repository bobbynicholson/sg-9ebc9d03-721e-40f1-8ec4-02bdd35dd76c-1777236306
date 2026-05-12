/**
 * DriverShiftHistory -- driver-side compact list of the last 5
 * shifts for the current user.
 *
 * Phase 17 #4. Phase 10 #10 shipped the one-tap clock-in /
 * clock-out button. Drivers now wanted a quick sanity-check:
 * 'did I forget to clock out yesterday?' / 'how many hours did
 * I do last weekend?'. The earnings page covers the full breakdown
 * but the driver dashboard had no quick read.
 *
 * Self-hides until there's at least one closed shift.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle } from "lucide-react";

interface ShiftRow {
  id: string;
  actual_start: string | null;
  actual_end: string | null;
  status: string | null;
  rate_multiplier: number | null;
}

const fmtTime = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

const hoursOf = (start: string | null, end: string | null): number => {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return (e - s) / 3_600_000;
};

export function DriverShiftHistory({ driverId }: { driverId: string | null | undefined }) {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("driver_shifts")
          .select("id, actual_start, actual_end, status, rate_multiplier")
          .eq("driver_id", driverId)
          .is("deleted_at", null)
          .not("actual_start", "is", null)
          .order("actual_start", { ascending: false })
          .limit(5);
        if (!cancelled) setRows((data || []) as ShiftRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [driverId]);

  if (!driverId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
          <Clock className="w-4 h-4 text-slate-500" />
          Recent shifts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-3">Loading...</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((s) => {
              const h = hoursOf(s.actual_start, s.actual_end);
              const isOpen = !s.actual_end;
              const mult = Number(s.rate_multiplier ?? 1);
              return (
                <li key={s.id} className="py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 tabular-nums">
                      {fmtTime(s.actual_start)}
                      {!isOpen && (
                        <span className="text-slate-500"> → {fmtTime(s.actual_end)}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {isOpen ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Open -- still clocked in
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] tabular-nums">
                          {h.toFixed(1)}h
                        </Badge>
                      )}
                      {mult > 1 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                          ×{mult}
                        </Badge>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
