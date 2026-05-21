/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Clock, Users as UsersIcon, Loader2, ChevronLeft, ChevronRight,
  CalendarDays, LayoutGrid, ChefHat, TrendingUp, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { KitchenServiceFAB } from "@/components/kitchen/KitchenServiceFAB";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { kitchenPrepService, type KitchenStation } from "@/services/kitchenPrepService";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

interface Order {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  status: string | null;
  special_instructions: string | null;
}

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string | null;
  quantity: number | null;
  special_instructions: string | null;
}

const STATUS_TONES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-purple-100 text-purple-800 border-purple-200",
  ready:      "bg-green-100 text-green-800 border-green-200",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
};

// Task block colours - one tone per status. Soft enough to layer on a
// striped grid without screaming.
const TASK_TONES: Record<string, string> = {
  pending:     "bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300",
  in_progress: "bg-blue-200  border-blue-400  text-blue-900  hover:bg-blue-300",
  done:        "bg-emerald-200 border-emerald-400 text-emerald-900 hover:bg-emerald-300",
  skipped:     "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 line-through",
};

const TASK_TYPE_LABEL: Record<string, string> = {
  prep: "Prep", cook: "Cook", cool: "Cool", pack: "Pack", plate: "Plate",
};

// Day grid spans 06:00 -> 23:00 = 17 hours = 1020 minutes.
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const DAY_TOTAL_MIN = (DAY_END_HOUR - DAY_START_HOUR) * 60; // 1020

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d: Date) { return toLocalISO(d); }
function fmtDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}
function fmtFullDay(d: Date) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}
function fmtTime(t?: string | null) {
  if (!t) return "TBC";
  return t.slice(0, 5);
}

type ViewMode = "day" | "week";

export default function KitchenProductionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date())); // pivots both views
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [loading, setLoading] = useState(true);

  // Kitchen persona follow-up (docs/personas/kitchen.md section 5.3).
  // The "Start cooking next" widget renders countdowns derived from
  // Date.now() inline, so the late-badge classes go stale until the
  // next data refresh. A 60s tick re-renders the widget and feeds the
  // overdue-toast watcher below, so a task slipping past its deadline
  // pings the chef proactively instead of waiting for them to look.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Track which task ids we've already toasted as overdue so a task
  // that stays late for an hour doesn't toast 60 times. Cleared by
  // task completion (the task drops out of the queued list).
  const alertedOverdueRef = useRef<Set<string>>(new Set());

  // Phase 4: recipe accuracy report - always loads the trailing 30 days so
  // the panel reflects actual yield history, not just the day on screen.
  const [recipeAccuracy, setRecipeAccuracy] = useState<Array<{
    recipe_name: string;
    samples: number;
    avg_planned: number;
    avg_actual: number;
    avg_variance_pct: number;
    yield_unit: string | null;
  }>>([]);

  // Date window: day = 1 day, week = 7 days starting Monday (or anchor)
  const windowDays = useMemo(() => {
    if (view === "day") return [anchor];
    return Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  }, [view, anchor]);

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const from = windowDays[0];
      const to = addDays(windowDays[windowDays.length - 1], 1);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();

      const [ordsRes, stationsRes, tasksRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, event_name, event_date, event_time, guest_count, status, special_instructions")
          .eq("company_id", user.company_id)
          .gte("event_date", isoDate(from))
          .lt("event_date", isoDate(to))
          .neq("status", "cancelled")
          .order("event_date", { ascending: true })
          .order("event_time", { ascending: true }),
        kitchenPrepService.getStationsForCompany(user.company_id),
        kitchenPrepService.getTasksForDateRange(user.company_id, fromISO, toISO),
      ]);

      if (ordsRes.error) throw ordsRes.error;
      const ords = (ordsRes.data || []) as Order[];
      setOrders(ords);
      setStations(stationsRes);
      setTasks(tasksRes);

      const orderIds = ords.map((o) => o.id);
      if (orderIds.length === 0) {
        setItems([]);
      } else {
        const { data: lineItems } = await supabase
          .from("order_items")
          .select("id, order_id, menu_item_id, item_name, quantity, special_instructions")
          .in("order_id", orderIds);
        setItems((lineItems || []) as OrderItem[]);
      }

      // Phase 4: pull trailing 30 days of recipe accuracy. Cheap, zero
      // results when no yields have been logged - panel stays hidden.
      try {
        const accFrom = new Date(Date.now() - 30 * 86400000).toISOString();
        const accTo = new Date().toISOString();
        const accuracy = await kitchenPrepService.getRecipeAccuracy(user.company_id, accFrom, accTo);
        setRecipeAccuracy(accuracy);
      } catch (accErr) {
        console.warn("Recipe accuracy query failed:", accErr);
      }
    } catch (e: any) {
      toast({ title: "Could not load production", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, windowDays, toast]);

  useEffect(() => { load(); }, [load]);

  // ── Derived state ──────────────────────────────────────────────────────
  const itemsByOrder = useMemo(() => {
    const map: Record<string, OrderItem[]> = {};
    items.forEach((i) => { (map[i.order_id] = map[i.order_id] || []).push(i); });
    return map;
  }, [items]);

  const ordersByDate = useMemo(() => {
    const map: Record<string, Order[]> = {};
    orders.forEach((o) => { if (o.event_date) (map[o.event_date] = map[o.event_date] || []).push(o); });
    return map;
  }, [orders]);

  const totals = useMemo(() => {
    const events = orders.length;
    const guests = orders.reduce((s, o) => s + Number(o.guest_count || 0), 0);
    const dishes = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const cookHours = Math.round(tasks.reduce((s, t) => s + Number(t.duration_min || 0), 0) / 60);
    return { events, guests, dishes, cookHours };
  }, [orders, items, tasks]);

  // Group tasks by date for the day view to filter to this day
  const tasksOnAnchor = useMemo(() => {
    if (view !== "day") return [];
    const start = startOfDay(anchor).getTime();
    const end = addDays(anchor, 1).getTime();
    return tasks.filter((t: any) => {
      const ts = new Date(t.start_at).getTime();
      return ts >= start && ts < end;
    });
  }, [tasks, view, anchor]);

  // Overdue-task watcher. Fires a destructive toast the first time a
  // pending task's start_at crosses into the past. Only checks day
  // view's tasks (week view is too coarse to surface live alerts) and
  // only checks pending-not-started tasks (a started or completed
  // task is no longer overdue in the actionable sense).
  // Tracked via alertedOverdueRef so a task staying late for an hour
  // doesn't toast 60 times. The set self-cleans when the task drops
  // out of tasksOnAnchor (started, deleted, day rolled over).
  useEffect(() => {
    if (view !== "day") return;
    const stillVisibleIds = new Set<string>();
    const newlyOverdue: any[] = [];
    for (const t of tasksOnAnchor) {
      if (t.status !== "pending" || t.started_at) continue;
      stillVisibleIds.add(t.id as string);
      const startMs = new Date(t.start_at).getTime();
      if (startMs <= nowMs && !alertedOverdueRef.current.has(t.id as string)) {
        newlyOverdue.push(t);
      }
    }
    // Garbage-collect ids no longer in the queued window so a task
    // re-added (rare - admin rolls back a status) can re-alert.
    for (const id of Array.from(alertedOverdueRef.current)) {
      if (!stillVisibleIds.has(id)) alertedOverdueRef.current.delete(id);
    }
    for (const t of newlyOverdue) {
      alertedOverdueRef.current.add(t.id as string);
      const dueClock = new Date(t.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
      toast({
        title: "Prep task overdue",
        description: `${t.menu_item_name || "Item"} should have started at ${dueClock}.`,
        variant: "destructive",
      });
    }
  }, [tasksOnAnchor, nowMs, view, toast]);

  // Task position helper for the day grid
  const taskPosition = (task: any): { leftPct: number; widthPct: number } | null => {
    const ts = new Date(task.start_at);
    const dayStart = new Date(anchor);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const minsFromStart = (ts.getTime() - dayStart.getTime()) / 60_000;
    if (minsFromStart < 0 || minsFromStart >= DAY_TOTAL_MIN) return null;
    const leftPct = (minsFromStart / DAY_TOTAL_MIN) * 100;
    const widthPct = Math.max(2, (Number(task.duration_min || 30) / DAY_TOTAL_MIN) * 100);
    return { leftPct, widthPct };
  };

  // Stations including a "Unassigned" pseudo-row for tasks without a station
  const stationsForGrid = useMemo(() => {
    const list: Array<{ id: string | null; name: string; station_type: string }> = stations.map(s => ({
      id: s.id, name: s.name, station_type: s.station_type,
    }));
    const hasUnassigned = tasksOnAnchor.some((t: any) => !t.station_id);
    if (hasUnassigned) list.push({ id: null, name: "Unassigned", station_type: "general" });
    return list;
  }, [stations, tasksOnAnchor]);

  const tasksByStation = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const s of stationsForGrid) {
      const key = s.id ?? "__unassigned__";
      map[key] = [];
    }
    for (const t of tasksOnAnchor) {
      const key = t.station_id ?? "__unassigned__";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasksOnAnchor, stationsForGrid]);

  // ── Header navigation ──────────────────────────────────────────────────
  const stepBack = () => setAnchor(d => addDays(d, view === "day" ? -1 : -7));
  const stepFwd  = () => setAnchor(d => addDays(d, view === "day" ?  1 :  7));
  const goToday  = () => setAnchor(startOfDay(new Date()));

  return (
    <>
      <Head><title>Production Timeline - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent flex items-center gap-2">
                <Calendar className="h-6 w-6 text-orange-600" />
                Production timeline
                <InfoTooltip content="Day view shows every prep task placed on a station-by-hour grid, you can see at a glance what the kitchen is on at any moment. Week view groups orders by day." />
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {view === "day"
                  ? fmtFullDay(anchor)
                  : `Week of ${fmtFullDay(anchor)}, ${fmtDay(addDays(anchor, 6))}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              <div className="inline-flex rounded-md border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setView("day")}
                  className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 rounded-l-md ${
                    view === "day"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Day
                </button>
                <button
                  type="button"
                  onClick={() => setView("week")}
                  className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 rounded-r-md border-l border-slate-200 ${
                    view === "week"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Week
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={stepBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {view === "day" ? "Yesterday" : "Previous"}
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
              <Button variant="outline" size="sm" onClick={stepFwd}>
                {view === "day" ? "Tomorrow" : "Next"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-5">
            <Card><CardContent className="p-3 sm:p-4">
              <p className="text-xs text-slate-600 flex items-center gap-1">Events
                <InfoTooltip content="Orders booked in the window shown above." />
              </p>
              <p className="text-2xl font-bold tabular-nums">{totals.events}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4">
              <p className="text-xs text-slate-600 flex items-center gap-1">Guests
                <InfoTooltip content="Total guests across every event in the window." />
              </p>
              <p className="text-2xl font-bold tabular-nums">{totals.guests}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4">
              <p className="text-xs text-slate-600 flex items-center gap-1">Portions
                <InfoTooltip content="Total dishes to plate across every event in the window." />
              </p>
              <p className="text-2xl font-bold tabular-nums">{totals.dishes}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4">
              <p className="text-xs text-slate-600 flex items-center gap-1">Cook-hours
                <InfoTooltip content="Total cooking time scheduled across every prep task in the window. The number that tells you whether the kitchen has the hours to do the work." />
              </p>
              <p className="text-2xl font-bold tabular-nums">{totals.cookHours}h</p>
            </CardContent></Card>
          </div>

          {/* Wave 66.9 Phase 2 - "What to start next" priority queue.
              The day-view grid answers "what's the kitchen on right
              now"; this answers "what do I start cooking next" by
              ranking every not-started task in the window by
              start_at, then surfacing the top 5 with live countdowns.
              Shows for day view only (week view is too coarse).
              Self-hides when nothing's queued. */}
          {!loading && view === "day" && (() => {
            // nowMs comes from the 60s tick state declared above so
            // this IIFE re-renders with fresh countdowns every minute.
            const queued = tasksOnAnchor
              .filter((t: any) => t.status === "pending" && !t.started_at)
              .map((t: any) => {
                const startMs = new Date(t.start_at).getTime();
                const minsFromNow = Math.round((startMs - nowMs) / 60_000);
                return { task: t, startMs, minsFromNow };
              })
              .sort((a, b) => a.startMs - b.startMs)
              .slice(0, 5);
            if (queued.length === 0) return null;
            const orderById = new Map<string, Order>(orders.map((o) => [o.id, o]));
            const stationById = new Map<string, KitchenStation>(stations.map((s) => [s.id, s]));
            return (
              <Card className="mb-4 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-orange-700" />
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
                      Start cooking next
                    </p>
                    <p className="text-[11px] text-orange-700/70">
                      top {queued.length} by deadline - earliest first
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {queued.map(({ task, minsFromNow }) => {
                      const ord = orderById.get(task.order_id);
                      const station = task.station_id ? stationById.get(task.station_id) : null;
                      const taskTypeLabel = TASK_TYPE_LABEL[task.task_type as string] || task.task_type;
                      const lateClass =
                        minsFromNow < -15 ? "bg-rose-100 text-rose-900 border-rose-300 font-bold animate-pulse" :
                        minsFromNow < 0 ? "bg-rose-50 text-rose-800 border-rose-200 font-semibold" :
                        minsFromNow <= 15 ? "bg-amber-100 text-amber-900 border-amber-300 font-semibold" :
                        "bg-white text-slate-700 border-slate-200";
                      const lateLabel =
                        minsFromNow < -15 ? `Should have started ${Math.abs(minsFromNow)}m ago` :
                        minsFromNow < 0 ? `${Math.abs(minsFromNow)}m late` :
                        minsFromNow === 0 ? "Now" :
                        minsFromNow <= 60 ? `Start in ${minsFromNow}m` :
                        `Start in ${Math.round(minsFromNow / 60)}h ${minsFromNow % 60}m`;
                      const startClock = new Date(task.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <li key={task.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border tabular-nums whitespace-nowrap ${lateClass}`}>
                            {lateLabel}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              <span className="text-orange-700 mr-1.5">{taskTypeLabel}</span>
                              {task.menu_item_name || "Item"}
                            </p>
                            <p className="text-[11px] text-slate-600 truncate">
                              {ord?.order_number ? `${ord.order_number} · ` : ""}
                              {ord?.event_name || ord?.event_date || "—"}
                              {ord?.guest_count ? ` · ${ord.guest_count} guests` : ""}
                              {station ? ` · ${station.name}` : ""}
                            </p>
                          </div>
                          <span className="text-xs text-slate-500 tabular-nums shrink-0">
                            {startClock}
                            <span className="text-slate-400 ml-1">· {Number(task.duration_min || 0)}m</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })()}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading production...
            </div>
          ) : view === "day" ? (
            // ── DAY VIEW: time-grid with stations as rows ──
            tasksOnAnchor.length === 0 && (ordersByDate[isoDate(anchor)] || []).length === 0 ? (
              <Card><CardContent className="p-10 text-center">
                <ChefHat className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-700">Quiet day</p>
                <p className="text-xs text-slate-500 mt-1">
                  No prep scheduled. Use the breather to deep-clean or restock.
                </p>
              </CardContent></Card>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <div className="min-w-[900px]">
                    {/* Hour ruler */}
                    <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                      <div className="w-32 shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-r border-slate-200">
                        Station
                      </div>
                      <div className="flex-1 relative h-8">
                        {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => {
                          const hour = DAY_START_HOUR + i;
                          const leftPct = (i * 60) / DAY_TOTAL_MIN * 100;
                          return (
                            <div
                              key={hour}
                              className="absolute top-0 bottom-0 border-l border-slate-200 text-[10px] text-slate-500 px-1.5 pt-1.5"
                              style={{ left: `${leftPct}%` }}
                            >
                              {String(hour).padStart(2, "0")}:00
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Station rows */}
                    {stationsForGrid.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500 text-center">
                        No stations configured.
                      </div>
                    ) : stationsForGrid.map(station => {
                      const stationTasks = tasksByStation[station.id ?? "__unassigned__"] || [];
                      return (
                        <div key={station.id ?? "__unassigned__"} className="flex border-b border-slate-100 hover:bg-slate-50/40">
                          <div className="w-32 shrink-0 px-3 py-3 text-sm border-r border-slate-200">
                            <p className="font-semibold text-slate-900">{station.name}</p>
                            <p className="text-[10px] text-slate-500 capitalize">
                              {stationTasks.length} task{stationTasks.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className="flex-1 relative min-h-[64px]">
                            {/* Hour grid lines */}
                            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => {
                              const leftPct = (i * 60) / DAY_TOTAL_MIN * 100;
                              return (
                                <div
                                  key={i}
                                  className="absolute top-0 bottom-0 border-l border-slate-100"
                                  style={{ left: `${leftPct}%` }}
                                />
                              );
                            })}

                            {/* Task blocks */}
                            {stationTasks.map((t: any) => {
                              const pos = taskPosition(t);
                              if (!pos) return null;
                              const tone = TASK_TONES[t.status] || TASK_TONES.pending;
                              const eventName = t.order?.event_name || t.order?.client_name || "Order";
                              return (
                                <div
                                  key={t.id}
                                  className={`absolute top-2 h-12 rounded-md border-l-4 px-1.5 py-1 text-[11px] cursor-pointer transition-colors ${tone}`}
                                  style={{
                                    left: `${pos.leftPct}%`,
                                    width: `${pos.widthPct}%`,
                                    minWidth: "60px",
                                  }}
                                  title={`${TASK_TYPE_LABEL[t.task_type] || t.task_type} · ${t.menu_item_name} · ${eventName} · ${t.duration_min}m`}
                                >
                                  <p className="font-semibold truncate leading-tight">
                                    {t.menu_item_name}
                                  </p>
                                  <p className="truncate text-[10px] opacity-80 leading-tight">
                                    {TASK_TYPE_LABEL[t.task_type] || t.task_type} · {t.duration_min}m · {eventName}
                                  </p>
                                </div>
                              );
                            })}

                            {stationTasks.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-300 italic">
                                Nothing scheduled on this station today
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          ) : (
            // ── WEEK VIEW: per-day card lists (existing layout, polished) ──
            <div className="space-y-4">
              {windowDays.map((d) => {
                const key = isoDate(d);
                const list = ordersByDate[key] || [];
                const isToday = key === isoDate(new Date());
                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <h2 className={`text-sm font-semibold ${isToday ? "text-orange-600" : "text-slate-700"}`}>
                        {fmtDay(d)}
                        {isToday && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Today</span>}
                      </h2>
                      <span className="text-xs text-slate-500">{list.length} event{list.length === 1 ? "" : "s"}</span>
                    </div>
                    {list.length === 0 ? (
                      <Card><CardContent className="p-3 text-center text-xs text-slate-400">Quiet day</CardContent></Card>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {list.map((o) => {
                          const lineItems = itemsByOrder[o.id] || [];
                          const orderTasks = tasks.filter((t: any) => t.order_id === o.id);
                          const tasksDone = orderTasks.filter((t: any) => t.status === "done").length;
                          // Wave 70.43c - whole card becomes a link to
                          // the print-friendly kitchen ticket. Bobby's
                          // brief: "when I see the order, user must be
                          // able to click on the order to see the kitchen
                          // ticket". Hover lift + ring give the affordance.
                          return (
                            <Link
                              key={o.id}
                              href={withSlug(`/team-portal/kitchen/orders/${o.id}/ticket`)}
                              className="block group"
                              title="Open kitchen ticket"
                            >
                            <Card className={`${isToday ? "border-orange-200" : ""} group-hover:border-orange-400 group-hover:shadow-md transition-all cursor-pointer`}>
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-slate-900 truncate group-hover:text-orange-700 transition-colors">{o.event_name ?? o.order_number ?? "Event"}</div>
                                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(o.event_time)}</span>
                                      {o.guest_count != null && <span className="flex items-center gap-1"><UsersIcon className="h-3 w-3" />{o.guest_count} guests</span>}
                                      {o.order_number && <span className="font-mono text-[10px] text-slate-400">{o.order_number}</span>}
                                    </div>
                                  </div>
                                  {o.status && (
                                    <Badge variant="outline" className={`${STATUS_TONES[o.status] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-[10px] flex-shrink-0`}>
                                      {o.status}
                                    </Badge>
                                  )}
                                </div>
                                {lineItems.length > 0 && (
                                  <ul className="mt-2 space-y-1 text-sm border-t border-slate-100 pt-2">
                                    {lineItems.map((it) => (
                                      <li key={it.id} className="flex items-center justify-between gap-2">
                                        <span className="truncate text-slate-700">{it.item_name ?? "--"}</span>
                                        <span className="tabular-nums text-slate-500 flex-shrink-0">x{it.quantity ?? 0}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {orderTasks.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-slate-100">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                                      <span className="font-semibold uppercase tracking-wide">Prep tasks</span>
                                      <span className="tabular-nums">{tasksDone} of {orderTasks.length} done</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          tasksDone === orderTasks.length ? "bg-emerald-500" :
                                          tasksDone > 0 ? "bg-blue-500" :
                                                          "bg-slate-300"
                                        }`}
                                        style={{ width: `${(tasksDone / orderTasks.length) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                                {o.special_instructions && (
                                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                    {o.special_instructions}
                                  </p>
                                )}
                                <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-orange-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                  Open kitchen ticket →
                                </div>
                              </CardContent>
                            </Card>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tone legend (only in day view + only when there are tasks) */}
          {view === "day" && tasksOnAnchor.length > 0 && (
            <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
              <span className="font-semibold">Status:</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-200 border border-slate-300" /> Pending</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-200 border border-blue-400" /> In progress</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-400" /> Done</span>
            </div>
          )}

          {/* Phase 4: recipe accuracy panel. Only renders when at least one
              prep task has both planned and actual yields logged. Lists the
              recipes by absolute variance so the worst offenders surface
              first. Sample size on each row keeps confidence honest. */}
          {recipeAccuracy.length > 0 && (
            <Card className="mt-6 border-0 shadow-md">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900">Recipe accuracy, last 30 days</h2>
                    <InfoTooltip content="Average difference between planned and actual yield, per recipe.\n\nNegative means you're under-producing relative to the plan; positive means over.\n\nSample size shows how many cooks the average is built on, treat single-digit samples as early signal, not gospel." />
                  </div>
                  <span className="text-xs text-slate-500">{recipeAccuracy.length} recipe{recipeAccuracy.length === 1 ? "" : "s"}</span>
                </div>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="px-2 py-2 font-medium">Recipe</th>
                        <th className="px-2 py-2 font-medium text-right">Samples</th>
                        <th className="px-2 py-2 font-medium text-right">Planned (avg)</th>
                        <th className="px-2 py-2 font-medium text-right">Actual (avg)</th>
                        <th className="px-2 py-2 font-medium text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipeAccuracy.map((r) => {
                        const tone =
                          Math.abs(r.avg_variance_pct) < 5  ? "text-emerald-700" :
                          Math.abs(r.avg_variance_pct) < 15 ? "text-amber-700"   :
                                                              "text-red-700";
                        const Arrow = r.avg_variance_pct >= 0 ? TrendingUp : TrendingDown;
                        return (
                          <tr key={r.recipe_name} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-2 py-2 font-medium text-slate-800">{r.recipe_name}</td>
                            <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{r.samples}</td>
                            <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{r.avg_planned} {r.yield_unit || ""}</td>
                            <td className="px-2 py-2 text-right text-slate-900 tabular-nums">{r.avg_actual} {r.yield_unit || ""}</td>
                            <td className={`px-2 py-2 text-right font-semibold tabular-nums ${tone}`}>
                              <span className="inline-flex items-center gap-1">
                                <Arrow className="h-3.5 w-3.5" />
                                {r.avg_variance_pct > 0 ? "+" : ""}{r.avg_variance_pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Wave 70.7c - bottom-left FAB during service hours */}
      <KitchenServiceFAB />
    </>
  );
}
