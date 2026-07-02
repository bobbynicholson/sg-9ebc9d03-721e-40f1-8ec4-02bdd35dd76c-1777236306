/* eslint-disable @typescript-eslint/no-explicit-any */
// KIT3-D (task #247): @ts-nocheck removed. The page is now type-
// checked. Remaining `any` casts are for supabase realtime channel
// payloads + the nested join shape on kitchen_prep_tasks (the
// generated Database type doesn't carry the joined order/station/
// chef fields, so we narrow at use-site instead).
//
// KIT4 (command-centre sweep, 2026-07-02): page now renders through
// KitchenPageShell (hero band + workbench + brand ground), surfaces
// load failures with a Retry card instead of a silent zero state,
// and the realtime channel got a per-mount suffix + removeChannel
// cleanup. Status colours moved off brand paint onto semantic tones
// (emerald done, amber in-flight, rose overdue).
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Clock, Users as UsersIcon, Loader2, ChevronLeft, ChevronRight,
  CalendarDays, LayoutGrid, ChefHat, TrendingUp, TrendingDown, RefreshCw,
  AlertTriangle, Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenPageShell, KITCHEN_HERO_CHIP } from "@/components/kitchen/KitchenPageShell";
import { KitchenServiceFAB } from "@/components/kitchen/KitchenServiceFAB";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { kitchenPrepService, type KitchenStation } from "@/services/kitchenPrepService";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { orderDisplayName } from "@/lib/orderDisplayName";
import { captureException } from "@/lib/observability";
import { onOrderUpdated } from "@/lib/events/orderEvents";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { dedupeKitchenPrepTasks, formatKitchenPrepTaskType } from "@/lib/kitchen/prepTasks";
import { UserRole } from "@/types/app";

interface Order {
  id: string;
  order_number: string | null;
  event_name: string | null;
  client_name: string | null;
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

// KIT3-D: explicit local type for the kitchen_prep_tasks rows returned
// by kitchenPrepService.getTasksForDateRange. The generated Database
// type omits the joined order/station/chef so this models what we
// actually consume on this page.
interface PrepTask {
  id: string;
  order_id: string;
  station_id: string | null;
  region_id?: string | null;
  menu_item_name: string | null;
  task_type: string | null;
  status: "pending" | "in_progress" | "done" | "skipped" | string;
  start_at: string;
  duration_min: number | null;
  started_at: string | null;
  completed_at: string | null;
  order?: {
    id?: string;
    event_name?: string | null;
    client_name?: string | null;
    event_date?: string | null;
    event_time?: string | null;
    guest_count?: number | null;
    status?: string | null;
  } | null;
  station?: {
    id?: string;
    name?: string | null;
    station_type?: string | null;
    display_order?: number | null;
  } | null;
}

// KIT4: order-status badge tones are SEMANTIC, not brand paint.
// Emerald = out the door / done, amber = being worked, slate =
// waiting, rose = cancelled. Dark variants added (the week view
// renders these on dark cards too).
const STATUS_TONES: Record<string, string> = {
  pending:    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  confirmed:  "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  preparing:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  ready:      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  in_transit: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  delivered:  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  completed:  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  cancelled:  "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
};

// Task block colours - one tone per status. Soft enough to layer on a
// striped grid without screaming. KIT4: semantic (amber = cooking now,
// emerald = done) instead of brand paint, with dark variants.
const TASK_TONES: Record<string, string> = {
  pending:     "bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-600",
  in_progress: "bg-amber-100 border-amber-400 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950/70",
  done:        "bg-emerald-100 border-emerald-400 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/70",
  skipped:     "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 line-through dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-700",
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

function KitchenProductionPageInner() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // KIT3-C (task #246): region scoping. If the kitchen_staff user
  // has a region_id on their profile, every orders + tasks query
  // narrows to that branch. Single-region tenants leave region_id
  // null so the .eq is skipped and behaviour is unchanged.
  const regionId = profile?.region_id ?? null;

  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date())); // pivots both views
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [stations, setStations] = useState<KitchenStation[]>([]);
  // KIT3-D: available staff-hours for the on-screen window. Powers
  // the cook-hours-vs-available utilisation chip + per-day load
  // bar in week view. Sourced from kitchen_duty_shifts (active +
  // recently-active) so it stays honest even if the schedule
  // changes mid-day.
  const [availableHours, setAvailableHours] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  // KIT4: load failures used to be toast-only, so a chef who missed
  // the toast stared at a false "Quiet day" with zeroed tiles. Now
  // held in state and rendered as a Retry card.
  const [loadError, setLoadError] = useState<string | null>(null);
  // KIT3-C: "next event" lookahead for the quiet-day empty state.
  // Single-row pull beyond the on-screen window so the chef knows
  // when prep actually picks up again instead of staring at a blank.
  const [nextUpcoming, setNextUpcoming] = useState<{
    eventDate: string;
    eventName: string | null;
    eventTime: string | null;
    guestCount: number | null;
  } | null>(null);

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

  // KIT4: load sequencing. Fast Prev/Prev/Next clicking fires
  // overlapping loads; without a sequence guard the SLOWEST response
  // wins and the board shows a different week than the header says.
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const from = windowDays[0];
      const to = addDays(windowDays[windowDays.length - 1], 1);
      const fromISO = from.toISOString();
      const toISO = to.toISOString();

      // KIT3-C: region-scoped queries. Build the ordersQuery with
      // a conditional .eq("region_id", ...) so the same code path
      // works for single-region tenants (no-op) and multi-branch
      // tenants (kitchen_staff sees only their branch's prep).
      // KIT4: exclude soft-deleted rows + paused orders (a paused
      // order must not be cooked for), not just cancelled.
      let ordersQuery = supabase
        .from("orders")
        .select("id, order_number, event_name, client_name, event_date, event_time, guest_count, status, special_instructions")
        .eq("company_id", user.company_id)
        .gte("event_date", isoDate(from))
        .lt("event_date", isoDate(to))
        .not("status", "in", "(cancelled,paused)")
        .is("deleted_at", null)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true });
      if (regionId) ordersQuery = ordersQuery.eq("region_id", regionId);

      const [ordsRes, stationsRes, tasksRes] = await Promise.all([
        ordersQuery,
        kitchenPrepService.getStationsForCompany(user.company_id),
        kitchenPrepService.getTasksForDateRange(user.company_id, fromISO, toISO),
      ]);
      if (seq !== loadSeqRef.current) return; // superseded by a newer window

      if (ordsRes.error) throw ordsRes.error;
      const ords = (ordsRes.data || []) as Order[];
      setOrders(ords);
      setStations(stationsRes);
      // Service returns Promise<any[]>; cast to our local PrepTask shape.
      // KIT4: the service is not region-aware yet, so multi-branch
      // scoping happens client-side. Legacy tasks with a null
      // region_id stay visible - hiding real prep is worse than
      // showing a sister branch's stragglers.
      const allTasks = dedupeKitchenPrepTasks((tasksRes || []) as PrepTask[]);
      setTasks(regionId
        ? allTasks.filter((t) => !t.region_id || t.region_id === regionId)
        : allTasks);

      const orderIds = ords.map((o) => o.id);
      if (orderIds.length === 0) {
        setItems([]);
      } else {
        // KIT4: error was previously ignored - a failed line-item pull
        // silently rendered every event card without its dishes and
        // zeroed the Portions tile.
        const { data: lineItems, error: itemsError } = await supabase
          .from("order_items")
          .select("id, order_id, menu_item_id, item_name, quantity, special_instructions")
          .in("order_id", orderIds);
        if (itemsError) throw itemsError;
        if (seq !== loadSeqRef.current) return;
        setItems((lineItems || []) as OrderItem[]);
      }

      // Phase 4: pull trailing 30 days of recipe accuracy. Cheap, zero
      // results when no yields have been logged - panel stays hidden.
      try {
        const accFrom = new Date(Date.now() - 30 * 86400000).toISOString();
        const accTo = new Date().toISOString();
        const accuracy = await kitchenPrepService.getRecipeAccuracy(user.company_id, accFrom, accTo);
        if (seq === loadSeqRef.current) setRecipeAccuracy(accuracy);
      } catch (accErr) {
        captureException(accErr, {
          tags: { route: "/team-portal/kitchen/production", step: "load-recipe-accuracy", companyId: user.company_id },
        });
      }

      // KIT3-D: available staff-hours for the window. Sum
      // (shift_end - shift_start) over kitchen_duty_shifts whose
      // window overlaps the visible window. Open-ended shifts
      // (shift_end IS NULL, still on the clock) get an 8h cap so
      // we don't claim infinite capacity. This is the denominator
      // for the utilisation chip + the per-day load bar.
      try {
        // Pull shifts active any time in the window. Use ISO strings
        // already prepared above (fromISO / toISO).
        const dutyQuery = (supabase as any)
          .from("kitchen_duty_shifts")
          .select("shift_start, shift_end, is_active")
          .eq("company_id", user.company_id)
          .lt("shift_start", toISO)
          .or(`shift_end.is.null,shift_end.gte.${fromISO}`);
        // KIT4: the error half of the response was previously
        // discarded, so a failed query fell through to hours = 0
        // without ever reaching the catch below.
        const { data: dutyRows, error: dutyError } = await dutyQuery;
        if (dutyError) throw dutyError;
        let hours = 0;
        const winFrom = from.getTime();
        const winTo = to.getTime();
        for (const r of (dutyRows || []) as Array<{ shift_start: string; shift_end: string | null }>) {
          const s = new Date(r.shift_start).getTime();
          // Cap open-ended shifts at 8h from start so an idle shift
          // doesn't claim infinite hours.
          const eRaw = r.shift_end ? new Date(r.shift_end).getTime() : (s + 8 * 3600_000);
          const clipS = Math.max(s, winFrom);
          const clipE = Math.min(eRaw, winTo);
          if (clipE > clipS) hours += (clipE - clipS) / 3600_000;
        }
        if (seq === loadSeqRef.current) setAvailableHours(Math.round(hours));
      } catch (capErr) {
        captureException(capErr, {
          tags: { route: "/team-portal/kitchen/production", step: "load-available-hours", companyId: user.company_id },
        });
        if (seq === loadSeqRef.current) setAvailableHours(0);
      }

      // KIT3-C: next event after the current window. Powers the
      // empty-state "Next event: Wed 27 May - 80 guests" so a quiet
      // day still tells the chef when to plan ahead from.
      try {
        let nextQuery = supabase
          .from("orders")
          .select("event_date, event_time, event_name, guest_count")
          .eq("company_id", user.company_id)
          .gte("event_date", isoDate(to))
          .not("status", "in", "(cancelled,paused)")
          .is("deleted_at", null)
          .order("event_date", { ascending: true })
          .order("event_time", { ascending: true })
          .limit(1);
        if (regionId) nextQuery = nextQuery.eq("region_id", regionId);
        const { data: nextRow, error: nextError } = await nextQuery.maybeSingle();
        if (nextError) throw nextError;
        if (seq !== loadSeqRef.current) return;
        if (nextRow) {
          setNextUpcoming({
            eventDate: nextRow.event_date as string,
            eventName: (nextRow as any).event_name,
            eventTime: (nextRow as any).event_time,
            guestCount: (nextRow as any).guest_count,
          });
        } else {
          setNextUpcoming(null);
        }
      } catch (nextErr) {
        captureException(nextErr, {
          tags: { route: "/team-portal/kitchen/production", step: "load-next-upcoming", companyId: user.company_id },
        });
        // Don't keep a stale lookahead from a different window.
        if (seq === loadSeqRef.current) setNextUpcoming(null);
      }
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/team-portal/kitchen/production", step: "load", companyId: user?.company_id },
      });
      if (seq === loadSeqRef.current) {
        setLoadError(e?.message || "We couldn't load the production board.");
        toast({ title: "Could not load production", description: e?.message, variant: "destructive" });
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [user?.company_id, windowDays, regionId, toast]);

  useEffect(() => { load(); }, [load]);

  // KIT4: keep a ref to the freshest load. The realtime effect below
  // deliberately only re-subscribes on company change, so its refresh
  // closure used to capture the FIRST load (initial window). After the
  // chef paged to next week, any realtime event silently reloaded the
  // original window over the visible one.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // KIT3-C: realtime subscriptions for orders + kitchen_prep_tasks.
  // The kitchen dashboard already subscribes to these; this page
  // shows the SAME data shaped as a timeline. Without realtime,
  // changes from the dashboard / admin tab don't reflect until the
  // chef manually re-navigates. Debounced through a 400ms timer so
  // a chatty tenant doesn't burn CPU.
  useEffect(() => {
    if (!user?.company_id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // Events that land while the tab is hidden are deferred, not
    // dropped - the visibilitychange listener below replays them so
    // a tablet waking from standby shows current data. (KIT4: used
    // to `return` and never catch up.)
    let pendingWhileHidden = false;
    const refresh = () => {
      if (document.hidden) { pendingWhileHidden = true; return; }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loadRef.current();
      }, 400);
    };
    const onVisible = () => {
      if (!document.hidden && pendingWhileHidden) {
        pendingWhileHidden = false;
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    // KIT4: unique per-mount suffix so two tabs (or a fast unmount/
    // remount) never share and tear down each other's channel.
    const sub = supabase
      .channel(`kitchen-production-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "orders",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "kitchen_prep_tasks",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      .subscribe();
    // Cross-tab event bus for the same-browser case.
    const offBus = onOrderUpdated(() => { refresh(); });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVisible);
      offBus();
      void supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

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

  // KIT4: hero chip counts. Same predicate as useKitchenLiveCounts'
  // overdue bucket (start_at <= now AND status pending/in_progress)
  // scoped to the visible window, so the number on the hero agrees
  // with the nav badge whenever the window covers today.
  const taskCounts = useMemo(() => {
    let inProgress = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.status === "in_progress") inProgress += 1;
      if ((t.status === "pending" || t.status === "in_progress") && new Date(t.start_at).getTime() <= nowMs) {
        overdue += 1;
      }
    }
    return { inProgress, overdue };
  }, [tasks, nowMs]);

  // KIT3-D: utilisation - scheduled cook-hours vs available staff-
  // hours. Available comes from the on-duty + scheduled shift sum
  // (loaded below). Tone: emerald under 70%, amber 70-95%, rose
  // 95%+ (likely under-resourced).
  const utilisation = useMemo(() => {
    if (availableHours <= 0) return null;
    const pct = Math.round((totals.cookHours / availableHours) * 100);
    const tone = pct >= 95 ? "rose" : pct >= 70 ? "amber" : "emerald";
    return { pct, tone };
  }, [totals.cookHours, availableHours]);

  // Group tasks by date for the day view to filter to this day
  const tasksOnAnchor = useMemo<PrepTask[]>(() => {
    if (view !== "day") return [];
    const start = startOfDay(anchor).getTime();
    const end = addDays(anchor, 1).getTime();
    return tasks.filter((t) => {
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
    const newlyOverdue: PrepTask[] = [];
    for (const t of tasksOnAnchor) {
      if (t.status !== "pending" || t.started_at) continue;
      stillVisibleIds.add(t.id);
      const startMs = new Date(t.start_at).getTime();
      if (startMs <= nowMs && !alertedOverdueRef.current.has(t.id)) {
        newlyOverdue.push(t);
      }
    }
    // Garbage-collect ids no longer in the queued window so a task
    // re-added (rare - admin rolls back a status) can re-alert.
    for (const id of Array.from(alertedOverdueRef.current)) {
      if (!stillVisibleIds.has(id)) alertedOverdueRef.current.delete(id);
    }
    for (const t of newlyOverdue) {
      alertedOverdueRef.current.add(t.id);
      const dueClock = new Date(t.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
      toast({
        title: "Prep task overdue",
        description: `${t.menu_item_name || "Item"} should have started at ${dueClock}.`,
        variant: "destructive",
      });
    }
  }, [tasksOnAnchor, nowMs, view, toast]);

  // Task position helper for the day grid. KIT4: tasks outside the
  // 06:00-23:00 track used to return null and vanish while the
  // station row still counted them ("3 tasks", 2 blocks). Out-of-
  // range starts now clamp to the grid edge; the block's title
  // carries the true start time.
  const taskPosition = (task: PrepTask): { leftPct: number; widthPct: number } | null => {
    const ts = new Date(task.start_at);
    const dayStart = new Date(anchor);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    let minsFromStart = (ts.getTime() - dayStart.getTime()) / 60_000;
    if (minsFromStart < 0) minsFromStart = 0;
    if (minsFromStart > DAY_TOTAL_MIN - 15) minsFromStart = DAY_TOTAL_MIN - 15;
    const leftPct = (minsFromStart / DAY_TOTAL_MIN) * 100;
    const widthPct = Math.max(2, (Number(task.duration_min || 30) / DAY_TOTAL_MIN) * 100);
    return { leftPct, widthPct };
  };

  // Stations including a "Unassigned" pseudo-row for tasks without a station
  const stationsForGrid = useMemo(() => {
    const list: Array<{ id: string | null; name: string; station_type: string }> = stations.map(s => ({
      id: s.id, name: s.name, station_type: s.station_type,
    }));
    const hasUnassigned = tasksOnAnchor.some((t) => !t.station_id);
    if (hasUnassigned) list.push({ id: null, name: "Unassigned", station_type: "general" });
    return list;
  }, [stations, tasksOnAnchor]);

  const tasksByStation = useMemo(() => {
    const map: Record<string, PrepTask[]> = {};
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

  // KIT3-D: cook-hours per day in the week view. Pre-bucket tasks
  // by event_date once so the per-day card can render its load bar
  // without re-walking the whole tasks array.
  // KIT4: the fallback used toISOString().slice(0,10) - UTC. In SA
  // (UTC+2) a task starting 00:30 was bucketed onto the PREVIOUS
  // day's load bar. toLocalISO keeps the bucket on the wall-clock day.
  const cookHoursByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tasks) {
      const date = (t.order?.event_date as string | undefined)
        || toLocalISO(new Date(t.start_at));
      if (!date) continue;
      map[date] = (map[date] || 0) + Number(t.duration_min || 0) / 60;
    }
    return map;
  }, [tasks]);
  // Daily capacity = availableHours / windowDays count. A rough
  // even-split that flags "this day is heavier than the others"
  // not an absolute per-day staffing call.
  const dailyCapacity = useMemo(() => {
    if (availableHours <= 0 || windowDays.length === 0) return 0;
    return availableHours / windowDays.length;
  }, [availableHours, windowDays.length]);

  // KIT3-D: "Generate prep plan" CTA. When the chef opens a day
  // with orders but no prep tasks (auto-cascade disabled in
  // kitchen_settings, or the order was imported late and bypassed
  // it), this lets them spin tasks up from the menu items in one
  // tap. Loops kitchenPrepService.ensurePrepTasksForOrder over the
  // visible orders + refreshes.
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const generatingPlanRef = useRef(false);
  const generatePrepPlan = useCallback(async (forOrderIds: string[]) => {
    if (!user?.company_id || forOrderIds.length === 0) return;
    // KIT4: double-tap guard via ref - state alone leaves a gap
    // before React re-renders the disabled button.
    if (generatingPlanRef.current) return;
    generatingPlanRef.current = true;
    setGeneratingPlan(true);
    let createdTotal = 0;
    let skipped = 0;
    try {
      for (const orderId of forOrderIds) {
        try {
          const res = await kitchenPrepService.ensurePrepTasksForOrder(
            user.company_id,
            orderId,
            user.id,
          );
          createdTotal += res.created || 0;
          if (res.skippedReason) skipped += 1;
        } catch (perOrderErr) {
          captureException(perOrderErr, {
            tags: {
              route: "/team-portal/kitchen/production",
              step: "generate-prep-plan",
              companyId: user.company_id,
              orderId,
            },
          });
        }
      }
      toast({
        title: createdTotal > 0 ? "Prep plan ready" : "Nothing to generate",
        description: createdTotal > 0
          ? `${createdTotal} task${createdTotal === 1 ? "" : "s"} scheduled across ${forOrderIds.length} order${forOrderIds.length === 1 ? "" : "s"}.${skipped > 0 ? ` ${skipped} skipped (auto-generate disabled or quarantined).` : ""}`
          : skipped > 0
            ? "Auto-generate is disabled in /admin/kitchen-settings, or the orders are in import quarantine."
            : "No prep work needed for these orders.",
        variant: createdTotal > 0 ? "default" : "destructive",
      });
      await load();
    } finally {
      generatingPlanRef.current = false;
      setGeneratingPlan(false);
    }
  }, [user?.company_id, user?.id, load, toast]);

  // Orders on the anchor day that have zero prep tasks (day view
  // only). Drives the "Generate prep plan" banner above the grid.
  const ordersWithoutPrep = useMemo(() => {
    if (view !== "day") return [];
    const todayList = ordersByDate[isoDate(anchor)] || [];
    if (todayList.length === 0) return [];
    const orderIdsWithTasks = new Set(tasksOnAnchor.map((t) => t.order_id));
    return todayList.filter((o) => !orderIdsWithTasks.has(o.id));
  }, [view, ordersByDate, anchor, tasksOnAnchor]);

  // ── Header navigation ──────────────────────────────────────────────────
  const stepBack = () => setAnchor(d => addDays(d, view === "day" ? -1 : -7));
  const stepFwd  = () => setAnchor(d => addDays(d, view === "day" ?  1 :  7));
  const goToday  = () => setAnchor(startOfDay(new Date()));

  const windowLabel = view === "day"
    ? fmtFullDay(anchor)
    : `Week of ${fmtFullDay(anchor)} to ${fmtDay(addDays(anchor, 6))}`;
  const loaded = !loading && !loadError;

  return (
    <>
      <KitchenPageShell
        pageTitle="Production timeline - CateringMS"
        heading={
          <span className="flex items-center gap-2">
            Production timeline
            <InfoTooltip
              className="text-white/70 hover:text-white focus-visible:text-white"
              content="Day view shows every prep task placed on a station-by-hour grid, you can see at a glance what the kitchen is on at any moment. Week view groups orders by day."
            />
          </span>
        }
        subheading={
          loadError
            ? windowLabel
            : loading
              ? `${windowLabel}. Loading the prep board...`
              : `${windowLabel}. ${totals.events} event${totals.events === 1 ? "" : "s"} and ${tasks.length} prep task${tasks.length === 1 ? "" : "s"} on the board.`
        }
        icon={Calendar}
        width="wide"
        meta={
          loaded ? (
            <>
              <span className={KITCHEN_HERO_CHIP}>
                <CalendarDays className="h-3 w-3" />
                {totals.events} event{totals.events === 1 ? "" : "s"} in window
              </span>
              <span className={KITCHEN_HERO_CHIP}>
                <Flame className="h-3 w-3" />
                {taskCounts.inProgress} in prep now
              </span>
              {taskCounts.overdue > 0 && (
                <span className={KITCHEN_HERO_CHIP}>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse motion-reduce:animate-none" />
                  {taskCounts.overdue} overdue
                </span>
              )}
              <span className={KITCHEN_HERO_CHIP}>
                <Clock className="h-3 w-3" />
                {totals.cookHours}h prep scheduled
              </span>
            </>
          ) : undefined
        }
        headerAction={
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle - white-glass segmented control on the hero band. */}
            <div className="inline-flex h-10 overflow-hidden rounded-md border border-white/20 bg-white/10">
              <button
                type="button"
                onClick={() => setView("day")}
                aria-pressed={view === "day"}
                className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  view === "day"
                    ? "bg-white text-slate-900"
                    : "text-white/85 hover:bg-white/10"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Day
              </button>
              <button
                type="button"
                onClick={() => setView("week")}
                aria-pressed={view === "week"}
                className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 border-l border-white/20 transition-colors ${
                  view === "week"
                    ? "bg-white text-slate-900"
                    : "text-white/85 hover:bg-white/10"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Week
              </button>
            </div>
            <Button variant="outline" onClick={stepBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {view === "day" ? "Yesterday" : "Previous"}
            </Button>
            <Button variant="outline" onClick={goToday}>Today</Button>
            <Button variant="outline" onClick={stepFwd}>
              {view === "day" ? "Tomorrow" : "Next"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            {/* KIT3-C: print button. Matches the Kitchen Today
                print run-sheet pattern - chef wants paper backup
                on prep mornings. Uses the browser's native print
                flow against the on-screen layout. */}
            <Button
              variant="outline"
              onClick={() => {
                if (loading) {
                  toast({ title: "Still loading", description: "Give it a second, the timeline is being prepared." });
                  return;
                }
                if (orders.length === 0 && tasks.length === 0) {
                  toast({ title: "Nothing to print", description: "No prep or events in this window." });
                  return;
                }
                setTimeout(() => window.print(), 100);
              }}
              disabled={loading}
            >
              Print
            </Button>
          </div>
        }
      >
          {/* KIT4: load-failure recovery card. Everything below the hero
              hides so a failed pull can never masquerade as a quiet day. */}
          {loadError && !loading && (
            <PortalCard className="border-rose-200 dark:border-rose-900">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-rose-900 dark:text-rose-200">Couldn&apos;t load the production board</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
                  <Button
                    size="sm"
                    onClick={() => void load()}
                    disabled={loading}
                    className="mt-3 bg-brand-primary hover:opacity-90 text-white"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            </PortalCard>
          )}

          {/* Stat cards - KIT3-D adds the Utilisation tile (cook-
              hours scheduled / available staff-hours) so the chef
              sees whether the prep load fits the day's roster.
              KIT4: skeleton tiles while loading so a slow network
              never flashes zeros that read as "no work today". */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 mb-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200/80 bg-white motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900" />
              ))}
            </div>
          ) : !loadError && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 mb-5">
            <StatTile
              label={
                <span className="flex items-center gap-1">Events
                  <InfoTooltip content="Orders booked in the window shown above." />
                </span>
              }
              value={totals.events}
            />
            <StatTile
              label={
                <span className="flex items-center gap-1">Guests
                  <InfoTooltip content="Total guests across every event in the window." />
                </span>
              }
              value={totals.guests}
            />
            <StatTile
              label={
                <span className="flex items-center gap-1">Portions
                  <InfoTooltip content="Total dishes to plate across every event in the window." />
                </span>
              }
              value={totals.dishes}
            />
            <StatTile
              label={
                <span className="flex items-center gap-1">Cook-hours
                  <InfoTooltip content={"Total cooking time scheduled across every prep task in the window.\nThe number that tells you whether the kitchen has the hours to do the work."} />
                </span>
              }
              value={`${totals.cookHours}h`}
            />
            <StatTile
              label={
                <span className="flex items-center gap-1">Utilisation
                  <InfoTooltip content={"Scheduled cook-hours divided by available staff-hours in this window.\nAvailable comes from kitchen_duty_shifts (active + open-ended capped at 8h).\nUnder 70% (green) fits comfortably, 70-95% (amber) is busy, 95%+ (red) means you're likely under-resourced - add staff or shift prep."} />
                </span>
              }
              value={
                utilisation ? (
                  <span
                    className={
                      utilisation.tone === "rose"
                        ? "text-rose-700 dark:text-rose-400"
                        : utilisation.tone === "amber"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {utilisation.pct}%
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">-</span>
                )
              }
              hint={
                utilisation
                  ? `${totals.cookHours}h of ${availableHours}h available`
                  : "Clock the team in to compare"
              }
            />
          </div>
          )}

          {/* KIT3-C: worst-recipe surface. The recipe accuracy panel
              at the bottom of the page sorts by variance, but a
              recipe drifting >15% is worth seeing BEFORE the chef
              scrolls. Single inline chip pointing at the table. */}
          {loaded && recipeAccuracy.length > 0 && (() => {
            const worst = recipeAccuracy
              .filter((r) => Math.abs(r.avg_variance_pct) >= 15 && r.samples >= 3)
              .sort((a, b) => Math.abs(b.avg_variance_pct) - Math.abs(a.avg_variance_pct))[0];
            if (!worst) return null;
            const ArrowIcon = worst.avg_variance_pct >= 0 ? TrendingUp : TrendingDown;
            return (
              <div className="mb-3 inline-flex items-center gap-2 text-xs bg-rose-50 border border-rose-200 rounded-full px-3 py-1.5 text-rose-900 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300">
                <ArrowIcon className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                <span>
                  Watch out: <strong>{worst.recipe_name}</strong> averaging{" "}
                  <span className="tabular-nums font-semibold">{worst.avg_variance_pct > 0 ? "+" : ""}{worst.avg_variance_pct}%</span>{" "}
                  yield variance over {worst.samples} cooks. Recipe needs a recalibration.
                </span>
                <a href="#recipe-accuracy" className="ml-1 underline text-rose-700 hover:text-rose-900 dark:text-rose-400 dark:hover:text-rose-300">
                  See all
                </a>
              </div>
            );
          })()}

          {/* Wave 66.9 Phase 2 - "What to start next" priority queue.
              The day-view grid answers "what's the kitchen on right
              now"; this answers "what do I start cooking next" by
              ranking every not-started task in the window by
              start_at, then surfacing the top 5 with live countdowns.
              Shows for day view only (week view is too coarse).
              Self-hides when nothing's queued. */}
          {loaded && view === "day" && (() => {
            // nowMs comes from the 60s tick state declared above so
            // this IIFE re-renders with fresh countdowns every minute.
            const queued = tasksOnAnchor
              .filter((t) => t.status === "pending" && !t.started_at)
              .map((t) => {
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
              <PortalCard className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Start cooking next
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      top {queued.length} by deadline - earliest first
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {queued.map(({ task, minsFromNow }) => {
                      const ord = orderById.get(task.order_id);
                      const station = task.station_id ? stationById.get(task.station_id) : null;
                      const taskTypeLabel = formatKitchenPrepTaskType(task.task_type);
                      const lateClass =
                        minsFromNow < -15 ? "bg-rose-100 text-rose-900 border-rose-300 font-bold animate-pulse motion-reduce:animate-none dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800" :
                        minsFromNow < 0 ? "bg-rose-50 text-rose-800 border-rose-200 font-semibold dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900" :
                        minsFromNow <= 15 ? "bg-amber-100 text-amber-900 border-amber-300 font-semibold dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" :
                        "bg-white text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700";
                      const lateLabel =
                        minsFromNow < -15 ? `Should have started ${Math.abs(minsFromNow)}m ago` :
                        minsFromNow < 0 ? `${Math.abs(minsFromNow)}m late` :
                        minsFromNow === 0 ? "Now" :
                        minsFromNow <= 60 ? `Start in ${minsFromNow}m` :
                        `Start in ${Math.round(minsFromNow / 60)}h ${minsFromNow % 60}m`;
                      const startClock = new Date(task.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <li key={task.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border tabular-nums whitespace-nowrap ${lateClass}`}>
                            {lateLabel}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              <span className="text-brand-primary mr-1.5">{taskTypeLabel}</span>
                              {task.menu_item_name || "Item"}
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                              {ord?.order_number ? `${ord.order_number} · ` : ""}
                              {/* KIT4: orderDisplayName so a literal "Untitled"
                                  event name falls back to the client. */}
                              {ord
                                ? orderDisplayName({ event_name: ord.event_name, client_name: ord.client_name, order_number: ord.order_number })
                                : "-"}
                              {ord?.guest_count ? ` · ${ord.guest_count} guests` : ""}
                              {station ? ` · ${station.name}` : ""}
                            </p>
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                            {startClock}
                            <span className="text-slate-400 dark:text-slate-500 ml-1">· {Number(task.duration_min || 0)}m</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
              </PortalCard>
            );
          })()}

          {loading ? (
            <div className="space-y-4">
              <div className="h-40 animate-pulse rounded-2xl border border-slate-200/80 bg-white motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900" />
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200/80 bg-white motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900" />
            </div>
          ) : loadError ? null : view === "day" ? (
            // ── DAY VIEW: time-grid with stations as rows ──
            tasksOnAnchor.length === 0 && (ordersByDate[isoDate(anchor)] || []).length === 0 ? (
              <PortalCard className="p-10 text-center">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand-primary dark:border-slate-700 dark:bg-slate-900">
                  <ChefHat className="h-6 w-6" />
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Quiet day</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  No prep scheduled. Use the breather to deep-clean or restock.
                </p>
                {/* KIT3-C: next-event lookahead so the empty state
                    points the chef at when to plan ahead from. */}
                {nextUpcoming && (() => {
                  const nextDate = new Date(`${nextUpcoming.eventDate}T00:00:00`);
                  const todayMs = startOfDay(new Date()).getTime();
                  const dayDiff = Math.round((nextDate.getTime() - todayMs) / 86400000);
                  const whenLabel =
                    dayDiff <= 0 ? fmtDay(nextDate) :
                    dayDiff === 1 ? "Tomorrow" :
                    dayDiff < 7 ? nextDate.toLocaleDateString("en-ZA", { weekday: "long" }) :
                                  fmtDay(nextDate);
                  return (
                    <div className="mt-4 inline-flex items-center gap-2 text-xs rounded-full px-3 py-1.5 bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20">
                      <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                      <span>
                        Next event: <strong>{whenLabel}</strong>
                        {nextUpcoming.eventTime ? ` at ${fmtTime(nextUpcoming.eventTime)}` : ""}
                        {nextUpcoming.guestCount ? ` for ${nextUpcoming.guestCount} guests` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAnchor(startOfDay(nextDate))}
                        className="ml-1 underline text-brand-primary hover:opacity-80"
                      >
                        Jump to it
                      </button>
                    </div>
                  );
                })()}
              </PortalCard>
            ) : (
              <>
                {/* KIT3-D: "Generate prep plan" CTA. Renders when the
                    day has orders but at least one of them has zero
                    prep tasks. Fires ensurePrepTasksForOrder per
                    order so the chef does not have to open each order
                    document manually. */}
                {ordersWithoutPrep.length > 0 && (
                  <PortalCard padded={false} className="mb-3 bg-amber-50 border-l-4 border-l-amber-500 dark:bg-amber-950/30">
                    <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <ChefHat className="w-5 h-5 text-amber-700 dark:text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                            {ordersWithoutPrep.length} order{ordersWithoutPrep.length === 1 ? "" : "s"} on today have no prep tasks scheduled
                          </p>
                          <p className="text-xs text-amber-800 dark:text-amber-300/80 mt-0.5">
                            Generate a prep plan from the menu items in one tap. Each task gets a station, a duration and a start time backed off from the event clock.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => generatePrepPlan(ordersWithoutPrep.map((o) => o.id))}
                        disabled={generatingPlan}
                        className="bg-brand-primary hover:opacity-90 text-white shrink-0 gap-1.5"
                      >
                        {generatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />}
                        Generate prep plan
                      </Button>
                    </div>
                  </PortalCard>
                )}
              <PortalCard padded={false} className="overflow-x-auto">
                  <div className="min-w-[900px] relative">
                    {/* KIT3-C: "now" line. Vertical red marker at the
                        current clock position when looking at today.
                        Hidden when the anchor isn't today.
                        Positioned relative to the inner container with
                        an 8rem (w-32) gutter for the station label
                        column so the line sits over the actual hour
                        track. */}
                    {(() => {
                      const isViewingToday = isoDate(anchor) === isoDate(new Date());
                      if (!isViewingToday) return null;
                      const nowDate = new Date(nowMs);
                      const minsFromStart =
                        nowDate.getHours() * 60 + nowDate.getMinutes() - DAY_START_HOUR * 60;
                      if (minsFromStart < 0 || minsFromStart > DAY_TOTAL_MIN) return null;
                      const leftPct = (minsFromStart / DAY_TOTAL_MIN) * 100;
                      const clock = nowDate.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div
                          className="absolute top-0 bottom-0 z-20 pointer-events-none"
                          style={{ left: `calc(8rem + (100% - 8rem) * ${leftPct / 100})` }}
                          aria-hidden="true"
                        >
                          <div className="w-px h-full bg-rose-500/70" />
                          <div className="absolute top-1 -translate-x-1/2 text-[9px] font-semibold text-white bg-rose-500 rounded px-1 py-0.5 tabular-nums whitespace-nowrap shadow-sm">
                            Now {clock}
                          </div>
                        </div>
                      );
                    })()}
                    {/* Hour ruler */}
                    <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10 dark:border-slate-800 dark:bg-slate-900">
                      <div className="w-32 shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-r border-slate-200 dark:border-slate-800 dark:text-slate-400">
                        Station
                      </div>
                      <div className="flex-1 relative h-8">
                        {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => {
                          const hour = DAY_START_HOUR + i;
                          const leftPct = (i * 60) / DAY_TOTAL_MIN * 100;
                          return (
                            <div
                              key={hour}
                              className="absolute top-0 bottom-0 border-l border-slate-200 text-[10px] text-slate-500 px-1.5 pt-1.5 dark:border-slate-800 dark:text-slate-400"
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
                      <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
                        No stations configured.
                      </div>
                    ) : stationsForGrid.map(station => {
                      const stationTasks = tasksByStation[station.id ?? "__unassigned__"] || [];
                      return (
                        <div key={station.id ?? "__unassigned__"} className="flex border-b border-slate-100 hover:bg-slate-50/40 dark:border-slate-800 dark:hover:bg-slate-800/30">
                          <div className="w-32 shrink-0 px-3 py-3 text-sm border-r border-slate-200 dark:border-slate-800">
                            <p className="font-semibold text-slate-900 dark:text-white">{station.name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
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
                                  className="absolute top-0 bottom-0 border-l border-slate-100 dark:border-slate-800"
                                  style={{ left: `${leftPct}%` }}
                                />
                              );
                            })}

                            {/* Task blocks. KIT3-C: each block links
                                through to the unified order document so
                                the chef can tap a block on the timeline
                                and land on the kitchen section. */}
                            {stationTasks.map((t: any) => {
                              const pos = taskPosition(t);
                              if (!pos) return null;
                              const tone = TASK_TONES[t.status] || TASK_TONES.pending;
                              const eventName = orderDisplayName({ event_name: t.order?.event_name, client_name: t.order?.client_name, order_number: t.order?.order_number });
                              const startClock = new Date(t.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
                              return (
                                <Link
                                  key={t.id}
                                  href={withSlug(staffOrderHref(t.order_id, "kitchen_staff")) + "#section-kitchen"}
                                  className={`absolute top-2 h-12 rounded-md border-l-4 px-1.5 py-1 text-[11px] cursor-pointer transition-colors block hover:shadow-md hover:ring-2 hover:ring-brand-primary/40 ${tone}`}
                                  style={{
                                    left: `${pos.leftPct}%`,
                                    width: `${pos.widthPct}%`,
                                    minWidth: "60px",
                                  }}
                                  title={`Open order document - ${formatKitchenPrepTaskType(t.task_type)} · ${t.menu_item_name} · ${eventName} · starts ${startClock} · ${t.duration_min}m`}
                                >
                                  <p className="font-semibold truncate leading-tight">
                                    {t.menu_item_name}
                                  </p>
                                  <p className="truncate text-[10px] opacity-80 leading-tight">
                                    {formatKitchenPrepTaskType(t.task_type)} &middot; {t.duration_min}m &middot; {eventName}
                                  </p>
                                </Link>
                              );
                            })}

                            {stationTasks.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-300 dark:text-slate-600 italic">
                                Nothing scheduled on this station today
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
              </PortalCard>
              </>
            )
          ) : (
            // ── WEEK VIEW: per-day card lists (existing layout, polished) ──
            <div className="space-y-4">
              {windowDays.map((d) => {
                const key = isoDate(d);
                const list = ordersByDate[key] || [];
                const isToday = key === isoDate(new Date());
                // KIT3-D: per-day cook-hours load. Sum the prep
                // task minutes scheduled on this date, compare to
                // an even-split of available staff-hours (rough
                // "is this day heavier than the others" tell).
                const dayHours = Math.round((cookHoursByDate[key] || 0) * 10) / 10;
                const loadPct = dailyCapacity > 0
                  ? Math.min(100, Math.round((dayHours / dailyCapacity) * 100))
                  : 0;
                const loadTone = loadPct >= 95
                  ? "bg-rose-500"
                  : loadPct >= 70
                    ? "bg-amber-500"
                    : "bg-emerald-500";
                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                      <h2 className={`text-sm font-semibold ${isToday ? "text-brand-primary" : "text-slate-700 dark:text-slate-300"}`}>
                        {fmtDay(d)}
                        {isToday && <span className="ml-2 text-xs bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded dark:bg-brand-primary/20">Today</span>}
                      </h2>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{list.length} event{list.length === 1 ? "" : "s"}</span>
                      {dayHours > 0 && (
                        <span
                          className="ml-auto inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400"
                          title={dailyCapacity > 0
                            ? `${dayHours}h scheduled, ~${Math.round(dailyCapacity)}h of staff capacity per day`
                            : `${dayHours}h scheduled`}
                        >
                          <span className="tabular-nums">{dayHours}h prep</span>
                          {dailyCapacity > 0 && (
                            <span className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                              <span
                                className={`block h-full ${loadTone}`}
                                style={{ width: `${loadPct}%` }}
                              />
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {list.length === 0 ? (
                      <PortalCard padded={false} className="p-3 text-center text-xs text-slate-400 dark:text-slate-500">Quiet day</PortalCard>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {list.map((o) => {
                          const lineItems = itemsByOrder[o.id] || [];
                          const orderTasks = tasks.filter((t) => t.order_id === o.id);
                          const tasksDone = orderTasks.filter((t) => t.status === "done").length;
                          // Wave 70.43c - whole card links to the unified
                          // order document. Kitchen details live in the
                          // kitchen section; print mode still produces a
                          // paper run sheet when needed.
                          return (
                            <Link
                              key={o.id}
                              href={withSlug(staffOrderHref(o.id, "kitchen_staff"))}
                              className="block group"
                              title="Open the full order document"
                            >
                            <PortalCard padded={false} className={`${isToday ? "border-brand-primary/30" : ""} group-hover:border-brand-primary group-hover:shadow-md transition-all cursor-pointer`}>
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-primary transition-colors">{orderDisplayName({ event_name: o.event_name, client_name: o.client_name, order_number: o.order_number })}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(o.event_time)}</span>
                                      {o.guest_count != null && <span className="flex items-center gap-1"><UsersIcon className="h-3 w-3" />{o.guest_count} guests</span>}
                                      {o.order_number && <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{o.order_number}</span>}
                                    </div>
                                  </div>
                                  {o.status && (
                                    <Badge variant="outline" className={`${STATUS_TONES[o.status] ?? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"} text-[10px] flex-shrink-0`}>
                                      {o.status}
                                    </Badge>
                                  )}
                                </div>
                                {lineItems.length > 0 && (
                                  <ul className="mt-2 space-y-1 text-sm border-t border-slate-100 dark:border-slate-800 pt-2">
                                    {lineItems.map((it) => (
                                      <li key={it.id} className="flex items-center justify-between gap-2">
                                        <span className="truncate text-slate-700 dark:text-slate-300">{it.item_name ?? "--"}</span>
                                        <span className="tabular-nums text-slate-500 dark:text-slate-400 flex-shrink-0">x{it.quantity ?? 0}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {orderTasks.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                                      <span className="font-semibold uppercase tracking-wide">Prep tasks</span>
                                      <span className="tabular-nums">{tasksDone} of {orderTasks.length} done</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          tasksDone === orderTasks.length ? "bg-emerald-500" :
                                          tasksDone > 0 ? "bg-amber-500" :
                                                          "bg-slate-300 dark:bg-slate-600"
                                        }`}
                                        style={{ width: `${(tasksDone / orderTasks.length) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                                {o.special_instructions && (
                                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900/50">
                                    {o.special_instructions}
                                  </p>
                                )}
                                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-brand-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                  Open order document
                                </div>
                              </div>
                            </PortalCard>
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
          {loaded && view === "day" && tasksOnAnchor.length > 0 && (
            <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="font-semibold">Status:</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-200 border border-slate-300 dark:bg-slate-700 dark:border-slate-600" /> Pending</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-400 dark:bg-amber-950/50 dark:border-amber-700" /> In progress</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-400 dark:bg-emerald-950/50 dark:border-emerald-700" /> Done</span>
            </div>
          )}

          {/* Phase 4: recipe accuracy panel. Only renders when at least one
              prep task has both planned and actual yields logged. Lists the
              recipes by absolute variance so the worst offenders surface
              first. Sample size on each row keeps confidence honest. */}
          {loaded && recipeAccuracy.length > 0 && (
            <PortalCard id="recipe-accuracy" padded={false} className="mt-6 scroll-mt-24">
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">Recipe accuracy, last 30 days</h2>
                    {/* KIT4: was a plain JSX attribute string, so the \n\n
                        escapes rendered literally in the bubble. */}
                    <InfoTooltip content={"Average difference between planned and actual yield, per recipe.\n\nNegative means you're under-producing relative to the plan; positive means over.\n\nSample size shows how many cooks the average is built on, treat single-digit samples as early signal, not gospel."} />
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{recipeAccuracy.length} recipe{recipeAccuracy.length === 1 ? "" : "s"}</span>
                </div>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
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
                          Math.abs(r.avg_variance_pct) < 5  ? "text-emerald-700 dark:text-emerald-400" :
                          Math.abs(r.avg_variance_pct) < 15 ? "text-amber-700 dark:text-amber-400"   :
                                                              "text-rose-700 dark:text-rose-400";
                        const Arrow = r.avg_variance_pct >= 0 ? TrendingUp : TrendingDown;
                        return (
                          <tr key={r.recipe_name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-200">{r.recipe_name}</td>
                            <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{r.samples}</td>
                            <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">{r.avg_planned} {r.yield_unit || ""}</td>
                            <td className="px-2 py-2 text-right text-slate-900 dark:text-white tabular-nums">{r.avg_actual} {r.yield_unit || ""}</td>
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
              </div>
            </PortalCard>
          )}
      </KitchenPageShell>

      {/* Wave 70.7c - bottom-left FAB during service hours */}
      <KitchenServiceFAB />
    </>
  );
}

export default function KitchenProductionPage() {
  // KIT4: admin set admitted alongside kitchen roles so an owner or
  // company admin view-switching into the kitchen portal doesn't 403
  // (middleware already lets them through to /team-portal/kitchen).
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.KITCHEN_MANAGER,
        UserRole.KITCHEN_STAFF,
        UserRole.ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.OWNER,
        UserRole.SUPER_ADMIN,
        UserRole.REGION_ADMIN,
      ]}
    >
      <KitchenProductionPageInner />
    </ProtectedRoute>
  );
}
