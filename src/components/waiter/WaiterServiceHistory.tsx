import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, Loader2, MapPin, MessageSquareText, PackageCheck, RefreshCw, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { orderDisplayName } from "@/lib/orderDisplayName";
import { formatClock } from "@/lib/portalTime";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const PAGE_SIZE = 25;

type AttendanceRow = {
  id: string;
  order_id: string;
  arrived_at: string | null;
  setup_started_at: string | null;
  guests_arrived_at: string | null;
  service_started_at: string | null;
  service_ended_at: string | null;
  event_complete_at: string | null;
  equipment_returned_at: string | null;
  notes: string | null;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string;
  event_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  guest_count: number | null;
  client_name: string | null;
  status: string;
};

type CompletedService = { attendance: AttendanceRow; order: OrderRow | null };

function dateLabel(value: string) {
  return new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function timeLabel(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "Not recorded";
}

function durationLabel(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? hours + "h " + (minutes % 60) + "m" : minutes + "m";
}

export function WaiterServiceHistory() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const [items, setItems] = useState<CompletedService[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    if (!user?.company_id || !user.id) return;
    if (nextOffset === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const { data: attendanceRows, error: attendanceError, count } = await (supabase as any)
        .from("event_attendance")
        .select("id, order_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes", { count: "exact" })
        .eq("company_id", user.company_id)
        .eq("waiter_id", user.id)
        .not("event_complete_at", "is", null)
        .order("event_complete_at", { ascending: false })
        .range(nextOffset, nextOffset + PAGE_SIZE - 1);
      if (attendanceError) throw attendanceError;

      const rows = (attendanceRows || []) as AttendanceRow[];
      const orderIds = [...new Set(rows.map((row) => row.order_id))];
      let ordersById = new Map<string, OrderRow>();
      if (orderIds.length) {
        const { data: orderRows, error: orderError } = await (supabase as any)
          .from("orders")
          .select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, client_name, status")
          .eq("company_id", user.company_id)
          .in("id", orderIds);
        if (orderError) throw orderError;
        ordersById = new Map((orderRows || []).map((order: OrderRow) => [order.id, order]));
      }

      const page = rows.map((attendance) => ({ attendance, order: ordersById.get(attendance.order_id) || null }));
      setItems((current) => nextOffset === 0 ? page : [...current, ...page]);
      setTotal(count ?? (nextOffset + rows.length));
      setOffset(nextOffset + rows.length);
    } catch (cause: any) {
      setError(cause?.message || "Could not load completed service history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.company_id, user?.id]);

  useEffect(() => { void load(0); }, [load]);

  if (loading) {
    return <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading completed service…</CardContent></Card>;
  }

  if (error) {
    return <Card><CardContent className="py-8 text-center"><p className="font-semibold text-slate-900 dark:text-white">History could not be loaded</p><p className="mt-1 break-words text-sm text-slate-500">{error}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void load(0)}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>;
  }

  if (!items.length) {
    return <Card><CardContent className="py-12 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-semibold text-slate-900 dark:text-white">No completed service yet</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">When you mark an assigned event complete, it will appear here with its service timeline and notes.</p></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">{total} completed service {total === 1 ? "record" : "records"} · newest first</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load(0)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Refresh</Button>
      </div>
      <div className="space-y-3">
        {items.map(({ attendance, order }) => {
          const duration = durationLabel(attendance.service_started_at, attendance.service_ended_at);
          const milestones = [
            ["On site", attendance.arrived_at],
            ["Setup", attendance.setup_started_at],
            ["Guests arrived", attendance.guests_arrived_at],
            ["Service started", attendance.service_started_at],
            ["Service ended", attendance.service_ended_at],
            ["Event complete", attendance.event_complete_at],
          ] as const;
          return (
            <Card key={attendance.id} className="overflow-hidden">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    {order ? (
                      <Link href={withSlug(staffOrderHref(order.id, "waiter"))} className="inline-flex max-w-full items-center gap-1.5 break-words font-semibold text-slate-900 hover:text-brand-primary hover:underline dark:text-white">
                        <span>{orderDisplayName(order)}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </Link>
                    ) : <p className="font-semibold text-slate-900 dark:text-white">Order details unavailable</p>}
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {order && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{dateLabel(order.event_date)}{order.event_time ? " · " + formatClock(order.event_time) : ""}</span>}
                      {order?.venue_name && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{order.venue_name}</span>}
                      {order?.guest_count != null && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{order.guest_count} guests</span>}
                      {duration && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Service {duration}</span>}
                    </div>
                  </div>
                  <Badge className="w-fit shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Completed</Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {milestones.map(([label, timestamp]) => (
                    <div key={label} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900/70">
                      <span className="text-slate-600 dark:text-slate-300">{label}</span>
                      <span className="shrink-0 font-medium text-slate-900 dark:text-white">{timeLabel(timestamp)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5"><PackageCheck className="h-3.5 w-3.5" />Equipment {attendance.equipment_returned_at ? "returned " + timeLabel(attendance.equipment_returned_at) : "return not recorded"}</span>
                    {attendance.notes && <span className="inline-flex min-w-0 items-start gap-1.5"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{attendance.notes}</span></span>}
                  </div>
                  {order && <Button asChild size="sm" variant="outline" className="shrink-0"><Link href={withSlug(staffOrderHref(order.id, "waiter"))}>Open order</Link></Button>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {offset < total && <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => void load(offset)} disabled={loadingMore}>{loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Load more completed service</Button></div>}
    </div>
  );
}
