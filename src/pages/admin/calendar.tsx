/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Event Calendar -- rebuilt for actual UX. Each day cell now shows event
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
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, MapPin,
  Users, ArrowRight, Sparkles, Keyboard, ChefHat, Truck, Star,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { orderService } from "@/services/orderService";
import type { AppOrder } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { cn } from "@/lib/utils";
import { ClientLinkButton } from "@/components/admin/ClientLinkButton";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export default function ProtectedCalendarPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
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
};

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

function AdminCalendar() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const focusedRef = useRef<HTMLButtonElement | null>(null);
  const [focusedISO, setFocusedISO] = useState<string | null>(null);

  useEffect(() => {
    if (user?.company_id) loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const all = await orderService.getAllOrders(user.company_id);
      setOrders(all as unknown as AppOrder[]);
    } catch (e) {
      console.error("Calendar load failed:", e);
    } finally {
      setLoading(false);
    }
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
      const k = (o.event_date as any)?.split?.("T")?.[0] || (o as any).event_date;
      if (!k) return;
      (map[k] = map[k] || []).push(o);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a: any, b: any) =>
        String(a.event_time || "23:59").localeCompare(String(b.event_time || "23:59")),
      ),
    );
    return map;
  }, [orders]);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
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

  // -- Keyboard navigation: arrows, T for today, [ ] for months ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (!focusedISO) return;

      const focused = new Date(focusedISO);
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
        setFocusedISO(next.toISOString().slice(0, 10));
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

  const upcoming = useMemo(() =>
    orders
      .filter((o) => (o.event_date as any) >= todayISO && o.status !== "cancelled")
      .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))
      .slice(0, 5),
  [orders, todayISO]);

  const dayEvents = selectedDate
    ? ordersByDay[selectedDate.toISOString().slice(0, 10)] || []
    : [];

  return (
    <>
      <NoIndexMeta />
      <Head><title>Event Calendar - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-6 max-w-screen-2xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Event Calendar
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Click a day to see its events. Use arrow keys to fly through the calendar.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={jumpToday} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Today
              </Button>
              <Link href="/admin/order-assignments">
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
                  <div className="grid grid-cols-7 gap-2">
                    {dayNames.map((d) => (
                      <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2">
                        {d}
                      </div>
                    ))}
                    {calendarDays.map((day, idx) => {
                      if (day === null) return <div key={`e-${idx}`} className="aspect-square min-h-[80px]" />;
                      const date = new Date(year, month, day);
                      const iso = date.toISOString().slice(0, 10);
                      const events = ordersByDay[iso] || [];
                      const isToday = iso === todayISO;
                      const isSelected = selectedDate && selectedDate.toISOString().slice(0, 10) === iso;
                      const isFocused = focusedISO === iso;
                      const eventTotal = events.reduce(
                        (s: number, e: any) => s + Number(e.total_amount || 0),
                        0,
                      );

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
                            isSelected ? "bg-purple-50 border-purple-500" :
                              events.length > 0 ? "bg-blue-50/60 border-blue-200" :
                              "bg-white border-slate-200",
                            isFocused && !isSelected && "ring-1 ring-slate-300",
                          )}
                          aria-label={`${day} ${monthNames[month]}, ${events.length} event${events.length === 1 ? "" : "s"}`}
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

                          {/* Event pills, show up to 2 by name, then "+N" */}
                          <div className="mt-1 space-y-1">
                            {events.slice(0, 2).map((e: any) => {
                              const tone = STATUS_TONES[String(e.status || "").toLowerCase()] || STATUS_TONES.confirmed;
                              return (
                                <div
                                  key={e.id}
                                  className={cn(
                                    "text-[10px] leading-tight rounded px-1.5 py-0.5 truncate border",
                                    tone,
                                  )}
                                  title={`${e.client_name || "Event"} - ${e.event_time || ""}`}
                                >
                                  <span className="font-semibold">{e.event_time?.slice(0,5) || ""}</span>{" "}
                                  {e.client_name || "Event"}
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
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Status legend */}
              <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Legend:</span>
                {Object.entries(STATUS_TONES).slice(0, 7).map(([k, tone]) => (
                  <Badge key={k} variant="outline" className={`${tone} border text-[10px] capitalize`}>
                    {k.replace("_", " ")}
                  </Badge>
                ))}
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
                          href={`/admin/orders?id=${e.id}`}
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

              <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 flex items-center gap-1.5">Total events <InfoTooltip content={"Every order on the books for your company, no matter the date or status."} /></span>
                    <span className="text-2xl font-bold text-slate-900 tabular-nums">{orders.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 flex items-center gap-1.5">{monthNames[month]} <InfoTooltip content={"Orders with an event date in the month you are currently viewing."} /></span>
                    <span className="text-2xl font-bold text-blue-900 tabular-nums">
                      {orders.filter((o: any) => {
                        const d = new Date(o.event_date);
                        return d.getMonth() === month && d.getFullYear() === year;
                      }).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 flex items-center gap-1.5">Upcoming <InfoTooltip content={"Open events dated today or later. Matches the five-event preview shown above."} /></span>
                    <span className="text-2xl font-bold text-emerald-900 tabular-nums">{upcoming.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Day detail sheet -- shared resizable host (drag the left edge) */}
      <ComposeDrawerHost open={!!selectedDate} onClose={() => setSelectedDate(null)}>
          {selectedDate && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-purple-600" />
                  {selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </SheetTitle>
                <SheetDescription>
                  {dayEvents.length === 0
                    ? "Nothing booked for this date yet."
                    : `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"} on this day.`}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-3">
                {dayEvents.length === 0 ? (
                  <Link href="/admin/order-assignments" className="block">
                    <Card className="border-2 border-dashed border-slate-200 hover:border-purple-300 transition-colors">
                      <CardContent className="py-8 text-center">
                        <Plus className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-700">Book an event</p>
                        <p className="text-xs text-slate-500 mt-1">No bookings on this day.</p>
                      </CardContent>
                    </Card>
                  </Link>
                ) : (
                  dayEvents.map((e: any) => {
                    const tone = STATUS_TONES[String(e.status || "").toLowerCase()] || STATUS_TONES.confirmed;
                    return (
                      <Link
                        key={e.id}
                        href={`/admin/orders?id=${e.id}`}
                        className="block"
                      >
                        <Card className="border-0 shadow hover:shadow-lg transition-all hover:-translate-y-0.5">
                          <CardContent className="py-4 px-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="font-semibold text-slate-900">{e.client_name || "Event"}</h4>
                              <Badge variant="outline" className={`${tone} border text-[10px] capitalize`}>
                                {String(e.status).replace("_", " ")}
                              </Badge>
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
