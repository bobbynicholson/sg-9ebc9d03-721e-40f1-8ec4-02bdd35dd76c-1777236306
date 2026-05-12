/**
 * TomorrowsEventsWidget -- compact list of confirmed events for
 * tomorrow.
 *
 * Phase 14 #3. Today's Pulse (Phase 9 #5) tells the operator
 * what's happening today. The evening-before review needs the
 * opposite -- a quick read on tomorrow's load so the kitchen +
 * dispatch can prep the right amount of stock and roster the
 * right team.
 *
 * Self-hides when no events sit on tomorrow's calendar.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ArrowRight, Users as UsersIcon, MapPin, Truck } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";

interface OrderRow {
  id: string;
  order_number: string | null;
  client_name: string | null;
  event_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  status: string | null;
  assigned_driver: { full_name: string | null } | null;
}

const fmtTime = (t: string | null): string => (t ? t.slice(0, 5) : "TBC");

export function TomorrowsEventsWidget({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowIso = toLocalISO(tomorrow);
        const { data } = await (supabase as any)
          .from("orders")
          .select(`
            id, order_number, client_name, event_time, guest_count,
            venue_address, status,
            assigned_driver:profiles!orders_assigned_driver_id_fkey ( full_name )
          `)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["confirmed", "preparing", "ready"])
          .eq("event_date", tomorrowIso)
          .order("event_time", { ascending: true })
          .limit(8);
        if (!cancelled) setRows((data || []) as OrderRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  const totalGuests = rows.reduce((acc, r) => acc + Number(r.guest_count || 0), 0);

  return (
    <Card className="mb-6 border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              Tomorrow's events
            </CardTitle>
            <CardDescription className="text-xs">
              Confirmed-and-onwards events on tomorrow's calendar. Earliest first.
            </CardDescription>
          </div>
          <Link href="/admin/orders/delivery-sheet">
            <Button variant="ghost" size="sm" className="text-indigo-700">
              Print sheet <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <>
            <ul className="divide-y divide-indigo-100">
              {rows.map((o) => {
                const driverName = o.assigned_driver?.full_name || null;
                // Phase 23 #4: full-row link to the order drawer.
                return (
                  <li key={o.id}>
                    <Link
                      href={`/admin/orders?orderId=${o.id}`}
                      className="py-2 flex items-baseline gap-3 hover:bg-indigo-50/60 rounded transition"
                    >
                      <span className="text-base font-bold tabular-nums text-slate-900 w-14 shrink-0">
                        {fmtTime(o.event_time)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-900 truncate">{o.client_name || "—"}</span>
                          {o.order_number && (
                            <span className="text-[11px] text-slate-500 tabular-nums">{o.order_number}</span>
                          )}
                          <Badge variant="outline" className="text-[10px] capitalize">{o.status?.replace(/_/g, " ")}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                          {o.guest_count != null && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <UsersIcon className="w-3 h-3" />{o.guest_count}
                            </span>
                          )}
                          {o.venue_address && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" />{o.venue_address}
                            </span>
                          )}
                          {!driverName && (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <Truck className="w-3 h-3" /> No driver
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 pt-2 border-t border-indigo-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{rows.length} event{rows.length === 1 ? "" : "s"}</span>
              {totalGuests > 0 && (
                <span className="tabular-nums font-medium text-slate-700">{totalGuests} guests total</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
