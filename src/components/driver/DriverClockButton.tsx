/**
 * DriverClockButton - one-tap clock-in / clock-out for the driver
 * dashboard.
 *
 * Phase 10 #10. Drivers had no in-app way to start a shift - shifts
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
 * No multiplier picker, no notes - those belong on the admin
 * LogDriverShiftModal. The driver-side experience is intentionally
 * a single tap so it gets used in the moment.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, Play, Square, Loader2 } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import {
  decideDriverClockIn,
  type DriverClockShiftRow,
} from "@/lib/driverClock";

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

const STALE_OPEN_SHIFT_HOURS = 18;

const hoursSince = (startIso: string): number => {
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, (Date.now() - start) / 3_600_000);
};

const fmtShiftStart = (startIso: string): string => {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return "the saved clock-in time";
  return d.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  // React state does not update synchronously. A ref closes the tiny window
  // where a fast double tap can start two requests before `disabled={busy}`
  // reaches the DOM.
  const actionInFlight = useRef(false);

  // Tick once a minute so the elapsed label stays roughly current.
  useEffect(() => {
    if (!openShift) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [openShift]);
  // Use tick so the eslint check stays happy + the render re-runs.
  void tick;

  const refresh = async () => {
    if (!driverId || !companyId) return;
    try {
      const { data } = await (supabase as any)
        .from("driver_shifts")
        .select("id, actual_start")
        .eq("driver_id", driverId)
        .eq("company_id", companyId)
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
      const todayIso = toLocalISO(new Date());
      const { data: planned } = await (supabase as any)
        .from("driver_shifts")
        .select("id, planned_start, planned_end")
        .eq("driver_id", driverId)
        .eq("company_id", companyId)
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
  }, [driverId, companyId]);

  // Today's shift rows through the delivery view. Errors are THROWN,
  // never swallowed - if this query failed silently the caller would
  // conclude "no row today" and INSERT, which crashes into the
  // one-per-day unique index with a cryptic duplicate-key error.
  const fetchTodayRows = async (todayIso: string) => {
    const { data, error } = await (supabase as any)
      .from("driver_shifts")
        .select("id, planned_start, actual_start, actual_end, status")
      .eq("driver_id", driverId)
      .eq("company_id", companyId)
      .eq("shift_date", todayIso)
      .is("deleted_at", null)
      .order("planned_start", { ascending: true });
    if (error) throw new Error(`Could not check today's shift: ${error.message}`);
    return (data || []) as DriverClockShiftRow[];
  };

  // Reuse only a still-open row or an unstarted roster row. Completed
  // sessions are immutable: reopening one would erase its first clock-out
  // and count the off-duty gap as paid hours. Returns true when an existing
  // row was handled, false when the caller must insert a fresh session.
  // Updates go through .select() so an
  // RLS-silenced 0-row update surfaces as an honest error instead of a
  // fake "Clocked in" toast.
  const handleExistingRow = async (
    rows: DriverClockShiftRow[],
    nowIso: string,
  ): Promise<boolean> => {
    const decision = decideDriverClockIn(rows);
    if (decision.kind === "already_open") return true;

    if (decision.kind === "start_rostered") {
      const { data, error } = await (supabase as any)
        .from("driver_shifts")
        .update({ actual_start: nowIso, status: "active" })
        .eq("id", decision.shift.id)
        // If another tab stamped the roster after our read, do not overwrite
        // its clock-in time. The 0-row result is resolved as a race below.
        .is("actual_start", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        const racedRows = await fetchTodayRows(toLocalISO(new Date()));
        if (decideDriverClockIn(racedRows).kind === "already_open") return true;
        throw new Error("Shift update was blocked. Ask your admin to check your account.");
      }
      toast({ title: "Clocked in", description: "Linked to today's rostered shift." });
      return true;
    }
    return false;
  };

  const clockIn = async () => {
    if (!driverId || !companyId) return;
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      // LOCAL date, not the UTC slice of nowIso. South Africa is
      // UTC+2, so between 00:00 and 02:00 SAST the UTC date is still
      // YESTERDAY - a blind UTC date would look at (and insert into)
      // the wrong day, missing today's roster row and crashing into
      // yesterday's on the one-per-day unique index. Rosters and the
      // planned-shift lookup in refresh() already use the local date.
      const todayIso = toLocalISO(new Date());

      // Pull today's row(s) up front so an open row is idempotent and a
      // roster row gets its actual clock-in stamp. Completed rows are not
      // reopened: a same-day second clock-in inserts another session so
      // payroll preserves the first clock-out and excludes the break.
      const rows = await fetchTodayRows(todayIso);
      if (await handleExistingRow(rows, nowIso)) {
        await refresh();
        return;
      }

      const { error } = await (supabase as any)
        .from("driver_shifts")
        .insert({
          driver_id: driverId,
          company_id: companyId,
          actual_start: nowIso,
          shift_date: todayIso,
          status: "active",
          source: "manual",
        });
      if (error) {
        // The database has a partial unique index for one OPEN delivery
        // session per driver/day. A concurrent tab can win the insert; in
        // that case re-read and treat its open row as our successful clock.
        // A completed session never qualifies for that index, so on the
        // migrated schema it is never reopened merely to hide a 23505.
        const isDuplicateDay = error.code === "23505" || /duplicate key/i.test(error.message || "");
        if (!isDuplicateDay) throw error;

        const retryRows = await fetchTodayRows(todayIso);
        if (await handleExistingRow(retryRows, nowIso)) {
          await refresh();
          return;
        }
        // Deploy-order safety: until migration 20260712120000 lands, the
        // legacy one-row-per-day index also rejects a second COMPLETED
        // session. The only clock-in the old schema can represent is the
        // legacy resume (clear actual_end), so fall back to it rather
        // than stranding the driver with an error. Post-migration a
        // completed row never triggers 23505, so this path goes dead.
        const legacyCompleted = retryRows.find((r) => r.actual_start && r.actual_end);
        if (legacyCompleted) {
          const startInFuture =
            legacyCompleted.actual_start &&
            new Date(legacyCompleted.actual_start).getTime() > Date.now();
          const patch: Record<string, unknown> = { actual_end: null, status: "active" };
          if (startInFuture) patch.actual_start = nowIso;
          const { data: resumed, error: resumeErr } = await (supabase as any)
            .from("driver_shifts")
            .update(patch)
            .eq("id", legacyCompleted.id)
            .select("id");
          if (!resumeErr && resumed && resumed.length > 0) {
            toast({ title: "Clocked back in", description: "Resumed today's shift." });
            await refresh();
            return;
          }
        }
        throw new Error(
          "A second shift could not be started. Refresh once; if it continues, ask support to check the driver clock migration.",
        );
      }
      toast({
        title: rows.some((row) => Boolean(row.actual_end)) ? "Clocked back in" : "Clocked in",
        description: rows.some((row) => Boolean(row.actual_end))
          ? "A new shift session was started; your earlier hours remain saved."
          : "Walk-in shift started (no roster on file).",
      });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not clock in", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!openShift) return;
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("driver_shifts")
        .update({ actual_end: nowIso, status: "completed" })
        .eq("id", openShift.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Clock-out was blocked. Ask your admin to check your account.");
      toast({ title: "Clocked out", description: "Shift saved." });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not clock out", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      actionInFlight.current = false;
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
    const elapsedHours = hoursSince(openShift.actual_start);
    const staleOpenShift = elapsedHours >= STALE_OPEN_SHIFT_HOURS;
    return (
      <Card className={staleOpenShift ? "border-amber-300 bg-amber-50" : "border-brand-primary/20 bg-brand-primary/5"}>
        <CardContent className="p-3 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            staleOpenShift ? "bg-amber-100" : "bg-brand-primary/10"
          }`}>
            <Clock className={`w-5 h-5 ${staleOpenShift ? "text-amber-800" : "text-brand-primary animate-pulse"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${staleOpenShift ? "text-amber-950" : "text-brand-primary"}`}>
              {staleOpenShift ? "Clock-out review needed" : "On shift"}
            </p>
            <p className={`text-xs tabular-nums ${staleOpenShift ? "text-amber-900" : "text-slate-700"}`}>
              {staleOpenShift
                ? `Open since ${fmtShiftStart(openShift.actual_start)} (${fmtElapsed(openShift.actual_start)}). Correct with admin if this was a missed clock-out.`
                : `${fmtElapsed(openShift.actual_start)} since clock in`}
            </p>
          </div>
          <Button
            size="sm"
            onClick={clockOut}
            disabled={busy}
            className={`text-white shrink-0 ${staleOpenShift ? "bg-amber-700 hover:bg-amber-800" : "bg-brand-primary hover:bg-brand-primary/90"}`}
            title={staleOpenShift ? "Clock out now only if this shift is genuinely still running." : undefined}
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Square className="w-4 h-4 mr-1" />}
            {staleOpenShift ? "Clock out now" : "Clock out"}
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
    <Card className={`${rosterLateMin > 0 ? "border-rose-300 bg-rose-50" : "border-brand-primary/20 bg-brand-primary/5"}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          rosterLateMin > 0 ? "bg-rose-100" : "bg-brand-primary/10"
        }`}>
          <Clock className={`w-5 h-5 ${rosterLateMin > 0 ? "text-rose-700" : "text-brand-primary"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${rosterLateMin > 0 ? "text-rose-900" : "text-brand-primary"}`}>
            Off shift
          </p>
          {plannedToday?.planned_start && plannedToday?.planned_end ? (
            <p className={`text-xs ${rosterLateMin > 0 ? "text-rose-800" : "text-slate-700"} flex items-center gap-1.5 flex-wrap`}>
              Rostered <strong className="tabular-nums">{plannedToday.planned_start.slice(0, 5)}-{plannedToday.planned_end.slice(0, 5)}</strong> today
              {rosterLateMin > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 text-[10px] font-bold tabular-nums">
                  {rosterLateMin}m late
                </span>
              )}
            </p>
          ) : (
            <p className="text-xs text-slate-700">Tap clock in when you start work.</p>
          )}
        </div>
        <Button
          size="sm"
          onClick={clockIn}
          disabled={busy}
          className={`shrink-0 ${rosterLateMin > 0 ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-primary hover:bg-brand-primary/90"}`}
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
          Clock in
        </Button>
      </CardContent>
    </Card>
  );
}
