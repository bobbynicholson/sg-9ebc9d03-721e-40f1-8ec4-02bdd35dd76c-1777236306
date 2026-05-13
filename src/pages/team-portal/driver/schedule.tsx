/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock, Users, Loader2, AlertCircle, Navigation } from "lucide-react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";

interface ScheduleOrder {
  id: string;
  event_date: string;
  event_time?: string | null;
  venue_address: string;
  guest_count: number;
  status: string;
  client_name?: string | null;
}

const dayBucket = (d: Date, today: Date) => {
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Past";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return "This week";
  if (diff < 30) return "This month";
  return "Later";
};

export default function DriverSchedulePage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ScheduleOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("orders")
        .select("id, event_date, event_time, venue_address, guest_count, status, client_name")
        .or(`assigned_driver_id.eq.${user.id},driver_id.eq.${user.id}`)
        .gte("event_date", toLocalISO(today))
        .neq("status", "cancelled")
        .order("event_date", { ascending: true });
      if (!cancelled) {
        if (error) console.error("Error loading schedule:", error);
        setOrders((data || []) as ScheduleOrder[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const grouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets: Record<string, ScheduleOrder[]> = {};
    orders.forEach((o) => {
      const bucket = dayBucket(new Date(o.event_date), today);
      buckets[bucket] = buckets[bucket] || [];
      buckets[bucket].push(o);
    });
    const order = ["Today", "Tomorrow", "This week", "This month", "Later"];
    return order.filter((b) => buckets[b]?.length).map((b) => ({ name: b, items: buckets[b] }));
  }, [orders]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>My Schedule - Driver Portal</title></Head>
      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-blue-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 py-8 max-w-screen-2xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 flex items-center gap-2">
                My Schedule
                <InfoTooltip content="Upcoming deliveries assigned to you.\n\nGrouped by Today, Tomorrow, This week, This month, and Later." />
              </h1>
              <p className="text-slate-600 mt-1">Upcoming jobs assigned to you</p>
            </div>
          </div>

          {loading ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading schedule...
              </CardContent>
            </Card>
          ) : orders.length === 0 ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 text-center">
                <AlertCircle className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700 mb-1">No upcoming jobs</p>
                <p className="text-sm text-slate-500">When dispatch assigns you a delivery it'll appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {grouped.map((g) => (
                <div key={g.name}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    {g.name}
                    <span className="ml-2 text-slate-400 font-normal">{g.items.length} job{g.items.length === 1 ? "" : "s"}</span>
                  </h2>
                  <Card className="border-0 shadow-lg">
                    <CardContent className="p-0">
                      {g.items.map((o, i) => (
                        <div
                          key={o.id}
                          className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-5 ${i > 0 ? "border-t border-slate-100" : ""} hover:bg-slate-50`}
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex flex-col items-center justify-center text-xs flex-shrink-0">
                              <span className="font-bold leading-none">
                                {new Date(o.event_date).toLocaleDateString("en-ZA", { day: "numeric" })}
                              </span>
                              <span className="uppercase">
                                {new Date(o.event_date).toLocaleDateString("en-ZA", { month: "short" })}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900 truncate">{o.client_name || "Order"}</p>
                                <Badge variant="outline" className="text-[10px] capitalize">{o.status}</Badge>
                              </div>
                              <p className="text-sm text-slate-600 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                <span className="truncate">{o.venue_address}</span>
                              </p>
                              <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{o.event_time || "TBD"}</span>
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{o.guest_count} pax</span>
                              </div>
                              {/* Schedule rows are read-only previews so we keep
                                  the action surface narrow: a single Maps tap
                                  so a driver scanning Tomorrow's jobs can
                                  pre-check the route. 44px-tall hit area for
                                  thumbs on a phone. */}
                              {o.venue_address && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.venue_address)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open ${o.venue_address} in Google Maps`}
                                  className="inline-flex items-center gap-1 mt-2 text-xs px-2.5 py-2 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 min-h-[44px]"
                                >
                                  <Navigation className="w-3.5 h-3.5" />
                                  Open in Maps
                                </a>
                              )}
                            </div>
                          </div>
                          {/* Order value was previously shown here. Removed
                              to stop leaking the catering company's revenue
                              to drivers -- drivers should see their own
                              payout, not the client's invoice. Driver-side
                              earnings live on /team-portal/driver/earnings
                              and /dashboard. */}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
