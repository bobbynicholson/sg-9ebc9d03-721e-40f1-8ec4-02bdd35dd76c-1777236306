/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Event Calendar - rebuilt for actual UX. Each day cell now shows event
 * pills (truncated client names) instead of an opaque count badge, click
 * a day to open a side sheet with that day's full event list, click an
 * event to jump to its order page. Arrow keys navigate days, "T" jumps
 * to today, "[" / "]" flip months. Today's cell pulses subtly.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, MapPin, Users, ArrowRight, Sparkles, Keyboard, Download, RefreshCw, AlertCircle, ChefHat, Truck, Package, Droplets, PartyPopper } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { supabase } from "@/integrations/supabase/client";
import type { AppOrder } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { cn } from "@/lib/utils";
import { ClientLinkButton } from "@/components/admin/ClientLinkButton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";
import { onOrderUpdated } from "@/lib/events/orderEvents";

// CAL-C (CAL-4): region_admin + sales_admin need diary access.
// RLS on orders narrows region_admin to their regions_covered
// rows; sales_admin reads all to slot quotes into the diary.
export default function ProtectedCalendarPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.REGION_ADMIN, UserRole.SALES_ADMIN]}>
      <AdminCalendar />
    </ProtectedRoute>
  );
}

const STATUS_TONES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-purple-100 text-purple-800 border-purple-200",
  ready:      "bg-green-100 text-green-800 border-green-200",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed:  "bg-slate-100 text-slate-800 border-slate-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
  // Paused stays blue (still booked, capacity counted) but with a
  // dashed border treatment in the cell so the at-risk read is
  // visible at a glance. Pill itself uses blue so the team doesn't
  // confuse it with cancelled (rose) or unconfirmed (amber).
  paused:     "bg-blue-100 text-blue-800 border-blue-300 border-dashed",
};

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

// Quote statuses that count as "still open" for the diary gap-finder.
// Anything past these (accepted -> already an order, rejected -> dead,
// expired -> dead unless re-quoted) is excluded so the calendar only
// shows quotes that could still convert to a booking.
// Generated supabase types narrow quotes.status to a strict 5-member
// enum, but the live CHECK + downstream code accepts "viewed",
// "pending", "revised" too. Cast as any[] at the .in call site to
// avoid the false-positive type error without weakening the rest of
// the file.
const OPEN_QUOTE_STATUSES = ["draft", "sent", "viewed", "pending", "revised"];

interface OpenQuote {
  id: string;
  client_name: string | null;
  event_date: string;
  event_time: string | null;
  total: number | null;
  status: string;
  valid_until: string | null;
  sent_at: string | null;
}

function AdminCalendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  // Wave 27: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [openQuotes, setOpenQuotes] = useState<OpenQuote[]>([]);

  // CAL-C (XSC Wave C, task #257): five more event producers can
  // now layer onto the calendar grid. Default to orders + holidays
  // visible (clean morning view) and the rest togglable via the
  // layer pills above the grid. Toggle state persists in
  // localStorage per user so an operator's setup survives reloads.
  const [kitchenShifts, setKitchenShifts] = useState<Array<{ id: string; staff_id: string; shift_date: string; planned_start: string | null; planned_end: string | null; status: string }>>([]);
  const [driverShiftRows, setDriverShiftRows] = useState<Array<{ id: string; driver_id: string; shift_date: string; planned_start: string | null; planned_end: string | null; status: string }>>([]);
  const [equipmentBlocks, setEquipmentBlocks] = useState<Array<{ id: string; equipment_id: string; booked_from: string | null; booked_until: string | null; quantity: number | null; status: string }>>([]);
  const [cleaningBlocks, setCleaningBlocks] = useState<Array<{ id: string; planned_start: string | null; planned_end: string | null; status: string }>>([]);
  const [holidays, setHolidays] = useState<Array<{ id: string; date: string; name: string }>>([]);
  const [layers, setLayers] = useState<{
    orders: boolean; quotes: boolean; kitchen: boolean; drivers: boolean;
    equipment: boolean; cleaning: boolean; holidays: boolean;
  }>({ orders: true, quotes: true, kitchen: false, drivers: false, equipment: false, cleaning: false, holidays: true });

  // CAL-C: hydrate layer toggles from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("calendar-layers-v1");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setLayers((cur) => ({ ...cur, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("calendar-layers-v1", JSON.stringify(layers)); } catch { /* ignore quota */ }
  }, [layers]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const focusedRef = useRef<HTMLButtonElement | null>(null);
  const [focusedISO, setFocusedISO] = useState<string | null>(null);

  // CAL-B (calendar audit, CAL-3): re-fetch orders when the visible
  // month changes so the sliding ±6-month window stays centred on
  // what the user is looking at. Open quotes are a small dataset
  // and don't need windowing.
  useEffect(() => {
    if (user?.company_id) {
      loadOrders();
      loadOpenQuotes();
      // CAL-C: load the 5 new producers in parallel. Each is
      // self-contained + non-blocking.
      loadKitchenShifts();
      loadDriverShiftRows();
      loadEquipmentBlocks();
      loadCleaningBlocks();
      loadHolidays();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id, currentDate.getFullYear(), currentDate.getMonth()]);

  // Wave 70.37 - live refresh hooks. The calendar previously only
  // refetched on mount and on company_id change. When Bobby edited
  // an order's date on /admin/orders, the calendar continued to
  // show the old date until he hard-refreshed. Two fixes:
  //   1. Tab focus - coming back to the calendar tab refetches.
  //      Covers cross-tab edits (admin/orders open in tab A, edit,
  //      switch to tab B = calendar -> refresh fires).
  //   2. Custom event 'cateringms:order-updated' - in-tab cross-
  //      page edits (same browser tab, e.g. drawer was opened
  //      from a different surface). Dispatched by every order
  //      save handler in /admin/orders.
  useEffect(() => {
    if (!user?.company_id) return;
    const refetch = () => {
      loadOrders();
      loadOpenQuotes();
    };
    const onFocus = () => { refetch(); };
    window.addEventListener("focus", onFocus);
    // Wave 70.40: shared helper from src/lib/events/orderEvents.
    const offOrderUpdated = onOrderUpdated(() => { refetch(); });
    // CAL-B (CAL-2): supabase realtime sub on orders + quotes so
    // cross-tab edits land without a focus event or order-updated
    // emit. Mirrors the /admin/tracking pattern (LO-9/10).
    const sub = supabase
      .channel(`calendar-${user.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${user.company_id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes", filter: `company_id=eq.${user.company_id}` }, () => refetch())
      // CAL-C: 4 more realtime tables. holidays don't need realtime
      // (rarely change). Each producer triggers its OWN refetch
      // rather than the global refetch so we don't waste a full
      // orders+quotes pull when only a kitchen shift moved.
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_shifts", filter: `company_id=eq.${user.company_id}` }, () => loadKitchenShifts())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_shifts", filter: `company_id=eq.${user.company_id}` }, () => loadDriverShiftRows())
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_bookings", filter: `company_id=eq.${user.company_id}` }, () => loadEquipmentBlocks())
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_jobs", filter: `company_id=eq.${user.company_id}` }, () => loadCleaningBlocks())
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      offOrderUpdated();
      sub.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      // CAL-B (CAL-3): sliding ±6-month window around the visible
      // month. Previously getAllOrders hauled the entire company
      // history every time. ±6 covers the prev/next navigation arc
      // without immediate refetch; navigating further triggers a
      // refetch via the useEffect above.
      const windowStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 6, 1);
      const windowEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 7, 0);
      const startISO = toLocalISO(windowStart);
      const endISO = toLocalISO(windowEnd);

      // Wave 70.66: status whitelist. Pre-fix the query had no
      // status filter, so the page header's "Every confirmed event"
      // copy was a lie - drafts, leads-converted-to-pending, even
      // cancelled rows came back. The grid filtered cancelled
      // client-side but the "Next 5 events" sidebar surfaced any
      // non-cancelled order including drafts, and the footer
      // "Total events" counted every status.
      //
      // Whitelist matches the live operations + dispatch queue
      // pages: confirmed and onwards through completion. Cancelled
      // is excluded server-side. Pending / draft stays off the
      // calendar entirely - those belong on /admin/quotes and
      // /admin/orders, not the kitchen / dispatch surface.
      const CALENDAR_STATUSES = [
        "confirmed", "preparing", "ready",
        "in_transit", "delivered", "completed",
      ] as const;

      // Null event_dates can't render on a calendar grid - drop
      // them from the load. They're still visible on /admin/orders.
      // order_items(*) was being pulled but is never read on this
      // page - dropped to cut the per-row payload weight.
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          client:clients(*),
          quote:quotes!orders_quote_id_fkey(public_token, quote_number),
          assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, email, phone),
          assigned_chef:profiles!orders_assigned_chef_id_fkey(id, full_name, email)
        `)
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .in("status", CALENDAR_STATUSES)
        .gte("event_date", startISO)
        .lte("event_date", endISO)
        .order("event_date", { ascending: true });

      if (error) {
        console.error("Calendar load failed:", error);
        setOrders([]);
        return;
      }
      setOrders((data || []) as unknown as AppOrder[]);
    } catch (e) {
      console.error("Calendar load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  // Open quotes drive the gap-finder. Pulled separately from orders so
  // the calendar can highlight days with floating quotes (operator can
  // chase to fill the diary) and days with quotes-only-no-orders
  // ("winnable diary").
  const loadOpenQuotes = async () => {
    try {
      const { data } = await supabase
        .from("quotes")
        .select("id, client_name, event_date, event_time, total, status, valid_until, sent_at")
        .eq("company_id", user.company_id)
        .in("status", OPEN_QUOTE_STATUSES as any[])
        .not("event_date", "is", null);
      setOpenQuotes((data || []) as OpenQuote[]);
    } catch (e) {
      console.error("Calendar open-quotes load failed:", e);
    }
  };

  // CAL-C: shared sliding-window helper for the 5 new producers. All
  // queries scope to (company_id, deleted_at is null) + the ±6mo
  // window we use for orders.
  const _windowISO = () => {
    const ws = new Date(currentDate.getFullYear(), currentDate.getMonth() - 6, 1);
    const we = new Date(currentDate.getFullYear(), currentDate.getMonth() + 7, 0);
    return { start: toLocalISO(ws), end: toLocalISO(we) };
  };

  const loadKitchenShifts = async () => {
    if (!user?.company_id) return;
    try {
      const { start, end } = _windowISO();
      const { data } = await (supabase as any)
        .from("kitchen_shifts")
        .select("id, staff_id, shift_date, planned_start, planned_end, status")
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .gte("shift_date", start)
        .lte("shift_date", end)
        .not("status", "eq", "cancelled");
      setKitchenShifts(data || []);
    } catch (e) { /* non-blocking */ }
  };

  const loadDriverShiftRows = async () => {
    if (!user?.company_id) return;
    try {
      const { start, end } = _windowISO();
      const { data } = await (supabase as any)
        .from("driver_shifts")
        .select("id, driver_id, shift_date, planned_start, planned_end, status")
        .eq("company_id", user.company_id)
        .gte("shift_date", start)
        .lte("shift_date", end)
        .not("status", "eq", "cancelled");
      setDriverShiftRows(data || []);
    } catch (e) { /* non-blocking */ }
  };

  const loadEquipmentBlocks = async () => {
    if (!user?.company_id) return;
    try {
      const { start, end } = _windowISO();
      const { data } = await (supabase as any)
        .from("equipment_bookings")
        .select("id, equipment_id, booked_from, booked_until, quantity, status")
        .eq("company_id", user.company_id)
        .gte("booked_until", start)
        .lte("booked_from", end)
        .in("status", ["booked", "confirmed", "in_use", "delivered", "out", "pending"]);
      setEquipmentBlocks(data || []);
    } catch (e) { /* non-blocking */ }
  };

  const loadCleaningBlocks = async () => {
    if (!user?.company_id) return;
    try {
      const { start, end } = _windowISO();
      const { data } = await (supabase as any)
        .from("cleaning_jobs")
        .select("id, planned_start, planned_end, status")
        .eq("company_id", user.company_id)
        .gte("planned_end", `${start}T00:00:00`)
        .lte("planned_start", `${end}T23:59:59`)
        .not("status", "eq", "cancelled");
      setCleaningBlocks(data || []);
    } catch (e) { /* non-blocking */ }
  };

  const loadHolidays = async () => {
    if (!user?.company_id) return;
    try {
      const { start, end } = _windowISO();
      const { data } = await (supabase as any)
        .from("public_holidays")
        .select("id, date, name")
        .or(`company_id.eq.${user.company_id},company_id.is.null`)
        .gte("date", start)
        .lte("date", end);
      setHolidays(data || []);
    } catch (e) { /* non-blocking */ }
  };

  const { year, month, calendarDays, daysInMonth, startingDayOfWeek } = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0);
    const start = first.getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < start; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(d);
    return {
      year: y, month: m,
      calendarDays: days,
      daysInMonth: last.getDate(),
      startingDayOfWeek: start,
    };
  }, [currentDate]);

  const ordersByDay = useMemo(() => {
    const map: Record<string, AppOrder[]> = {};
    orders.forEach((o) => {
      // Skip cancelled orders so they don't visually fill the diary.
      if (String((o as any).status || "").toLowerCase() === "cancelled") return;
      const startISO = (o.event_date as any)?.split?.("T")?.[0] || (o as any).event_date;
      if (!startISO) return;
      // Wave 70.70: multi-day events. event_end_date defaults to
      // event_date via the orders trigger; for a single-day event
      // start === end and the loop fires once. For a 3-day event
      // the order lands in three day cells with the SAME row
      // reference (so click-into-day, conflict detection and
      // capacity counts all naturally include the day in
      // question). Trigger guarantees end >= start, so the loop
      // can't run forever even on bad data; we cap at 60 days
      // defensively.
      const endISO = ((o as any).event_end_date as string | undefined) || startISO;
      const start = new Date(`${startISO}T12:00:00`);
      const end = new Date(`${endISO}T12:00:00`);
      const maxIters = 60;
      let iters = 0;
      for (let d = new Date(start); d.getTime() <= end.getTime() && iters < maxIters; d.setDate(d.getDate() + 1)) {
        const k = toLocalISO(d);
        (map[k] = map[k] || []).push(o);
        iters += 1;
      }
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a: any, b: any) =>
        String(a.event_time || "23:59").localeCompare(String(b.event_time || "23:59")),
      ),
    );
    return map;
  }, [orders]);

  const quotesByDay = useMemo(() => {
    const map: Record<string, OpenQuote[]> = {};
    openQuotes.forEach((q) => {
      const k = (q.event_date as any)?.split?.("T")?.[0] || q.event_date;
      if (!k) return;
      (map[k] = map[k] || []).push(q);
    });
    return map;
  }, [openQuotes]);

  // CAL-C: per-day aggregation for each layer. Counts only - the
  // icon strip on the cell is intentionally compact; click-through
  // for detail is a separate concern. Each map is keyed on local
  // YYYY-MM-DD to align with the rest of the calendar.
  const kitchenShiftsByDay = useMemo(() => {
    const m: Record<string, number> = {};
    kitchenShifts.forEach((s) => {
      const k = String(s.shift_date).slice(0, 10);
      if (!k) return;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [kitchenShifts]);
  const driverShiftsByDay = useMemo(() => {
    const m: Record<string, number> = {};
    driverShiftRows.forEach((s) => {
      const k = String(s.shift_date).slice(0, 10);
      if (!k) return;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [driverShiftRows]);
  const equipmentBlocksByDay = useMemo(() => {
    // Spreads a booking across every day in its [booked_from, booked_until] window.
    const m: Record<string, number> = {};
    equipmentBlocks.forEach((b) => {
      if (!b.booked_from || !b.booked_until) return;
      const start = new Date(String(b.booked_from).slice(0, 10) + "T12:00:00");
      const end = new Date(String(b.booked_until).slice(0, 10) + "T12:00:00");
      const dayMs = 86400000;
      const span = Math.max(0, Math.round((end.getTime() - start.getTime()) / dayMs));
      for (let i = 0; i <= span && i < 60; i++) {
        const d = new Date(start.getTime() + i * dayMs);
        const k = toLocalISO(d);
        m[k] = (m[k] || 0) + 1;
      }
    });
    return m;
  }, [equipmentBlocks]);
  const cleaningBlocksByDay = useMemo(() => {
    const m: Record<string, number> = {};
    cleaningBlocks.forEach((c) => {
      if (!c.planned_start) return;
      const k = String(c.planned_start).slice(0, 10);
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [cleaningBlocks]);
  const holidaysByDay = useMemo(() => {
    const m: Record<string, string> = {};
    holidays.forEach((h) => {
      const k = String(h.date).slice(0, 10);
      m[k] = h.name;
    });
    return m;
  }, [holidays]);

  /** CAL-C (CAL-5): maxConcurrentEvents from operations settings.
   *  Canonical store is auth user_metadata.admin_settings (mirrored
   *  to localStorage by /admin/settings for offline fallback). Read
   *  from user_metadata first so a fresh-device user gets their
   *  persisted value; fall back to localStorage; finally default 5
   *  matching the settings tab default. */
  const maxConcurrent = useMemo(() => {
    const fromMeta = Number(
      (user as any)?.user_metadata?.admin_settings?.operations?.maxConcurrentEvents,
    );
    if (fromMeta > 0) return fromMeta;
    try {
      const raw = typeof window !== "undefined"
        ? window.localStorage.getItem("admin_settings")
        : null;
      if (!raw) return 5;
      const s = JSON.parse(raw);
      return Number(s?.operations?.maxConcurrentEvents) || 5;
    } catch { return 5; }
  }, [user]);

  const todayISO = useMemo(() => toLocalISO(new Date()), []);
  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const previousMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth     = () => setCurrentDate(new Date(year, month + 1, 1));
  const jumpToday     = () => {
    const t = new Date();
    setCurrentDate(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDate(t);
  };

  // - Keyboard navigation: arrows, T for today, [ ] for months ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (!focusedISO) return;

      // Wave 70.66: parse the focused ISO date as local-noon so
      // arithmetic doesn't drift across month boundaries in SAST
      // (the bare `new Date("YYYY-MM-DD")` constructor reads UTC
      // midnight, which lands at 02:00 SAST the next day - so
      // `focused.getMonth()` could be wrong by one at the edges).
      const focused = new Date(`${focusedISO}T12:00:00`);
      let next: Date | null = null;
      switch (e.key) {
        case "ArrowRight": next = new Date(focused.getTime() + 86400000); break;
        case "ArrowLeft":  next = new Date(focused.getTime() - 86400000); break;
        case "ArrowDown":  next = new Date(focused.getTime() + 86400000 * 7); break;
        case "ArrowUp":    next = new Date(focused.getTime() - 86400000 * 7); break;
        case "Enter":
        case " ":
          e.preventDefault();
          setSelectedDate(focused);
          return;
        case "t":
        case "T":
          e.preventDefault();
          jumpToday();
          return;
        case "[":
          e.preventDefault();
          previousMonth();
          return;
        case "]":
          e.preventDefault();
          nextMonth();
          return;
      }
      if (next) {
        e.preventDefault();
        if (next.getMonth() !== month || next.getFullYear() !== year) {
          setCurrentDate(new Date(next.getFullYear(), next.getMonth(), 1));
        }
        setFocusedISO(toLocalISO(next));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedISO, month, year]);

  // Default keyboard-focus on today when the page loads
  useEffect(() => {
    if (!focusedISO) setFocusedISO(todayISO);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO]);

  // Full list of open events from today onwards - drives the KPI tile.
  // The preview list slices this to 5 separately so the count isn't
  // capped at five (a real bookings number is the useful figure).
  const upcomingAll = useMemo(() =>
    orders
      .filter((o) => (o.event_date as any) >= todayISO && o.status !== "cancelled")
      .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))),
  [orders, todayISO]);
  const upcoming = useMemo(() => upcomingAll.slice(0, 5), [upcomingAll]);

  /** Wave 70.69: real operational conflicts. For every day, detect
   *  events that share a driver / vehicle / chef. That's a hard
   *  double-book - the same person/vehicle can't be in two places
   *  at once, regardless of event time. Two events at 10:00 and
   *  17:00 on the same day with the same driver assigned would
   *  technically be physically possible but the operator should
   *  know - so we flag any same-day same-resource overlap and let
   *  dispatch decide.
   *
   *  Returned shape: per-ISO map -> reasons array, plus the count
   *  surfaced on the gap-finder tile. */
  const opsConflictsByDay = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [iso, dayEvents] of Object.entries(ordersByDay)) {
      const reasons: string[] = [];
      const seenDriver = new Map<string, string>(); // id -> first client name
      const seenVehicle = new Map<string, string>();
      const seenChef = new Map<string, string>();
      for (const o of dayEvents as any[]) {
        const driver = o.assigned_driver_id as string | null;
        const vehicle = o.assigned_vehicle_id as string | null;
        const chef = o.assigned_chef_id as string | null;
        const label = o.client_name || o.order_number || "Event";
        if (driver) {
          const prev = seenDriver.get(driver);
          if (prev) reasons.push(`Driver double-booked: ${prev} + ${label}`);
          else seenDriver.set(driver, label);
        }
        if (vehicle) {
          const prev = seenVehicle.get(vehicle);
          if (prev) reasons.push(`Vehicle double-booked: ${prev} + ${label}`);
          else seenVehicle.set(vehicle, label);
        }
        if (chef) {
          const prev = seenChef.get(chef);
          if (prev) reasons.push(`Chef double-booked: ${prev} + ${label}`);
          else seenChef.set(chef, label);
        }
      }
      if (reasons.length > 0) map[iso] = reasons;
    }
    return map;
  }, [ordersByDay]);

  /** Next-30-day diary stats. Drives the gap-finder strip + sidebar:
   *  the operator sees at a glance how many days are booked, how many
   *  have floating quotes that could fill them, and how many days are
   *  empty in the working horizon. */
  const horizonStats = useMemo(() => {
    const horizon = 30;
    const today = new Date(todayISO);
    let booked = 0;
    let winnable = 0;
    let empty = 0;
    let competingQuotes = 0;
    let opsConflicts = 0;
    const winnableDays: Array<{ iso: string; quotes: OpenQuote[] }> = [];
    const opsConflictDays: Array<{ iso: string; reasons: string[] }> = [];
    for (let i = 0; i < horizon; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = toLocalISO(d);
      const ev = ordersByDay[iso] || [];
      const qu = quotesByDay[iso] || [];
      if (ev.length > 0) booked += 1;
      else if (qu.length > 0) winnable += 1;
      else empty += 1;
      if (qu.length > 1 && ev.length === 0) competingQuotes += 1;
      if (qu.length > 0 && ev.length === 0) winnableDays.push({ iso, quotes: qu });
      const opsReasons = opsConflictsByDay[iso];
      if (opsReasons && opsReasons.length > 0) {
        opsConflicts += 1;
        opsConflictDays.push({ iso, reasons: opsReasons });
      }
    }
    // 'conflicts' kept under the old name for the existing tile that
    // surfaces "competing quotes" - same renaming we did in 70.66.
    return {
      booked, winnable, empty,
      conflicts: competingQuotes,
      opsConflicts,
      winnableDays,
      opsConflictDays,
    };
  }, [ordersByDay, quotesByDay, opsConflictsByDay, todayISO]);

  const dayEvents = selectedDate
    ? ordersByDay[toLocalISO(selectedDate)] || []
    : [];
  const dayQuotes = selectedDate
    ? quotesByDay[toLocalISO(selectedDate)] || []
    : [];

  // Wave 70.36 - day intelligence aggregator. The previous popout
  // listed events as a flat array with no day-level read-out - the
  // operator had to add up revenue + guests in their head and had
  // no signal on operational risk. This computes everything we can
  // derive from already-loaded orders (no extra DB hits):
  //   - mode: quiet / relaxed / busy / packed / conflict
  //   - aggregates: totalGuests, totalRevenue, timeSpread
  //   - per-event lightweight readiness: missing driver / time /
  //     pickup, past-event-not-delivered, pending-within-3-days
  //   - day-level issues: count of events with issues, count past-due
  //   - timeline buckets for the mini chart
  const dayIntel = useMemo(() => {
    if (!selectedDate) return null;
    const now = Date.now();
    const isPastDay = selectedDate.getTime() < new Date(toLocalISO(new Date())).getTime();

    let totalGuests = 0;
    let totalRevenue = 0;
    const times: number[] = []; // minutes-of-day for each event
    let eventsWithIssues = 0;
    let pastDue = 0;
    let conflictMarker = false; // overlapping same time-of-day

    // Per-event lightweight issue list. Heavy signals (prep tasks,
    // invoice sent_at, kitchen rostered) need joins - those live on
    // the OrderReadinessChip on /admin/orders. Here we surface what's
    // computable from the order row alone.
    const perEventIssues = new Map<string, string[]>();

    for (const e of dayEvents) {
      totalGuests += Number((e as any).guest_count || 0);
      totalRevenue += Number((e as any).total_amount || 0);

      const issues: string[] = [];
      if (!(e as any).assigned_driver_id) issues.push("No driver assigned");
      if (!(e as any).event_time) issues.push("No event start time");
      if (!(e as any).pickup_time) issues.push("No driver pickup time");
      const status = String((e as any).status || "").toLowerCase();
      if (isPastDay && !["delivered", "completed", "cancelled"].includes(status)) {
        issues.push("Past event, not yet delivered");
        pastDue += 1;
      }
      if (!isPastDay && status === "pending") {
        const daysToEvent = Math.ceil((selectedDate.getTime() - now) / 86400000);
        if (daysToEvent <= 3) issues.push("Unconfirmed within 3 days of event");
      }
      if (issues.length > 0) {
        eventsWithIssues += 1;
        perEventIssues.set((e as any).id, issues);
      }

      if ((e as any).event_time) {
        const [h, m] = String((e as any).event_time).slice(0, 5).split(":").map(Number);
        if (Number.isFinite(h) && Number.isFinite(m)) times.push(h * 60 + m);
      }
    }

    // Conflict detection: any two events within 60 minutes of each other.
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i += 1) {
      if (times[i] - times[i - 1] < 60) { conflictMarker = true; break; }
    }

    // Mode: ordered priority - conflict beats packed beats busy etc.
    type Mode = "quiet" | "relaxed" | "busy" | "packed" | "conflict";
    let mode: Mode = "quiet";
    if (dayEvents.length === 0) mode = "quiet";
    else if (conflictMarker) mode = "conflict";
    else if (dayEvents.length >= 6) mode = "packed";
    else if (dayEvents.length >= 3) mode = "busy";
    else mode = "relaxed";

    const earliestMin = times.length ? times[0] : null;
    const latestMin = times.length ? times[times.length - 1] : null;

    return {
      mode,
      isPastDay,
      totalEvents: dayEvents.length,
      totalGuests,
      totalRevenue,
      eventsWithIssues,
      pastDue,
      earliestMin,
      latestMin,
      times,
      perEventIssues,
    };
  }, [selectedDate, dayEvents]);

  // Mode metadata - mirrors the portal nav mode badge pattern from
  // Waves 70.28 / 70.29 / 70.31 for visual consistency.
  const DAY_MODE_META: Record<string, { label: string; sublabel: string; bg: string; text: string; pulse: boolean }> = {
    quiet:    { label: "Quiet",    sublabel: "Open diary, easy to win extra bookings", bg: "bg-slate-100 border-slate-200", text: "text-slate-700", pulse: false },
    relaxed:  { label: "Relaxed",  sublabel: "Light day, room to focus on prep",       bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", pulse: false },
    busy:     { label: "Busy",     sublabel: "Solid run - keep the team aligned",     bg: "bg-blue-50 border-blue-200", text: "text-blue-800", pulse: false },
    packed:   { label: "Packed",   sublabel: "Heavy load - watch capacity + drivers", bg: "bg-amber-50 border-amber-200", text: "text-amber-800", pulse: false },
    conflict: { label: "Conflicts","sublabel": "Multiple events within 60 min of each other - review", bg: "bg-rose-50 border-rose-200", text: "text-rose-800", pulse: true },
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Event Calendar - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Calendar
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Every confirmed event on a calendar grid. Click a day to see its events; arrow keys move you through the calendar.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={jumpToday} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Today
              </Button>
              {/* Phase 28 #10: manual refresh. A new booking from
                  the lead pipeline or a status change made by
                  dispatch in another tab should land on the
                  calendar without a hard reload. */}
              <Button
                variant="outline"
                size="sm"
                onClick={loadOrders}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {/* Phase 22 #1: calendar CSV. Operators print this for
                  kitchen meal-plan briefings and morning whiteboards.
                  Walks orders so future-dated events plus already-
                  delivered history land in chronological order; we
                  scope to the currently displayed month so the file
                  matches what's on screen. */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const monthStart = new Date(year, month, 1);
                  const monthEnd = new Date(year, month + 1, 0);
                  const startIso = toLocalISO(monthStart);
                  const endIso = toLocalISO(monthEnd);
                  const monthOrders = orders.filter((o) => {
                    const d = (o as any).event_date as string | null;
                    return d && d >= startIso && d <= endIso;
                  });
                  if (monthOrders.length === 0) {
                    toast({ title: "Nothing to export", description: `No events in ${monthNames[month]} ${year}.` });
                    return;
                  }
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = [
                    "Event date", "Event time", "Order", "Client",
                    "Guests", "Venue", "Status", "Total",
                  ];
                  const lines = [headers.join(",")];
                  for (const o of [...monthOrders].sort((a, b) =>
                    String((a as any).event_date || "").localeCompare(String((b as any).event_date || ""))
                  )) {
                    const oa = o as any;
                    lines.push([
                      esc(oa.event_date || ""),
                      esc(oa.event_time || ""),
                      esc(oa.order_number || ""),
                      esc(o.client_name || ""),
                      esc(oa.guest_count ?? ""),
                      esc(oa.venue_name || oa.venue || ""),
                      esc(oa.status || ""),
                      esc(Number(oa.total_amount || 0).toFixed(2)),
                    ].join(","));
                  }
                  // Wave 70.67: UTF-8 BOM prefix so Excel-ZA reads
                  // the file with the right encoding. Without the
                  // BOM, Excel defaults to Windows-1252 and mangles
                  // non-ASCII client names (e.g. "Eugène", "O'Reilly"
                  // with curly apostrophe) and the ZAR symbol "R"
                  // adjacent to non-ASCII chars. Google Sheets +
                  // LibreOffice already auto-detect UTF-8, so this
                  // is a no-op for them.
                  const BOM = "﻿";
                  const blob = new Blob([BOM + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `calendar-${year}-${String(month + 1).padStart(2, "0")}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-3.5 h-3.5" /> Export month
              </Button>
              {/* Wave 70.68: iCal export. Lets the operator pull
                  the displayed month into Apple Calendar / Google
                  Calendar / Outlook so they have the diary on
                  their phone without logging back into the admin.
                  Format: RFC 5545 .ics with one VEVENT per order.
                  Date-only events (no event_time) are emitted as
                  all-day VEVENTs with DTSTART/DTEND in VALUE=DATE
                  form. Timed events use the tenant timezone if
                  known; falls back to floating local time so the
                  client app interprets in the user's calendar tz. */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const monthStart = new Date(year, month, 1);
                  const monthEnd = new Date(year, month + 1, 0);
                  const startIso = toLocalISO(monthStart);
                  const endIso = toLocalISO(monthEnd);
                  const monthOrders = orders.filter((o) => {
                    const d = (o as any).event_date as string | null;
                    return d && d >= startIso && d <= endIso;
                  });
                  if (monthOrders.length === 0) {
                    toast({ title: "Nothing to export", description: `No events in ${monthNames[month]} ${year}.` });
                    return;
                  }
                  // RFC 5545 line-folding (75-octet limit) + CRLF
                  // line terminators. Escape commas / semicolons /
                  // backslashes / newlines per spec.
                  const escIcs = (v: any): string =>
                    String(v ?? "")
                      .replace(/\\/g, "\\\\")
                      .replace(/\n/g, "\\n")
                      .replace(/,/g, "\\,")
                      .replace(/;/g, "\\;");
                  const fmtDate = (iso: string) => iso.replace(/-/g, "");
                  const fmtDateTime = (iso: string, time: string) => {
                    const [hh, mm] = time.slice(0, 5).split(":");
                    return `${fmtDate(iso)}T${hh}${mm}00`;
                  };
                  const nowStamp = (() => {
                    const d = new Date();
                    const pad = (n: number) => String(n).padStart(2, "0");
                    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
                  })();
                  const lines: string[] = [
                    "BEGIN:VCALENDAR",
                    "VERSION:2.0",
                    "PRODID:-//CateringMS//Calendar Export//EN",
                    "CALSCALE:GREGORIAN",
                    "METHOD:PUBLISH",
                  ];
                  for (const o of monthOrders) {
                    const oa = o as any;
                    const eventDate = oa.event_date as string;
                    const eventTime = (oa.event_time as string | null) || null;
                    const uid = `${oa.id}@cateringms`;
                    const summary = escIcs(o.client_name || oa.order_number || "Event");
                    const locationParts = [oa.venue_name, oa.venue_address].filter(Boolean);
                    const location = escIcs(locationParts.join(", "));
                    const descParts: string[] = [];
                    if (oa.order_number) descParts.push(`Order ${oa.order_number}`);
                    if (oa.guest_count != null) descParts.push(`${oa.guest_count} guests`);
                    if (oa.status) descParts.push(`Status: ${oa.status}`);
                    const description = escIcs(descParts.join(" · "));
                    lines.push("BEGIN:VEVENT");
                    lines.push(`UID:${uid}`);
                    lines.push(`DTSTAMP:${nowStamp}`);
                    if (eventTime) {
                      // Timed event - 2 hours default duration. The
                      // pickup_time field on orders is when the
                      // driver leaves the kitchen, not when the
                      // event ends, so we don't use it as DTEND.
                      const dtStart = fmtDateTime(eventDate, eventTime);
                      const endDt = new Date(`${eventDate}T${eventTime.slice(0, 5)}`);
                      endDt.setHours(endDt.getHours() + 2);
                      const endTime = `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`;
                      const endDateIso = toLocalISO(endDt);
                      const dtEnd = fmtDateTime(endDateIso, endTime);
                      lines.push(`DTSTART:${dtStart}`);
                      lines.push(`DTEND:${dtEnd}`);
                    } else {
                      // All-day event. DTEND is exclusive in iCal
                      // VALUE=DATE form, so it's eventDate+1.
                      const endDt = new Date(`${eventDate}T12:00:00`);
                      endDt.setDate(endDt.getDate() + 1);
                      lines.push(`DTSTART;VALUE=DATE:${fmtDate(eventDate)}`);
                      lines.push(`DTEND;VALUE=DATE:${fmtDate(toLocalISO(endDt))}`);
                    }
                    lines.push(`SUMMARY:${summary}`);
                    if (location) lines.push(`LOCATION:${location}`);
                    if (description) lines.push(`DESCRIPTION:${description}`);
                    lines.push("END:VEVENT");
                  }
                  lines.push("END:VCALENDAR");
                  // RFC 5545 says lines MUST be CRLF terminated.
                  const ics = lines.join("\r\n") + "\r\n";
                  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `calendar-${year}-${String(month + 1).padStart(2, "0")}.ics`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <CalendarIcon className="w-3.5 h-3.5" /> Export iCal
              </Button>
              {/* Wave 70.66: New Event used to drill to
                  /admin/order-assignments (dispatch queue) which
                  is not a creation flow - the operator landed on a
                  read-only queue with no "create" affordance.
                  /admin/orders is the right home: it carries its
                  own "New Order" CTA in the header and shows the
                  operator the surrounding bookings for context. */}
              <Link href={withSlug("/admin/orders")}>
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 gap-2">
                  <Plus className="w-4 h-4" /> New Event
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={previousMonth} aria-label="Previous month">
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold tabular-nums">
                        {monthNames[month]} {year}
                      </h2>
                      <Button variant="outline" size="sm" onClick={nextMonth} aria-label="Next month">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Keyboard className="w-3.5 h-3.5" />
                      <kbd className="px-1.5 py-0.5 bg-slate-100 rounded">←→↑↓</kbd>
                      <span>nav</span>
                      <kbd className="px-1.5 py-0.5 bg-slate-100 rounded ml-1">T</kbd>
                      <span>today</span>
                      <kbd className="px-1.5 py-0.5 bg-slate-100 rounded ml-1">[ ]</kbd>
                      <span>month</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Wave 70.71: mobile agenda fallback. The 7-col
                      month grid stays cramped on phones (each cell
                      ~50px wide at 360px viewport, event pills
                      truncate aggressively). Below sm we switch to
                      an agenda-style day list grouped by date,
                      showing only days that have events or open
                      quotes + today as an anchor. The grid stays
                      for tablet / desktop. */}
                  <div className="sm:hidden space-y-2">
                    {(() => {
                      const monthStart = new Date(year, month, 1);
                      const monthEnd = new Date(year, month + 1, 0);
                      const days: { iso: string; label: string; events: AppOrder[]; quotes: OpenQuote[] }[] = [];
                      for (let d = new Date(monthStart); d.getTime() <= monthEnd.getTime(); d.setDate(d.getDate() + 1)) {
                        const iso = toLocalISO(d);
                        const ev = ordersByDay[iso] || [];
                        const qu = quotesByDay[iso] || [];
                        if (ev.length === 0 && qu.length === 0 && iso !== todayISO) continue;
                        days.push({
                          iso,
                          label: d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }),
                          events: ev,
                          quotes: qu,
                        });
                      }
                      if (days.length === 0) {
                        return (
                          <p className="text-center text-sm text-slate-500 py-8">
                            No events or open quotes in {monthNames[month]} {year}.
                          </p>
                        );
                      }
                      return days.map((d) => {
                        const isToday = d.iso === todayISO;
                        const opsReasons = opsConflictsByDay[d.iso];
                        const hasConflict = !!opsReasons && opsReasons.length > 0;
                        return (
                          <div
                            key={d.iso}
                            className={cn(
                              "rounded-lg border p-3",
                              isToday ? "border-purple-400 bg-purple-50/60" :
                              hasConflict ? "border-rose-300 bg-rose-50/30" :
                              d.events.length > 0 ? "border-blue-200 bg-white" :
                              "border-amber-200 bg-amber-50/30",
                            )}
                          >
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => setSelectedDate(new Date(year, month, Number(d.iso.slice(8, 10))))}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className={cn(
                                  "text-sm font-semibold",
                                  isToday ? "text-purple-900" : "text-slate-900",
                                )}>
                                  {d.label}{isToday ? " · Today" : ""}
                                </span>
                                {hasConflict && (
                                  <span className="text-[10px] font-semibold text-rose-800 inline-flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Conflict
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1">
                                {d.events.map((e: any) => {
                                  const tone = STATUS_TONES[String(e.status || "").toLowerCase()] || STATUS_TONES.confirmed;
                                  return (
                                    <div
                                      key={e.id}
                                      className={cn(
                                        "text-xs rounded px-2 py-1 border flex items-center gap-2",
                                        tone,
                                      )}
                                    >
                                      <span className="font-semibold tabular-nums">
                                        {e.event_time?.slice(0, 5) || "TBC"}
                                      </span>
                                      <span className="flex-1 truncate">{e.client_name || "Event"}</span>
                                      {e.guest_count != null && (
                                        <span className="text-[10px] opacity-70 tabular-nums">{e.guest_count}g</span>
                                      )}
                                    </div>
                                  );
                                })}
                                {d.quotes.length > 0 && (
                                  <div className="text-[10px] text-amber-800 font-medium inline-flex items-center gap-1 pt-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    {d.quotes.length} open quote{d.quotes.length === 1 ? "" : "s"}
                                  </div>
                                )}
                              </div>
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* CAL-C (XSC Wave C, task #257): layer toggles.
                      Defaults to Orders + Holidays on, rest off, so
                      the morning view stays clean. Operator flicks
                      whatever they need for the task at hand. Toggle
                      state persists in localStorage. Hidden on
                      mobile (compact view doesn't render the icon
                      strip on cells). */}
                  <div className="hidden sm:flex flex-wrap items-center gap-1.5 mb-3 text-xs">
                    <span className="text-slate-500 mr-1">Layers:</span>
                    {[
                      { key: "orders" as const,    label: "Orders",     Icon: CalendarIcon, tone: "blue" },
                      { key: "quotes" as const,    label: "Quotes",     Icon: Sparkles,     tone: "amber" },
                      { key: "kitchen" as const,   label: "Kitchen",    Icon: ChefHat,      tone: "orange" },
                      { key: "drivers" as const,   label: "Drivers",    Icon: Truck,        tone: "indigo" },
                      { key: "equipment" as const, label: "Equipment",  Icon: Package,      tone: "purple" },
                      { key: "cleaning" as const,  label: "Cleaning",   Icon: Droplets,     tone: "cyan" },
                      { key: "holidays" as const,  label: "Holidays",   Icon: PartyPopper,  tone: "rose" },
                    ].map(({ key, label, Icon, tone }) => {
                      const on = layers[key];
                      const onClasses: Record<string, string> = {
                        blue:   "bg-blue-100 text-blue-800 border-blue-300",
                        amber:  "bg-amber-100 text-amber-800 border-amber-300",
                        orange: "bg-orange-100 text-orange-800 border-orange-300",
                        indigo: "bg-indigo-100 text-indigo-800 border-indigo-300",
                        purple: "bg-purple-100 text-purple-800 border-purple-300",
                        cyan:   "bg-cyan-100 text-cyan-800 border-cyan-300",
                        rose:   "bg-rose-100 text-rose-800 border-rose-300",
                      };
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setLayers((s) => ({ ...s, [key]: !s[key] }))}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full border font-medium transition",
                            on ? onClasses[tone] : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                          )}
                          aria-pressed={on}
                          title={`Toggle ${label} layer`}
                        >
                          <Icon className="w-3 h-3" />
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tablet + desktop: the full 7-col month grid. */}
                  <div className="hidden sm:grid grid-cols-7 gap-2">
                    {dayNames.map((d) => (
                      <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2">
                        {d}
                      </div>
                    ))}
                    {calendarDays.map((day, idx) => {
                      if (day === null) return <div key={`e-${idx}`} className="aspect-square min-h-[80px]" />;
                      const date = new Date(year, month, day);
                      const iso = toLocalISO(date);
                      const events = ordersByDay[iso] || [];
                      const quotes = quotesByDay[iso] || [];
                      const isToday = iso === todayISO;
                      const isPast = iso < todayISO;
                      const isSelected = selectedDate && toLocalISO(selectedDate) === iso;
                      const isFocused = focusedISO === iso;
                      const eventTotal = events.reduce(
                        (s: number, e: any) => s + Number(e.total_amount || 0),
                        0,
                      );
                      // Wave 70.69: per-cell ops conflict badge.
                      const opsConflictReasons = opsConflictsByDay[iso];
                      const hasOpsConflict = !!opsConflictReasons && opsConflictReasons.length > 0;
                      // Diary state - drives the cell border colour. Past
                      // days are excluded from the gap-finder logic; they
                      // can't be filled retroactively.
                      const atCapacity = events.length >= maxConcurrent;
                      const hasQuotes = !isPast && quotes.length > 0;
                      // A day with ANY paused order surfaces as "paused"
                      // (dashed blue) so the operator can spot at-risk
                      // bookings at a glance. Capacity still counts the
                      // paused orders - they're holding the slot.
                      const pausedCount = events.filter((e: any) => String(e.status).toLowerCase() === "paused").length;
                      const hasPaused = pausedCount > 0;
                      const allPaused = events.length > 0 && pausedCount === events.length;
                      const cellState: "selected" | "capacity" | "booked_with_quotes" | "booked" | "paused" | "winnable" | "empty" =
                        isSelected ? "selected"
                        : atCapacity ? "capacity"
                        : allPaused ? "paused"
                        : (events.length > 0 && hasQuotes) ? "booked_with_quotes"
                        : events.length > 0 ? "booked"
                        : hasQuotes ? "winnable"
                        : "empty";

                      return (
                        <button
                          key={iso}
                          ref={isFocused ? focusedRef : undefined}
                          onClick={() => { setSelectedDate(date); setFocusedISO(iso); }}
                          onMouseEnter={() => setFocusedISO(iso)}
                          className={cn(
                            "relative min-h-[88px] p-2 rounded-lg border-2 text-left transition-all",
                            "hover:shadow-md hover:scale-[1.02] focus:outline-none",
                            isToday  && "ring-2 ring-purple-500 ring-offset-1",
                            cellState === "selected"          && "bg-purple-50 border-purple-500",
                            cellState === "capacity"          && "bg-rose-50 border-rose-300",
                            cellState === "paused"            && "bg-blue-50/40 border-blue-300 border-dashed",
                            cellState === "booked_with_quotes"&& "bg-blue-50/60 border-amber-300",
                            cellState === "booked"            && "bg-blue-50/60 border-blue-200",
                            cellState === "winnable"          && "bg-amber-50/60 border-amber-300",
                            cellState === "empty"             && "bg-white border-slate-200",
                            // Mixed-status flag: some confirmed + some paused on the same day.
                            !allPaused && hasPaused && cellState !== "selected" && "ring-1 ring-blue-300",
                            isFocused && !isSelected && "ring-1 ring-slate-300",
                          )}
                          aria-label={`${day} ${monthNames[month]}, ${events.length} event${events.length === 1 ? "" : "s"}${pausedCount > 0 ? `, ${pausedCount} paused` : ""}, ${quotes.length} quote${quotes.length === 1 ? "" : "s"} pending`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "text-sm font-semibold tabular-nums",
                              isToday ? "text-purple-700" : "text-slate-900",
                            )}>
                              {day}
                            </span>
                            {isToday && (
                              <span className="relative flex h-2 w-2" aria-hidden>
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                              </span>
                            )}
                          </div>

                          {/* Event pills, show up to 2 by name, then "+N".
                              Wave 70.70: multi-day events show a
                              "Day X/N" suffix on the pill so the
                              operator knows the same booking spans
                              other cells too. Single-day events are
                              unchanged. */}
                          <div className="mt-1 space-y-1">
                            {events.slice(0, 2).map((e: any) => {
                              const tone = STATUS_TONES[String(e.status || "").toLowerCase()] || STATUS_TONES.confirmed;
                              const startIso = String(e.event_date || "").slice(0, 10);
                              const endIso = String(e.event_end_date || startIso).slice(0, 10);
                              let dayLabel = "";
                              let isMultiDay = false;
                              if (endIso && endIso !== startIso) {
                                // Compute total span (inclusive) +
                                // which day of the span this cell
                                // represents.
                                const start = new Date(`${startIso}T12:00:00`);
                                const end = new Date(`${endIso}T12:00:00`);
                                const cellDt = new Date(`${iso}T12:00:00`);
                                const dayMs = 86400000;
                                const totalSpan = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
                                const dayIndex = Math.round((cellDt.getTime() - start.getTime()) / dayMs) + 1;
                                if (totalSpan > 1 && dayIndex >= 1 && dayIndex <= totalSpan) {
                                  dayLabel = ` · Day ${dayIndex}/${totalSpan}`;
                                  isMultiDay = true;
                                }
                              }
                              return (
                                <div
                                  key={e.id}
                                  className={cn(
                                    "text-[10px] leading-tight rounded px-1.5 py-0.5 truncate border",
                                    tone,
                                    isMultiDay && "ring-1 ring-indigo-200/60",
                                  )}
                                  title={`${e.client_name || "Event"} - ${e.event_time || ""}${dayLabel}`}
                                >
                                  <span className="font-semibold">{e.event_time?.slice(0,5) || ""}</span>{" "}
                                  {e.client_name || "Event"}
                                  {dayLabel && <span className="text-indigo-700">{dayLabel}</span>}
                                </div>
                              );
                            })}
                            {events.length > 2 && (
                              <div className="text-[10px] text-slate-500 font-medium">
                                +{events.length - 2} more
                              </div>
                            )}
                            {events.length > 0 && eventTotal > 0 && (
                              <div className="text-[10px] text-slate-500 tabular-nums">
                                {fmtMoney.format(eventTotal)}
                              </div>
                            )}
                            {hasQuotes && (
                              <div className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {quotes.length} quote{quotes.length === 1 ? "" : "s"} out
                              </div>
                            )}
                            {atCapacity && (
                              <div className="text-[10px] font-semibold text-rose-700">
                                Full ({events.length} of {maxConcurrent})
                              </div>
                            )}
                            {hasOpsConflict && (
                              // Wave 70.69: red ops-conflict badge.
                              // Same driver / vehicle / chef on >1
                              // event for this day. Tooltip shows
                              // the specific reason on hover.
                              <div
                                className="text-[10px] font-semibold text-rose-800 flex items-center gap-1"
                                title={opsConflictReasons!.join(" \n")}
                              >
                                <AlertCircle className="w-3 h-3" />
                                Conflict
                              </div>
                            )}
                            {/* CAL-C: layered producer icon strip.
                                One chip per toggled-on layer that has
                                events on this day. Compact + greyscale-
                                tinted so it doesn't fight the orders
                                pills for attention. */}
                            {(() => {
                              const k = kitchenShiftsByDay[iso] || 0;
                              const d = driverShiftsByDay[iso] || 0;
                              const eq = equipmentBlocksByDay[iso] || 0;
                              const cl = cleaningBlocksByDay[iso] || 0;
                              const hol = holidaysByDay[iso];
                              const chips: React.ReactNode[] = [];
                              if (layers.kitchen && k > 0) chips.push(
                                <span key="k" className="inline-flex items-center gap-0.5 text-[9px] text-orange-700 bg-orange-50 border border-orange-100 rounded px-1 py-px" title={`${k} kitchen shift${k === 1 ? "" : "s"} rostered`}>
                                  <ChefHat className="w-2.5 h-2.5" />{k}
                                </span>,
                              );
                              if (layers.drivers && d > 0) chips.push(
                                <span key="d" className="inline-flex items-center gap-0.5 text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1 py-px" title={`${d} driver shift${d === 1 ? "" : "s"} rostered`}>
                                  <Truck className="w-2.5 h-2.5" />{d}
                                </span>,
                              );
                              if (layers.equipment && eq > 0) chips.push(
                                <span key="e" className="inline-flex items-center gap-0.5 text-[9px] text-purple-700 bg-purple-50 border border-purple-100 rounded px-1 py-px" title={`${eq} equipment booking${eq === 1 ? "" : "s"} active`}>
                                  <Package className="w-2.5 h-2.5" />{eq}
                                </span>,
                              );
                              if (layers.cleaning && cl > 0) chips.push(
                                <span key="c" className="inline-flex items-center gap-0.5 text-[9px] text-cyan-700 bg-cyan-50 border border-cyan-100 rounded px-1 py-px" title={`${cl} cleaning block${cl === 1 ? "" : "s"}`}>
                                  <Droplets className="w-2.5 h-2.5" />{cl}
                                </span>,
                              );
                              if (layers.holidays && hol) chips.push(
                                <span key="h" className="inline-flex items-center gap-0.5 text-[9px] text-rose-700 bg-rose-50 border border-rose-100 rounded px-1 py-px" title={hol}>
                                  <PartyPopper className="w-2.5 h-2.5" />
                                  <span className="truncate max-w-[3rem]">{hol.length > 6 ? hol.slice(0, 6) + "..." : hol}</span>
                                </span>,
                              );
                              if (chips.length === 0) return null;
                              return (
                                <div className="flex flex-wrap items-center gap-0.5 pt-1 border-t border-slate-100 mt-1">
                                  {chips}
                                </div>
                              );
                            })()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Status legend + diary-state legend */}
              <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order status:</span>
                {Object.entries(STATUS_TONES).slice(0, 7).map(([k, tone]) => (
                  <Badge key={k} variant="outline" className={`${tone} border text-[10px] capitalize`}>
                    {k.replace("_", " ")}
                  </Badge>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 px-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Diary state:</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-700 px-2 py-0.5 rounded border-2 border-blue-200 bg-blue-50/60">Booked</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 px-2 py-0.5 rounded border-2 border-amber-300 bg-amber-50/60">Quotes out (winnable)</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 px-2 py-0.5 rounded border-2 border-amber-300 bg-blue-50/60">Booked + extra quotes</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 px-2 py-0.5 rounded border-2 border-rose-300 bg-rose-50">Full ({maxConcurrent} cap)</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-800 px-2 py-0.5 rounded border-2 border-blue-300 border-dashed bg-blue-50/40">Paused (at risk)</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 px-2 py-0.5 rounded border-2 border-slate-200 bg-white">Open</span>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-purple-600" />
                    Next 5 events
                    <InfoTooltip content={"The next five upcoming events on your books, sorted by date so the soonest sits at the top."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {upcoming.length === 0 ? (
                    <p className="text-center text-slate-500 py-8 text-sm">Nothing booked yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {upcoming.map((e: any) => (
                        <Link
                          key={e.id}
                          href={withSlug(`/order/${e.id}`)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                        >
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-purple-700 leading-none">
                              {new Date(e.event_date).toLocaleDateString("en-ZA", { month: "short" }).toUpperCase()}
                            </span>
                            <span className="text-sm font-bold text-purple-700 leading-none">
                              {new Date(e.event_date).getDate()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-slate-900 truncate">{e.client_name || "Event"}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {e.guest_count} guests - {fmtMoney.format(Number(e.total_amount || 0))}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Gap finder - the diary opportunity panel. Lists days
                  in the next 30 with quotes out but nothing booked, so
                  the operator can pick which quote to chase. */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-600" />
                    Gap finder
                    <InfoTooltip content={"Days in the next 30 with floating quotes (sent / viewed / pending) but nothing booked yet. Each one is a sales opportunity. Chase the quote to lock the diary."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Wave 70.66: all four tiles measure DAYS in the
                      next-30-day rolling horizon, not "events in
                      May". The previous labels read like event counts
                      ("Booked (30d) = 2" implied 2 events when it
                      actually meant 2 days had ≥1 event). Each label
                      now ends with "(next 30d)" or is paired with a
                      tooltip so the operator reads it as days, not
                      events. */}
                  <div className="px-4 pb-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5">
                      <p
                        className="text-blue-800 text-[10px] uppercase font-semibold"
                        title="Number of days in the next 30 with at least one confirmed event"
                      >Booked days (30d)</p>
                      <p className="text-lg font-bold text-blue-900 tabular-nums">{horizonStats.booked}</p>
                    </div>
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
                      <p
                        className="text-amber-800 text-[10px] uppercase font-semibold"
                        title="Days in the next 30 with an open quote and no confirmed event yet - winnable diary"
                      >Winnable</p>
                      <p className="text-lg font-bold text-amber-900 tabular-nums">{horizonStats.winnable}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1.5">
                      <p
                        className="text-slate-700 text-[10px] uppercase font-semibold"
                        title="Days in the next 30 with no event and no open quote"
                      >Empty days</p>
                      <p className="text-lg font-bold text-slate-900 tabular-nums">{horizonStats.empty}</p>
                    </div>
                    {/* Wave 70.66 -> 70.69: rename + split. The
                        original "Conflicts" tile counted
                        competing-quote days (sales pipeline). The
                        new Ops conflicts tile counts real ops
                        double-bookings (driver / vehicle / chef
                        assigned to >1 event the same day). Both
                        live in the gap finder so the operator
                        sees pipeline pressure + assignment risk
                        at one glance. */}
                    <div className="rounded-md bg-rose-50 border border-rose-200 px-2 py-1.5">
                      <p className="text-rose-800 text-[10px] uppercase font-semibold">Competing quotes</p>
                      <p
                        className="text-lg font-bold text-rose-900 tabular-nums"
                        title="Days where more than one open quote targets the same empty slot - pick one to convert or chase both clients to a different date"
                      >{horizonStats.conflicts}</p>
                    </div>
                    <div className={`rounded-md ${horizonStats.opsConflicts > 0 ? "bg-rose-100 border-rose-300" : "bg-slate-50 border-slate-200"} border px-2 py-1.5 col-span-2`}>
                      <p className={`${horizonStats.opsConflicts > 0 ? "text-rose-900" : "text-slate-700"} text-[10px] uppercase font-semibold`}>Ops conflicts (next 30d)</p>
                      <p
                        className={`text-lg font-bold ${horizonStats.opsConflicts > 0 ? "text-rose-900" : "text-slate-900"} tabular-nums`}
                        title="Days where the same driver, vehicle or chef is assigned to more than one event - hard double-book that needs reassignment"
                      >
                        {horizonStats.opsConflicts}
                        {horizonStats.opsConflicts > 0 && (
                          <span className="text-[11px] font-normal ml-2 text-rose-800">- driver / vehicle / chef double-booked</span>
                        )}
                      </p>
                      {horizonStats.opsConflicts > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-rose-900">
                          {horizonStats.opsConflictDays.slice(0, 3).map((d) => {
                            const dt = new Date(`${d.iso}T12:00:00`);
                            const niceDate = dt.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
                            return (
                              <li key={d.iso}>
                                <button
                                  type="button"
                                  className="font-semibold underline-offset-2 hover:underline text-left"
                                  onClick={() => { setSelectedDate(dt); setFocusedISO(d.iso); }}
                                >
                                  {niceDate}
                                </button>
                                <span className="ml-1">- {d.reasons[0]}{d.reasons.length > 1 ? ` (+${d.reasons.length - 1} more)` : ""}</span>
                              </li>
                            );
                          })}
                          {horizonStats.opsConflictDays.length > 3 && (
                            <li className="text-rose-700/80">+{horizonStats.opsConflictDays.length - 3} more days</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                  {horizonStats.winnableDays.length === 0 ? (
                    <p className="text-center text-slate-500 text-xs px-4 pb-4">
                      No quotes-without-bookings in the next 30 days.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                      {horizonStats.winnableDays.slice(0, 8).map(({ iso, quotes }) => {
                        const d = new Date(iso);
                        const daysOut = Math.floor((d.getTime() - new Date(todayISO).getTime()) / 86400000);
                        return (
                          <div key={iso} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-900">
                                {d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                              </p>
                              <span className="text-[10px] text-slate-500">in {daysOut}d</span>
                            </div>
                            <div className="space-y-1">
                              {quotes.slice(0, 3).map((q) => (
                                <Link
                                  key={q.id}
                                  href={withSlug(`/admin/quotes?focus=${q.id}`)}
                                  className="flex items-center justify-between gap-2 text-xs text-slate-700 hover:bg-amber-50 -mx-1 px-1 py-0.5 rounded"
                                >
                                  <span className="truncate">{q.client_name || "Quote"}</span>
                                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                                    {q.total ? fmtMoney.format(Number(q.total)) : "—"}
                                  </span>
                                </Link>
                              ))}
                              {quotes.length > 3 && (
                                <p className="text-[10px] text-slate-500">+{quotes.length - 3} more on this day</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 flex items-center gap-1.5">Total events <InfoTooltip content={"Every confirmed-and-onwards event in the loaded ±6-month window. Cancelled, pending and draft orders are excluded - they live on /admin/orders, not the calendar."} /></span>
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">{orders.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 flex items-center gap-1.5">{monthNames[month]} <InfoTooltip content={"Confirmed-and-onwards events with an event date in the month you are currently viewing."} /></span>
                    <span className="text-2xl font-bold text-blue-900 tabular-nums">
                      {orders.filter((o: any) => {
                        const d = new Date(o.event_date);
                        return d.getMonth() === month && d.getFullYear() === year;
                      }).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 flex items-center gap-1.5">Upcoming <InfoTooltip content={"Every open event dated today or later. The preview above lists only the next five, but this is the real count."} /></span>
                    <span className="text-2xl font-bold text-emerald-900 tabular-nums">{upcomingAll.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Day detail sheet - shared resizable host (drag the left edge) */}
      <ComposeDrawerHost open={!!selectedDate} onClose={() => setSelectedDate(null)}>
          {selectedDate && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-purple-600" />
                  {selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </SheetTitle>
                <SheetDescription>
                  {dayEvents.length === 0 && dayQuotes.length === 0
                    ? "Nothing booked or quoted for this date yet."
                    : [
                        dayEvents.length > 0 && `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`,
                        dayQuotes.length > 0 && `${dayQuotes.length} quote${dayQuotes.length === 1 ? "" : "s"} pending`,
                      ].filter(Boolean).join(" - ")}
                </SheetDescription>
              </SheetHeader>

              {/* Wave 70.36 - intelligence layer at the top of the
                  popout. Mode badge + day aggregates + mini timeline
                  + health pills + quick actions. Computed entirely
                  from already-loaded orders state - no extra DB
                  hits. */}
              {dayIntel && (dayIntel.totalEvents > 0 || dayIntel.isPastDay) && (
                <div className="mt-4 space-y-3">
                  {/* Mode badge */}
                  {(() => {
                    const meta = DAY_MODE_META[dayIntel.mode];
                    return (
                      <div className={cn("rounded-xl border px-3 py-2.5 flex items-start gap-2.5", meta.bg, meta.text, meta.pulse ? "motion-safe:animate-pulse" : "")}>
                        <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.08em] leading-none">
                            {dayIntel.isPastDay && dayIntel.mode === "quiet" ? "Past · Quiet" : meta.label}
                          </p>
                          <p className="text-[11px] mt-1 opacity-90 leading-snug">{meta.sublabel}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Day aggregates - 4 mini pills */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      <p className="text-[14px] font-bold tabular-nums leading-none text-slate-900">{dayIntel.totalEvents}</p>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5 leading-none">Events</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      <p className="text-[14px] font-bold tabular-nums leading-none text-slate-900">{dayIntel.totalGuests}</p>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5 leading-none">Guests</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      <p className="text-[14px] font-bold tabular-nums leading-none text-slate-900">{fmtMoney.format(dayIntel.totalRevenue).replace(/\s/g, "")}</p>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5 leading-none">Revenue</p>
                    </div>
                    <div className={cn(
                      "rounded-lg border px-2 py-1.5",
                      dayIntel.eventsWithIssues > 0 ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50",
                    )}>
                      <p className={cn(
                        "text-[14px] font-bold tabular-nums leading-none",
                        dayIntel.eventsWithIssues > 0 ? "text-rose-700" : "text-emerald-700",
                      )}>
                        {dayIntel.eventsWithIssues}
                      </p>
                      <p className={cn(
                        "text-[9px] uppercase tracking-wider mt-0.5 leading-none",
                        dayIntel.eventsWithIssues > 0 ? "text-rose-700" : "text-emerald-700",
                      )}>
                        {/* Day-level scale = events at risk (NOT issue
                            count - per-event cards below show "N to
                            fix" as the issue count, so we use a
                            distinct word here to avoid confusing the
                            two scales). */}
                        {dayIntel.eventsWithIssues > 0
                          ? (dayIntel.eventsWithIssues === 1 ? "Event at risk" : "Events at risk")
                          : "All set"}
                      </p>
                    </div>
                  </div>

                  {/* Mini timeline - shows event start times on a
                      7am-11pm bar so the operator sees the day's
                      spread at a glance. Tightly clustered events
                      = potential conflict; spread out = relaxed. */}
                  {dayIntel.times.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-500 mb-1.5">
                        <span>Timeline</span>
                        <span>
                          {dayIntel.earliestMin !== null && dayIntel.latestMin !== null
                            ? `${String(Math.floor(dayIntel.earliestMin / 60)).padStart(2, "0")}:${String(dayIntel.earliestMin % 60).padStart(2, "0")} → ${String(Math.floor(dayIntel.latestMin / 60)).padStart(2, "0")}:${String(dayIntel.latestMin % 60).padStart(2, "0")}`
                            : ""}
                        </span>
                      </div>
                      <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                        {/* Each event is a small block at its start time.
                            Window: 7am (420 min) to 11pm (1380 min) = 960 min wide. */}
                        {dayIntel.times.map((t, i) => {
                          const startMin = 420;
                          const windowMin = 960;
                          const leftPct = Math.max(0, Math.min(100, ((t - startMin) / windowMin) * 100));
                          return (
                            <span
                              key={i}
                              className="absolute top-0 bottom-0 w-1.5 bg-gradient-to-b from-purple-500 to-pink-500 rounded-sm shadow-sm"
                              style={{ left: `calc(${leftPct}% - 3px)` }}
                              title={`Event at ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-[8px] text-slate-400 mt-1 tabular-nums">
                        <span>07:00</span>
                        <span>12:00</span>
                        <span>17:00</span>
                        <span>23:00</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-3">
                {/* Floating quotes for this day - listed before events so
                    the operator sees the opportunity first when the day
                    is empty. Each links to the quote on /admin/quotes. */}
                {dayQuotes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Quotes pending for this date
                    </h4>
                    {dayQuotes.map((q) => (
                      <Link key={q.id} href={withSlug(`/admin/quotes?focus=${q.id}`)} className="block">
                        <Card className="border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-colors">
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm text-slate-900 truncate">
                                  {q.client_name || "Quote"}
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5 capitalize">
                                  Status: {q.status} {q.event_time ? `· ${q.event_time.slice(0, 5)} start` : ""}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-slate-900 tabular-nums">
                                  {q.total ? fmtMoney.format(Number(q.total)) : "—"}
                                </p>
                                <p className="text-[10px] text-amber-700 font-medium flex items-center justify-end gap-0.5">
                                  Chase <ArrowRight className="w-3 h-3" />
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}

                {dayEvents.length === 0 && dayQuotes.length === 0 ? (
                  <Link href={withSlug("/admin/order-assignments")} className="block">
                    <Card className="border-2 border-dashed border-slate-200 hover:border-purple-300 transition-colors">
                      <CardContent className="py-8 text-center">
                        <Plus className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-700">Book an event</p>
                        <p className="text-xs text-slate-500 mt-1">No bookings on this day.</p>
                      </CardContent>
                    </Card>
                  </Link>
                ) : dayEvents.length === 0 ? null : (
                  dayEvents.map((e: any) => {
                    const tone = STATUS_TONES[String(e.status || "").toLowerCase()] || STATUS_TONES.confirmed;
                    // Wave 70.36 - inline lightweight readiness list
                    // surfaced as a small badge + bullet list at the
                    // bottom of the card. Tells the operator AT A
                    // GLANCE which events need attention without
                    // forcing a navigation to the order page.
                    const issues = dayIntel?.perEventIssues.get(e.id) || [];
                    return (
                      <Link
                        key={e.id}
                        href={withSlug(`/order/${e.id}`)}
                        className="block"
                      >
                        <Card className={cn(
                          "border-0 shadow hover:shadow-lg transition-all hover:-translate-y-0.5",
                          issues.length > 0 ? "ring-1 ring-rose-200" : "",
                        )}>
                          <CardContent className="py-4 px-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="font-semibold text-slate-900">{e.client_name || "Event"}</h4>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {issues.length > 0 && (
                                  <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    {issues.length} to fix
                                  </Badge>
                                )}
                                <Badge variant="outline" className={`${tone} border text-[10px] capitalize`}>
                                  {String(e.status).replace("_", " ")}
                                </Badge>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {e.event_time || "TBD"}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Users className="w-3 h-3 text-slate-400" />
                                {e.guest_count} guests
                              </span>
                              <span className="flex items-center gap-1.5 col-span-2">
                                <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                <span className="truncate">{e.venue_address || "Venue TBD"}</span>
                              </span>
                            </div>
                            {issues.length > 0 && (
                              <ul className="mt-2 pt-2 border-t border-rose-100 space-y-0.5">
                                {issues.map((issue, i) => (
                                  <li key={i} className="text-[11px] text-rose-700 flex items-start gap-1.5">
                                    <span className="text-rose-400 mt-0.5">•</span>
                                    <span>{issue}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 gap-2">
                              <span className="text-sm font-bold text-slate-900 tabular-nums">
                                {fmtMoney.format(Number(e.total_amount || 0))}
                              </span>
                              <div
                                className="flex items-center gap-1"
                                onClick={(ev) => ev.stopPropagation()}
                                onMouseDown={(ev) => ev.stopPropagation()}
                              >
                                <ClientLinkButton orderId={e.id} companyId={(e as any).company_id} compact />
                                <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
                                  Open <ArrowRight className="w-3 h-3" />
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })
                )}
              </div>
            </>
          )}
      </ComposeDrawerHost>
    </>
  );
}
