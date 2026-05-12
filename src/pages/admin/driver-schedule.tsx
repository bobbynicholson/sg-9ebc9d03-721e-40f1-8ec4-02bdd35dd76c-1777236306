/**
 * /admin/driver-schedule -- weekly grid view of every driver's
 * shifts for the selected week.
 *
 * Phase 9 #8. Until now, the dispatch lead had to open each
 * driver one at a time on /admin/driver-management to see who
 * was on shift when. There was no single screen showing the
 * whole team's coverage for the week, which made it painful to
 * spot Sunday gaps or double-booked drivers.
 *
 * Read-only at the row level. Clicking any empty cell opens
 * LogDriverShiftModal pre-targeted at that driver -- so the
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
import { Calendar, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { LogDriverShiftModal } from "@/components/admin/LogDriverShiftModal";

interface Driver {
  id: string;
  full_name: string;
  email: string;
}

interface ShiftRow {
  id: string;
  driver_id: string;
  shift_date: string;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  rate_multiplier: number | null;
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
          .select("id, driver_id, shift_date, actual_start, actual_end, status, rate_multiplier")
          .eq("company_id", companyId)
          .gte("shift_date", fromIso)
          .lte("shift_date", toIso)
          .is("deleted_at", null),
      ]);
      setDrivers((driversRes.data || []) as Driver[]);
      setShifts((shiftsRes.data || []) as ShiftRow[]);
    } catch {
      setDrivers([]);
      setShifts([]);
    } finally {
      setLoading(false);
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

  // Per-day total hours across all drivers -- footer row.
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

  const weekLabel = `${weekStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} — ${addDays(weekStart, 6).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <>
      <Head><title>Driver schedule - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80">
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
                                const totalHours = cellShifts.reduce((acc, s) => acc + fmtHours(s.actual_start, s.actual_end).hours, 0);
                                driverTotal += totalHours;
                                const hasShift = cellShifts.length > 0;
                                return (
                                  <td key={i} className="px-1.5 py-1.5 text-center align-top">
                                    {hasShift ? (
                                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                                        <div className="text-sm font-semibold tabular-nums text-emerald-900">
                                          {totalHours.toFixed(1)}h
                                        </div>
                                        {cellShifts.some((s) => (s.rate_multiplier ?? 1) > 1) && (
                                          <Badge className="mt-0.5 bg-amber-100 text-amber-800 border-amber-200 text-[10px] px-1 py-0">
                                            x{Math.max(...cellShifts.map((s) => Number(s.rate_multiplier ?? 1)))}
                                          </Badge>
                                        )}
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
