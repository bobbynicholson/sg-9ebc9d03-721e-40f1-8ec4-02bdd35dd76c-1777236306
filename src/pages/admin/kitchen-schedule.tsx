/**
 * /admin/kitchen-schedule - weekly grid view of every kitchen
 * staffer's planned roster for the selected week.
 *
 * Wave 36.1. Mirrors /admin/driver-schedule.tsx 1:1 - same week
 * navigation, same Mon-Sun grid, same click-empty-cell-to-roster
 * pattern. Uses the kitchen_shifts table (planned + actual per
 * chef per day).
 *
 * What's different from driver-schedule:
 *   - Cells render planned hours (e.g. "9.0h planned") not actual
 *   - When actual_start has been stamped, the cell flips to a
 *     two-line "8a-5p / 8h actual" so the operator can see lateness
 *     at a glance.
 *   - Late / missed status badges (status='missed' or planned_start
 *     was past with no actual_start)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DynamicNav } from "@/components/DynamicNav";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Loader2, Download, RefreshCw, AlertTriangle, Users, ExternalLink, LayoutGrid, Calendar as CalendarIcon } from "lucide-react";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { toLocalISO } from "@/lib/localDate";
import { LogKitchenShiftModal } from "@/components/admin/LogKitchenShiftModal";
import { ShiftTasksChips } from "@/components/admin/ShiftTasksChips";
import { AddShiftTaskModal } from "@/components/admin/AddShiftTaskModal";
import {
  listTasksForShifts,
  type ShiftTaskRow,
} from "@/services/staffShiftTasksService";

interface Staffer {
  id: string;
  full_name: string;
  email: string;
  role: string;
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
  // Wave 43 T1: delivery shifts link to the order they served.
  // Surfaced on the order detail panel "Assigned shifts" list.
  order_id: string | null;
}

// Wave 66.2 - event overlay rows. The schedule needs to surface the
// demand side (orders booked for the day) alongside the supply side
// (chefs rostered) so the operator can see "16 May has a 43-guest
// event and zero chefs" at a glance instead of bouncing between
// /admin/orders and this page.
interface OrderForCal {
  id: string;
  order_number: string | null;
  client_name: string | null;
  event_date: string;
  guest_count: number | null;
  status: string;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date): Date {
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

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function plannedHours(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return Math.max(0, (endMin - startMin) / 60);
}

function actualHours(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return (e - s) / 3_600_000;
}

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

function KitchenScheduleGrid() {
  const { user } = useAuth() as any;
  const userRole = ((user as any)?.active_role || (user as any)?.role || UserRole.ADMIN).toString();
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const companyId = user?.company_id;
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(companyId);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));

  // Wave 66.6 - honour ?date=YYYY-MM-DD URL param. The Wave 66.4
  // timeline rewrite repointed the kitchen_prep_in_progress dot to
  // /admin/kitchen-schedule?date={event_date}, but the page ignored
  // the param and always landed on the current week. Now: when the
  // URL carries a parseable date, jump to the week that contains it.
  useEffect(() => {
    if (!router.isReady) return;
    const raw = typeof router.query.date === "string" ? router.query.date : null;
    if (!raw) return;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return;
    setWeekStart(startOfWeek(parsed));
  }, [router.isReady, router.query.date]);
  // Wave 66.2 - view mode. Week = the original Mon-Sun grid.
  // Month = a 4-6 row calendar overview showing chef count + event
  // count per day; click a day to drop back into week view for that
  // week. Operators planning the next two months reach for the
  // month view first; daily ops stay on week.
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [staff, setStaff] = useState<Staffer[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [orders, setOrders] = useState<OrderForCal[]>([]);
  const [loading, setLoading] = useState(true);
  const [logTarget, setLogTarget] = useState<{ staffId: string; staffName: string; date: string } | null>(null);
  // Wave 41 Phase 3: per-shift task chips (kitchen / cleaning /
  // delivery / shopping / waitering / setup / breakdown / admin).
  // Indexed by shift_id for O(1) cell render lookup.
  const [tasksByShift, setTasksByShift] = useState<Map<string, ShiftTaskRow[]>>(new Map());
  const [addTaskTarget, setAddTaskTarget] = useState<{ shiftId: string; assignedUserId: string | null } | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Wave 66.2 - compute the date range we need to fetch for. Week
  // view pulls 7 days; month view pulls the whole month grid (which
  // can run Mon of week containing the 1st through Sun of week
  // containing the last day, up to 42 days).
  const fetchRange = useMemo(() => {
    if (viewMode === "month") {
      const monthFirst = startOfMonth(monthCursor);
      const monthLast = endOfMonth(monthCursor);
      const gridStart = startOfWeek(monthFirst);
      const gridEnd = addDays(startOfWeek(monthLast), 6);
      return { from: gridStart, to: gridEnd };
    }
    return { from: weekStart, to: addDays(weekStart, 6) };
  }, [viewMode, monthCursor, weekStart]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const fromIso = toLocalISO(fetchRange.from);
      const toIso = toLocalISO(fetchRange.to);
      const [staffRes, shiftsRes, ordersRes] = await Promise.all([
        // Wave 36.1: kitchen_staff role for chefs. Some tenants
        // also flag head chefs as company_admin - pull both so the
        // grid shows everyone who could be on a kitchen shift.
        // Wave 64.5 - "owner" was in this filter but isn't a valid
        // user_role enum label, so PostgREST rejected the whole
        // query and the catch block silently set staff=[]. The page
        // then read as "0 chefs" even when Sarah Kitchen + Callum
        // Rogers obviously qualified. Same trap caught and fixed
        // previously on /admin/vehicles. Valid roles only here.
        (supabase as any)
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("company_id", companyId)
          .in("role", ["kitchen_staff", "company_admin", "admin"])
          .is("deleted_at", null)
          .order("full_name", { ascending: true }),
        // Wave 40.4: kitchen_shifts now backs both kitchen + cleaning
        // rosters via the shift_type column. This page stays
        // kitchen-only via the IN filter; the cleaning equivalent
        // lives at /admin/cleaning-schedule.
        (supabase as any)
          .from("kitchen_shifts")
          .select("id, staff_id, shift_date, planned_start, planned_end, actual_start, actual_end, status, rate_multiplier, notes, order_id")
          .eq("company_id", companyId)
          .in("shift_type", ["kitchen", "kitchen_and_cleaning"])
          .gte("shift_date", fromIso)
          .lte("shift_date", toIso)
          .is("deleted_at", null),
        // Wave 66.2 - pull orders within the range so the calendar
        // shows the demand side (events booked) alongside the supply
        // side (chefs rostered). Excludes cancelled so the overlay
        // doesn't include a dead-and-buried run.
        (supabase as any)
          .from("orders")
          .select("id, order_number, client_name, event_date, guest_count, status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", fromIso)
          .lte("event_date", toIso)
          .neq("status", "cancelled")
          .order("event_date", { ascending: true }),
      ]);
      setStaff((staffRes.data || []) as Staffer[]);
      const shiftRows = (shiftsRes.data || []) as ShiftRow[];
      setShifts(shiftRows);
      setOrders((ordersRes.data || []) as OrderForCal[]);
      // Phase 3: pull tasks for every shift in this week in one
      // batch. Empty map until shifts exist, no extra round-trip.
      const shiftIds = shiftRows.map((s) => s.id);
      if (shiftIds.length > 0) {
        const taskMap = await listTasksForShifts(supabase as any, shiftIds);
        setTasksByShift(taskMap);
      } else {
        setTasksByShift(new Map());
      }
    } catch {
      setStaff([]);
      setShifts([]);
      setOrders([]);
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
  }, [companyId, weekStart, monthCursor, viewMode, refreshSignal]);

  useEffect(() => {
    if (!companyId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void load();
      }, 400);
    };

    const channelSuffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`admin-kitchen-schedule-${companyId}-${channelSuffix}`)
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `company_id=eq.${companyId}`,
      }, refresh)
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "kitchen_shifts",
        filter: `company_id=eq.${companyId}`,
      }, refresh)
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "staff_shift_tasks",
        filter: `company_id=eq.${companyId}`,
      }, refresh)
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "profiles",
        filter: `company_id=eq.${companyId}`,
      }, refresh)
      .subscribe();

    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      if (debounceTimer) clearTimeout(debounceTimer);
      void channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, weekStart, monthCursor, viewMode]);

  const shiftIndex = useMemo(() => {
    const map: Record<string, ShiftRow[]> = {};
    for (const s of shifts) {
      const key = `${s.staff_id}|${s.shift_date}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [shifts]);

  // Wave 66.2 - orders bucketed by event_date for O(1) cell lookup.
  // Shape: 'YYYY-MM-DD' -> [event rows]. Drives both the week-view
  // events row and the month-view per-day chips.
  const ordersByDate = useMemo(() => {
    const map = new Map<string, OrderForCal[]>();
    for (const o of orders) {
      if (!o.event_date) continue;
      const arr = map.get(o.event_date);
      if (arr) arr.push(o); else map.set(o.event_date, [o]);
    }
    return map;
  }, [orders]);

  // Wave 66.2 - shifts bucketed by date (ignoring staff_id) so the
  // month view can render a single chef-count chip per day without
  // walking the full shift list per cell.
  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const s of shifts) {
      const arr = map.get(s.shift_date);
      if (arr) arr.push(s); else map.set(s.shift_date, [s]);
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

  const todayIso = toLocalISO(new Date());

  return (
    <>
      <Head><title>Kitchen schedule - CateringMS</title></Head>
      <NoIndexMeta />
      <DynamicNav userRole={userRole} />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <div className="space-y-4">
            <PortalHeader
              title="Kitchen schedule"
              icon={CalendarClock}
              subtitle="Weekly roster. Click an empty cell to plan a shift; cells flip to actual hours when the chef clocks in."
              actions={
              <>
                {/* Wave 66.2 - view-mode toggle. Week stays the
                    daily-ops surface (Mon-Sun grid with per-cell
                    rostering); Month gives the planner a 5-6 week
                    overview showing chef + event load per day, with
                    click-through to that week. */}
                <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode("week")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${viewMode === "week" ? "bg-orange-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                    title="Daily-ops view - one week, one cell per chef per day"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("month")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-slate-200 transition ${viewMode === "month" ? "bg-orange-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                    title="Planning view - a month at a glance, chef + event load per day"
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Month
                  </button>
                </div>
                {viewMode === "week" ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <div className="text-sm font-medium text-slate-700 px-2 tabular-nums whitespace-nowrap">
                      {monthCursor.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMonthCursor(startOfMonth(new Date()))}>
                      This month
                    </Button>
                  </>
                )}
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
                    const headers = ["Chef", "Email", "Day", "Date", "Planned start", "Planned end", "Planned hours", "Actual hours", "Status", "Rate multiplier"];
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
                    a.download = `kitchen-schedule-${toLocalISO(weekStart)}.csv`;
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {staff.length} chef{staff.length === 1 ? "" : "s"}
                </CardTitle>
                <CardDescription className="text-xs">
                  Cells show planned hours. Once the chef clocks in, the cell flips to actual hours and surfaces lateness inline.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
                  </div>
                ) : staff.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No kitchen staff in this company yet. Add one from /admin/kitchen-staff.
                  </div>
                ) : viewMode === "week" ? (
                  <>
                  {/* Kitchen persona follow-up (kitchen.md 5.1):
                      mobile card-stack. The 7-day-by-N-chef grid
                      below needs ~1200px to render without scroll.
                      On mobile we collapse to one card per day with
                      that day's chef list, total hours and event
                      overlay. Sticky-day-picker is the next polish.
                      md+ falls through to the existing table. */}
                  <div className="md:hidden space-y-3">
                    {weekDays.map((d, dayIdx) => {
                      const iso = toLocalISO(d);
                      const dayOrders = ordersByDate.get(iso) || [];
                      const isToday = iso === todayIso;
                      const cellsForDay = staff
                        .map((p) => {
                          const cellShifts = shiftIndex[`${p.id}|${iso}`] || [];
                          const totalPlanned = cellShifts.reduce(
                            (acc, s) => acc + plannedHours(s.planned_start, s.planned_end),
                            0,
                          );
                          return { p, shifts: cellShifts, totalPlanned };
                        })
                        .filter((c) => c.shifts.length > 0);
                      const dayTotalHours = cellsForDay.reduce((acc, c) => acc + c.totalPlanned, 0);
                      const dayHasChef = cellsForDay.length > 0;
                      const needsCover = dayOrders.length > 0 && !dayHasChef;
                      return (
                        <Card
                          key={dayIdx}
                          className={`border ${
                            isToday ? "border-orange-300 ring-1 ring-orange-200" :
                            needsCover ? "border-rose-300 ring-1 ring-rose-200" :
                            "border-slate-200"
                          }`}
                        >
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className={`text-sm font-semibold ${isToday ? "text-orange-700" : "text-slate-900"}`}>
                                  {DAY_LABELS[dayIdx]}
                                </p>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                  {isToday ? " (today)" : ""}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold tabular-nums">
                                  {dayTotalHours.toFixed(1)}h
                                </p>
                                <p className="text-[11px] text-slate-500">{cellsForDay.length} chef{cellsForDay.length === 1 ? "" : "s"}</p>
                              </div>
                            </div>

                            {dayOrders.length > 0 && (
                              <div className={`rounded-md border px-2 py-1.5 ${needsCover ? "border-rose-200 bg-rose-50" : "border-blue-200 bg-blue-50"}`}>
                                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${needsCover ? "text-rose-700" : "text-blue-700"}`}>
                                  Events ({dayOrders.length}){needsCover ? " - needs cover" : ""}
                                </p>
                                <ul className="space-y-1">
                                  {dayOrders.map((o) => (
                                    <li key={o.id} className="text-xs flex items-center justify-between gap-2">
                                      <Link
                                        href={withSlug(staffOrderHref(o.id, "kitchen_staff"))}
                                        className={`truncate ${needsCover ? "text-rose-900" : "text-blue-900"} font-medium`}
                                      >
                                        {o.client_name || o.order_number || "Event"}
                                      </Link>
                                      <span className={`tabular-nums ${needsCover ? "text-rose-700" : "text-blue-700"}`}>
                                        <Users className="w-3 h-3 inline mr-0.5" />
                                        {o.guest_count ?? "?"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {cellsForDay.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No shifts rostered.</p>
                            ) : (
                              <ul className="space-y-1">
                                {cellsForDay.map((c) => (
                                  <li key={c.p.id} className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-slate-900 truncate">
                                      {c.p.full_name || c.p.email}
                                    </span>
                                    <span className="text-slate-600 tabular-nums shrink-0">
                                      {c.totalPlanned.toFixed(1)}h
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold sticky left-0 bg-white">
                            Chef
                          </th>
                          {weekDays.map((d, i) => {
                            const iso = toLocalISO(d);
                            const isToday = iso === todayIso;
                            return (
                              <th key={i} className={`px-2 py-2 text-xs uppercase tracking-wider font-semibold text-center min-w-[110px] ${isToday ? "text-orange-700" : "text-slate-500"}`}>
                                <div>{DAY_LABELS[i]}</div>
                                <div className={`text-[10px] tabular-nums ${isToday ? "text-orange-600" : "text-slate-400"}`}>
                                  {d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                </div>
                              </th>
                            );
                          })}
                          <th className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      {/* Wave 66.2 - events overlay row. Surfaces the
                          demand side (orders booked on each day) so
                          the operator can see "16 May: ORD-003828,
                          43 guests, no chefs rostered - needs cover"
                          without bouncing to /admin/orders. Red ring
                          fires when an event exists with zero chef
                          shifts on the same date. */}
                      <tbody className="border-b-2 border-slate-200">
                        <tr className="bg-slate-50/60">
                          <td className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold sticky left-0 bg-slate-50/60">
                            Events
                          </td>
                          {weekDays.map((d, i) => {
                            const iso = toLocalISO(d);
                            const dayOrders = ordersByDate.get(iso) || [];
                            const dayHasChef = (shiftsByDate.get(iso) || []).length > 0;
                            const needsCover = dayOrders.length > 0 && !dayHasChef;
                            return (
                              <td key={i} className="px-1.5 py-1.5 align-top text-center">
                                {dayOrders.length === 0 ? (
                                  <span className="text-slate-300 text-xs">-</span>
                                ) : (
                                  <div className={`space-y-1 ${needsCover ? "ring-1 ring-rose-300 bg-rose-50 rounded-md p-1" : ""}`}>
                                    {dayOrders.map((o) => (
                                      <Link
                                        key={o.id}
                                        href={withSlug(staffOrderHref(o.id, "kitchen_staff"))}
                                        className={`block text-left rounded-md border px-1.5 py-1 text-[10px] leading-tight hover:bg-blue-50 transition ${needsCover ? "border-rose-200 bg-white" : "border-blue-200 bg-blue-50"}`}
                                        title={`${o.order_number || "Order"} - ${o.client_name || ""} - ${o.guest_count ?? "?"} guests`}
                                      >
                                        <div className={`font-semibold truncate ${needsCover ? "text-rose-900" : "text-blue-900"}`}>
                                          {o.client_name || o.order_number || "Event"}
                                        </div>
                                        <div className={`tabular-nums inline-flex items-center gap-0.5 ${needsCover ? "text-rose-700" : "text-blue-700"}`}>
                                          <Users className="w-2.5 h-2.5" />
                                          {o.guest_count ?? "?"}
                                        </div>
                                      </Link>
                                    ))}
                                    {needsCover && (
                                      <div className="text-[10px] text-rose-700 font-medium inline-flex items-center gap-0.5 mt-0.5">
                                        <AlertTriangle className="w-2.5 h-2.5" /> Needs cover
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-500">
                            {orders.length > 0 ? `${orders.length} event${orders.length === 1 ? "" : "s"}` : "-"}
                          </td>
                        </tr>
                      </tbody>
                      <tbody className="divide-y divide-slate-100">
                        {staff.map((p) => {
                          let staffTotal = 0;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 sticky left-0 bg-white">
                                <div className="font-medium text-slate-900 truncate">{p.full_name || p.email}</div>
                                <div className="text-[11px] text-slate-500 truncate">{p.email}</div>
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
                                                  ? "border-red-200 bg-red-50"
                                                  : hasActual
                                                    ? "border-brand-primary/20 bg-brand-primary/10"
                                                    : "border-orange-200 bg-orange-50"
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-1">
                                                <span className={`text-xs font-semibold tabular-nums ${
                                                  isMissed ? "text-red-900" :
                                                  hasActual ? "text-brand-primary" :
                                                              "text-orange-900"
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
                                                <div className="text-[10px] text-red-700 font-medium mt-0.5 inline-flex items-center gap-0.5">
                                                  <AlertTriangle className="w-2.5 h-2.5" /> Missed
                                                </div>
                                              ) : (
                                                <div className="text-[10px] text-orange-700 mt-0.5 tabular-nums">
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
                                        className="w-full text-slate-300 hover:text-orange-600 hover:bg-orange-50 rounded-md py-2 transition-colors"
                                        title="Roster a shift on this day"
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
                  </>
                ) : (
                  // Wave 66.2 - month view. 5-6 row calendar grid
                  // showing chef count + event count per day. The
                  // overview a planner reaches for when slotting
                  // staff into next month's bookings. Click a day to
                  // drop back into week view for that week.
                  (() => {
                    const monthFirst = startOfMonth(monthCursor);
                    const monthLast = endOfMonth(monthCursor);
                    const gridStart = startOfWeek(monthFirst);
                    const gridEnd = addDays(startOfWeek(monthLast), 6);
                    const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
                    const cells = Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
                    // TIGHTEN I.28 (admin.md section 6 + section 7
                    // item 2): mobile redesign. Pre-fix the month grid
                    // wrapped in `overflow-x-auto + min-w-[700px]`,
                    // which forced a horizontal scroll on every mobile
                    // viewport. Now: the grid is fluid (no min-width)
                    // and cell sizing + label visibility tier through
                    // a few breakpoints so a phone shows compact-but-
                    // readable cells and a desktop keeps the spacious
                    // 88px min-height the planner is used to.
                    return (
                      <div>
                        <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-md overflow-hidden">
                          {DAY_LABELS.map((lbl) => (
                            <div key={lbl} className="bg-slate-50 px-1 sm:px-2 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-semibold text-center">
                              <span className="hidden sm:inline">{lbl}</span>
                              <span className="sm:hidden">{lbl.slice(0, 1)}</span>
                            </div>
                          ))}
                          {cells.map((d) => {
                            const iso = toLocalISO(d);
                            const isToday = iso === todayIso;
                            const inMonth = d.getMonth() === monthCursor.getMonth();
                            const dayOrders = ordersByDate.get(iso) || [];
                            const dayShifts = shiftsByDate.get(iso) || [];
                            const distinctChefs = new Set(dayShifts.map((s) => s.staff_id)).size;
                            const needsCover = dayOrders.length > 0 && distinctChefs === 0;
                            return (
                              <button
                                key={iso}
                                type="button"
                                onClick={() => {
                                  // Jump into week view for the
                                  // week containing this day so
                                  // the operator can roster.
                                  setWeekStart(startOfWeek(d));
                                  setViewMode("week");
                                }}
                                className={`text-left min-h-[60px] sm:min-h-[88px] p-1 sm:p-1.5 transition ${
                                  !inMonth ? "bg-slate-50 text-slate-400" :
                                  needsCover ? "bg-rose-50 hover:bg-rose-100 ring-1 ring-inset ring-rose-200" :
                                  isToday ? "bg-orange-50 hover:bg-orange-100" :
                                  "bg-white hover:bg-slate-50"
                                }`}
                                title={`${d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })} - click to open the week`}
                              >
                                <div className={`text-[11px] sm:text-xs font-semibold tabular-nums ${isToday ? "text-orange-700" : inMonth ? "text-slate-700" : "text-slate-400"}`}>
                                  {d.getDate()}
                                </div>
                                {/* Event labels: 1 row on mobile, up
                                    to 2 on sm+. The "+N more" overflow
                                    indicator surfaces the rest. */}
                                <div className="mt-1 space-y-0.5">
                                  {dayOrders.slice(0, 1).map((o) => (
                                    <div
                                      key={o.id}
                                      className={`text-[9px] sm:text-[10px] truncate rounded px-1 ${needsCover ? "bg-rose-100 text-rose-900" : "bg-blue-100 text-blue-900"}`}
                                    >
                                      {o.client_name || o.order_number || "Event"}
                                    </div>
                                  ))}
                                  {dayOrders.slice(1, 2).map((o) => (
                                    <div
                                      key={o.id}
                                      className={`hidden sm:block text-[10px] truncate rounded px-1 ${needsCover ? "bg-rose-100 text-rose-900" : "bg-blue-100 text-blue-900"}`}
                                    >
                                      {o.client_name || o.order_number || "Event"}
                                    </div>
                                  ))}
                                  {/* Overflow indicator: mobile (>=1
                                      hidden), desktop (>=2 hidden). */}
                                  {dayOrders.length > 1 && (
                                    <div className="text-[9px] sm:text-[10px] text-slate-500 sm:hidden">
                                      +{dayOrders.length - 1} more
                                    </div>
                                  )}
                                  {dayOrders.length > 2 && (
                                    <div className="hidden sm:block text-[10px] text-slate-500">
                                      +{dayOrders.length - 2} more
                                    </div>
                                  )}
                                </div>
                                {distinctChefs > 0 && (
                                  <div className="text-[9px] sm:text-[10px] text-brand-primary mt-1 inline-flex items-center gap-0.5">
                                    <Users className="w-2.5 h-2.5" />
                                    <span className="hidden sm:inline">{distinctChefs} chef{distinctChefs === 1 ? "" : "s"}</span>
                                    <span className="sm:hidden tabular-nums">{distinctChefs}</span>
                                  </div>
                                )}
                                {needsCover && (
                                  <div className="text-[9px] sm:text-[10px] text-rose-700 font-medium mt-0.5 inline-flex items-center gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    <span className="hidden sm:inline"> No cover</span>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-2 flex flex-wrap gap-3">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-200"></span>
                            Event booked
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-rose-100 border border-rose-200"></span>
                            No chef rostered
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-orange-50 border border-orange-200"></span>
                            Today
                          </span>
                          <span className="hidden sm:inline ml-auto text-slate-400">Click a day to open the week and roster shifts.</span>
                        </div>
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          </div>
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
          actorUserId={user?.id ?? null}
          onCreated={() => { setLogTarget(null); void load(); }}
        />
      )}

      {/* Wave 41 Phase 3 - add-task modal. Defaults to 'kitchen'
          on this page; operator can pick any of the 8 task types. */}
      {addTaskTarget && companyId && (
        <AddShiftTaskModal
          open={!!addTaskTarget}
          onOpenChange={(o) => !o && setAddTaskTarget(null)}
          companyId={companyId}
          shiftId={addTaskTarget.shiftId}
          assignedUserId={addTaskTarget.assignedUserId}
          defaultType="kitchen"
          actorUserId={user?.id ?? null}
          onCreated={() => { setAddTaskTarget(null); void refreshTasks(); }}
        />
      )}
    </>
  );
}

export default function ProtectedKitchenSchedulePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.KITCHEN_MANAGER]}>
      <KitchenScheduleGrid />
    </ProtectedRoute>
  );
}
