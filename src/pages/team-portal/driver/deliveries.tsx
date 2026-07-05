import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, CheckCircle2, Clock, Package, Loader2, Search, Navigation, ExternalLink,
  Phone, MessageCircle, Mail, RefreshCw, ChevronDown, ChevronUp, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { PortalCard, PortalCardHeader, PortalOverview } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { parseLocalDay } from "@/lib/localDate";
// Wave 48 A1 - DriverConfirmationPanel was a P0 orphan: the full
// 4-stage post-event UI (en-route to kitchen, departed, arrived at
// venue, collection complete) existed at /components/driver/ but was
// mounted on zero pages. Without it, completeCollection() was
// unreachable from the driver app - so equipment_bookings never
// flipped to 'returned', dispatch carried phantom open assignments,
// driver pay never snapshotted the collection leg, damages couldn't
// be recorded. Mounted here per active delivery, behind a per-row
// expander (restructure 2026-07-02) so a long history doesn't mount
// a live GPS/data panel for every row at once.
import { DriverConfirmationPanel } from "@/components/driver/DriverConfirmationPanel";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { logPiiAccess } from "@/services/piiAccessLogService";

/** One line of the quote's menu_items jsonb - only the fields this
 *  page reads. Sales-entered data, so every field is best-effort. */
interface MenuLine {
  item_name?: string | null;
  name?: string | null;
  quantity?: number | string | null;
}

/** One line of the quote's equipment_items jsonb - the load list. */
interface EquipmentLine {
  name?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  from_stock_qty?: number | string | null;
  from_hire_qty?: number | string | null;
}

/** Shape of the joined quote row. menu_items / equipment_items exist
 *  on BOTH orders and quotes - this page deliberately reads the
 *  QUOTE copies (the load list sales captured), so keep the join
 *  payload in its own type to avoid mixing the two up. */
interface QuoteItemsJoin {
  menu_items: MenuLine[] | null;
  equipment_items: EquipmentLine[] | null;
}

/** Raw row as returned by the select below (order columns + quote
 *  join). PostgREST returns the many-to-one join as an object, but
 *  we tolerate an array shape defensively. */
interface RawOrderRow {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string;
  event_time: string | null;
  venue_address: string | null;
  guest_count: number | null;
  status: string | null;
  delivery_status: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  quote: QuoteItemsJoin | QuoteItemsJoin[] | null;
}

interface DriverOrder {
  id: string;
  /** Wave 48 A1 - order_number drives the panel header. */
  order_number: string | null;
  /** Wave 70.45c - event_name feeds the canonical BookingHeader so
   *  the driver sees the client-facing event label (not just a
   *  numbered order). */
  event_name: string | null;
  event_date: string;
  event_time: string | null;
  venue_address: string | null;
  guest_count: number | null;
  status: string;
  delivery_status: string | null;
  client_name: string | null;
  /** Client contact details for the driver-to-client comms bridge.
   *  These are surfaced as call / WhatsApp links inline on each
   *  delivery so the driver can reach the client without copying
   *  numbers off another screen. */
  client_phone: string | null;
  client_email: string | null;
  /** From the linked quote's equipment_items jsonb - the load list. */
  equipment_items: EquipmentLine[] | null;
  /** From the linked quote's menu_items jsonb - the headline food. */
  menu_items: MenuLine[] | null;
}

/** Wave 48 A1 - statuses where the post-event panel should render.
 *  Hide it on cancelled (irrelevant) and on completed where every
 *  stage button is already non-actionable - the panel itself
 *  no-ops when buttons are pressed for a closed job, but suppressing
 *  the surface keeps the completed list clean. */
const ACTIVE_STATUSES_FOR_CONFIRMATION_PANEL = new Set([
  "confirmed", "preparing", "ready", "in_transit", "delivered",
]);

/** Timezone-safe "is this event today or later" bucket. event_date is
 *  a bare YYYY-MM-DD; `new Date("YYYY-MM-DD")` parses as UTC midnight
 *  which is the PREVIOUS local day east of the meridian (SA is UTC+2),
 *  so the old comparison shifted every bucket by a day around
 *  midnight. parseLocalDay pins both sides to local midnight. */
const isUpcomingDay = (eventDate: string, today: Date): boolean => {
  const day = parseLocalDay(eventDate);
  return !!day && day.getTime() >= today.getTime();
};

const isOpenStatus = (status: string): boolean =>
  !["completed", "delivered", "cancelled"].includes(status);

const heroChipClass =
  "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white";

function DriverDeliveriesInner() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  /** True once at least one fetch has succeeded - lets background
   *  refetches (focus / realtime ticks) refresh quietly instead of
   *  flashing the skeleton over an already-rendered list. */
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [search, setSearch] = useState("");
  /** Restructure 2026-07-02: only ONE row mounts the (heavy, self-
   *  fetching) DriverConfirmationPanel at a time, behind an explicit
   *  per-row expander. */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // TIGHTEN I.119: refetch when an order edit lands in any tab /
  // another session, or when the tab regains focus.
  const refreshSignal = useOrderRefreshSignal(user?.company_id ?? null);

  // Smart search across client / venue so a driver can quickly find a job
  // by typing the customer's name or part of the address.
  const filteredOrders = useFuzzyItems<DriverOrder>(
    orders,
    search,
    [
      { key: "client_name", weight: 3 },
      { key: "venue_address", weight: 2 },
    ],
    { limit: 0 },
  );

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
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
      if (cancelled) return;
      if (fetchError) {
        // Restructure 2026-07-02: this used to console.error and carry
        // on, so a failed load rendered as "no deliveries" - the driver
        // couldn't tell an empty roster from an outage. Surface it.
        console.error("Error loading deliveries:", fetchError);
        setError(fetchError.message || "Something went wrong loading your deliveries.");
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as unknown as RawOrderRow[];
      const mapped: DriverOrder[] = rows.map((o) => {
        const quote = Array.isArray(o.quote) ? o.quote[0] ?? null : o.quote;
        return {
          id: o.id,
          order_number: o.order_number ?? null,
          event_name: o.event_name ?? null,
          event_date: o.event_date,
          event_time: o.event_time ?? null,
          venue_address: o.venue_address ?? null,
          guest_count: o.guest_count ?? null,
          status: o.status ?? "pending",
          delivery_status: o.delivery_status ?? null,
          client_name: o.client_name ?? null,
          client_phone: o.client_phone ?? null,
          client_email: o.client_email ?? null,
          menu_items: quote?.menu_items ?? null,
          equipment_items: quote?.equipment_items ?? null,
        };
      });
      setOrders(mapped);
      setError(null);
      setLoaded(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.company_id, refreshSignal, reloadTick]);

  const stats = useMemo(() => {
    // Local-midnight "today" anchor - see isUpcomingDay for the
    // UTC-parse trap the old new Date(event_date) comparison had.
    const today = parseLocalDay(new Date()) as Date;
    const upcoming = orders.filter((o) => isUpcomingDay(o.event_date, today) && isOpenStatus(o.status));
    const completed = orders.filter((o) => o.status === "completed" || o.status === "delivered");
    const totalGuests = orders.reduce((s, o) => s + (o.guest_count || 0), 0);
    return { total: orders.length, upcoming: upcoming.length, completed: completed.length, totalGuests };
  }, [orders]);

  const upcomingFiltered = useMemo(() => {
    const today = parseLocalDay(new Date()) as Date;
    return filteredOrders.filter((o) => isUpcomingDay(o.event_date, today) && isOpenStatus(o.status));
  }, [filteredOrders]);

  const completedFiltered = useMemo(
    () => filteredOrders.filter((o) => ["completed", "delivered"].includes(o.status)),
    [filteredOrders],
  );

  const showSkeleton = loading && !loaded;

  return (
    <DriverPageShell
      pageTitle="All deliveries - Driver Portal"
      heading="All deliveries"
      subheading="Every order assigned to you, past and upcoming."
      icon={Truck}
      width="full"
      headerAction={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReloadTick((t) => t + 1)}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
      meta={
        loaded && !error ? (
          <>
            <span className={heroChipClass}>
              <Truck className="h-3 w-3" aria-hidden="true" />
              {stats.total} {stats.total === 1 ? "delivery" : "deliveries"}
            </span>
            <span className={heroChipClass}>
              {stats.upcoming > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" aria-hidden="true" />
              )}
              {stats.upcoming} upcoming
            </span>
            <span className={heroChipClass}>
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              {stats.completed} completed
            </span>
          </>
        ) : undefined
      }
      overview={
        <PortalOverview
          eyebrow="Delivery history"
          title={showSkeleton ? "Loading your assigned deliveries" : stats.upcoming > 0 ? "Upcoming work sits above completed history" : "All assigned deliveries are in one place"}
          description="Use this page for assigned orders across time. Search by client or venue, open the driver brief, and use the active rows to complete handover stages."
          items={[
            { label: "All deliveries", value: stats.total, helper: "Past and upcoming", icon: Truck, tone: stats.total > 0 ? "brand" : "neutral" },
            { label: "Upcoming", value: stats.upcoming, helper: "Still to do", icon: Clock, tone: stats.upcoming > 0 ? "warning" : "success" },
            { label: "Completed", value: stats.completed, helper: "Finished runs", icon: CheckCircle2, tone: "success" },
            { label: "Guests", value: stats.totalGuests, helper: "Across deliveries", icon: Package, tone: "neutral" },
          ]}
          actions={
            <>
              {/* Consolidation repoints: /schedule folded into the calendar
                  agenda and /tracking into the routes board's current-stop
                  card, so link straight there instead of via the redirects. */}
              <Link
                href={withSlug("/team-portal/driver/calendar")}
                className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Schedule
              </Link>
              <Link
                href={withSlug("/team-portal/driver/routes#current")}
                className="inline-flex min-h-9 items-center rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Current stop
              </Link>
            </>
          }
        />
      }
    >
      {error && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-slate-900">
          <h2 className="text-base font-bold text-rose-900 dark:text-rose-300 mb-1">Couldn&apos;t load your deliveries</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{error}</p>
          <Button
            onClick={() => setReloadTick((t) => t + 1)}
            size="sm"
            disabled={loading}
            className="bg-brand-primary hover:bg-brand-primary/90 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Retry
          </Button>
        </div>
      )}

      {!error && (
        <PortalCard>
          <PortalCardHeader title="Delivery history" />
          {showSkeleton ? (
            <div className="py-12 flex items-center justify-center text-slate-500 dark:text-slate-400 gap-2" aria-busy="true">
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
                    className="flex-1 justify-center min-w-0 whitespace-nowrap data-[state=active]:bg-brand-primary data-[state=active]:text-white data-[state=active]:shadow-sm"
                  >
                    All ({filteredOrders.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="upcoming"
                    className="flex-1 justify-center min-w-0 whitespace-nowrap data-[state=active]:bg-brand-primary data-[state=active]:text-white data-[state=active]:shadow-sm"
                  >
                    Upcoming ({upcomingFiltered.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="flex-1 justify-center min-w-0 whitespace-nowrap data-[state=active]:bg-brand-primary data-[state=active]:text-white data-[state=active]:shadow-sm"
                  >
                    Completed ({completedFiltered.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                  <DeliveryList orders={filteredOrders} expandedId={expandedId} onToggleExpand={setExpandedId} />
                </TabsContent>
                <TabsContent value="upcoming">
                  <DeliveryList orders={upcomingFiltered} expandedId={expandedId} onToggleExpand={setExpandedId} />
                </TabsContent>
                <TabsContent value="completed">
                  <DeliveryList orders={completedFiltered} expandedId={expandedId} onToggleExpand={setExpandedId} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </PortalCard>
      )}
    </DriverPageShell>
  );
}

function DeliveryList({
  orders,
  expandedId,
  onToggleExpand,
}: {
  orders: DriverOrder[];
  /** Order id whose DriverConfirmationPanel is currently mounted. */
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
}) {
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
        const isExpanded = expandedId === o.id;
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
                order_number: o.order_number,
                event_name: o.event_name,
                event_date: o.event_date,
                event_time: o.event_time,
                guest_count: o.guest_count,
                status: o.status,
                client_name: o.client_name,
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
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          Call
                        </a>
                        <a
                          href={`https://wa.me/${String(o.client_phone).replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                            `Hi ${(o.client_name || "there").split(" ")[0]}, I'm your driver for today's delivery to ${String(o.venue_address || "").split(",")[0]}.`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-primary/20 bg-brand-primary/10 hover:bg-brand-primary/15 text-brand-primary dark:border-brand-primary/30 dark:bg-brand-primary/15 dark:text-brand-primary dark:hover:bg-brand-primary/20"
                          title="Open WhatsApp"
                          onClick={() => void logPiiAccess({
                            entityType: "order",
                            entityId: o.id,
                            category: "contact_details",
                            fields: "driver opened WhatsApp deep link to client phone",
                            reason: "driver outbound WhatsApp for active delivery",
                          })}
                        >
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          WhatsApp
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
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        Email
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

            {/* What to load, pulled from the linked quote's
                equipment_items + menu_items. Sales captured this in
                the quote, it persisted through the quote -> order
                conversion, the kitchen sees it on prep-list, the
                driver sees it here. */}
            {/* Driver feedback 2026-07-04 (Pic 82): one clean load list.
                Food and equipment render as identical rows (name left,
                quantity right) in a single column - no chip/list mix, no
                side-by-side columns on desktop, no full food list hidden
                behind "+N more". Ownership (OWNED / HIRE-IN split) and
                category metadata are back-office concerns; the driver
                only needs what to load and how many. */}
            {(equipment.length > 0 || menu.length > 0) && (
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                {menu.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                      Food on board ({menu.length})
                    </p>
                    <ul className="space-y-1">
                      {menu.map((m, i) => (
                        <li
                          key={`m_${i}`}
                          className="flex items-center justify-between gap-2 text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1.5 dark:bg-slate-800/50 dark:border-slate-700"
                        >
                          <span className="text-slate-800 dark:text-slate-200 min-w-0 flex-1 truncate">
                            {m.item_name || m.name || "(unnamed)"}
                          </span>
                          {m.quantity ? (
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex-shrink-0 tabular-nums">
                              x {Number(m.quantity)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {equipment.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                      Equipment to load ({equipment.length})
                    </p>
                    <ul className="space-y-1">
                      {equipment.map((eq, i) => (
                        <li
                          key={`eq_${i}`}
                          className="flex items-center justify-between gap-2 text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1.5 dark:bg-slate-800/50 dark:border-slate-700"
                        >
                          <span className="text-slate-800 dark:text-slate-200 min-w-0 flex-1 truncate">
                            {eq.name || "(unnamed)"}
                          </span>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex-shrink-0 tabular-nums">
                            x {Number(eq.quantity) || 0}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Wave 48 A1 - the post-event confirmation panel surfaces
                every stage button (en-route, departed, arrived,
                collection complete) so the driver can close each leg
                without leaving this page. Render only when the order
                is in an active range; cancelled and completed jobs
                hide it to keep the history clean.

                Restructure 2026-07-02: the panel is a heavy, self-
                fetching widget (its own confirmations query + GPS
                capture). Mounting one per row made long lists slow,
                so it now sits behind a per-row expander and only the
                expanded row mounts it. The panel itself is unchanged. */}
            {ACTIVE_STATUSES_FOR_CONFIRMATION_PANEL.has(o.status) && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onToggleExpand(isExpanded ? null : o.id)}
                  aria-expanded={isExpanded}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 min-h-[32px] dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Confirm delivery stages (en route, departed, arrived, collection complete)"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  {isExpanded ? "Hide delivery stages" : "Update delivery stages"}
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
                {isExpanded && (
                  <div className="mt-3">
                    <DriverConfirmationPanel
                      orderId={o.id}
                      orderNumber={o.order_number || o.id}
                      eventTime={o.event_time || ""}
                      venueAddress={o.venue_address || ""}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Defense-in-depth (same recipe as the driver dashboard's DRV-A):
// this page previously relied purely on `useAuth().user` for the
// fetch, so a logged-in non-driver hitting the URL rendered an empty
// shell instead of being bounced. Admin roles are admitted for
// support / cross-tenant troubleshooting.
export default function DriverDeliveriesPage() {
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
      <DriverDeliveriesInner />
    </ProtectedRoute>
  );
}
