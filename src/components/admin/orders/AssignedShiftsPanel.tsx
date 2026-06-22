/**
 * AssignedShiftsPanel - Wave 43 T1.
 *
 * Surfaces every kitchen_shifts row linked to an order via the
 * order_id column Wave 41 Phase 4 added. Today the column was
 * dead weight - no consumer joined orders to shifts. This card
 * gives the operator a single-glance answer to "who's rostered
 * for this order, what's their role, have they clocked in?".
 *
 * Cross-system intelligence groundwork: the next-to-do engine
 * (Wave 43 T3+) can use the same join to flag "Kitchen prep due
 * but no chef on shift" or "Driver needed for tomorrow but no
 * delivery shift covers the dispatch window".
 *
 * Self-hides when no shifts are linked to the order.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Truck, ChefHat, Sparkles, AlertTriangle, Users } from "lucide-react";

interface ShiftRow {
  id: string;
  staff_id: string | null;
  shift_type: string | null;
  shift_date: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

const TYPE_META: Record<string, { label: string; icon: any; chip: string }> = {
  delivery: { label: "Delivery", icon: Truck, chip: "bg-teal-100 text-teal-800 border-teal-300" },
  kitchen: { label: "Kitchen", icon: ChefHat, chip: "bg-orange-100 text-orange-800 border-orange-300" },
  cleaning: { label: "Cleaning", icon: Sparkles, chip: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  kitchen_and_cleaning: { label: "Kitchen + cleaning", icon: ChefHat, chip: "bg-violet-100 text-violet-800 border-violet-300" },
  general: { label: "General", icon: Users, chip: "bg-slate-100 text-slate-800 border-slate-300" },
};

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

interface Props {
  orderId: string;
  companyId: string;
  /** Wave 59 - when the parent has already batch-fetched shifts +
   *  profiles for many orders, skip the panel's own per-order fetches.
   *  Closes a 200-orders = 200-round-trips perf cliff. When omitted,
   *  the panel falls back to its own fetch (back-compat for any
   *  caller that hasn't lifted the batch up yet). */
  preloadedShifts?: ShiftRow[];
  preloadedProfiles?: Map<string, ProfileRow>;
}

export function AssignedShiftsPanel({
  orderId,
  companyId,
  preloadedShifts,
  preloadedProfiles,
}: Props) {
  const [shifts, setShifts] = useState<ShiftRow[]>(preloadedShifts || []);
  const [profileMap, setProfileMap] = useState<Map<string, ProfileRow>>(
    preloadedProfiles || new Map(),
  );
  const [loading, setLoading] = useState(!preloadedShifts);

  useEffect(() => {
    // Wave 59 - preloaded fast-path. Parent passed shifts + profiles
    // from its batch fetch; sync local state and skip the round-trips.
    if (preloadedShifts) {
      setShifts(preloadedShifts);
      setProfileMap(preloadedProfiles || new Map());
      setLoading(false);
      return;
    }
    if (!orderId || !companyId) return;
    let cancelled = false;
    (async () => {
      const { data: shiftRows, error: shiftError } = await (supabase as any)
        .from("kitchen_shifts")
        .select("id, staff_id, shift_type, shift_date, planned_start, planned_end, actual_start, actual_end, status")
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .order("planned_start", { ascending: true });
      if (shiftError) {
        console.error("[AssignedShiftsPanel] kitchen_shifts fetch failed:", shiftError);
      }
      if (cancelled) return;
      const rows = (shiftRows || []) as ShiftRow[];
      setShifts(rows);
      // Pull profile names in one batch.
      const ids = Array.from(new Set(rows.map((r) => r.staff_id).filter(Boolean) as string[]));
      if (ids.length > 0) {
        const { data: profileRows, error: profileError } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        if (profileError) {
          console.error("[AssignedShiftsPanel] profiles fetch failed:", profileError);
        }
        if (cancelled) return;
        const m = new Map<string, ProfileRow>();
        for (const p of (profileRows || []) as ProfileRow[]) m.set(p.id, p);
        setProfileMap(m);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, companyId, preloadedShifts, preloadedProfiles]);

  if (loading) return null;
  if (shifts.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Assigned shifts ({shifts.length})
        </span>
      </div>
      <div className="space-y-1.5">
        {shifts.map((s) => {
          const meta = TYPE_META[s.shift_type || "general"] || TYPE_META.general;
          const Icon = meta.icon;
          const profile = s.staff_id ? profileMap.get(s.staff_id) : null;
          const name = profile?.full_name || profile?.email || "Unassigned";
          const todayIso = new Date().toISOString().slice(0, 10);
          const isMissed =
            s.status === "missed" ||
            (s.shift_date && s.shift_date < todayIso && !s.actual_start && s.status === "scheduled");
          const hasActual = !!s.actual_start;
          // Clocked OUT once the shift has an end stamp or is marked
          // completed - otherwise a finished shift kept reading "Clocked in"
          // forever (the label only looked at actual_start).
          const clockedOut = !!s.actual_end || s.status === "completed";
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded bg-white px-2 py-1.5 text-xs"
            >
              <Badge
                variant="outline"
                className={`${meta.chip} text-[10px] inline-flex items-center gap-1`}
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </Badge>
              <span className="font-medium text-slate-900 truncate">{name}</span>
              {s.planned_start && (
                <span className="text-slate-500 tabular-nums">
                  {fmtTime(s.planned_start)} - {fmtTime(s.planned_end)}
                </span>
              )}
              {hasActual && !isMissed && (
                clockedOut
                  ? <span className="text-slate-500 text-[10px]">Clocked out</span>
                  : <span className="text-emerald-700 text-[10px]">Clocked in</span>
              )}
              {isMissed && (
                <span className="text-red-700 text-[10px] inline-flex items-center gap-0.5 font-medium">
                  <AlertTriangle className="w-3 h-3" /> Missed
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
