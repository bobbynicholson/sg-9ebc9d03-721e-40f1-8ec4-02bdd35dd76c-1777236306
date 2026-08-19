/**
 * DriverLeaderboardStrip
 *
 * Compact leaderboard shown on the driver portal dashboard.
 * Shows top-5 drivers this month by deliveries + hours,
 * with the current user's row highlighted.
 *
 * Intentionally lightweight: reads the same driver_shifts +
 * orders tables the admin DriverLeaderboard uses but renders
 * as a horizontal scrollable strip rather than a full card,
 * keeping the driver dashboard uncluttered.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonthIso } from "@/lib/dashboardWindows";

interface Entry {
  driver_id: string;
  name: string;
  deliveries: number;
  hours: number;
}

interface Props {
  companyId: string | null | undefined;
  currentUserId: string | null | undefined;
}

const MEDALS = ["🥇", "🥈", "🥉"];

function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return (e - s) / 3_600_000;
}

export function DriverLeaderboardStrip({ companyId, currentUserId }: Props) {
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

        const drivers = (driversRes.data || []) as Array<{ id: string; full_name: string | null; email: string | null }>;
        const driverIndex: Record<string, string> = {};
        for (const d of drivers) {
          driverIndex[d.id] = d.full_name || d.email?.split("@")[0] || "Driver";
        }

        const hoursMap: Record<string, number> = {};
        for (const s of (shiftsRes.data || []) as Array<{ driver_id: string; actual_start: string | null; actual_end: string | null }>) {
          hoursMap[s.driver_id] = (hoursMap[s.driver_id] || 0) + hoursBetween(s.actual_start, s.actual_end);
        }

        const deliveryMap: Record<string, number> = {};
        for (const o of (deliveriesRes.data || []) as Array<{ assigned_driver_id: string }>) {
          if (!o.assigned_driver_id) continue;
          deliveryMap[o.assigned_driver_id] = (deliveryMap[o.assigned_driver_id] || 0) + 1;
        }

        const idSet = new Set([
          ...Object.keys(hoursMap),
          ...Object.keys(deliveryMap),
          // Always include current user even if they have no activity yet
          ...(currentUserId ? [currentUserId] : []),
        ]);

        const rows: Entry[] = [];
        for (const id of idSet) {
          rows.push({
            driver_id: id,
            name: driverIndex[id] || "Driver",
            hours: hoursMap[id] || 0,
            deliveries: deliveryMap[id] || 0,
          });
        }

        rows.sort((a, b) => (b.deliveries - a.deliveries) || (b.hours - a.hours));
        setEntries(rows.slice(0, 5));
      } catch (e) {
        console.warn("[DriverLeaderboardStrip] fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [companyId, currentUserId]);

  // Don't render if no data or only 1 driver (no competition)
  if (!companyId || (!loading && entries.length <= 1)) return null;

  const monthLabel = new Date().toLocaleDateString("en-ZA", { month: "long" });
  const myRank = entries.findIndex((e) => e.driver_id === currentUserId);

  return (
    <div className="mb-4 sm:mb-6 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {monthLabel} leaderboard
        </span>
        {myRank >= 0 && (
          <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
            You&apos;re #{myRank + 1}
          </span>
        )}
      </div>

      {/* Scrollable entries */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex gap-3 px-4 py-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-shrink-0 w-24 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex gap-2 px-4 py-3">
            {entries.map((entry, idx) => {
              const isMe = entry.driver_id === currentUserId;
              return (
                <div
                  key={entry.driver_id}
                  className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl px-3 py-2.5 min-w-[80px] border transition-colors ${
                    isMe
                      ? "bg-brand-primary/10 border-brand-primary/30 dark:bg-brand-primary/15 dark:border-brand-primary/40"
                      : "bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700"
                  }`}
                >
                  <span className="text-lg leading-none mb-1">
                    {MEDALS[idx] || `#${idx + 1}`}
                  </span>
                  <span
                    className={`text-[11px] font-semibold truncate max-w-[72px] text-center ${
                      isMe ? "text-brand-primary" : "text-slate-700 dark:text-slate-300"
                    }`}
                    title={entry.name}
                  >
                    {isMe ? "You" : entry.name.split(" ")[0]}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                    {entry.deliveries} drop{entry.deliveries !== 1 ? "s" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
