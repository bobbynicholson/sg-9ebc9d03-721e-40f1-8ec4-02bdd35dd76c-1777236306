import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Users, Clock, Loader2, Play, Square, ChefHat, TrendingUp, Target, Coffee, AlertTriangle, DollarSign } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { kitchenPrepService } from "@/services/kitchenPrepService";

interface Shift {
  id: string;
  staff_id: string | null;
  user_id: string | null;
  order_id: string | null;
  shift_start: string | null;
  shift_end: string | null;
  shift_type: string | null;
  is_active: boolean | null;
  break_started_at: string | null;
  total_break_min: number;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  hourly_rate: number | null;
}

export default function KitchenDutyRosterPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [active, setActive] = useState<Shift[]>([]);
  const [recent, setRecent] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [endingShift, setEndingShift] = useState<Shift | null>(null);
  const [handoffNotes, setHandoffNotes] = useState("");

  // Phase 3: rolling 7-day chef performance roll-up. Cheap query, info-only,
  // no clicks needed -- shows up under the "On duty now" panel.
  const [chefPerf, setChefPerf] = useState<Array<{
    chef_id: string;
    chef_name: string;
    tasks_completed: number;
    on_time_rate: number;
    avg_yield_variance_pct: number | null;
  }>>([]);

  // Phase 4: live tick + tenant settings drive earnings, overtime warning
  // and overdue-break prompt. Settings have safe defaults so the page
  // works even before any tenant tunes them.
  const [now, setNow] = useState(new Date());
  const [settings, setSettings] = useState({
    overtimeAfterHours: 9,
    maxHotHoldMin: 90,
    mealBreakAfterHours: 5,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data: activeShifts } = await supabase
        .from("kitchen_duty_shifts")
        .select("*")
        .eq("company_id", user.company_id)
        .eq("is_active", true)
        .order("shift_start", { ascending: false })
        .returns<Shift[]>();

      const { data: recentShifts } = await supabase
        .from("kitchen_duty_shifts")
        .select("*")
        .eq("company_id", user.company_id)
        .eq("is_active", false)
        .order("shift_end", { ascending: false })
        .limit(20)
        .returns<Shift[]>();

      setActive(activeShifts || []);
      setRecent(recentShifts || []);

      const ids = new Set<string>();
      [...(activeShifts || []), ...(recentShifts || [])].forEach((s) => {
        if (s.staff_id) ids.add(s.staff_id);
      });
      if (ids.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email, role, hourly_rate")
          .in("id", Array.from(ids))
          .returns<Profile[]>();
        const map: Record<string, Profile> = {};
        (profiles || []).forEach((p) => { map[p.id] = p; });
        setStaff(map);
      }

      // Pull tenant kitchen settings for overtime / break thresholds
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("kitchen_settings")
          .eq("id", user.company_id)
          .single();
        const ks: any = company?.kitchen_settings || {};
        setSettings({
          overtimeAfterHours: Number(ks.overtimeAfterHours ?? 9),
          maxHotHoldMin: Number(ks.maxHotHoldMin ?? 90),
          mealBreakAfterHours: Number(ks.mealBreakAfterHours ?? 5),
        });
      } catch (sErr) {
        console.warn("Settings load failed, using defaults:", sErr);
      }

      // Phase 3: chef performance for the last 7 days
      try {
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 86400000);
        const perf = await kitchenPrepService.getChefPerformance(
          user.company_id,
          from.toISOString(),
          to.toISOString(),
        );
        setChefPerf(perf);
      } catch (perfErr) {
        console.warn("Chef performance query failed:", perfErr);
      }
    } catch (e) {
      toast({ title: "Could not load duty roster", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const myActiveShift = useMemo(
    () => active.find((s) => s.staff_id === user?.id) ?? null,
    [active, user?.id],
  );

  const startShift = async () => {
    if (!user?.id || !user?.company_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("kitchen_duty_shifts").insert([{
        company_id: user.company_id,
        staff_id: user.id,
        user_id: user.id,
        shift_start: new Date().toISOString(),
        is_active: true,
        shift_type: "kitchen",
      }] as never);
      if (error) throw error;
      toast({ title: "Clocked in", description: "Welcome to your shift" });
      load();
    } catch (e: any) {
      toast({ title: "Could not clock in", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEndShift = (shift: Shift) => {
    setEndingShift(shift);
    setHandoffNotes("");
  };

  const confirmEndShift = async () => {
    if (!endingShift) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("kitchen_duty_shifts")
        .update({
          is_active: false,
          shift_end: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", endingShift.id);
      if (error) throw error;

      // Phase 1: hand-off notes ALWAYS save now. The previous flow silently
      // dropped them when the shift had no order_id (the common case). They
      // go to kitchen_handoffs so anyone starting the next shift sees them.
      if (handoffNotes.trim() && user?.id && user.company_id) {
        try {
          await supabase.from("kitchen_handoffs").insert([{
            company_id: user.company_id,
            author_id: user.id,
            shift_id: endingShift.id,
            body: handoffNotes.trim(),
          }] as never);

          // Also keep a per-order task_completions row when an order_id exists
          // (preserves the existing audit trail surface that admin views)
          if (endingShift.order_id) {
            await supabase.from("kitchen_task_completions").insert([{
              order_id: endingShift.order_id,
              completed_by: user.id,
              user_id: user.id,
              staff_id: user.id,
              task_type: "handoff",
              notes: handoffNotes.trim(),
              completed_at: new Date().toISOString(),
            }] as never);
          }
        } catch (handoffErr) {
          console.warn("Could not save hand-off note:", handoffErr);
        }
      }
      toast({ title: "Clocked out", description: "Hand-off note saved." });
      setEndingShift(null);
      setHandoffNotes("");
      load();
    } catch (e: any) {
      toast({ title: "Could not end shift", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Phase 4: break toggle. Pure pass-through to the service so the timestamp
  // bookkeeping stays in one place.
  const handleToggleBreak = async (shift: Shift) => {
    setSaving(true);
    try {
      if (shift.break_started_at) {
        await kitchenPrepService.endBreak(shift.id);
        toast({ title: "Break ended", description: "Welcome back to your shift." });
      } else {
        await kitchenPrepService.startBreak(shift.id);
        toast({ title: "Break started", description: "Take 5. Tap again when you return." });
      }
      load();
    } catch (e: any) {
      toast({ title: "Could not toggle break", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Tiny formatters for the earnings panel
  const fmtMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const fmtDuration = (start?: string | null, end?: string | null) => {
    if (!start) return "--";
    const a = new Date(start).getTime();
    const b = end ? new Date(end).getTime() : Date.now();
    const mins = Math.max(0, Math.floor((b - a) / 60000));
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <>
      <Head><title>Kitchen Duty Roster - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent flex items-center gap-3">
              <Users className="h-7 w-7 text-orange-600" />
              Kitchen Duty Roster
            </h1>
            <p className="text-sm text-slate-600 mt-1">Who is in the kitchen right now and recent shift history</p>
          </div>

          {/* Phase 4: live earnings + overtime + break panel. Numbers tick
              every 30s without any DB hit -- pure math off the shift row. */}
          {(() => {
            const myProfile = user?.id ? staff[user.id] : null;
            const earnings = myActiveShift
              ? kitchenPrepService.computeShiftEarnings({
                  shiftStart: myActiveShift.shift_start,
                  breakStartedAt: myActiveShift.break_started_at,
                  totalBreakMin: myActiveShift.total_break_min,
                  hourlyRate: myProfile?.hourly_rate ?? null,
                  settings,
                  now,
                })
              : null;
            const onBreak = !!myActiveShift?.break_started_at;
            return (
              <Card className={`mb-6 border-2 ${
                earnings?.overtime ? "border-red-300 bg-red-50/40" :
                earnings?.overdueBreak ? "border-amber-300 bg-amber-50/40" :
                "border-orange-200 bg-gradient-to-r from-orange-50 to-red-50"
              }`}>
                <CardContent className="p-4 sm:p-6 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                        <ChefHat className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 flex items-center gap-1">
                          Your status
                          <InfoTooltip content="Live shift summary. Earnings show only if your hourly rate is set on your profile. Break time is excluded from worked hours." />
                        </p>
                        <p className="text-base font-semibold text-slate-900">
                          {myActiveShift
                            ? onBreak
                              ? `On break -- ${fmtDuration(myActiveShift.break_started_at)}`
                              : `On shift -- ${fmtMinutes(earnings?.workedMin ?? 0)}`
                            : "Not clocked in"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {myActiveShift && (
                        <Button
                          onClick={() => handleToggleBreak(myActiveShift)}
                          disabled={saving}
                          variant="outline"
                          className={onBreak ? "border-emerald-400 text-emerald-700 hover:bg-emerald-50" : ""}
                        >
                          <Coffee className="h-4 w-4 mr-2" />
                          {onBreak ? "End break" : "Start break"}
                        </Button>
                      )}
                      {myActiveShift ? (
                        <Button onClick={() => openEndShift(myActiveShift)} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
                          <Square className="h-4 w-4 mr-2" />Clock out
                        </Button>
                      ) : (
                        <Button onClick={startShift} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Clocking in</> : <><Play className="h-4 w-4 mr-2" />Clock in</>}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Earnings strip -- only renders when on shift */}
                  {myActiveShift && earnings && (
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-orange-200">
                      <div className="rounded-md bg-white/70 p-2 sm:p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Worked</div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">{fmtMinutes(earnings.workedMin)}</div>
                      </div>
                      <div className="rounded-md bg-white/70 p-2 sm:p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Break</div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">{fmtMinutes(earnings.breakMin)}</div>
                      </div>
                      <div className="rounded-md bg-white/70 p-2 sm:p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <DollarSign className="h-2.5 w-2.5" />Earnings
                        </div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">
                          {earnings.earnings != null ? `R ${earnings.earnings.toFixed(2)}` : "Set rate"}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warnings -- overtime first, break second */}
                  {earnings?.overtime && (
                    <div className="flex items-start gap-2 text-xs text-red-800 bg-red-100/70 rounded-md p-2.5 border border-red-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Overtime -- </span>
                        you've worked over {settings.overtimeAfterHours}h. Confirm with your manager that the extra hours are approved.
                      </div>
                    </div>
                  )}
                  {earnings?.overdueBreak && !earnings.overtime && (
                    <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-100/70 rounded-md p-2.5 border border-amber-200">
                      <Coffee className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Time for a break -- </span>
                        you've been on shift over {settings.mealBreakAfterHours}h with no break logged.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            On duty now -- {active.length}
            <InfoTooltip content="Everyone currently clocked in for a kitchen shift." />
          </h2>
          <Card className="mb-6">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : active.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No-one is currently on duty</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {active.map((s) => {
                    const p = s.staff_id ? staff[s.staff_id] : null;
                    return (
                      <li key={s.id} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <ChefHat className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{p?.full_name ?? p?.email ?? "Unknown staff"}</div>
                          <div className="text-xs text-slate-500">{s.shift_type ?? "kitchen"} -- started {s.shift_start ? formatDistanceToNow(new Date(s.shift_start), { addSuffix: true }) : "--"}</div>
                        </div>
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 tabular-nums">
                          <Clock className="h-3 w-3 mr-1" />{fmtDuration(s.shift_start)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Phase 3: per-chef performance roll-up, last 7 days. Three numbers
              per chef -- tasks done, on-time %, avg yield variance. Shows
              empty-state copy when no completed tasks yet. */}
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            Chef performance -- last 7 days
            <InfoTooltip content="Rolling 7-day rollup of completed prep tasks by chef.\n\nOn-time = task completed within 5 minutes of its planned end (start_at + duration).\n\nYield variance = average % difference between planned and actual yield -- only shows if your team logs actuals." />
          </h2>
          <Card className="mb-6">
            <CardContent className="p-0">
              {chefPerf.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  No completed prep tasks in the last 7 days
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {chefPerf.map((p) => (
                    <li key={p.chef_id} className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <ChefHat className="h-5 w-5 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">{p.chef_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {p.tasks_completed} task{p.tasks_completed === 1 ? "" : "s"} completed
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50">
                          <Target className="h-3.5 w-3.5 text-slate-500" />
                          <span className={`font-semibold tabular-nums ${
                            p.on_time_rate >= 90 ? "text-emerald-700" :
                            p.on_time_rate >= 70 ? "text-amber-700"   :
                                                   "text-red-700"
                          }`}>{p.on_time_rate}%</span>
                          <span className="text-slate-500">on-time</span>
                        </div>
                        {p.avg_yield_variance_pct !== null && (
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50">
                            <TrendingUp className="h-3.5 w-3.5 text-slate-500" />
                            <span className="font-semibold text-slate-900 tabular-nums">
                              {p.avg_yield_variance_pct > 0 ? "+" : ""}{p.avg_yield_variance_pct}%
                            </span>
                            <span className="text-slate-500">yield</span>
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 tabular-nums sm:hidden">
                        {p.on_time_rate}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            Recent shifts
            <InfoTooltip content="The last 20 shifts that have ended, newest first." />
          </h2>
          <Card>
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No completed shifts yet</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recent.map((s) => {
                    const p = s.staff_id ? staff[s.staff_id] : null;
                    return (
                      <li key={s.id} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <ChefHat className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{p?.full_name ?? p?.email ?? "Unknown staff"}</div>
                          <div className="text-xs text-slate-500">
                            {s.shift_end ? `Ended ${formatDistanceToNow(new Date(s.shift_end), { addSuffix: true })}` : "--"} -- {fmtDuration(s.shift_start, s.shift_end)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={!!endingShift} onOpenChange={(o) => { if (!o) { setEndingShift(null); setHandoffNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End shift</DialogTitle>
            <DialogDescription>
              Optional hand-off note for the next person on duty -- e.g. "starter prep done, mains in the walk-in, oven on 180 for 20 more min".
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={handoffNotes}
            onChange={(e) => setHandoffNotes(e.target.value)}
            rows={4}
            placeholder="Hand-off notes (optional)"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndingShift(null)} disabled={saving}>Cancel</Button>
            <Button onClick={confirmEndShift} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ending</> : "Clock out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
