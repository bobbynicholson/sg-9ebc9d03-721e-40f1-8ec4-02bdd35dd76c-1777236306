/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, MapPin, Calendar, CheckCircle2, Clock, Package, Loader2, Search, Navigation, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { DriverNav } from "@/components/navigation/DriverNav";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
// Wave 48 A1 - DriverConfirmationPanel was a P0 orphan: the full
// 4-stage post-event UI (en-route to kitchen, departed, arrived at
// venue, collection complete) existed at /components/driver/ but was
// mounted on zero pages. Without it, completeCollection() was
// unreachable from the driver app - so equipment_bookings never
// flipped to 'returned', dispatch carried phantom open assignments,
// driver pay never snapshotted the collection leg, damages couldn't
// be recorded. Mounting here on each active delivery surfaces every
// stage button per order in the driver's natural flow.
import { DriverConfirmationPanel } from "@/components/driver/DriverConfirmationPanel";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { logPiiAccess } from "@/services/piiAccessLogService";

interface DriverOrder {
  id: string;
  /** Wave 48 A1 - order_number drives the panel header. */
  order_number?: string | null;
  /** Wave 70.45c - event_name feeds the canonical BookingHeader so
   *  the driver sees the client-facing event label (not just a
   *  numbered order). */
  event_name?: string | null;
  event_date: string;
  event_time?: string;
  venue_address: string;
  guest_count: number;
  status: string;
  delivery_status?: string | null;
  client_name?: string | null;
  /** Client contact details for the driver-to-client comms bridge.
   *  These are surfaced as call / WhatsApp links inline on each
   *  delivery so the driver can reach the client without copying
   *  numbers off another screen. */
  client_phone?: string | null;
  client_email?: string | null;
  /** From orders.equipment_items jsonb - the load list. */
  equipment_items?: any[] | null;
  /** From orders.menu_items jsonb - so the driver knows the headline. */
  menu_items?: any[] | null;
}

/** Wave 48 A1 - statuses where the post-event panel should render.
 *  Hide it on cancelled (irrelevant) and on completed where every
 *  stage button is already non-actionable - the panel itself
 *  no-ops when buttons are pressed for a closed job, but suppressing
 *  the surface keeps the completed list clean. */
const ACTIVE_STATUSES_FOR_CONFIRMATION_PANEL = new Set([
  "confirmed", "preparing", "ready", "in_transit", "delivered",
]);

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    in_transit: "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/20 dark:text-brand-primary",
    ready: "bg-slate-100 text-slate-700 border-slate-200",
    confirmed: "bg-slate-100 text-slate-700 border-slate-200",
    preparing: "bg-slate-100 text-slate-700 border-slate-200",
    cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  };
  return map[status] || "bg-slate-100 text-slate-700 border-slate-200";
};

export default function DriverDeliveriesPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Smart search across client / venue so a driver can quickly find a job
  // by typing the customer's name or part of the address.
  const filteredOrders = useFuzzyItems(
    orders,
    search,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "venue_address" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        // Pull the load list (equipment_items) + menu headline so the
        // driver sees what's on the truck, not just where they're going.
        // Both live on the linked quote, not orders.
        .select("id, order_number, event_name, event_date, event_time, venue_address, guest_count, status, delivery_status, client_name, client_phone, client_email, quote:quotes!orders_quote_id_fkey(menu_items, equipment_items)")
        // Include orders where this user is the PRIMARY (assigned_driver_id /
        // legacy driver_id) OR the SECONDARY (secondary_driver_id) - a
        // second driver on a two-driver job was getting an empty list
        // because secondary_driver_id wasn't in the filter.
        .eq("company_id", user.company_id)
        .or(`assigned_driver_id.eq.${user.id},driver_id.eq.${user.id},secondary_driver_id.eq.${user.id}`)
        .order("event_date", { ascending: false });
      if (!cancelled) {
        if (error) console.error("Error loading deliveries:", error);
        const mapped = ((data as any[]) || []).map((o) => ({
          ...o,
          menu_items: o.quote?.menu_items ?? null,
          equipment_items: o.quote?.equipment_items ?? null,
        }));
        setOrders(mapped as DriverOrder[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.company_id]);

  const stats = useMemo(() => {
    const now = new Date();
    const upcoming = orders.filter((o) => new Date(o.event_date) >= new Date(now.toDateString()) && o.status !== "completed" && o.status !== "delivered" && o.status !== "cancelled");
    const completed = orders.filter((o) => o.status === "completed" || o.status === "delivered");
    const totalGuests = orders.reduce((s, o) => s + (o.guest_count || 0), 0);
    return { total: orders.length, upcoming: upcoming.length, completed: completed.length, totalGuests };
  }, [orders]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>All deliveries - CateringMS</title></Head>
      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="My deliveries"
            subtitle="Every order assigned to you, past and upcoming"
            icon={Truck}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <StatTile label="All deliveries" value={stats.total} icon={Truck} hint="Past and upcoming" />
            <StatTile label="Upcoming" value={stats.upcoming} icon={Clock} hint="Still to do" />
            <StatTile label="Completed" value={stats.completed} icon={CheckCircle2} hint="Finished and signed off" />
            <StatTile label="Total guests served" value={stats.totalGuests} icon={Package} hint="Across every delivery" />
          </div>

          <PortalCard>
            <PortalCardHeader title="Delivery history" />
            {loading ? (
              <div className="py-12 flex items-center justify-center text-slate-500 dark:text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading deliveries...
              </div>
            ) : (
              <>
                <div className="relative max-w-md mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder="Search by client or venue..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Tabs defaultValue="all">
                  <TabsList className="mb-4 flex w-full gap-1 overflow-x-auto">
                    <TabsTrigger
                      value="all"
                      className="flex-1 justify-center min-w-[120px] whitespace-nowrap data-[state=active]:bg-brand-primary data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      All ({filteredOrders.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="upcoming"
                      className="flex-1 justify-center min-w-[120px] whitespace-nowrap data-[state=active]:bg-brand-primary data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      Upcoming
                    </TabsTrigger>
                    <TabsTrigger
                      value="completed"
                      className="flex-1 justify-center min-w-[120px] whitespace-nowrap data-[state=active]:bg-brand-primary data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      Completed
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="all">
                    <DeliveryList orders={filteredOrders} />
                  </TabsContent>
                  <TabsContent value="upcoming">
                    <DeliveryList orders={filteredOrders.filter((o) => new Date(o.event_date) >= new Date(new Date().toDateString()) && !["completed","delivered","cancelled"].includes(o.status))} />
                  </TabsContent>
                  <TabsContent value="completed">
                    <DeliveryList orders={filteredOrders.filter((o) => ["completed","delivered"].includes(o.status))} />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </PortalCard>
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}

function DeliveryList({ orders }: { orders: DriverOrder[] }) {
  // ODOC H.9: deep-link to the unified /order/[id] doc with the
  // driver section pre-expanded. Same chip pattern as the dashboard
  // - the doc carries venue contact, leave-by, checklist, POD path
  // all in one brief.
  const { withSlug } = useTenantHref();
  if (orders.length === 0) {
    return (
      <div className="py-14 px-6 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
          <Truck className="w-6 h-6 text-slate-400 dark:text-slate-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1.5">
          No deliveries here yet
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          When dispatch assigns you a job it shows up here. Upcoming runs sit at the top, finished ones drop into your history below.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const equipment = Array.isArray(o.equipment_items) ? o.equipment_items : [];
        const menu = Array.isArray(o.menu_items) ? o.menu_items : [];
        return (
          <div key={o.id} className="flex flex-col gap-3 p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.12)]">
            {/* Wave 70.45c - canonical BookingHeader (driver variant,
                compact). Carries the tenant brand bar + status + date +
                time + venue + guest count, replacing the bespoke top
                strip that this card had per-instance. Driver-specific
                actions (Open in Maps, comms bridge) live in the row
                below so the header stays the SAME shared component
                that every event document uses. */}
            <BookingHeader
              variant="driver"
              compact
              booking={{
                id: o.id,
                order_number: o.order_number ?? null,
                event_name: o.event_name ?? null,
                event_date: o.event_date,
                event_time: o.event_time ?? null,
                guest_count: o.guest_count,
                status: o.status,
                client_name: o.client_name ?? null,
                venue_address: o.venue_address,
              }}
            />

            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Driver-specific actions: Maps + comms bridge.
                    Header above shows the venue text; this row gives
                    the driver the tap-to-navigate / tap-to-call links
                    that aren't part of the shared header component. */}
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {/* ODOC H.9: Open brief - the unified driver
                      doc with venue contact, checklist, leave-by,
                      POD path in one place. */}
                  <Link
                    href={withSlug(staffOrderHref(o.id, "driver"))}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary font-semibold min-h-[32px] dark:border-brand-primary/30 dark:bg-brand-primary/10 dark:text-brand-primary dark:hover:bg-brand-primary/20"
                    title="Open the driver brief for this order"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open brief
                  </Link>
                  {o.venue_address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.venue_address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${o.venue_address} in Google Maps`}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 min-h-[32px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Open in Maps
                    </a>
                  )}
                </div>
                {/* Driver -> client comms bridge. Tap-to-call + open
                    WhatsApp / email so the driver can reach the
                    client without copying numbers off another screen.
                    Closes the audit gap "client sees driver phone but
                    driver cannot message client". */}
                {(o.client_phone || o.client_email) && (
                  <div className="flex items-center gap-2 mt-2">
                    {o.client_phone && (
                      <>
                        <a
                          href={`tel:${String(o.client_phone).replace(/[^+\d]/g, "")}`}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          title={`Call ${o.client_phone}`}
                          onClick={() => void logPiiAccess({
                            entityType: "order",
                            entityId: o.id,
                            category: "contact_details",
                            fields: "driver tap-to-call client phone from deliveries list",
                            reason: "driver outbound call for active delivery",
                          })}
                        >
                          📞 Call
                        </a>
                        <a
                          href={`https://wa.me/${String(o.client_phone).replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                            `Hi ${(o.client_name || "there").split(" ")[0]}, I'm your driver for today's delivery to ${String(o.venue_address || "").split(",")[0]}.`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                          title="Open WhatsApp"
                          onClick={() => void logPiiAccess({
                            entityType: "order",
                            entityId: o.id,
                            category: "contact_details",
                            fields: "driver opened WhatsApp deep link to client phone",
                            reason: "driver outbound WhatsApp for active delivery",
                          })}
                        >
                          💬 WhatsApp
                        </a>
                      </>
                    )}
                    {o.client_email && (
                      <a
                        href={`mailto:${o.client_email}`}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        title={`Email ${o.client_email}`}
                        onClick={() => void logPiiAccess({
                          entityType: "order",
                          entityId: o.id,
                          category: "contact_details",
                          fields: "driver tap-to-email client",
                          reason: "driver outbound email for active delivery",
                        })}
                      >
                        ✉️ Email
                      </a>
                    )}
                  </div>
                )}
              </div>
              {/* Wave 70.45c - guest-count "X pax" chip used to live
                  here on the right; it now renders inside the
                  BookingHeader driver variant above (which formats it
                  as "N pax" automatically). Order total stays hidden
                  - drivers see payout on /earnings, not what the
                  catering company charged the client. */}
            </div>

            {/* What to load, pulled from orders.equipment_items + menu_items.
                Sales captured this in the quote, it persisted through the
                quote -> order conversion, the kitchen sees it on prep-list,
                the driver sees it here. */}
            {(equipment.length > 0 || menu.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                {menu.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                      Food on board ({menu.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {menu.slice(0, 8).map((m: any, i: number) => (
                        <Badge key={`m_${i}`} variant="secondary" className="text-xs">
                          {m.item_name || m.name}
                          {m.quantity ? ` × ${m.quantity}` : ""}
                        </Badge>
                      ))}
                      {menu.length > 8 && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 self-center">
                          +{menu.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {equipment.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                      Equipment to load ({equipment.length})
                    </p>
                    <ul className="space-y-1">
                      {equipment.map((eq: any, i: number) => {
                        const fromStock = Number(eq.from_stock_qty);
                        const fromHire = Number(eq.from_hire_qty);
                        const hasSplit =
                          Number.isFinite(fromStock) &&
                          Number.isFinite(fromHire) &&
                          (fromStock > 0 || fromHire > 0);
                        return (
                          <li
                            key={`eq_${i}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1.5 dark:bg-slate-800/50 dark:border-slate-700"
                          >
                            <span className="text-slate-800 dark:text-slate-200 min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                              <span className="truncate">{eq.name || "(unnamed)"}</span>
                              {eq.category && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">{eq.category}</span>
                              )}
                              {hasSplit && fromStock > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
                                  {fromStock} OWNED
                                </span>
                              )}
                              {hasSplit && fromHire > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">
                                  {fromHire} HIRE-IN
                                </span>
                              )}
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex-shrink-0 tabular-nums">
                              × {Number(eq.quantity) || 0}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Wave 48 A1 - mount the post-event confirmation panel
                inline on every active delivery row. The panel
                surfaces every stage button (en-route, departed,
                arrived, collection complete) so the driver can close
                each leg without leaving this page. Render only when
                the order is in an active range; cancelled and
                completed jobs hide it to keep the history clean. */}
            {ACTIVE_STATUSES_FOR_CONFIRMATION_PANEL.has(o.status) && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <DriverConfirmationPanel
                  orderId={o.id}
                  orderNumber={o.order_number || o.id}
                  eventTime={o.event_time || ""}
                  venueAddress={o.venue_address || ""}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
