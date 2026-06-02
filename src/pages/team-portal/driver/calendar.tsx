/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /team-portal/driver/calendar - Bobby's brief: a month-grid the
 * driver can scan to see at-a-glance which days they have a
 * function booked vs which days have unclaimed jobs they could
 * pick up.
 *
 * Two-layer dot legend per day:
 *   - blue dot = at least one order assigned to this driver
 *   - amber dot = at least one unassigned order in the tenant the
 *                  driver is eligible to claim
 *   - both can co-exist
 *
 * Clicking a day expands the day's events below. Clicking a
 * claimable event opens the existing AvailableJobsCard confirm
 * flow (in-place dialog), so the calendar inherits the same
 * commitment story as the dashboard.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, MapPin, Clock,
  Users, Loader2, Hand, ExternalLink,
} from "lucide-react";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";

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
function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export default function DriverCalendarPage() {
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
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !user?.company_id) return;
    setLoading(true);
    try {
      // Load the visible month + one-week pad on each side so the
      // overflow days at the top and bottom of the grid still get
      // dots. The grid renders 6 weeks max.
      const start = new Date(cursor);
      start.setDate(start.getDate() - 7);
      const end = endOfMonth(cursor);
      end.setDate(end.getDate() + 7);

      // Pull every relevant order in window: assigned-to-me OR
      // unassigned-in-my-tenant. RLS plus the IN status filter
      // give us only what the driver should actually see.
      const { data, error } = await (supabase as any)
        .from("orders")
        .select(
          "id, order_number, client_name, event_date, event_time, pickup_time, venue_address, guest_count, status, assigned_driver_id, driver_id",
        )
        .eq("company_id", user.company_id)
        .in("status", ["confirmed", "preparing", "ready", "in_transit"])
        .gte("event_date", toIso(start))
        .lte("event_date", toIso(end));

      if (error) {
        console.error("[driver/calendar] orders fetch failed:", error);
        setOrders([]);
        return;
      }

      const rows = ((data as any[]) || [])
        .map((o) => {
          const mine = o.assigned_driver_id === user.id || o.driver_id === user.id;
          const claimable = !o.assigned_driver_id && !o.driver_id;
          // We surface a row if it's MINE or unclaimed-in-tenant.
          // Other drivers' jobs we leave out - the driver can't
          // act on those and they'd just clutter the grid.
          if (!mine && !claimable) return null;
          return {
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
          } as OrderRow;
        })
        .filter((x): x is OrderRow => x !== null);

      setOrders(rows);
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

  const todayIso = toIso(new Date());

  // Claim flow (calendar-side). Same RPC the dashboard uses;
  // duplicated here to keep the calendar self-contained.
  const claim = async (orderId: string) => {
    if (claimingId) return;
    setClaimingId(orderId);
    const { data, error } = await (supabase as any).rpc("claim_order", {
      p_order_id: orderId,
    });
    setClaimingId(null);
    if (error) {
      toast({
        title: "Couldn't claim",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    const result = (data || {}) as { ok?: boolean; reason?: string };
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

  return (
    <DriverPageShell
      pageTitle="Calendar - Driver Portal"
      heading="My Calendar"
      subheading="Blue dots = jobs already yours. Amber dots = jobs in your company waiting to be claimed."
      icon={CalendarIcon}
      width="wide"
    >
          {/* Month nav */}
          <Card className="border-0 shadow-lg mb-4">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">
                {cursor.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
              </CardTitle>
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
                  onClick={() => {
                    const t = new Date();
                    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
                    setSelectedDay(toIso(t));
                  }}
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
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 flex items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading calendar...
                </div>
              ) : (
                <>
                  {/* Day-of-week header */}
                  <div className="grid grid-cols-7 gap-1 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <div key={d} className="text-center py-1">{d}</div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {grid.days.map((d, i) => {
                      const iso = toIso(d);
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
                              ? "bg-slate-50/50 text-slate-300 border-transparent"
                              : isSelected
                              ? "border-blue-500 ring-2 ring-blue-200 bg-white"
                              : isToday
                              ? "border-blue-300 bg-blue-50/40"
                              : "bg-white border-slate-200 hover:border-blue-200"
                          }`}
                          aria-label={`${d.toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}, ${mineCount + claimableCount} events`}
                        >
                          <div className={`text-xs sm:text-sm font-semibold ${isToday ? "text-blue-700" : ""}`}>
                            {d.getDate()}
                          </div>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {mineCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-800 tabular-nums">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                {mineCount}
                              </span>
                            )}
                            {claimableCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 tabular-nums">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {claimableCount}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" /> Your jobs
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Open to claim
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Selected-day detail */}
          {selectedDay && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base">
                  {fromIso(selectedDay).toLocaleDateString("en-ZA", {
                    weekday: "long", day: "numeric", month: "long", year: "numeric",
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedOrders.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">
                    Nothing scheduled or available to claim on this day.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedOrders.map((o) => (
                      <li
                        key={o.id}
                        className={`p-3 rounded-md border ${
                          o.is_mine
                            ? "border-blue-200 bg-blue-50/40"
                            : "border-amber-200 bg-amber-50/40"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              {o.order_number && (
                                <span className="tabular-nums">{o.order_number}</span>
                              )}
                              <span className="truncate">{o.client_name || "Order"}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  o.is_mine
                                    ? "bg-blue-100 text-blue-800 border-blue-300"
                                    : "bg-amber-100 text-amber-800 border-amber-300"
                                }`}
                              >
                                {o.is_mine ? "Yours" : "Open"}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                              {o.event_time && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Event {o.event_time.slice(0, 5)}
                                </span>
                              )}
                              {o.pickup_time && (
                                <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                                  <Clock className="w-3 h-3" />
                                  Collect {o.pickup_time.slice(0, 5)}
                                </span>
                              )}
                              {o.guest_count != null && (
                                <span className="inline-flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {o.guest_count} guests
                                </span>
                              )}
                              {o.venue_address && (
                                <span className="inline-flex items-center gap-1 truncate max-w-[280px]">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{o.venue_address}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Link
                              href={withSlug(staffOrderHref(o.id, "driver"))}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold min-h-[32px]"
                              title="Open the driver brief for this order"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open brief
                            </Link>
                            {o.is_mine ? (
                              <Link href="/team-portal/driver/routes">
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
                                className="bg-emerald-600 hover:bg-emerald-700 min-h-11"
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
              </CardContent>
            </Card>
          )}
    </DriverPageShell>
  );
}
