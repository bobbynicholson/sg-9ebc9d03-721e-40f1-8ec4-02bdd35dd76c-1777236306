/**
 * DriverLeaderboard - top-5 drivers this month by hours worked
 * plus deliveries completed.
 *
 * Phase 11 #3. The admin had no quick way to see who's pulling
 * the weight this month. Settlement gives precise per-driver
 * numbers but only at a date-range scope; this widget keeps a
 * persistent month-to-date pulse on the driver-management page
 * so trends are visible without drilling.
 *
 * Reads two tables (driver_shifts for hours, orders for completed
 * deliveries), aggregates client-side. No new RPC.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Clock, Truck } from "lucide-react";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";

interface ShiftRow {
  driver_id: string;
  actual_start: string | null;
  actual_end: string | null;
}
interface DeliveryRow {
  assigned_driver_id: string;
}
interface DriverLite {
  id: string;
  full_name: string | null;
  email: string | null;
}
interface Entry {
  driver: DriverLite;
  hours: number;
  deliveries: number;
}

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return (e - s) / 3_600_000;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function DriverLeaderboard({ companyId }: { companyId: string | null }) {
  const { reportError, retryNonce } = useReportWidgetError();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const from = startOfMonthIso();
        const [shiftsRes, deliveriesRes, driversRes] = await Promise.all([
          (supabase as any)
            .from("driver_shifts")
            .select("driver_id, actual_start, actual_end")
            .eq("company_id", companyId)
            .gte("actual_start", from)
            .is("deleted_at", null)
            .not("actual_end", "is", null)
            .limit(2000),
          (supabase as any)
            .from("orders")
            .select("assigned_driver_id")
            .eq("company_id", companyId)
            .not("assigned_driver_id", "is", null)
            .in("status", ["delivered", "completed"])
            .gte("event_date", from.slice(0, 10))
            .is("deleted_at", null)
            .limit(2000),
          (supabase as any)
            .from("profiles")
            .select("id, full_name, email")
            .eq("company_id", companyId)
            .eq("role", "driver"),
        ]);
        if (cancelled) return;
        const drivers = (driversRes.data || []) as DriverLite[];
        const driverIndex: Record<string, DriverLite> = {};
        for (const d of drivers) driverIndex[d.id] = d;

        const hoursMap: Record<string, number> = {};
        for (const s of (shiftsRes.data || []) as ShiftRow[]) {
          hoursMap[s.driver_id] = (hoursMap[s.driver_id] || 0) + hoursBetween(s.actual_start, s.actual_end);
        }
        const deliveryMap: Record<string, number> = {};
        for (const o of (deliveriesRes.data || []) as DeliveryRow[]) {
          if (!o.assigned_driver_id) continue;
          deliveryMap[o.assigned_driver_id] = (deliveryMap[o.assigned_driver_id] || 0) + 1;
        }
        const idSet = new Set([
          ...Object.keys(hoursMap),
          ...Object.keys(deliveryMap),
        ]);
        const rows: Entry[] = [];
        for (const id of idSet) {
          const driver = driverIndex[id] || { id, full_name: null, email: null };
          rows.push({
            driver,
            hours: hoursMap[id] || 0,
            deliveries: deliveryMap[id] || 0,
          });
        }
        // Rank by hours first, deliveries as tiebreaker.
        rows.sort((a, b) => (b.hours - a.hours) || (b.deliveries - a.deliveries));
        setEntries(rows.slice(0, 5));
        reportError(null);
      } catch (e: any) {
        if (!cancelled) {
          setEntries([]);
          reportError(e?.message || "Could not load driver leaderboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" }),
    [],
  );

  if (!companyId) return null;
  if (!loading && entries.length === 0) return null;

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="w-4 h-4 text-blue-600" />
          Leaderboard - {monthLabel}
        </CardTitle>
        <CardDescription className="text-xs">
          Top 5 drivers by hours worked, with completed deliveries as tiebreaker.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ol className="space-y-2">
            {entries.map((e, i) => (
              <li key={e.driver.id} className="flex items-center gap-3 p-2 rounded-md bg-white border border-blue-100">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-sm font-semibold text-blue-900 tabular-nums">
                  {MEDALS[i] || `#${i + 1}`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {e.driver.full_name || e.driver.email || "Unknown driver"}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {e.hours.toFixed(1)}h
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Truck className="w-3 h-3" /> {e.deliveries} delivered
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
