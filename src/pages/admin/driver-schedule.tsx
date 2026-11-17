/**
 * /admin/driver-schedule - weekly grid view of every driver's
 * shifts for the selected week.
 *
 * Phase 9 #8. Until now, the dispatch lead had to open each
 * driver one at a time on /admin/driver-management to see who
 * was on shift when. There was no single screen showing the
 * whole team's coverage for the week, which made it painful to
 * spot Sunday gaps or double-booked drivers.
 *
 * Read-only at the row level. Clicking any empty cell opens
 * LogDriverShiftModal pre-targeted at that driver - so the
 * grid acts as both a bird's-eye view and a quick-add surface.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
  StatTile,
} from "@/components/portal/ui";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus, Loader2, Download, RefreshCw, AlertTriangle, Users, Clock, UserPlus } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { LogDriverShiftModal, type ExistingShiftForEdit } from "@/components/admin/LogDriverShiftModal";
import { ShiftTasksChips } from "@/components/admin/ShiftTasksChips";
import { WhatsAppTemplateSend } from "@/components/messaging/WhatsAppTemplateSend";
import { WhatsAppManualStaffSend } from "@/components/messaging/WhatsAppManualStaffSend";
import { formatDate } from "@/lib/formatters";
import { AddShiftTaskModal } from "@/components/admin/AddShiftTaskModal";
import {
  listTasksForShifts,
  type ShiftTaskRow,
} from "@/services/staffShiftTasksService";

interface Driver {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string | null;
  mobile_number?: string | null;
}

interface ShiftRow {
  id: string;
  driver_id: string;
  shift_date: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  rate_multiplier: number | null;
  notes: string | null;
}

function plannedHoursFromTime(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date): Date {
  // ISO week, Monday = 0. Local time so DST doesn't shift the boundary.
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (out.getDay() + 6) % 7; // Mon=0, Sun=6
  out.setDate(out.getDate() - day);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

function fmtHours(start: string | null, end: string | null): { hours: number; label: string } {
  if (!start || !end) return { hours: 0, label: "" };
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return { hours: 0, label: "" };
  const h = (e - s) / 3_600_000;
  return { hours: h, label: `${h.toFixed(1)}h` };
}

function DriverScheduleGrid() {
  const { user } = useAuth() as any;
  const companyId = user?.company_id;
  const { withSlug } = useTenantHref();
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Command-centre audit: a failed load previously blanked the grid
  // into "No drivers in this company yet", which reads as an empty
  // roster rather than an outage. Persist the failure + offer Retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logTarget, setLogTarget] = useState<{ driverId: string; driverName: string } | null>(null);
  // Wave 70.12 - edit-mode target. When set, opens LogDriverShiftModal
  // pre-filled with the existing shift's actual_start / actual_end /
  // notes / multiplier so an admin can adjust or delete the row.
  const [editTarget, setEditTarget] = useState<{
    driverId: string;
    driverName: string;
    shift: ExistingShiftForEdit;
  } | null>(null);
  // Wave 42 Tier 2: per-shift task chips. Mirrors kitchen + cleaning
  // schedule grids so a driver shift can carry typed tasks
  // (delivery / waitering / setup / breakdown / etc).
  const [tasksByShift, setTasksByShift] = useState<Map<string, ShiftTaskRow[]>>(new Map());
  const [addTaskTarget, setAddTaskTarget] = useState<{ shiftId: string; assignedUserId: string | null } | null>(null);
  const todayIso = useMemo(() => toLocalISO(new Date()), []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const fromIso = toLocalISO(weekStart);
      const toIso = toLocalISO(addDays(weekStart, 6));
      const [driversRes, shiftsRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("id, full_name, email, phone_number, mobile_number")
          .eq("company_id", companyId)
          .eq("role", "driver")
          .is("deleted_at", null)
          .order("full_name", { ascending: true }),
        (supabase as any)
          .from("driver_shifts")
          .select("id, driver_id, shift_date, planned_start, planned_end, actual_start, actual_end, status, rate_multiplier, notes")
          .eq("company_id", companyId)
          .gte("shift_date", fromIso)
          .lte("shift_date", toIso)
          .is("deleted_at", null),
      ]);
      // supabase-js never throws on a query error; it returns it on the
      // result. The old catch-only handling meant a rejected filter fell
      // through as data=null and the grid silently read as an empty
      // roster forever.
      if (driversRes.error) throw driversRes.error;
      if (shiftsRes.error) throw shiftsRes.error;
      setDrivers((driversRes.data || []) as Driver[]);
      const shiftRows = (shiftsRes.data || []) as ShiftRow[];
      setShifts(shiftRows);
      const shiftIds = shiftRows.map((s) => s.id);
      if (shiftIds.length > 0) {
        const taskMap = await listTasksForShifts(supabase as any, shiftIds);
        setTasksByShift(taskMap);
      } else {
        setTasksByShift(new Map());
      }
    } catch (e: any) {
      console.error("[driver-schedule] load failed:", e);
      setLoadError(e?.message || "Could not load the schedule. Check your connection and try again.");
      setDrivers([]);
      setShifts([]);
      setTasksByShift(new Map());
    } finally {
      setLoading(false);
    }
  };

  const refreshTasks = async () => {
    const shiftIds = shifts.map((s) => s.id);
    if (shiftIds.length === 0) return;
    try {
      const taskMap = await listTasksForShifts(supabase as any, shiftIds);
      setTasksByShift(taskMap);
    } catch (e) {
      // Chips keep their last-known state; a failed refresh must not
      // reject unhandled out of the modal's onChanged callback.
      console.warn("[driver-schedule] task refresh failed:", e);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, weekStart]);

  // Index shifts by driver_id + shift_date so the grid lookup is O(1).
  const shiftIndex = useMemo(() => {
    const map: Record<string, ShiftRow[]> = {};
    for (const s of shifts) {
      const key = `${s.driver_id}|${s.shift_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [shifts]);

  // One hours definition for every total on the page: planned hours
  // when a roster window exists, else actual clocked hours. Pre-audit
  // the per-driver Total column summed planned hours only while the
  // Day total footer summed actual hours only, so the two axes of the
  // same grid disagreed whenever a shift had one but not the other.
  const shiftHours = (s: ShiftRow): number => {
    const planned = plannedHoursFromTime(s.planned_start, s.planned_end);
    return planned > 0 ? planned : fmtHours(s.actual_start, s.actual_end).hours;
  };

  // Per-day total hours across all drivers - footer row.
  const dayTotals = useMemo(() => {
    return weekDays.map((d) => {
      const iso = toLocalISO(d);
      let h = 0;
      for (const s of shifts) {
        if (s.shift_date !== iso) continue;
        h += shiftHours(s);
      }
      return h;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, weekDays]);

  const weekLabel = `${weekStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} - ${addDays(weekStart, 6).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`;

  // Command-centre restructure: aggregate strip fed by the loaded week.
  // Missed = flagged missed, or a past scheduled shift with no clock-in.
  const missedCount = useMemo(
    () => shifts.filter(
      (s) => s.status === "missed"
        || (s.shift_date < todayIso && !s.actual_start && s.status === "scheduled"),
    ).length,
    [shifts, todayIso],
  );
  const weekHours = dayTotals.reduce((a, b) => a + b, 0);

  return (
    <>
      <Head><title>Driver schedule - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Driver schedule"
            icon={Calendar}
            subtitle="Plan driver shifts and review their recorded hours."
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {drivers.length} driver{drivers.length === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    {shifts.length} shift{shifts.length === 1 ? "" : "s"} this week
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    {weekHours.toFixed(1)}h rostered
                  </span>
                </>
              ) : undefined
            }
            actions={
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-start">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeekStart(addDays(weekStart, -7))}
                    aria-label="Previous week"
                    title="Previous week"
                    className="h-10 w-10 shrink-0 justify-center p-0 sm:h-9"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0 flex-1 px-1 text-center text-xs font-medium tabular-nums text-white sm:flex-initial sm:px-2 sm:text-sm sm:whitespace-nowrap">{weekLabel}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                    aria-label="Next week"
                    title="Next week"
                    className="h-10 w-10 shrink-0 justify-center p-0 sm:h-9"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart(startOfWeek(new Date()))}
                  aria-label="Go to this week"
                  title="This week"
                  className="h-10 w-10 justify-center p-0 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only sm:inline">This week</span>
                </Button>
                {/* Phase 28 #8: manual refresh. A dispatcher who
                    has just logged a shift from another tab or
                    fielded a swap request needs to pull the
                    grid without flipping the week chevron back
                    and forth. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={load}
                  disabled={loading}
                  aria-label="Refresh driver schedule"
                  title="Refresh schedule"
                  className="h-10 w-10 justify-center p-0 sm:h-9 sm:w-auto sm:px-3"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  <span className="sr-only sm:not-sr-only sm:inline">Refresh</span>
                </Button>
                {/* Phase 22 #2: weekly grid CSV. Dispatch leads
                    handing off the schedule to a colleague or
                    printing it for the dispatch board needed a flat
                    list rather than a screenshot. One row per
                    driver-day with hours + status. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-10 justify-center p-0 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
                  aria-label="Export driver schedule as CSV"
                  title="Export CSV"
                  onClick={() => {
                    if (drivers.length === 0) return;
                    const esc = (v: any) => {
                      if (v == null) return "";
                      const s = String(v).replace(/"/g, '""');
                      return /[",\n]/.test(s) ? `"${s}"` : s;
                    };
                    const headers = ["Driver", "Email", "Day", "Date", "Hours", "Status", "Rate multiplier"];
                    const lines = [headers.join(",")];
                    for (const d of drivers) {
                      for (let i = 0; i < weekDays.length; i++) {
                        const day = weekDays[i];
                        const iso = toLocalISO(day);
                        const dayShifts = shiftIndex[`${d.id}|${iso}`] || [];
                        if (dayShifts.length === 0) continue;
                        for (const s of dayShifts) {
                          // Same planned-else-actual definition as the
                          // grid totals so the export matches the screen.
                          const hours = shiftHours(s);
                          lines.push([
                            esc(d.full_name || ""),
                            esc(d.email || ""),
                            esc(DAY_LABELS[i]),
                            esc(iso),
                            esc(hours.toFixed(2)),
                            esc(s.status || ""),
                            esc(s.rate_multiplier ?? 1),
                          ].join(","));
                        }
                      }
                    }
                    if (lines.length === 1) return;
                    // UTF-8 BOM so Excel-ZA opens the file as UTF-8,
                    // matching the CSV exports on calendar / regions /
                    // route-planning.
                    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `driver-schedule-${toLocalISO(weekStart)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  disabled={drivers.length === 0 || shifts.length === 0}
                >
                  <Download className="h-4 w-4" /><span className="sr-only sm:not-sr-only sm:inline">Export CSV</span>
                </Button>
                </div>
              </div>
            }
          />
          <PageWorkbench />

          {/* Surfaced load failure with Retry; pre-audit a failed fetch
              rendered as "No drivers in this company yet". */}
          {loadError && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4">
              <h2 className="mb-1 text-sm font-bold text-rose-900 sm:text-base">Couldn&apos;t load the schedule</h2>
              <p className="mb-3 break-words text-xs leading-5 text-slate-600 sm:text-sm">{loadError}</p>
              <Button onClick={load} size="sm" disabled={loading} aria-label="Retry loading the schedule" className="min-h-10 bg-brand-primary hover:bg-brand-primary/90">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {/* Command-centre restructure: live weekly aggregates. Missed
              stays semantic (rose when non-zero, never brand). */}
          {!loadError && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-4 lg:grid-cols-4">
              <StatTile compact
                label="Drivers"
                value={loading ? "-" : drivers.length}
                hint="Active driver roster"
                icon={Users}
              />
              <StatTile compact
                label="Shifts this week"
                value={loading ? "-" : shifts.length}
                hint={`Week of ${weekLabel}`}
                icon={Calendar}
              />
              <StatTile compact
                label="Hours rostered"
                value={loading ? "-" : `${weekHours.toFixed(1)}h`}
                hint="Planned hours, else actual clocked"
                icon={Clock}
              />
              <StatTile compact
                label="Missed shifts"
                value={
                  loading ? "-" : (
                    <span className={missedCount > 0 ? "text-rose-600 dark:text-rose-400" : undefined}>
                      {missedCount}
                    </span>
                  )
                }
                hint={missedCount > 0 ? "Scheduled but never clocked in" : "No missed shifts this week"}
                icon={AlertTriangle}
              />
            </div>
          )}

            <Card>
              <CardHeader className="px-3 pb-3 pt-4 sm:px-6">
                <CardTitle className="text-sm sm:text-base">
                  {drivers.length} driver{drivers.length === 1 ? "" : "s"}
                </CardTitle>
                <CardDescription className="text-xs leading-5">
                  Expand a driver to review their week. Totals use planned hours where set, otherwise actual. Choose an empty day to log a shift.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
                {loading ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
                  </div>
                ) : loadError ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    Schedule unavailable. Use Retry above.
                  </div>
                ) : drivers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700 mb-1">No drivers yet</p>
                    <p className="text-xs text-slate-500 mb-4">
                      Add a driver and their shifts will show up on this weekly grid.
                    </p>
                    <Button asChild size="sm" className="bg-brand-primary hover:bg-brand-primary/90">
                      <Link href={withSlug("/admin/driver-management")}>
                        <UserPlus className="w-4 h-4 mr-2" /> Add a driver
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Keep each driver's week collapsed initially so the
                        roster stays scan-friendly on phones. */}
                    <div className="space-y-4 md:hidden">
                      <p className="text-xs text-slate-500">
                        Expand a driver to see their days. Tap a shift to edit or an empty day to add one.
                      </p>
                      {drivers.map((d) => {
                        const driverTotal = weekDays.reduce((total, day) => (
                          total + (shiftIndex[`${d.id}|${toLocalISO(day)}`] || []).reduce(
                            (dayTotal, shift) => dayTotal + shiftHours(shift),
                            0,
                          )
                        ), 0);
                        const driverShiftCount = weekDays.reduce(
                          (count, day) => count + (shiftIndex[`${d.id}|${toLocalISO(day)}`] || []).length,
                          0,
                        );
                        return (
                          <details key={d.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-left [&::-webkit-details-marker]:hidden">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{d.full_name || d.email}</p>
                                <p className="truncate text-xs text-slate-500">{driverShiftCount} shift{driverShiftCount === 1 ? "" : "s"} this week · {d.email}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-xs font-semibold tabular-nums text-slate-700">{driverTotal > 0 ? `${driverTotal.toFixed(1)}h` : "-"}</span>
                                <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
                              </div>
                            </summary>
                            <div id={`driver-week-${d.id}`} className="grid grid-cols-1 gap-2 border-t border-slate-100 p-2 min-[390px]:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
                              {weekDays.map((day, i) => {
                                const iso = toLocalISO(day);
                                const cellShifts = shiftIndex[`${d.id}|${iso}`] || [];
                                const isPastDay = iso < todayIso;
                                const dayHours = cellShifts.reduce((total, shift) => total + shiftHours(shift), 0);
                                return (
                                  <div key={iso} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold text-slate-800">{DAY_LABELS[i]}</p>
                                        <p className="text-xs text-slate-500">
                                          {day.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                        </p>
                                      </div>
                                      {dayHours > 0 && (
                                        <span className="text-xs font-semibold tabular-nums text-slate-700">{dayHours.toFixed(1)}h</span>
                                      )}
                                    </div>
                                    {cellShifts.length > 0 ? (
                                      <div className="space-y-2">
                                        {cellShifts.map((s) => {
                                          const actualHours = fmtHours(s.actual_start, s.actual_end).hours;
                                          const hasActual = !!s.actual_start;
                                          const isMissed = s.status === "missed" || (isPastDay && !s.actual_start && s.status === "scheduled");
                                          const plannedHours = plannedHoursFromTime(s.planned_start, s.planned_end);
                                          return (
                                            <div
                                              key={s.id}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => setEditTarget({
                                                driverId: d.id,
                                                driverName: d.full_name || d.email,
                                                shift: {
                                                  id: s.id,
                                                  actual_start: s.actual_start,
                                                  actual_end: s.actual_end,
                                                  notes: s.notes,
                                                  rate_multiplier: s.rate_multiplier,
                                                },
                                              })}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  setEditTarget({
                                                    driverId: d.id,
                                                    driverName: d.full_name || d.email,
                                                    shift: {
                                                      id: s.id,
                                                      actual_start: s.actual_start,
                                                      actual_end: s.actual_end,
                                                      notes: s.notes,
                                                      rate_multiplier: s.rate_multiplier,
                                                    },
                                                  });
                                                }
                                              }}
                                              title="Tap to edit or delete this shift"
                                              className={`cursor-pointer rounded-md border px-2.5 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/50 ${
                                                isMissed
                                                  ? "border-rose-200 bg-rose-50"
                                                  : "border-brand-primary/20 bg-brand-primary/10"
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-2">
                                                <span className={`min-w-0 break-words text-xs font-semibold tabular-nums ${isMissed ? "text-rose-900" : "text-brand-primary"}`}>
                                                  {s.planned_start
                                                    ? `${fmtTime(s.planned_start)}-${fmtTime(s.planned_end)}`
                                                    : `${actualHours.toFixed(1)}h`}
                                                </span>
                                                {(s.rate_multiplier ?? 1) > 1 && (
                                                  <Badge className="shrink-0 border-amber-200 bg-amber-100 px-1 py-0 text-xs text-amber-800">
                                                    x{Number(s.rate_multiplier ?? 1)}
                                                  </Badge>
                                                )}
                                              </div>
                                              {hasActual ? (
                                                <p className="mt-0.5 text-xs tabular-nums text-brand-primary">Actual {actualHours.toFixed(1)}h</p>
                                              ) : isMissed ? (
                                                <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-rose-700">
                                                  <AlertTriangle className="h-3 w-3" /> Missed
                                                </p>
                                              ) : (
                                                <p className="mt-0.5 text-xs tabular-nums text-brand-primary">{plannedHours.toFixed(1)}h planned</p>
                                              )}
                                              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                <ShiftTasksChips
                                                  tasks={tasksByShift.get(s.id) || []}
                                                  onAddClick={() => setAddTaskTarget({ shiftId: s.id, assignedUserId: s.driver_id })}
                                                  onChanged={refreshTasks}
                                                />
                                              </div>
                                              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                <WhatsAppTemplateSend
                                                  entityType="driver_shift"
                                                  entityId={s.id}
                                                  companyId={companyId}
                                                  recipientName={d.full_name || d.email}
                                                  buttonLabel="Send shift message"
                                                  iconOnly
                                                />
                                                <WhatsAppManualStaffSend
                                                  messageKey="whatsapp_staff_schedule_change"
                                                  recipientName={d.full_name || d.email}
                                                  recipientPhone={d.mobile_number || d.phone_number}
                                                  variables={{ shift_date: formatDate(s.shift_date, { year: true }) }}
                                                  buttonLabel="Shift changed"
                                                  iconOnly
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setLogTarget({ driverId: d.id, driverName: d.full_name || d.email })}
                                        className="flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 text-xs font-medium text-slate-500 transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5 hover:text-brand-primary"
                                        title="Log a shift on this day"
                                      >
                                        <Plus className="h-3.5 w-3.5" /> Add shift
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>

                    <details className="group hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Full weekly grid</span>
                        <span className="block text-xs text-slate-500">Expand to scan all seven days</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="sticky left-0 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Driver
                          </th>
                          {weekDays.map((d, i) => (
                            <th key={i} className="min-w-[88px] px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                              <div>{DAY_LABELS[i]}</div>
                              <div className="text-xs text-slate-500 tabular-nums">
                                {d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                              </div>
                            </th>
                          ))}
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drivers.map((d) => {
                          let driverTotal = 0;
                          return (
                            <tr key={d.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                              <td className="px-3 py-2 sticky left-0 bg-white">
                                <div className="font-medium text-slate-900 truncate">{d.full_name || d.email}</div>
                                <div className="truncate text-xs text-slate-500">{d.email}</div>
                              </td>
                              {weekDays.map((day, i) => {
                                const iso = toLocalISO(day);
                                const cellShifts = shiftIndex[`${d.id}|${iso}`] || [];
                                // Wave 42 Tier 2: track planned hours (not just actual) so the
                                // grid totals reflect rostered coverage, matching kitchen +
                                // cleaning grids.
                                const totalPlanned = cellShifts.reduce(
                                  (acc, s) => acc + shiftHours(s),
                                  0,
                                );
                                driverTotal += totalPlanned;
                                const hasShift = cellShifts.length > 0;
                                const isPastDay = iso < todayIso;
                                return (
                                  <td key={i} className="px-1.5 py-1.5 text-center align-top">
                                    {hasShift ? (
                                      <div className="space-y-0.5">
                                        {cellShifts.map((s) => {
                                          const aHours = fmtHours(s.actual_start, s.actual_end).hours;
                                          const hasActual = !!s.actual_start;
                                          const isMissed = s.status === "missed" || (isPastDay && !s.actual_start && s.status === "scheduled");
                                          const pHours = plannedHoursFromTime(s.planned_start, s.planned_end);
                                          return (
                                            <div
                                              key={s.id}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => setEditTarget({
                                                driverId: d.id,
                                                driverName: d.full_name || d.email,
                                                shift: {
                                                  id: s.id,
                                                  actual_start: s.actual_start,
                                                  actual_end: s.actual_end,
                                                  notes: s.notes,
                                                  rate_multiplier: s.rate_multiplier,
                                                },
                                              })}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  setEditTarget({
                                                    driverId: d.id,
                                                    driverName: d.full_name || d.email,
                                                    shift: {
                                                      id: s.id,
                                                      actual_start: s.actual_start,
                                                      actual_end: s.actual_end,
                                                      notes: s.notes,
                                                      rate_multiplier: s.rate_multiplier,
                                                    },
                                                  });
                                                }
                                              }}
                                              title="Click to edit or delete this shift"
                                              className={`rounded-md border px-2 py-1.5 text-left cursor-pointer hover:shadow-sm hover:brightness-105 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                                isMissed
                                                  ? "border-rose-200 bg-rose-50"
                                                  : hasActual
                                                    ? "border-brand-primary/20 bg-brand-primary/10"
                                                    : "border-brand-primary/20 bg-brand-primary/10"
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-1">
                                                <span className={`text-xs font-semibold tabular-nums ${
                                                  isMissed ? "text-rose-900" :
                                                  hasActual ? "text-brand-primary" :
                                                              "text-brand-primary"
                                                }`}>
                                                  {s.planned_start
                                                    ? `${fmtTime(s.planned_start)}-${fmtTime(s.planned_end)}`
                                                    : `${aHours.toFixed(1)}h`}
                                                </span>
                                                {(s.rate_multiplier ?? 1) > 1 && (
                                                  <Badge className="border-amber-200 bg-amber-100 px-1 py-0 text-xs text-amber-800">
                                                    x{Number(s.rate_multiplier ?? 1)}
                                                  </Badge>
                                                )}
                                              </div>
                                              {hasActual ? (
                                                <div className="mt-0.5 text-xs tabular-nums text-brand-primary">
                                                  Actual {aHours.toFixed(1)}h
                                                </div>
                                              ) : isMissed ? (
                                                <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-rose-700">
                                                  <AlertTriangle className="h-3 w-3" /> Missed
                                                </div>
                                              ) : (
                                                <div className="mt-0.5 text-xs tabular-nums text-brand-primary">
                                                  {pHours.toFixed(1)}h planned
                                                </div>
                                              )}
                                              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                <ShiftTasksChips
                                                  tasks={tasksByShift.get(s.id) || []}
                                                  onAddClick={() => setAddTaskTarget({ shiftId: s.id, assignedUserId: s.driver_id })}
                                                  onChanged={refreshTasks}
                                                />
                                              </div>
                                              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                <WhatsAppTemplateSend
                                                  entityType="driver_shift"
                                                  entityId={s.id}
                                                  companyId={companyId}
                                                  recipientName={d.full_name || d.email}
                                                  buttonLabel="Send shift message"
                                                  iconOnly
                                                />
                                                <WhatsAppManualStaffSend
                                                  messageKey="whatsapp_staff_schedule_change"
                                                  recipientName={d.full_name || d.email}
                                                  recipientPhone={d.mobile_number || d.phone_number}
                                                  variables={{ shift_date: formatDate(s.shift_date, { year: true }) }}
                                                  buttonLabel="Shift changed"
                                                  iconOnly
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setLogTarget({ driverId: d.id, driverName: d.full_name || d.email })}
                                        className="w-full text-slate-300 hover:text-brand-primary hover:bg-brand-primary/10 rounded-md py-2 transition-colors"
                                        title="Log a shift on this day"
                                      >
                                        <Plus className="w-4 h-4 mx-auto" />
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-700">
                                {driverTotal > 0 ? `${driverTotal.toFixed(1)}h` : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200">
                          <td className="sticky left-0 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Day total
                          </td>
                          {dayTotals.map((h, i) => (
                            <td key={i} className="px-2 py-2 text-center text-sm font-semibold tabular-nums text-slate-700">
                              {h > 0 ? `${h.toFixed(1)}h` : "-"}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-900">
                            {dayTotals.reduce((a, b) => a + b, 0).toFixed(1)}h
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                    </details>
                  </>
                )}
              </CardContent>
            </Card>
        </PortalShell>
        <Footer />
      </div>

      {logTarget && companyId && (
        <LogDriverShiftModal
          open={!!logTarget}
          onOpenChange={(o) => !o && setLogTarget(null)}
          companyId={companyId}
          driverId={logTarget.driverId}
          driverName={logTarget.driverName}
          actorUserId={user?.id ?? null}
          onCreated={() => { setLogTarget(null); void load(); }}
        />
      )}

      {/* Wave 70.12 - edit mode for an existing shift. Admin tap
          any non-empty cell on the grid -> modal opens pre-filled
          with that shift's actuals -> Update or Delete. */}
      {editTarget && companyId && (
        <LogDriverShiftModal
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          companyId={companyId}
          driverId={editTarget.driverId}
          driverName={editTarget.driverName}
          actorUserId={user?.id ?? null}
          existingShift={editTarget.shift}
          onCreated={() => { setEditTarget(null); void load(); }}
        />
      )}

      {/* Wave 42 Tier 2 - add-task modal. Defaults to 'delivery'
          on this page so a dispatcher dropping a task on a driver
          shift surfaces the relevant defaults. */}
      {addTaskTarget && companyId && (
        <AddShiftTaskModal
          open={!!addTaskTarget}
          onOpenChange={(o) => !o && setAddTaskTarget(null)}
          companyId={companyId}
          shiftId={addTaskTarget.shiftId}
          assignedUserId={addTaskTarget.assignedUserId}
          defaultType="delivery"
          actorUserId={user?.id ?? null}
          onCreated={() => { setAddTaskTarget(null); void refreshTasks(); }}
        />
      )}
    </>
  );
}

export default function ProtectedDriverSchedulePage() {
  return (
    // Command-centre audit: OWNER was missing from the baseline admin
    // tier with no documented reason; owners run their own dispatch.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DriverScheduleGrid />
    </ProtectedRoute>
  );
}
