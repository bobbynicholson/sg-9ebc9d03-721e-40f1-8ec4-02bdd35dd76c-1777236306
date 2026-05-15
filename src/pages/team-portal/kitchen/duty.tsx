import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Users, Clock, Loader2, Play, Square, ChefHat, TrendingUp, Target, Coffee, AlertTriangle, DollarSign, Activity, MessageSquareText, Check, Calendar as CalendarIcon } from "lucide-react";
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

  // Wave 35: hand-off notes. Was write-only -- the previous flow
  // saved notes to kitchen_handoffs on clock-out but no surface ever
  // displayed them, so the next chef on duty had no idea they
  // existed. Schema even has acknowledged_at/acknowledged_by columns
  // pointing at an ack flow that was never wired up. Surfaced here
  // as "Hand-off notes" with a one-tap acknowledge button.
  interface Handoff {
    id: string;
    company_id: string;
    author_id: string | null;
    shift_id: string | null;
    body: string | null;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    created_at: string | null;
  }
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [acking, setAcking] = useState<string | null>(null);

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

      // Wave 35: pull the most recent hand-off notes for this
      // tenant. Tight cap of 12 -- the relevant ones are always at
      // the top, older notes belong in audit not the floor view.
      try {
        const { data: hoData } = await supabase
          .from("kitchen_handoffs")
          .select("id, company_id, author_id, shift_id, body, acknowledged_at, acknowledged_by, created_at")
          .eq("company_id", user.company_id)
          .order("created_at", { ascending: false })
          .limit(12)
          .returns<Handoff[]>();
        setHandoffs(hoData || []);
        // Backfill the staff lookup so author names render.
        const authorIds = new Set<string>();
        (hoData || []).forEach((h) => { if (h.author_id) authorIds.add(h.author_id); });
        const newIds = [...authorIds].filter((id) => !staff[id]);
        if (newIds.length > 0) {
          const { data: extraProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, hourly_rate")
            .in("id", newIds)
            .returns<Profile[]>();
          if (extraProfiles && extraProfiles.length > 0) {
            setStaff((prev) => {
              const next = { ...prev };
              extraProfiles.forEach((p) => { next[p.id] = p; });
              return next;
            });
          }
        }
      } catch (hoErr) {
        console.warn("Hand-off notes load failed:", hoErr);
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

  // Wave 35: team-stat strip (4 headline numbers) derived from
  // existing data -- no new queries. Hours-today / hours-this-week
  // sum across active + recent shifts that touched the day window.
  // Avg-shift averages every recent shift with both start + end.
  const teamStats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay()); // Sunday-start, matches en-ZA convention

    const minutesInWindow = (s: Shift, windowStart: Date): number => {
      if (!s.shift_start) return 0;
      const startMs = Math.max(new Date(s.shift_start).getTime(), windowStart.getTime());
      const endMs = s.shift_end ? new Date(s.shift_end).getTime() : Date.now();
      const totalMin = Math.max(0, Math.floor((endMs - startMs) / 60000));
      return Math.max(0, totalMin - (s.total_break_min || 0));
    };

    const hoursToday = [...active, ...recent].reduce(
      (sum, s) => sum + minutesInWindow(s, startOfToday),
      0,
    ) / 60;
    const hoursThisWeek = [...active, ...recent].reduce(
      (sum, s) => sum + minutesInWindow(s, startOfWeek),
      0,
    ) / 60;
    const finishedShifts = recent.filter((s) => s.shift_start && s.shift_end);
    const avgShiftHours = finishedShifts.length === 0
      ? 0
      : finishedShifts.reduce((sum, s) => {
          const totalMin = Math.floor(
            (new Date(s.shift_end!).getTime() - new Date(s.shift_start!).getTime()) / 60000,
          );
          return sum + Math.max(0, totalMin - (s.total_break_min || 0));
        }, 0) / finishedShifts.length / 60;

    return {
      onDutyNow: active.length,
      hoursToday: Math.round(hoursToday * 10) / 10,
      hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
      avgShiftHours: Math.round(avgShiftHours * 10) / 10,
    };
    // `now` deliberately included so hours-today ticks live for any
    // shift still in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, recent, now]);

  // Group recent shifts by day for the timeline view.
  const recentByDay = useMemo(() => {
    const buckets = new Map<string, Shift[]>();
    for (const s of recent) {
      if (!s.shift_end) continue;
      const day = new Date(s.shift_end).toLocaleDateString("en-ZA", {
        weekday: "short", day: "numeric", month: "short",
      });
      if (!buckets.has(day)) buckets.set(day, []);
      buckets.get(day)!.push(s);
    }
    return Array.from(buckets.entries());
  }, [recent]);

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

  // Wave 35: acknowledge a hand-off note. Stamps acknowledged_at +
  // acknowledged_by so the original author can see "yes, the next
  // shift saw it." Idempotent -- a re-ack is a no-op.
  const handleAcknowledgeHandoff = async (handoffId: string) => {
    if (!user?.id) return;
    setAcking(handoffId);
    try {
      await supabase
        .from("kitchen_handoffs")
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        } as never)
        .eq("id", handoffId);
      // Optimistic local update so the button flips without a full reload.
      setHandoffs((prev) =>
        prev.map((h) =>
          h.id === handoffId
            ? { ...h, acknowledged_at: new Date().toISOString(), acknowledged_by: user.id }
            : h,
        ),
      );
      toast({ title: "Got it", description: "Hand-off acknowledged." });
    } catch (e: any) {
      toast({ title: "Could not acknowledge", description: e?.message, variant: "destructive" });
    } finally {
      setAcking(null);
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
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-screen-2xl">
          {/* Wave 35: header restyle. Icon-in-gradient-box pattern
              (matches the kitchen suite), live "X on duty" pulse pill
              that animates when anyone is clocked in. */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-md flex-shrink-0">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  Kitchen Duty Roster
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">Live floor, hand-off notes, performance</p>
              </div>
            </div>
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${
                active.length > 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
              title={active.length > 0 ? "Live -- updates every 30 seconds" : "Nobody on shift"}
            >
              <span className="relative flex h-2.5 w-2.5">
                {active.length > 0 && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${active.length > 0 ? "bg-emerald-500" : "bg-slate-400"}`}></span>
              </span>
              {active.length > 0 ? `${active.length} on duty now` : "Nobody on duty"}
            </div>
          </div>

          {/* Wave 35: team-stat strip. Four headline numbers derived
              from existing data -- no new queries. Hours-today ticks
              live because the useMemo deps include `now`. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> On duty now
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-600 tabular-nums mt-1">{teamStats.onDutyNow}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Hours today
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1">{teamStats.hoursToday}<span className="text-sm font-normal text-slate-500 ml-0.5">h</span></div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" /> This week
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1">{teamStats.hoursThisWeek}<span className="text-sm font-normal text-slate-500 ml-0.5">h</span></div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Avg shift
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums mt-1">{teamStats.avgShiftHours || "—"}<span className="text-sm font-normal text-slate-500 ml-0.5">h</span></div>
              </CardContent>
            </Card>
          </div>

          {/* Phase 4: live earnings + overtime + break panel. Numbers tick
              every 30s without any DB hit, pure math off the shift row. */}
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
                              ? `On break, ${fmtDuration(myActiveShift.break_started_at)}`
                              : `On shift, ${fmtMinutes(earnings?.workedMin ?? 0)}`
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

                  {/* Earnings strip, only renders when on shift.
                      Wave 33.6: was bg-white/70 which read as muddy
                      grey on the gradient parent card. Solid white
                      with a subtle border + shadow gives the numbers
                      the contrast a chef glancing at the kitchen
                      tablet needs. */}
                  {myActiveShift && earnings && (
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-orange-200">
                      <div className="rounded-md bg-white border border-orange-100 shadow-sm p-2 sm:p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Worked</div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">{fmtMinutes(earnings.workedMin)}</div>
                      </div>
                      <div className="rounded-md bg-white border border-orange-100 shadow-sm p-2 sm:p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Break</div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">{fmtMinutes(earnings.breakMin)}</div>
                      </div>
                      <div className="rounded-md bg-white border border-orange-100 shadow-sm p-2 sm:p-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <DollarSign className="h-2.5 w-2.5" />Earnings
                        </div>
                        <div className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">
                          {earnings.earnings != null ? `R ${earnings.earnings.toFixed(2)}` : "Set rate"}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warnings, overtime first, break second */}
                  {earnings?.overtime && (
                    <div className="flex items-start gap-2 text-xs text-red-800 bg-red-100/70 rounded-md p-2.5 border border-red-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Overtime, </span>
                        you've worked over {settings.overtimeAfterHours}h. Confirm with your manager that the extra hours are approved.
                      </div>
                    </div>
                  )}
                  {earnings?.overdueBreak && !earnings.overtime && (
                    <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-100/70 rounded-md p-2.5 border border-amber-200">
                      <Coffee className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Time for a break, </span>
                        you've been on shift over {settings.mealBreakAfterHours}h with no break logged.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Wave 35: section header restyle. Bigger sentence-case
              heading + a count chip + tooltip stay on the same line.
              Reads as a real heading, not a database row label. */}
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              Live floor
              <span className="text-sm font-normal text-slate-500">·</span>
              <span className="text-sm font-medium text-slate-600 tabular-nums">{active.length}</span>
              <InfoTooltip content="Everyone currently clocked in for a kitchen shift. Updates every 30 seconds." />
            </h2>
          </div>
          <Card className="mb-8 border-0 shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : active.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <ChefHat className="h-7 w-7 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Quiet kitchen</p>
                  <p className="text-xs text-slate-500 mt-1">When the team clocks in, they'll show up here in real time.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {active.map((s) => {
                    const p = s.staff_id ? staff[s.staff_id] : null;
                    const initials = (p?.full_name || p?.email || "?")
                      .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <li key={s.id} className="p-4 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                        <div className="relative flex-shrink-0">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-semibold shadow-sm">
                            {initials}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm" title="Live -- on shift" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{p?.full_name ?? p?.email ?? "Unknown staff"}</div>
                          <div className="text-xs text-slate-500 capitalize">{s.shift_type ?? "kitchen"} · started {s.shift_start ? formatDistanceToNow(new Date(s.shift_start), { addSuffix: true }) : "--"}</div>
                        </div>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 tabular-nums">
                          <Clock className="h-3 w-3 mr-1" />{fmtDuration(s.shift_start)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Wave 35: NEW SECTION (data already collected, just
              never displayed). kitchen_handoffs is written on every
              clock-out via the existing "Hand-off notes (optional)"
              dialog -- but no surface ever read it back. The schema
              has acknowledged_at + acknowledged_by columns showing
              the original schema designer expected an ack flow.
              Now wired up: shows the latest 12 notes, an
              "Acknowledge" button on unread ones, dimmed visual
              treatment on already-acked notes. */}
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-amber-600" />
              Hand-off notes
              {handoffs.filter((h) => !h.acknowledged_at).length > 0 && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] uppercase tracking-wider">
                  {handoffs.filter((h) => !h.acknowledged_at).length} new
                </Badge>
              )}
              <InfoTooltip content="What the previous shift left for you. Tap Acknowledge so the author knows you saw it." />
            </h2>
          </div>
          <Card className="mb-8 border-0 shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : handoffs.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <MessageSquareText className="h-7 w-7 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">No notes yet</p>
                  <p className="text-xs text-slate-500 mt-1">When someone clocks out and leaves a note, it lands here for the next shift.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {handoffs.map((h) => {
                    const author = h.author_id ? staff[h.author_id] : null;
                    const acked = !!h.acknowledged_at;
                    const initials = (author?.full_name || author?.email || "?")
                      .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <li key={h.id} className={`p-4 flex items-start gap-3 ${acked ? "opacity-60" : ""}`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 ${
                          acked ? "bg-slate-400" : "bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm"
                        }`}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {author?.full_name ?? author?.email ?? "Unknown chef"}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {h.created_at ? formatDistanceToNow(new Date(h.created_at), { addSuffix: true }) : "--"}
                            </div>
                          </div>
                          {h.body && (
                            <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap break-words">{h.body}</p>
                          )}
                          <div className="flex items-center justify-between gap-2 mt-2">
                            {acked ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                                <Check className="w-3 h-3" />
                                Acknowledged
                                {h.acknowledged_by && staff[h.acknowledged_by] ? ` by ${staff[h.acknowledged_by].full_name || staff[h.acknowledged_by].email}` : ""}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
                                onClick={() => handleAcknowledgeHandoff(h.id)}
                                disabled={acking === h.id}
                              >
                                {acking === h.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                                Acknowledge
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Phase 3 + Wave 35: chef performance, restyled. Visual
              ranking with on-time bar; bigger numbers; ChefHat
              avatar with rank pill. */}
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-600" />
              This week's chefs
              <InfoTooltip content="Rolling 7-day rollup of completed prep tasks by chef.\n\nOn-time = task completed within 5 minutes of its planned end (start_at + duration).\n\nYield variance = average % difference between planned and actual yield, only shows if your team logs actuals." />
            </h2>
          </div>
          <Card className="mb-8 border-0 shadow-sm">
            <CardContent className="p-0">
              {chefPerf.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Target className="h-7 w-7 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Performance ranking is empty</p>
                  <p className="text-xs text-slate-500 mt-1">Complete a few prep tasks across this week and the leaderboard will populate.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {chefPerf.map((p, idx) => {
                    const initials = (p.chef_name || "?")
                      .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                    const onTimeTone =
                      p.on_time_rate >= 90 ? "from-emerald-400 to-emerald-600" :
                      p.on_time_rate >= 70 ? "from-amber-400 to-orange-500" :
                                              "from-rose-400 to-red-600";
                    return (
                      <li key={p.chef_id} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                        <div className="relative flex-shrink-0">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-semibold shadow-sm">
                            {initials}
                          </div>
                          {idx < 3 && (
                            <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm ${
                              idx === 0 ? "bg-yellow-400 text-yellow-900" :
                              idx === 1 ? "bg-slate-300 text-slate-800" :
                                          "bg-amber-700 text-amber-100"
                            }`}>
                              {idx + 1}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{p.chef_name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {p.tasks_completed} task{p.tasks_completed === 1 ? "" : "s"} completed
                            {p.avg_yield_variance_pct !== null && (
                              <span className="ml-2">
                                · yield {p.avg_yield_variance_pct > 0 ? "+" : ""}{p.avg_yield_variance_pct}%
                              </span>
                            )}
                          </div>
                          {/* On-time bar -- visual ranking instead of a chip */}
                          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full bg-gradient-to-r ${onTimeTone} transition-all`}
                              style={{ width: `${Math.max(2, Math.min(100, p.on_time_rate))}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-lg sm:text-xl font-bold tabular-nums ${
                            p.on_time_rate >= 90 ? "text-emerald-700" :
                            p.on_time_rate >= 70 ? "text-amber-700"   :
                                                   "text-rose-700"
                          }`}>
                            {p.on_time_rate}%
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-500">on-time</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Wave 35: recent shifts grouped by day so the operator
              can see "Friday: 3 shifts" at a glance instead of a
              flat 20-row stream. Each shift compact one-liner. */}
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-slate-600" />
              Recent shifts
              <InfoTooltip content="The last 20 shifts that have ended, newest first, grouped by day." />
            </h2>
          </div>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Clock className="h-7 w-7 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">No completed shifts yet</p>
                  <p className="text-xs text-slate-500 mt-1">As chefs clock out, their finished shifts will land here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentByDay.map(([day, shifts]) => {
                    const dayMins = shifts.reduce((sum, s) => {
                      if (!s.shift_start || !s.shift_end) return sum;
                      const total = Math.floor(
                        (new Date(s.shift_end).getTime() - new Date(s.shift_start).getTime()) / 60000,
                      );
                      return sum + Math.max(0, total - (s.total_break_min || 0));
                    }, 0);
                    return (
                      <div key={day}>
                        <div className="px-4 py-2 bg-slate-50/70 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{day}</span>
                          <span className="text-slate-500 tabular-nums">{shifts.length} shift{shifts.length === 1 ? "" : "s"} · {fmtMinutes(dayMins)}</span>
                        </div>
                        <ul>
                          {shifts.map((s) => {
                            const p = s.staff_id ? staff[s.staff_id] : null;
                            const initials = (p?.full_name || p?.email || "?")
                              .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                            return (
                              <li key={s.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold flex-shrink-0">
                                  {initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-900 truncate">{p?.full_name ?? p?.email ?? "Unknown staff"}</div>
                                  <div className="text-xs text-slate-500">
                                    {s.shift_end ? `Ended ${formatDistanceToNow(new Date(s.shift_end), { addSuffix: true })}` : "--"}
                                  </div>
                                </div>
                                <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 tabular-nums text-xs">
                                  {fmtDuration(s.shift_start, s.shift_end)}
                                </Badge>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
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
              Optional hand-off note for the next person on duty, e.g. "starter prep done, mains in the walk-in, oven on 180 for 20 more min".
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
