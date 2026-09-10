/**
 * /admin/cleaning-schedule - weekly grid view of every cleaning
 * staffer's planned roster.
 *
 * Wave 40.4. Direct sibling of /admin/kitchen-schedule.tsx - same
 * UI shape, same week-grid pattern, same modal for adding shifts.
 * Difference is the department filter (cleaning roles/departments
 * only) and the shift_type ('cleaning') passed to the roster modal.
 *
 * Architecturally: cleaning shifts share the kitchen_shifts table
 * via the shift_type column added in 20260515180000 - so a person
 * who is explicitly assigned to both departments can log one
 * 'kitchen_and_cleaning' shift or two separate ones, depending on
 * how the roster lead wants to split the day. Same payslip math
 * regardless, but kitchen-only people do not appear as cleaners by
 * default.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DynamicNav } from "@/components/DynamicNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
  StatTile,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, ChevronLeft, ChevronRight, Plus, Loader2, Download, RefreshCw, AlertTriangle, Users, CalendarClock, Clock } from "lucide-react";
import { DEFAULT_TENANT_TIMEZONE, tenantToday, toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { LogKitchenShiftModal } from "@/components/admin/LogKitchenShiftModal";
import { ShiftTasksChips } from "@/components/admin/ShiftTasksChips";
import { AddShiftTaskModal } from "@/components/admin/AddShiftTaskModal";
import {
  listTasksForShifts,
  type ShiftTaskRow,
} from "@/services/staffShiftTasksService";
import {
  displayRosterRole,
  filterRosterStaff,
  rosterDepartmentAliases,
  type RosterDepartmentRow,
} from "@/lib/rosterStaff";

interface Staffer {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active_role: string | null;
}

interface ShiftRow {
  id: string;
  staff_id: string;
  shift_date: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  rate_multiplier: number | null;
  notes: string | null;
  shift_type: string;
  order_id: string | null;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - day);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

function plannedHours(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
}

function actualHours(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return (e - s) / 3_600_000;
}

const fmtTime = (t: string | null): string => (t ? t.slice(0, 5) : "");

function CleaningScheduleGrid() {
  const { user } = useAuth() as any;
  const userRole = ((user as any)?.active_role || (user as any)?.role || UserRole.ADMIN).toString();
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const companyId = user?.company_id;
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));

  // Wave 66.6 - honour ?date=YYYY-MM-DD URL param. The Wave 66.6
  // timeline rewrite repointed pre_event_cleaning + post_event_cleaning
  // dots to /admin/cleaning-schedule?date={event_date}. Without this
  // effect the page always landed on the current week regardless.
  useEffect(() => {
    if (!router.isReady) return;
    const raw = typeof router.query.date === "string" ? router.query.date : null;
    if (!raw) return;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return;
    setWeekStart(startOfWeek(parsed));
  }, [router.isReady, router.query.date]);
  const [staff, setStaff] = useState<Staffer[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Silent-failure audit: a swallowed load error left the grid
  // reading "no cleaning staff". Keep the failure visible with Retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tenant wall clock for the "today" highlight + missed-shift
  // detection (same pattern as kitchen-schedule / dashboard).
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  const [logTarget, setLogTarget] = useState<{ staffId: string; staffName: string; date: string } | null>(null);
  // Wave 41 Phase 3 - per-shift task chips. Cleaning grid defaults
  // new tasks to 'cleaning' but the operator can pick anything.
  const [tasksByShift, setTasksByShift] = useState<Map<string, ShiftTaskRow[]>>(new Map());
  const [addTaskTarget, setAddTaskTarget] = useState<{ shiftId: string; assignedUserId: string | null } | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("timezone")
        .eq("id", companyId)
        .maybeSingle();
      if (!cancelled && !error) setTenantTimezone((data as any)?.timezone || null);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const fromIso = toLocalISO(weekStart);
      const toIso = toLocalISO(addDays(weekStart, 6));
      const [staffRes, shiftsRes] = await Promise.all([
        // Cleaning roster eligibility is department-specific. Admins
        // can manage the page, but they should not appear as cleaners
        // unless their profile/active role or department says cleaning.
        (supabase as any)
          .from("profiles")
          .select("id, full_name, email, role, active_role")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("full_name", { ascending: true }),
        (supabase as any)
          .from("kitchen_shifts")
          .select("id, staff_id, shift_date, planned_start, planned_end, actual_start, actual_end, status, rate_multiplier, notes, shift_type, order_id")
          .eq("company_id", companyId)
          .in("shift_type", ["cleaning", "kitchen_and_cleaning"])
          .gte("shift_date", fromIso)
          .lte("shift_date", toIso)
          .is("deleted_at", null),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (shiftsRes.error) throw shiftsRes.error;
      const staffRows = (staffRes.data || []) as Staffer[];
      let departmentRows: RosterDepartmentRow[] = [];
      if (staffRows.length > 0) {
        const departmentRes = await (supabase as any)
          .from("user_departments")
          .select("user_id, department")
          .in("user_id", staffRows.map((row) => row.id))
          .in("department", rosterDepartmentAliases("cleaning"));
        // A failed department fetch silently hid every staffer whose
        // cleaning eligibility comes via user_departments. Surface it.
        if (departmentRes.error) throw departmentRes.error;
        departmentRows = (departmentRes.data || []) as RosterDepartmentRow[];
      }
      setStaff(filterRosterStaff(staffRows, departmentRows, "cleaning"));
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
      // Surface the failure instead of quietly rendering an empty
      // grid that reads as "no staff rostered".
      setLoadError(e?.message || "Could not load the cleaning roster. Please try again.");
      setStaff([]);
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

  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 750);
    };
    // Random suffix so a second tab / sibling page never collides on
    // the channel name (recurring realtime bug class). staff_shift_tasks
    // now carries the company filter like kitchen-schedule does;
    // user_departments stays unfiltered to match the codebase-wide
    // convention for that table.
    const channelSuffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`admin-cleaning-schedule-${companyId}-${channelSuffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_shifts", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_shift_tasks", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, weekStart]);

  const shiftIndex = useMemo(() => {
    const map: Record<string, ShiftRow[]> = {};
    for (const s of shifts) {
      const key = `${s.staff_id}|${s.shift_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [shifts]);

  const dayTotals = useMemo(() => {
    return weekDays.map((d) => {
      const iso = toLocalISO(d);
      let h = 0;
      for (const s of shifts) {
        if (s.shift_date !== iso) continue;
        h += plannedHours(s.planned_start, s.planned_end);
      }
      return h;
    });
  }, [shifts, weekDays]);

  const weekLabel = `${weekStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} - ${addDays(weekStart, 6).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`;
  // "Today" follows the tenant's wall clock, not the browser's.
  const todayIso = toLocalISO(tenantToday(tenantTimezone || DEFAULT_TENANT_TIMEZONE));

  // Command-centre stat row: real aggregates for the week in view.
  const stats = useMemo(() => {
    let plannedH = 0;
    let missed = 0;
    let clockedIn = 0;
    for (const s of shifts) {
      plannedH += plannedHours(s.planned_start, s.planned_end);
      if (s.actual_start) clockedIn += 1;
      const isPast = s.shift_date < todayIso;
      if (s.status === "missed" || (isPast && !s.actual_start && s.status === "scheduled")) missed += 1;
    }
    return { plannedH, missed, clockedIn };
  }, [shifts, todayIso]);

  return (
    <>
      <Head><title>Cleaning shift roster - CateringMS</title></Head>
      <NoIndexMeta />
      <DynamicNav userRole={userRole} />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title="Cleaning shift roster"
            icon={Sparkles}
            subtitle="Manager view for staff shifts, duty coverage, and handover workload."
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {staff.length} cleaning team member{staff.length === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {shifts.length} shift{shifts.length === 1 ? "" : "s"} this week
                  </span>
                </>
              ) : undefined
            }
            actions={
            <>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="text-sm font-medium text-white px-2 tabular-nums whitespace-nowrap">{weekLabel}</div>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                  This week
                </Button>
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    if (staff.length === 0) return;
                    const esc = (v: any) => {
                      if (v == null) return "";
                      const s = String(v).replace(/"/g, '""');
                      return /[",\n]/.test(s) ? `"${s}"` : s;
                    };
                    const headers = ["Staff", "Email", "Day", "Date", "Planned start", "Planned end", "Planned hours", "Actual hours", "Status", "Rate multiplier"];
                    const lines = [headers.join(",")];
                    for (const p of staff) {
                      for (let i = 0; i < weekDays.length; i++) {
                        const day = weekDays[i];
                        const iso = toLocalISO(day);
                        const dayShifts = shiftIndex[`${p.id}|${iso}`] || [];
                        if (dayShifts.length === 0) continue;
                        for (const s of dayShifts) {
                          lines.push([
                            esc(p.full_name || ""),
                            esc(p.email || ""),
                            esc(DAY_LABELS[i]),
                            esc(iso),
                            esc(fmtTime(s.planned_start)),
                            esc(fmtTime(s.planned_end)),
                            esc(plannedHours(s.planned_start, s.planned_end).toFixed(2)),
                            esc(actualHours(s.actual_start, s.actual_end).toFixed(2)),
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
                    a.download = `cleaning-schedule-${toLocalISO(weekStart)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  disabled={staff.length === 0 || shifts.length === 0}
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
            </>
            }
          />
          <PageWorkbench />

            {/* Stat row: live aggregates for the week in view. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatTile
                label="Cleaning staff"
                value={loading ? "…" : staff.length}
                icon={Users}
                hint="Cleaning-eligible team"
              />
              <StatTile
                label="Shifts this week"
                value={loading ? "…" : shifts.length}
                icon={CalendarClock}
                hint={stats.clockedIn > 0 ? `${stats.clockedIn} clocked in` : "None clocked in yet"}
              />
              <StatTile
                label="Planned hours"
                value={loading ? "…" : `${stats.plannedH.toFixed(1)}h`}
                icon={Clock}
                hint="Sum of rostered time"
              />
              <StatTile
                label="Missed shifts"
                value={loading ? "…" : stats.missed}
                icon={AlertTriangle}
                hint={stats.missed > 0 ? "Past shifts never clocked in" : "All accounted for"}
              />
            </div>

            {loadError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  <span>{loadError}</span>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {staff.length} cleaning team member{staff.length === 1 ? "" : "s"}
                </CardTitle>
                <CardDescription className="text-xs">
                  Cells show planned hours. Once the cleaner clocks in via the team portal, the cell flips to actual hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
                  </div>
                ) : staff.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <p>No cleaning staff assigned yet. Add a cleaner or assign a cleaning department.</p>
                    {/* User provisioning is admin-only; a cleaning_manager
                        can't open /admin/users, so don't dangle a button
                        that just bounces them. */}
                    {userRole !== UserRole.CLEANING_MANAGER && (
                      <Link href={withSlug("/admin/users")}>
                        <Button variant="outline" size="sm" className="mt-3 gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          Open Users
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold sticky left-0 bg-white">
                            Staff
                          </th>
                          {weekDays.map((d, i) => {
                            const iso = toLocalISO(d);
                            const isToday = iso === todayIso;
                            return (
                              <th key={i} className={`px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-center min-w-[110px] ${isToday ? "text-brand-primary" : "text-slate-500"}`}>
                                <div>{DAY_LABELS[i]}</div>
                                <div className={`text-[10px] tabular-nums ${isToday ? "text-brand-primary" : "text-slate-400"}`}>
                                  {d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                </div>
                              </th>
                            );
                          })}
                          <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {staff.map((p) => {
                          let staffTotal = 0;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                              <td className="px-3 py-2 sticky left-0 bg-white">
                                <div className="font-medium text-slate-900 truncate">{p.full_name || p.email}</div>
                                <div className="text-[11px] text-slate-500 truncate capitalize">{displayRosterRole(p)}</div>
                              </td>
                              {weekDays.map((day, i) => {
                                const iso = toLocalISO(day);
                                const cellShifts = shiftIndex[`${p.id}|${iso}`] || [];
                                const totalPlanned = cellShifts.reduce((acc, s) => acc + plannedHours(s.planned_start, s.planned_end), 0);
                                staffTotal += totalPlanned;
                                const hasShift = cellShifts.length > 0;
                                const isPastDay = iso < todayIso;
                                return (
                                  <td key={i} className="px-1.5 py-1.5 text-center align-top">
                                    {hasShift ? (
                                      <div className="space-y-0.5">
                                        {cellShifts.map((s) => {
                                          const aHours = actualHours(s.actual_start, s.actual_end);
                                          const hasActual = !!s.actual_start;
                                          const isMissed = s.status === "missed" || (isPastDay && !s.actual_start && s.status === "scheduled");
                                          return (
                                            <div
                                              key={s.id}
                                              className={`rounded-md border px-2 py-1.5 text-left ${
                                                isMissed
                                                  ? "border-rose-200 bg-rose-50"
                                                  : hasActual
                                                    ? "border-brand-primary/20 bg-brand-primary/10"
                                                    : "border-slate-200 bg-slate-50"
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-1">
                                                <span className={`text-xs font-semibold tabular-nums ${
                                                  isMissed ? "text-rose-900" :
                                                  hasActual ? "text-brand-primary" :
                                                              "text-slate-900"
                                                }`}>
                                                  {fmtTime(s.planned_start)}-{fmtTime(s.planned_end)}
                                                </span>
                                                {(s.rate_multiplier ?? 1) > 1 && (
                                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1 py-0">
                                                    x{Number(s.rate_multiplier ?? 1)}
                                                  </Badge>
                                                )}
                                              </div>
                                              {hasActual ? (
                                                <div className="text-[10px] text-brand-primary mt-0.5 tabular-nums">
                                                  Actual {aHours.toFixed(1)}h
                                                </div>
                                              ) : isMissed ? (
                                                <div className="text-[10px] text-rose-700 font-medium mt-0.5 inline-flex items-center gap-0.5">
                                                  <AlertTriangle className="w-2.5 h-2.5" /> Missed
                                                </div>
                                              ) : (
                                                // Planned-only cells stay neutral slate so
                                                // clocked-in (brand tint) reads at a glance,
                                                // matching the kitchen grid.
                                                <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                                                  {plannedHours(s.planned_start, s.planned_end).toFixed(1)}h planned
                                                </div>
                                              )}
                                              {/* Wave 41 Phase 3: typed task chips. */}
                                              <ShiftTasksChips
                                                tasks={tasksByShift.get(s.id) || []}
                                                onAddClick={() => setAddTaskTarget({ shiftId: s.id, assignedUserId: s.staff_id })}
                                                onChanged={refreshTasks}
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setLogTarget({ staffId: p.id, staffName: p.full_name || p.email, date: iso })}
                                        className="w-full text-slate-300 hover:text-brand-primary hover:bg-brand-primary/10 rounded-md py-2 transition-colors"
                                        title="Roster a cleaning shift on this day"
                                      >
                                        <Plus className="w-4 h-4 mx-auto" />
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-700">
                                {staffTotal > 0 ? `${staffTotal.toFixed(1)}h` : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200">
                          <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold sticky left-0 bg-white">
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
        </PortalShell>
        <Footer />
      </div>

      {logTarget && companyId && (
        <LogKitchenShiftModal
          open={!!logTarget}
          onOpenChange={(o) => !o && setLogTarget(null)}
          companyId={companyId}
          staffId={logTarget.staffId}
          staffName={logTarget.staffName}
          defaultDate={logTarget.date}
          shiftType="cleaning"
          actorUserId={user?.id ?? null}
          onCreated={() => { setLogTarget(null); void load(); }}
        />
      )}

      {/* Wave 41 Phase 3 - add-task modal. Defaults to 'cleaning'
          on this page so the dishwasher-vs-manual decision surfaces
          immediately when an operator clicks "+task" on a shift. */}
      {addTaskTarget && companyId && (
        <AddShiftTaskModal
          open={!!addTaskTarget}
          onOpenChange={(o) => !o && setAddTaskTarget(null)}
          companyId={companyId}
          shiftId={addTaskTarget.shiftId}
          assignedUserId={addTaskTarget.assignedUserId}
          defaultType="cleaning"
          actorUserId={user?.id ?? null}
          onCreated={() => { setAddTaskTarget(null); void refreshTasks(); }}
        />
      )}
    </>
  );
}

export default function ProtectedCleaningSchedulePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.CLEANING_MANAGER]}>
      <CleaningScheduleGrid />
    </ProtectedRoute>
  );
}
