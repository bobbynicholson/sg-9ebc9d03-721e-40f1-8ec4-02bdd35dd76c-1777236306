/**
 * /admin/kitchen-schedule -- weekly grid view of every kitchen
 * staffer's planned roster for the selected week.
 *
 * Wave 36.1. Mirrors /admin/driver-schedule.tsx 1:1 -- same week
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
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Loader2, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { LogKitchenShiftModal } from "@/components/admin/LogKitchenShiftModal";

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
  const companyId = user?.company_id;
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [staff, setStaff] = useState<Staffer[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [logTarget, setLogTarget] = useState<{ staffId: string; staffName: string; date: string } | null>(null);

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
      const [staffRes, shiftsRes] = await Promise.all([
        // Wave 36.1: kitchen_staff role for chefs. Some tenants
        // also flag head chefs as company_admin -- pull both so the
        // grid shows everyone who could be on a kitchen shift.
        (supabase as any)
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("company_id", companyId)
          .in("role", ["kitchen_staff", "company_admin", "owner"])
          .is("deleted_at", null)
          .order("full_name", { ascending: true }),
        (supabase as any)
          .from("kitchen_shifts")
          .select("id, staff_id, shift_date, planned_start, planned_end, actual_start, actual_end, status, rate_multiplier, notes")
          .eq("company_id", companyId)
          .gte("shift_date", fromIso)
          .lte("shift_date", toIso)
          .is("deleted_at", null),
      ]);
      setStaff((staffRes.data || []) as Staffer[]);
      setShifts((shiftsRes.data || []) as ShiftRow[]);
    } catch {
      setStaff([]);
      setShifts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
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

  const weekLabel = `${weekStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} -- ${addDays(weekStart, 6).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`;

  const todayIso = toLocalISO(new Date());

  return (
    <>
      <Head><title>Kitchen schedule - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-12 max-w-full">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-md flex-shrink-0">
                  <CalendarClock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Kitchen schedule</h1>
                  <p className="text-slate-600 text-sm mt-0.5">
                    Weekly roster. Click an empty cell to plan a shift; cells flip to actual hours when the chef clocks in.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
              </div>
            </div>

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
                ) : (
                  <div className="overflow-x-auto">
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
                                                    ? "border-emerald-200 bg-emerald-50"
                                                    : "border-orange-200 bg-orange-50"
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-1">
                                                <span className={`text-xs font-semibold tabular-nums ${
                                                  isMissed ? "text-red-900" :
                                                  hasActual ? "text-emerald-900" :
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
                                                <div className="text-[10px] text-emerald-700 mt-0.5 tabular-nums">
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
                )}
              </CardContent>
            </Card>
          </div>
        </div>
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
    </>
  );
}

export default function ProtectedKitchenSchedulePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <KitchenScheduleGrid />
    </ProtectedRoute>
  );
}
