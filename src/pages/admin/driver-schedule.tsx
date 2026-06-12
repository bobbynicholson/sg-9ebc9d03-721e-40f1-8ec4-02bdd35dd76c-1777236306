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
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, ChevronLeft, ChevronRight, Plus, Loader2, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { LogDriverShiftModal, type ExistingShiftForEdit } from "@/components/admin/LogDriverShiftModal";
import { ShiftTasksChips } from "@/components/admin/ShiftTasksChips";
import { AddShiftTaskModal } from "@/components/admin/AddShiftTaskModal";
import {
  listTasksForShifts,
  type ShiftTaskRow,
} from "@/services/staffShiftTasksService";

interface Driver {
  id: string;
  full_name: string;
  email: string;
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
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [addTaskTarget, setAddTaskTarget] = useState<{ shiftId: string } | null>(null);
  const todayIso = useMemo(() => toLocalISO(new Date()), []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const fromIso = toLocalISO(weekStart);
      const toIso = toLocalISO(addDays(weekStart, 6));
      const [driversRes, shiftsRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("id, full_name, email")
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
    } catch {
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
    const taskMap = await listTasksForShifts(supabase as any, shiftIds);
    setTasksByShift(taskMap);
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

  // Per-day total hours across all drivers - footer row.
  const dayTotals = useMemo(() => {
    return weekDays.map((d) => {
      const iso = toLocalISO(d);
      let h = 0;
      for (const s of shifts) {
        if (s.shift_date !== iso) continue;
        h += fmtHours(s.actual_start, s.actual_end).hours;
      }
      return h;
    });
  }, [shifts, weekDays]);

  const weekLabel = `${weekStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} - ${addDays(weekStart, 6).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <>
      <Head><title>Driver schedule - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-12 max-w-full">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Driver schedule</h1>
                  <p className="text-slate-600 text-sm mt-0.5">
                    Weekly grid of every driver's logged shifts. Click an empty cell to log a shift.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="text-sm font-medium text-slate-700 px-2 tabular-nums whitespace-nowrap">{weekLabel}</div>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                  This week
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
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
                {/* Phase 22 #2: weekly grid CSV. Dispatch leads
                    handing off the schedule to a colleague or
                    printing it for the dispatch board needed a flat
                    list rather than a screenshot. One row per
                    driver-day with hours + status. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
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
                          const { hours } = fmtHours(s.actual_start, s.actual_end);
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
                    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
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
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {drivers.length} driver{drivers.length === 1 ? "" : "s"}
                </CardTitle>
                <CardDescription className="text-xs">
                  Cells show actual hours logged. Click an empty cell to log a shift for that driver / day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
                  </div>
                ) : drivers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No drivers in this company yet. Add one from /admin/driver-management.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold sticky left-0 bg-white">
                            Driver
                          </th>
                          {weekDays.map((d, i) => (
                            <th key={i} className="px-2 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold text-center min-w-[88px]">
                              <div>{DAY_LABELS[i]}</div>
                              <div className="text-[10px] text-slate-400 tabular-nums">
                                {d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                              </div>
                            </th>
                          ))}
                          <th className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drivers.map((d) => {
                          let driverTotal = 0;
                          return (
                            <tr key={d.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 sticky left-0 bg-white">
                                <div className="font-medium text-slate-900 truncate">{d.full_name || d.email}</div>
                                <div className="text-[11px] text-slate-500 truncate">{d.email}</div>
                              </td>
                              {weekDays.map((day, i) => {
                                const iso = toLocalISO(day);
                                const cellShifts = shiftIndex[`${d.id}|${iso}`] || [];
                                // Wave 42 Tier 2: track planned hours (not just actual) so the
                                // grid totals reflect rostered coverage, matching kitchen +
                                // cleaning grids.
                                const totalPlanned = cellShifts.reduce(
                                  (acc, s) => acc + plannedHoursFromTime(s.planned_start, s.planned_end),
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
                                                  ? "border-red-200 bg-red-50"
                                                  : hasActual
                                                    ? "border-emerald-200 bg-emerald-50"
                                                    : "border-teal-200 bg-teal-50"
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-1">
                                                <span className={`text-xs font-semibold tabular-nums ${
                                                  isMissed ? "text-red-900" :
                                                  hasActual ? "text-emerald-900" :
                                                              "text-teal-900"
                                                }`}>
                                                  {s.planned_start
                                                    ? `${fmtTime(s.planned_start)}-${fmtTime(s.planned_end)}`
                                                    : `${aHours.toFixed(1)}h`}
                                                </span>
                                                {(s.rate_multiplier ?? 1) > 1 && (
                                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1 py-0">
                                                    x{Number(s.rate_multiplier ?? 1)}
                                                  </Badge>
                                                )}
                                              </div>
                                              {hasActual ? (
                                                <div className="text-[10px] text-emerald-700 mt-0.5 tabular-nums">
                                                  Actual {aHours.toFixed(1)}h
                                                </div>
                                              ) : isMissed ? (
                                                <div className="text-[10px] text-red-700 font-medium mt-0.5 inline-flex items-center gap-0.5">
                                                  <AlertTriangle className="w-2.5 h-2.5" /> Missed
                                                </div>
                                              ) : (
                                                <div className="text-[10px] text-teal-700 mt-0.5 tabular-nums">
                                                  {pHours.toFixed(1)}h planned
                                                </div>
                                              )}
                                              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                <ShiftTasksChips
                                                  tasks={tasksByShift.get(s.id) || []}
                                                  onAddClick={() => setAddTaskTarget({ shiftId: s.id })}
                                                  onChanged={refreshTasks}
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
                                        className="w-full text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-md py-2 transition-colors"
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
                          <td className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold sticky left-0 bg-white">
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
                )}
              </CardContent>
            </Card>
          </div>
        </div>
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
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DriverScheduleGrid />
    </ProtectedRoute>
  );
}
