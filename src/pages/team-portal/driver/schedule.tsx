/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock, Users, Loader2, AlertCircle, Navigation, ExternalLink } from "lucide-react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Footer } from "@/components/Footer";
import { PortalShell, PortalHeader, PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";

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
  const { withSlug } = useTenantHref();
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
      <Head><title>My schedule - CateringMS</title></Head>
      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title={
              <span className="inline-flex items-center gap-2">
                My schedule
                <InfoTooltip content="Upcoming deliveries assigned to you.\n\nGrouped by Today, Tomorrow, This week, This month, and Later." />
              </span>
            }
            subtitle="Upcoming jobs assigned to you"
            icon={Calendar}
          />

          {loading ? (
            <PortalCard padded={false}>
              <div className="py-16 flex items-center justify-center text-slate-500 dark:text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading schedule...
              </div>
            </PortalCard>
          ) : orders.length === 0 ? (
            <PortalCard padded={false}>
              <div className="py-16 px-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">No upcoming jobs</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">When dispatch assigns you a delivery it'll appear here.</p>
              </div>
            </PortalCard>
          ) : (
            <div className="space-y-8">
              {grouped.map((g) => (
                <div key={g.name}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                    {g.name}
                    <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">{g.items.length} job{g.items.length === 1 ? "" : "s"}</span>
                  </h2>
                  <PortalCard padded={false}>
                    <div>
                      {g.items.map((o, i) => (
                        <div
                          key={o.id}
                          className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-5 ${i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""} hover:bg-slate-50 dark:hover:bg-slate-800/50`}
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-12 h-12 rounded-xl bg-brand-accent/10 text-brand-accent border border-brand-accent/20 dark:bg-brand-accent/20 dark:text-brand-accent flex flex-col items-center justify-center text-xs flex-shrink-0">
                              <span className="font-bold leading-none tabular-nums">
                                {new Date(o.event_date).toLocaleDateString("en-ZA", { day: "numeric" })}
                              </span>
                              <span className="uppercase">
                                {new Date(o.event_date).toLocaleDateString("en-ZA", { month: "short" })}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">{o.client_name || "Order"}</p>
                                <Badge variant="outline" className="text-[10px] capitalize">{o.status}</Badge>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                                <span className="truncate">{o.venue_address}</span>
                              </p>
                              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1">
                                <span className="flex items-center gap-1 tabular-nums"><Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />{o.event_time || "TBD"}</span>
                                <span className="flex items-center gap-1 tabular-nums"><Users className="w-3 h-3 text-slate-400 dark:text-slate-500" />{o.guest_count} pax</span>
                              </div>
                              {/* Schedule rows are read-only previews so we keep
                                  the action surface narrow: a single Maps tap
                                  so a driver scanning Tomorrow's jobs can
                                  pre-check the route. 44px-tall hit area for
                                  thumbs on a phone. */}
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
                                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-accent/30 bg-brand-accent/5 hover:bg-brand-accent/10 text-brand-accent font-semibold min-h-[32px]"
                                  title="Open the driver brief for this order"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open brief
                                </Link>
                              </div>
                            </div>
                          </div>
                          {/* Order value was previously shown here. Removed
                              to stop leaking the catering company's revenue
                              to drivers - drivers should see their own
                              payout, not the client's invoice. Driver-side
                              earnings live on /team-portal/driver/earnings
                              and /dashboard. */}
                        </div>
                      ))}
                    </div>
                  </PortalCard>
                </div>
              ))}
            </div>
          )}
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}
