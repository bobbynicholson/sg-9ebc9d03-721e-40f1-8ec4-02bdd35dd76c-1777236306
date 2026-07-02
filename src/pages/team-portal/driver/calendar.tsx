/**
 * /team-portal/driver/calendar - Bobby's brief: a month-grid the
 * driver can scan to see at-a-glance which days they have a
 * function booked vs which days have unclaimed jobs they could
 * pick up.
 *
 * Two-layer dot legend per day:
 *   - slate dot = at least one order assigned to this driver
 *   - brand dot = at least one unassigned order in the tenant the
 *                  driver is eligible to claim
 *   - both can co-exist
 *
 * Clicking a day expands the day's events below. Clicking a
 * claimable event opens the existing AvailableJobsCard confirm
 * flow (in-place dialog), so the calendar inherits the same
 * commitment story as the dashboard.
 *
 * Command-centre restructure (2026-07-02): this page ABSORBED the old
 * /team-portal/driver/schedule page. The "Upcoming schedule" agenda
 * below the grid is that page's read-only day-bucketed list of the
 * driver's assigned jobs (Today / Tomorrow / This week / This month /
 * Later) with the Maps + Open brief actions. Its day bucketing was
 * rebuilt on parseLocalDay/toLocalISO because the old page diffed
 * `new Date("YYYY-MM-DD")` (UTC midnight) against local midnight,
 * which shifted every bucket by a day for browsers west of UTC.
 * Order money values stay OFF this page - drivers must not see the
 * client's invoice value, only their own payout (earnings page).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PortalCard, PortalCardHeader, PortalOverview } from "@/components/portal/ui";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, MapPin, Clock,
  Users, Loader2, Hand, ExternalLink, Truck, RefreshCw, Navigation, CalendarClock,
} from "lucide-react";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { parseLocalDay, toLocalISO } from "@/lib/localDate";

interface OrderRow {
  id: string;
  order_number: string | null;
  client_name: string | null;
  event_date: string | null;
  event_time: string | null;
  pickup_time: string | null;
  venue_address: string | null;
  guest_count: number | null;
  status: string;
  /** Computed locally: true when this row is assigned to the
   *  signed-in driver. false means it's unclaimed in this tenant. */
  is_mine: boolean;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Every order column this page reads - shared by the month-window
 *  and upcoming-agenda queries so the two stay in lockstep. */
const ORDER_COLUMNS =
  "id, order_number, client_name, event_date, event_time, pickup_time, venue_address, guest_count, status, assigned_driver_id, driver_id";

const AGENDA_BUCKETS = ["Today", "Tomorrow", "This week", "This month", "Later"] as const;
type AgendaBucket = (typeof AGENDA_BUCKETS)[number];

/** Day-bucket an event date against local midnight today. Both sides
 *  are local-midnight Dates (parseLocalDay), so the diff is whole
 *  days on the driver's wall clock - no UTC-midnight drift. */
function agendaBucket(eventDate: string | null, today: Date): AgendaBucket | null {
  const day = parseLocalDay(eventDate);
  if (!day) return null;
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "Today"; // query filters event_date >= today
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return "This week";
  if (diff < 30) return "This month";
  return "Later";
}

function DriverCalendarInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id ?? null);
  const [cursor, setCursor] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  /** Assigned jobs from today onwards, unbounded by the visible month.
   *  Feeds the absorbed "Upcoming schedule" agenda. */
  const [upcoming, setUpcoming] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !user?.company_id) return;
    setLoading(true);
    setError(null);
    try {
      // Load the visible month + one-week pad on each side so the
      // overflow days at the top and bottom of the grid still get
      // dots. The grid renders 6 weeks max.
      const start = new Date(cursor);
      start.setDate(start.getDate() - 7);
      const end = endOfMonth(cursor);
      end.setDate(end.getDate() + 7);
      const today = new Date();

      // Two scoped queries in parallel:
      //   1. Month window: assigned-to-me OR unassigned-in-my-tenant,
      //      feeds the grid dots + selected-day detail.
      //   2. Upcoming agenda: MY active jobs from today onwards with
      //      no month cap, so next month's bookings still show in the
      //      schedule list. RLS plus the status filters keep both to
      //      what the driver should actually see.
      const [monthRes, upcomingRes] = await Promise.all([
        supabase
          .from("orders")
          .select(ORDER_COLUMNS)
          .eq("company_id", user.company_id)
          // Show every real delivery job on the calendar - upcoming (confirmed
          // -> in_transit) AND already finished (delivered/completed) so the
          // driver sees their full schedule + history, not just the live ones.
          // Only quote/pending/cancelled (not yet a real job) are left off.
          .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"])
          .gte("event_date", toLocalISO(start))
          .lte("event_date", toLocalISO(end)),
        supabase
          .from("orders")
          .select(ORDER_COLUMNS)
          .eq("company_id", user.company_id)
          .or(`assigned_driver_id.eq.${user.id},driver_id.eq.${user.id}`)
          .in("status", ["confirmed", "preparing", "ready", "in_transit"])
          .gte("event_date", toLocalISO(today))
          .order("event_date", { ascending: true })
          .order("event_time", { ascending: true, nullsFirst: true })
          .limit(100),
      ]);

      if (monthRes.error) throw monthRes.error;
      if (upcomingRes.error) throw upcomingRes.error;

      const rows = (monthRes.data || []).flatMap((o): OrderRow[] => {
        const mine = o.assigned_driver_id === user.id || o.driver_id === user.id;
        const claimable =
          !o.assigned_driver_id &&
          !o.driver_id &&
          !["delivered", "completed"].includes(String(o.status));
        // We surface a row if it's MINE or unclaimed-in-tenant.
        // Other drivers' jobs we leave out - the driver can't
        // act on those and they'd just clutter the grid.
        if (!mine && !claimable) return [];
        return [{
          id: o.id,
          order_number: o.order_number,
          client_name: o.client_name,
          event_date: o.event_date,
          event_time: o.event_time,
          pickup_time: o.pickup_time,
          venue_address: o.venue_address,
          guest_count: o.guest_count,
          status: o.status,
          is_mine: mine,
        }];
      });

      setOrders(rows);
      setUpcoming(
        (upcomingRes.data || []).map((o): OrderRow => ({
          id: o.id,
          order_number: o.order_number,
          client_name: o.client_name,
          event_date: o.event_date,
          event_time: o.event_time,
          pickup_time: o.pickup_time,
          venue_address: o.venue_address,
          guest_count: o.guest_count,
          status: o.status,
          is_mine: true,
        })),
      );
    } catch (e) {
      // Pre-audit this fetch failed silently (console.error + empty
      // grid, which read as "no jobs"). Surface it with a Retry card.
      console.error("[driver/calendar] orders fetch failed:", e);
      setOrders([]);
      setUpcoming([]);
      setError(dbErrorMessage(e, { entity: "calendar" }));
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.company_id, cursor]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  // Group orders by event_date for fast per-day lookups in the grid.
  const ordersByDay = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of orders) {
      if (!o.event_date) continue;
      const arr = map.get(o.event_date) || [];
      arr.push(o);
      map.set(o.event_date, arr);
    }
    return map;
  }, [orders]);

  // Build the 6-week grid for the current cursor.
  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    // Pad to Monday start.
    const firstDow = (first.getDay() + 6) % 7; // 0 = Mon
    const start = new Date(first);
    start.setDate(start.getDate() - firstDow);
    const days: Date[] = [];
    // Always render 6 weeks to keep height stable across months.
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return { days, monthStart: first, monthEnd: last };
  }, [cursor]);

  const todayIso = toLocalISO(new Date());

  // Month-scoped counts for the hero chips (the fetch window pads a
  // week each side; chips should speak about the month on screen).
  const monthCounts = useMemo(() => {
    const startIso = toLocalISO(startOfMonth(cursor));
    const endIso = toLocalISO(endOfMonth(cursor));
    let mine = 0;
    let open = 0;
    for (const o of orders) {
      if (!o.event_date || o.event_date < startIso || o.event_date > endIso) continue;
      if (o.is_mine) mine += 1;
      else open += 1;
    }
    return { mine, open };
  }, [orders, cursor]);

  // Absorbed schedule page: bucket upcoming assigned jobs by local
  // calendar day distance (parseLocalDay both sides - see file header).
  const agendaGroups = useMemo(() => {
    const today = parseLocalDay(new Date());
    if (!today) return [];
    const buckets = new Map<AgendaBucket, OrderRow[]>();
    for (const o of upcoming) {
      const bucket = agendaBucket(o.event_date, today);
      if (!bucket) continue;
      const arr = buckets.get(bucket) || [];
      arr.push(o);
      buckets.set(bucket, arr);
    }
    return AGENDA_BUCKETS.filter((b) => (buckets.get(b) || []).length > 0).map((b) => ({
      name: b,
      items: buckets.get(b) as OrderRow[],
    }));
  }, [upcoming]);

  // Claim flow (calendar-side). Same RPC the dashboard uses;
  // duplicated here to keep the calendar self-contained.
  const claim = async (orderId: string) => {
    if (claimingId) return;
    setClaimingId(orderId);
    const { data, error: claimError } = await supabase.rpc("claim_order", {
      p_order_id: orderId,
    });
    setClaimingId(null);
    if (claimError) {
      toast({
        title: "Couldn't claim",
        description: dbErrorMessage(claimError, { entity: "job" }),
        variant: "destructive",
      });
      return;
    }
    const result = (data ?? {}) as { ok?: boolean; reason?: string };
    if (!result.ok) {
      const labels: Record<string, string> = {
        already_claimed: "Another driver claimed this first.",
        not_eligible: "Order is no longer eligible.",
        not_found: "Order is no longer available.",
      };
      toast({
        title: "Couldn't claim",
        description: labels[result.reason || ""] || result.reason || "Try again.",
        variant: "destructive",
      });
      void load();
      return;
    }
    toast({ title: "Job claimed", description: "Added to your deliveries." });
    void load();
  };

  const selectedOrders = selectedDay ? ordersByDay.get(selectedDay) || [] : [];
  const selectedDayDate = selectedDay ? parseLocalDay(selectedDay) : null;

  const jumpToToday = () => {
    const t = new Date();
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDay(toLocalISO(t));
  };

  return (
    <DriverPageShell
      pageTitle="Calendar - Driver Portal"
      heading="My calendar"
      subheading="Slate dots = jobs already yours. Brand dots = jobs in your company waiting to be claimed. Your upcoming schedule is listed below the grid."
      icon={CalendarIcon}
      width="wide"
      headerAction={
        <>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={jumpToToday}
          >
            <CalendarClock className="w-4 h-4 mr-1.5" />
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </>
      }
      meta={
        !loading && !error ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {monthCounts.mine} job{monthCounts.mine === 1 ? "" : "s"} this month
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              {monthCounts.open} open to claim
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              {upcoming.length} upcoming assigned
            </span>
          </>
        ) : undefined
      }
      overview={
        <PortalOverview
          eyebrow="Calendar"
          title="Scan your month, then claim open work"
          description="Each day shows your assigned jobs and tenant jobs still open to drivers. Select a day to see addresses, collect times, and claim actions. The upcoming schedule below groups your assigned jobs by when you need to act."
          items={[
            { label: "Month", value: cursor.toLocaleDateString("en-ZA", { month: "short", year: "numeric" }), helper: "Visible grid", icon: CalendarIcon, tone: "brand" },
            { label: "Your jobs", value: orders.filter((o) => o.is_mine).length, helper: "In this window", icon: Truck, tone: "neutral" },
            { label: "Open jobs", value: orders.filter((o) => !o.is_mine).length, helper: "Available to claim", icon: Hand, tone: orders.some((o) => !o.is_mine) ? "warning" : "success" },
            { label: "Upcoming", value: upcoming.length, helper: "Assigned from today", icon: CalendarClock, tone: upcoming.length > 0 ? "brand" : "neutral" },
          ]}
        />
      }
    >
          {/* Recovery card - a failed fetch used to render as a blank,
              dot-free month, which read as "no jobs". */}
          {error && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900/60 dark:bg-slate-900">
              <h2 className="text-base font-bold text-rose-900 dark:text-rose-300 mb-1">Couldn&apos;t load your calendar</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{error}</p>
              <Button
                onClick={() => void load()}
                size="sm"
                disabled={loading}
                className="bg-brand-primary hover:opacity-90 text-white min-h-11"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {/* Month nav */}
          <PortalCard className="mb-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {cursor.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
              </h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={jumpToToday}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              {loading ? (
                <div className="py-12 flex items-center justify-center text-slate-500 dark:text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading calendar...
                </div>
              ) : (
                <>
                  {/* Day-of-week header */}
                  <div className="grid grid-cols-7 gap-1 mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <div key={d} className="text-center py-1">{d}</div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {grid.days.map((d, i) => {
                      const iso = toLocalISO(d);
                      const inMonth = d.getMonth() === cursor.getMonth();
                      const isToday = iso === todayIso;
                      const isSelected = selectedDay === iso;
                      const dayOrders = ordersByDay.get(iso) || [];
                      const mineCount = dayOrders.filter((o) => o.is_mine).length;
                      const claimableCount = dayOrders.filter((o) => !o.is_mine).length;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedDay(iso)}
                          className={`relative min-h-16 sm:min-h-20 rounded-md border text-left p-1 sm:p-2 transition ${
                            !inMonth
                              ? "bg-slate-50/50 dark:bg-slate-950 text-slate-300 dark:text-slate-600 border-transparent"
                              : isSelected
                              ? "border-brand-primary ring-2 ring-brand-primary/20 dark:ring-brand-primary/30 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                              : isToday
                              ? "border-brand-primary/40 bg-brand-primary/5 dark:border-brand-primary/40 dark:bg-brand-primary/10 text-slate-900 dark:text-white"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:border-brand-primary/40"
                          }`}
                          aria-label={`${d.toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}, ${mineCount + claimableCount} events`}
                        >
                          <div className={`text-xs sm:text-sm font-semibold ${isToday ? "text-brand-primary" : ""}`}>
                            {d.getDate()}
                          </div>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {mineCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 tabular-nums">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                                {mineCount}
                              </span>
                            )}
                            {claimableCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-brand-primary/10 text-brand-primary border border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary tabular-nums">
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                                {claimableCount}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" /> Your jobs
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-brand-primary" /> Open to claim
                    </span>
                  </div>
                </>
              )}
            </div>
          </PortalCard>

          {/* Selected-day detail */}
          {selectedDay && selectedDayDate && (
            <PortalCard>
              <PortalCardHeader
                title={selectedDayDate.toLocaleDateString("en-ZA", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              />
              <div>
                {selectedOrders.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                    Nothing scheduled or available to claim on this day.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedOrders.map((o) => (
                      <li
                        key={o.id}
                        className={`p-3 rounded-md border ${
                          o.is_mine
                            ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                            : "border-brand-primary/20 bg-brand-primary/5 dark:border-brand-primary/30 dark:bg-brand-primary/10"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                              {o.order_number && (
                                <span className="tabular-nums">{o.order_number}</span>
                              )}
                              <span className="truncate">{o.client_name || "Order"}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  o.is_mine
                                    ? "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                    : "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary dark:border-brand-primary/30"
                                }`}
                              >
                                {o.is_mine ? "Yours" : "Open"}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                              {o.event_time && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                  Event {o.event_time.slice(0, 5)}
                                </span>
                              )}
                              {o.pickup_time && (
                                <span className="inline-flex items-center gap-1 text-brand-primary font-medium">
                                  <Clock className="w-3 h-3" />
                                  Collect {o.pickup_time.slice(0, 5)}
                                </span>
                              )}
                              {o.guest_count != null && (
                                <span className="inline-flex items-center gap-1">
                                  <Users className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                  {o.guest_count} guests
                                </span>
                              )}
                              {o.venue_address && (
                                <span className="inline-flex items-center gap-1 truncate max-w-[280px]">
                                  <MapPin className="w-3 h-3 shrink-0 text-slate-400 dark:text-slate-500" />
                                  <span className="truncate">{o.venue_address}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Link
                              href={withSlug(staffOrderHref(o.id, "driver"))}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-primary/30 hover:bg-brand-primary/5 text-brand-primary font-semibold min-h-[32px] transition-colors duration-150"
                              title="Open the driver brief for this order"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open brief
                            </Link>
                            {o.is_mine ? (
                              <Link href={withSlug("/team-portal/driver/routes")}>
                                <Button size="sm" variant="outline" className="min-h-11">
                                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                  Open route
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => claim(o.id)}
                                disabled={claimingId === o.id}
                                className="bg-brand-primary hover:opacity-90 text-white min-h-11"
                              >
                                {claimingId === o.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Hand className="w-4 h-4" />
                                )}
                                <span className="ml-1">Claim</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </PortalCard>
          )}

          {/* Upcoming schedule agenda (absorbed /driver/schedule page).
              Read-only preview of MY assigned active jobs from today
              onwards, grouped by when the driver needs to act. Kept
              deliberately money-free - see file header. */}
          {!error && (
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Upcoming schedule</h2>
              </div>
              {loading ? (
                <PortalCard padded={false}>
                  <div className="py-12 flex items-center justify-center text-slate-500 dark:text-slate-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading schedule...
                  </div>
                </PortalCard>
              ) : agendaGroups.length === 0 ? (
                <PortalCard padded={false}>
                  <div className="py-14 px-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                      <CalendarClock className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">No upcoming jobs</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                      When dispatch assigns you a delivery, or you claim an open job above, it&apos;ll appear here grouped by day.
                    </p>
                  </div>
                </PortalCard>
              ) : (
                <div className="space-y-8">
                  {agendaGroups.map((g) => (
                    <div key={g.name}>
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                        {g.name}
                        <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">
                          {g.items.length} job{g.items.length === 1 ? "" : "s"}
                        </span>
                      </h3>
                      <PortalCard padded={false}>
                        <div>
                          {g.items.map((o, i) => {
                            const day = parseLocalDay(o.event_date);
                            return (
                              <div
                                key={o.id}
                                className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-5 ${i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""} hover:bg-slate-50 dark:hover:bg-slate-800/50`}
                              >
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className="w-12 h-12 rounded-xl bg-brand-primary/10 text-brand-primary border border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary flex flex-col items-center justify-center text-xs flex-shrink-0">
                                    <span className="font-bold leading-none tabular-nums">
                                      {day ? day.toLocaleDateString("en-ZA", { day: "numeric" }) : "?"}
                                    </span>
                                    <span className="uppercase">
                                      {day ? day.toLocaleDateString("en-ZA", { month: "short" }) : ""}
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-slate-900 dark:text-white truncate">{o.client_name || "Order"}</p>
                                      <Badge variant="outline" className="text-[10px] capitalize">
                                        {o.status.replace(/_/g, " ")}
                                      </Badge>
                                    </div>
                                    {o.venue_address && (
                                      <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                        <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                                        <span className="truncate">{o.venue_address}</span>
                                      </p>
                                    )}
                                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1">
                                      <span className="flex items-center gap-1 tabular-nums">
                                        <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                        {o.event_time ? o.event_time.slice(0, 5) : "TBD"}
                                      </span>
                                      {o.pickup_time && (
                                        <span className="flex items-center gap-1 tabular-nums text-brand-primary font-medium">
                                          <Clock className="w-3 h-3" />
                                          Collect {o.pickup_time.slice(0, 5)}
                                        </span>
                                      )}
                                      {o.guest_count != null && (
                                        <span className="flex items-center gap-1 tabular-nums">
                                          <Users className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                          {o.guest_count} pax
                                        </span>
                                      )}
                                    </div>
                                    {/* Agenda rows are read-only previews so the action
                                        surface stays narrow: a Maps tap to pre-check
                                        the route + the full driver brief. 44px-tall
                                        hit areas for thumbs on a phone. */}
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                      {o.venue_address && (
                                        <a
                                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.venue_address)}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          aria-label={`Open ${o.venue_address} in Google Maps`}
                                          className="inline-flex items-center gap-1 text-xs px-2.5 py-2 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 min-h-[44px]"
                                        >
                                          <Navigation className="w-3.5 h-3.5" />
                                          Open in Maps
                                        </a>
                                      )}
                                      <Link
                                        href={withSlug(staffOrderHref(o.id, "driver"))}
                                        className="inline-flex items-center gap-1 text-xs px-2.5 py-2 rounded border border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary font-semibold min-h-[44px]"
                                        title="Open the driver brief for this order"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Open brief
                                      </Link>
                                    </div>
                                  </div>
                                </div>
                                {/* Order value deliberately absent - drivers see their
                                    own payout on /team-portal/driver/earnings, never
                                    the client's invoice value. */}
                              </div>
                            );
                          })}
                        </div>
                      </PortalCard>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
    </DriverPageShell>
  );
}

// Defense-in-depth, same as the driver dashboard (DRV-A): the calendar
// previously had NO route guard and relied purely on `useAuth().user`
// for fetching, so a logged-in non-driver hitting the URL rendered a
// blank calendar rather than getting bounced. Admin roles are admitted
// for support / cross-tenant troubleshooting.
export default function DriverCalendarPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.DRIVER,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <DriverCalendarInner />
    </ProtectedRoute>
  );
}
