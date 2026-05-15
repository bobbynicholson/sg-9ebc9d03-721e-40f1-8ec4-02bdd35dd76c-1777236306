/**
 * DriverClockButton -- one-tap clock-in / clock-out for the driver
 * dashboard.
 *
 * Phase 10 #10. Drivers had no in-app way to start a shift -- shifts
 * were either logged manually by admins via /admin/driver-management
 * after the fact, or back-dated by the driver via the settlement
 * page. Both broke the 'real-time clock' promise the BCEA fatigue
 * checks (Phase 7 #2) depend on.
 *
 * Behaviour:
 *   - On mount, query the driver's open shift (deleted_at IS NULL,
 *     actual_end IS NULL) to figure out what state to render.
 *   - If no open shift: big green 'Clock in' button. On click, INSERT
 *     a new driver_shifts row with actual_start = now, status =
 *     'active'.
 *   - If an open shift exists: amber 'Clock out (Xh Ym)' button + an
 *     auto-ticking elapsed counter. On click, UPDATE actual_end = now,
 *     status = 'completed'.
 *
 * No multiplier picker, no notes -- those belong on the admin
 * LogDriverShiftModal. The driver-side experience is intentionally
 * a single tap so it gets used in the moment.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, Play, Square, Loader2 } from "lucide-react";

interface OpenShift {
  id: string;
  actual_start: string;
}

interface PlannedToday {
  id: string;
  planned_start: string | null;
  planned_end: string | null;
}

const fmtElapsed = (startIso: string): string => {
  const ms = Date.now() - new Date(startIso).getTime();
  if (ms < 0 || isNaN(ms)) return "0m";
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export function DriverClockButton({
  driverId,
  companyId,
}: {
  driverId: string | null | undefined;
  companyId: string | null | undefined;
}) {
  const { toast } = useToast();
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [plannedToday, setPlannedToday] = useState<PlannedToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // Tick once a minute so the elapsed label stays roughly current.
  useEffect(() => {
    if (!openShift) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [openShift]);
  // Use tick so the eslint check stays happy + the render re-runs.
  void tick;

  const refresh = async () => {
    if (!driverId) return;
    try {
      const { data } = await (supabase as any)
        .from("driver_shifts")
        .select("id, actual_start")
        .eq("driver_id", driverId)
        .is("deleted_at", null)
        .is("actual_end", null)
        .not("actual_start", "is", null)
        .order("actual_start", { ascending: false })
        .limit(1);
      const row = (data && data[0]) as OpenShift | undefined;
      setOpenShift(row || null);

      // Wave 37: also pull today's planned shift (if any). Surfaced
      // on the off-shift state so the driver sees "Rostered 06:00-15:00
      // today" and on the on-shift state so they know what's expected
      // of them. No-op for walk-in drivers with no roster.
      const todayIso = new Date().toISOString().slice(0, 10);
      const { data: planned } = await (supabase as any)
        .from("driver_shifts")
        .select("id, planned_start, planned_end")
        .eq("driver_id", driverId)
        .eq("shift_date", todayIso)
        .is("deleted_at", null)
        .not("planned_start", "is", null)
        .order("planned_start", { ascending: true })
        .limit(1);
      const plannedRow = (planned && planned[0]) as PlannedToday | undefined;
      setPlannedToday(plannedRow || null);
    } catch {
      setOpenShift(null);
      setPlannedToday(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

  const clockIn = async () => {
    if (!driverId || !companyId) return;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const todayIso = nowIso.slice(0, 10);

      // Wave 37: prefer to STAMP onto today's planned shift if one
      // exists (admin rostered the driver for today), otherwise
      // INSERT a fresh walk-in shift row. Without this, every
      // clock-in spawned a second row -- the roster row stayed
      // forever in 'scheduled' state and the schedule grid showed
      // a phantom no-show next to the actual hours. Mirrors the
      // pattern Wave 36.1 added on /team-portal/kitchen/duty.
      const { data: planned } = await (supabase as any)
        .from("driver_shifts")
        .select("id, actual_start, status")
        .eq("driver_id", driverId)
        .eq("company_id", companyId)
        .eq("shift_date", todayIso)
        .is("deleted_at", null)
        .is("actual_start", null)
        .order("planned_start", { ascending: true })
        .limit(1);
      const plannedRow = planned && planned[0];

      if (plannedRow?.id) {
        const { error } = await (supabase as any)
          .from("driver_shifts")
          .update({ actual_start: nowIso, status: "active" })
          .eq("id", plannedRow.id);
        if (error) throw error;
        toast({ title: "Clocked in", description: "Linked to today's rostered shift." });
      } else {
        const { error } = await (supabase as any)
          .from("driver_shifts")
          .insert({
            driver_id: driverId,
            company_id: companyId,
            actual_start: nowIso,
            shift_date: todayIso,
            status: "active",
          });
        if (error) throw error;
        toast({ title: "Clocked in", description: "Walk-in shift started (no roster on file)." });
      }
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not clock in", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!openShift) return;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("driver_shifts")
        .update({ actual_end: nowIso, status: "completed" })
        .eq("id", openShift.id);
      if (error) throw error;
      toast({ title: "Clocked out", description: "Shift saved." });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not clock out", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-3 text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking shift...
        </CardContent>
      </Card>
    );
  }

  if (openShift) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-700 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">On shift</p>
            <p className="text-xs text-amber-800/80 tabular-nums">
              {fmtElapsed(openShift.actual_start)} since clock in
            </p>
          </div>
          <Button
            size="sm"
            onClick={clockOut}
            disabled={busy}
            className="bg-amber-600 hover:bg-amber-700 shrink-0"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Square className="w-4 h-4 mr-1" />}
            Clock out
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Wave 37: lateness detector for the off-shift state. If the
  // driver was rostered for 06:00 and it's now 06:23 with no
  // clock-in, show a red "23m late" chip alongside the schedule
  // line so they (and any glancing dispatch lead) see it.
  const rosterLateMin = (() => {
    if (!plannedToday?.planned_start) return 0;
    const [h, m] = plannedToday.planned_start.split(":").map(Number);
    if (Number.isNaN(h)) return 0;
    const planned = new Date();
    planned.setHours(h, m || 0, 0, 0);
    const diff = Math.floor((Date.now() - planned.getTime()) / 60000);
    // 240 cap = stop showing once we're 4h past, after which the
    // missed-clock-in cron auto-promotes to status='missed' anyway.
    return diff > 0 && diff < 240 ? diff : 0;
  })();

  return (
    <Card className={`${rosterLateMin > 0 ? "border-rose-300 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          rosterLateMin > 0 ? "bg-rose-100" : "bg-emerald-100"
        }`}>
          <Clock className={`w-5 h-5 ${rosterLateMin > 0 ? "text-rose-700" : "text-emerald-700"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${rosterLateMin > 0 ? "text-rose-900" : "text-emerald-900"}`}>
            Off shift
          </p>
          {plannedToday?.planned_start && plannedToday?.planned_end ? (
            <p className={`text-xs ${rosterLateMin > 0 ? "text-rose-800" : "text-emerald-800/80"} flex items-center gap-1.5 flex-wrap`}>
              Rostered <strong className="tabular-nums">{plannedToday.planned_start.slice(0, 5)}-{plannedToday.planned_end.slice(0, 5)}</strong> today
              {rosterLateMin > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 text-[10px] font-bold tabular-nums">
                  {rosterLateMin}m late
                </span>
              )}
            </p>
          ) : (
            <p className="text-xs text-emerald-800/80">Tap clock in when you start work.</p>
          )}
        </div>
        <Button
          size="sm"
          onClick={clockIn}
          disabled={busy}
          className={`shrink-0 ${rosterLateMin > 0 ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
          Clock in
        </Button>
      </CardContent>
    </Card>
  );
}
