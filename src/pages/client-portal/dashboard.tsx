/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
/**
 * Client portal dashboard -- Phase 3 rebuild.
 *
 * What changed from the old scaffold:
 *   - Hero card adapts to the next event's phase (countdown / preparing
 *     / live tracking / "no upcoming" empty state)
 *   - Branded header uses company.primary_color + secondary_color +
 *     logo so each catering company's portal feels like their own
 *   - Past events compact strip with one-tap rebook and rating display
 *   - Quick actions row -- tracking, invoice, contact, rebook
 *   - Real-time subscription on the orders table so status changes
 *     appear without a refresh (e.g. "Preparing" -> "Out for delivery")
 *
 * Structure:
 *   [Branded header] -- always
 *   [Hero card]      -- next event, transforms by phase
 *   [Quick actions]  -- 4-up grid
 *   [Past events]    -- horizontal scroll, only when there are any
 *
 * The page is mounted both at /client-portal/dashboard and at
 * /[slug]/client-portal/dashboard via the rewrite in next.config.mjs --
 * the slug variant is the canonical URL post-Phase-2.
 */
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  Calendar, Clock, MapPin, Users, ChefHat, Truck, CheckCircle2,
  Sparkles, ArrowRight, Receipt, Phone, MessageSquare,
  Loader2, PartyPopper, RotateCcw, Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ClientNav } from "@/components/navigation/ClientNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ChatBot } from "@/components/ChatBot";
import { RebookDialog } from "@/components/client-portal/RebookDialog";
import { RequestEditsDialog } from "@/components/client-portal/RequestEditsDialog";
import { supabase } from "@/integrations/supabase/client";

// Leaflet (used for live tracking) is SSR-hostile. Lazy-load on demand so
// the bundle stays small and SSR doesn't crash.
const ClientTrackingMap = dynamic(
  () => import("@/components/tracking/ClientTrackingMap").then((m) => m.ClientTrackingMap),
  { ssr: false, loading: () => <div className="h-64 sm:h-80 bg-slate-100 animate-pulse rounded-xl" /> },
);

// ── Types ─────────────────────────────────────────────────────────────

interface Order {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string;
  event_time: string | null;
  guest_count: number | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  status: string;
  payment_status: string | null;
  total_amount: number | null;
  driver_id: string | null;
  // Star rating from delivery_feedback (1-5). null = the client hasn't
  // rated this event yet. Populated client-side from a separate query
  // because the orders table doesn't carry it.
  rating: number | null;
}

interface DriverPin {
  lat: number;
  lng: number;
  driver_name: string;
  driver_phone?: string;
  last_updated: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const STATUS_TIMELINE = [
  { id: "confirmed",  label: "Confirmed",  icon: CheckCircle2 },
  { id: "preparing",  label: "Preparing",  icon: ChefHat },
  { id: "ready",      label: "Ready",      icon: Sparkles },
  { id: "in_transit", label: "On the way", icon: Truck },
  { id: "delivered",  label: "Delivered",  icon: CheckCircle2 },
];

/**
 * Tone presets for the status badge so we don't reinvent the colour
 * mapping at every call site.
 */
const STATUS_TONES: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-purple-100 text-purple-800 border-purple-200",
  ready:      "bg-green-100 text-green-800 border-green-200",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  out_for_delivery: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed:  "bg-slate-100 text-slate-800 border-slate-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
};

/** Time-of-day greeting -- adapts every six hours. */
function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Hello";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Pick the headline event from the order list.
 * Priority:
 *   1. Currently in transit / ready (active, not delivered)
 *   2. Earliest upcoming non-cancelled event
 *   3. A very recent past event (event_date within the last 3 days) that
 *      the caterer hasn't yet marked completed/delivered. This closes the
 *      gap where the kitchen finishes service but doesn't transition the
 *      status straight away -- the client still wants the portal to show
 *      "your event was on Sunday" rather than going blank.
 *   4. null if there's nothing live
 */
function pickHeadlineEvent(orders: Order[]): Order | null {
  const live = orders.find((o) =>
    ["in_transit", "out_for_delivery", "ready", "preparing"].includes(o.status),
  );
  if (live) return live;
  const todayISO = new Date().toISOString().slice(0, 10);
  const upcoming = orders
    .filter((o) => o.event_date >= todayISO && !["cancelled", "completed"].includes(o.status))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  if (upcoming[0]) return upcoming[0];

  // Recent-past fallback. We only care about confirmed/in-flight bookings
  // whose date has just passed -- not draft, not cancelled. 3 days is the
  // window the admin team has to mark completion before the portal stops
  // surfacing it as the headline.
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoffISO = threeDaysAgo.toISOString().slice(0, 10);
  const recent = orders
    .filter(
      (o) =>
        o.event_date < todayISO &&
        o.event_date >= cutoffISO &&
        !["cancelled", "draft", "completed", "delivered"].includes(o.status),
    )
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  return recent[0] || null;
}

/** Days/hours from now to the event (negative if past). */
function timeUntil(eventDate: string, eventTime?: string | null): { days: number; hours: number; minutes: number; isPast: boolean } {
  const target = new Date(`${eventDate}T${(eventTime || "12:00").slice(0, 5)}:00`);
  const diffMs = target.getTime() - Date.now();
  const isPast = diffMs < 0;
  const abs = Math.abs(diffMs);
  const days = Math.floor(abs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((abs / (60 * 60 * 1000)) % 24);
  const minutes = Math.floor((abs / (60 * 1000)) % 60);
  return { days, hours, minutes, isPast };
}

/**
 * Smart copy that adapts to the event phase. Bobby asked for the
 * "Silicon Valley feel" -- the difference between a bland status badge
 * and a portal that feels intelligent is mostly here.
 */
function smartStatusCopy(order: Order): { headline: string; sub: string } {
  const t = timeUntil(order.event_date, order.event_time);
  if (order.status === "in_transit" || order.status === "out_for_delivery") {
    return { headline: "On the way!", sub: "Track your driver live below." };
  }
  if (order.status === "ready") {
    return { headline: "Ready for delivery", sub: "Your order is prepped and waiting on the driver to roll out." };
  }
  if (order.status === "preparing") {
    return { headline: "Our kitchen is on it", sub: "Final prep is underway right now." };
  }
  if (order.status === "delivered" || order.status === "completed") {
    return { headline: "Delivered", sub: "We hope it was lekker. Tap to leave a quick rating." };
  }
  if (t.isPast) {
    // Same-day past timestamp: event is happening or just happened today.
    if (t.days === 0) {
      return { headline: "Event in progress", sub: "Hope it's going brilliantly." };
    }
    // Headline is a recent-past confirmed booking that hasn't been
    // marked complete yet (see pickHeadlineEvent's 3-day fallback).
    const ago = t.days === 1 ? "yesterday" : `${t.days} days ago`;
    return {
      headline: `Your event ${ago}`,
      sub: "Hope it landed brilliantly. We'll close it out shortly.",
    };
  }
  if (t.days === 0) {
    return { headline: "Today's the day", sub: `${t.hours} hour${t.hours === 1 ? "" : "s"} until kick-off.` };
  }
  if (t.days === 1) {
    return { headline: "Tomorrow", sub: "Final touches and prep tomorrow." };
  }
  if (t.days <= 7) {
    return { headline: `In ${t.days} days`, sub: "We're locked in and prepping." };
  }
  return { headline: `${t.days} days to go`, sub: "We'll keep you posted as the date gets closer." };
}

// ── Page ──────────────────────────────────────────────────────────────

export default function ClientPortalDashboard() {
  const { user, profile, company } = useAuth() as any;
  const router = useRouter();
  const { toast } = useToast();

  // Slug-aware link prefix. The dashboard is mounted at both
  // /client-portal/dashboard and /[slug]/client-portal/dashboard
  // (next.config rewrite). When the user is on the slug variant,
  // router.query.company_slug is populated and we keep all internal
  // links inside that tenant prefix so navigation stays in the
  // company-branded URL space.
  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    (user as any)?.user_metadata?.last_company_slug ||
    company?.slug ||
    "";

  const withSlug = (href: string) => {
    if (!resolvedSlug) return href;
    if (href.startsWith(`/${resolvedSlug}/`)) return href;
    if (href.startsWith("/client-portal")) return `/${resolvedSlug}${href}`;
    return href;
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverPin, setDriverPin] = useState<DriverPin | null>(null);

  // Quotes the client can act on. We surface pending quotes (status =
  // sent or viewed) as a hero band above the next-event card so the
  // "you need to act" prompt comes before everything else. Accepted /
  // declined / draft quotes don't appear here -- the full list lives
  // on /client-portal/quotes.
  type PortalQuote = {
    id: string;
    public_token: string;
    quote_number: string;
    quote_name: string | null;
    status: string | null;
    total: number | null;
    total_amount: number | null;
    event_date: string | null;
    sent_at: string | null;
    valid_until: string | null;
  };
  const [quotes, setQuotes] = useState<PortalQuote[]>([]);

  // Rebook dialog state -- when the client taps "Rebook" on a past
  // event we open the RebookDialog component, which presents:
  //   - new event details (date defaulting to ~4 weeks out, guests, venue)
  //   - the catering company's actual menu items, by category, with
  //     quantity steppers (no pricing)
  //   - dietary requirements + free-form notes
  // On submit it writes a row to `leads` with structured
  // `requested_items` JSONB and a source_order_id pointing back to the
  // past event for context.
  const [rebookOrder, setRebookOrder] = useState<Order | null>(null);
  // Quote-edits dialog state -- the client opens this from the
  // dashboard hero band when they want changes before accepting.
  const [editsQuote, setEditsQuote] = useState<{ id: string; quote_number: string } | null>(null);

  // Branding tones -- fall back to a calm emerald so unbranded companies
  // still look polished.
  const brandPrimary = company?.primary_color || "#059669";
  const brandSecondary = company?.secondary_color || "#10b981";
  const brandGradient = `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`;
  const brandSoftBg = `linear-gradient(135deg, ${brandPrimary}10 0%, ${brandSecondary}10 100%)`;
  const companyName = company?.company_name || profile?.company_name || "Your portal";
  const companyLogo = company?.logo_url || null;

  const greeting = useMemo(() => greetingFor(new Date()), []);

  // Client-facing greeting: prefer the per-tenant clients.client_name
  // (what the catering company actually has them stored as in their
  // books) over profiles.full_name (a global identity that gets
  // written once on auth signup and never refreshed). Same email
  // can be "Bobby Nicholson" on Spit Braai's books and "Tollie Le
  // Roux" on the auth side -- the greeting in this catering company's
  // portal should say what THIS catering company calls them.
  const [clientName, setClientName] = useState<string | null>(null);
  const firstName = (
    clientName || profile?.full_name || user?.full_name || ""
  ).split(" ")[0] || "there";

  // Canonical clients.id for THIS tenant. Used as the FK target when the
  // client submits an inline rating from a past-event tile -- the
  // delivery_feedback row needs both order_id and client_id and we'd
  // rather resolve it once at load than every star-click.
  const [tenantClientId, setTenantClientId] = useState<string | null>(null);

  // ── Load orders for this client ─────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    // Scope every query to the URL-slug company so a user who happens
    // to be a client of multiple catering tenants doesn't see merged
    // data on this tenant's portal.
    const tenantCompanyId: string | null = company?.id ?? null;
    if (!tenantCompanyId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // Find every clients row this user owns -- under THIS tenant
        // only. Catering companies often create order rows before the
        // user signs up (linked by email only), and a single user might
        // also have multiple client rows under the same company through
        // historical data entry. We collect every candidate id and
        // email so the orders query catches all of them. Tenant scope
        // is enforced by company_id; user might be a client of several
        // companies but this portal renders one tenant at a time.
        const { data: clientRowsRaw } = await supabase
          .from("clients")
          .select("id, client_name")
          .eq("user_id", user.id)
          .eq("company_id", tenantCompanyId);
        const clientRows = ((clientRowsRaw as any[]) || []);
        const clientIds = clientRows.map((r) => r.id);
        // Pick the most recent clients.client_name as the tenant-scoped
        // greeting. When there are multiple historical rows for the
        // same email, the latest one is most likely what the catering
        // team currently uses.
        if (clientRows.length > 0 && !cancelled) {
          setClientName(clientRows[0].client_name || null);
          setTenantClientId(clientRows[0].id || null);
        }

        let q = supabase
          .from("orders")
          .select(
            "id, order_number, event_name, event_date, event_time, guest_count, venue_name, venue_address, venue_lat, venue_lng, status, payment_status, total_amount, driver_id",
          )
          .order("event_date", { ascending: false });

        if (clientIds.length > 0 && user.email) {
          // Match on either client_id (canonical link) OR client_email
          // (orders booked before sign-up). Email match is case-
          // insensitive to handle "Sue.Smith@Gmail.com" vs the lowercase
          // form Supabase auth normalises to.
          q = q.or(
            `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
          );
        } else if (clientIds.length > 0) {
          q = q.in("client_id", clientIds);
        } else if (user.email) {
          q = q.ilike("client_email", user.email);
        } else {
          if (!cancelled) {
            setOrders([]);
            setLoading(false);
          }
          return;
        }

        const { data, error } = await q;
        if (error) console.error("Client dashboard load failed:", error);
        const rows = (data as Omit<Order, "rating">[]) || [];

        // Pull star ratings in a single second query keyed on order_id.
        // RLS on delivery_feedback already gates this to the client's
        // own orders. We merge by id rather than embedding so we don't
        // get tripped up if the column shape changes upstream.
        const ratingByOrderId = new Map<string, number>();
        if (rows.length > 0) {
          const orderIds = rows.map((r) => r.id);
          const { data: feedback } = await supabase
            .from("delivery_feedback")
            .select("order_id, overall_rating")
            .in("order_id", orderIds);
          for (const f of (feedback as any[]) || []) {
            if (f.order_id && f.overall_rating != null) {
              ratingByOrderId.set(f.order_id, f.overall_rating);
            }
          }
        }

        const merged: Order[] = rows.map((r) => ({
          ...(r as any),
          rating: ratingByOrderId.get(r.id) ?? null,
        }));
        if (!cancelled) setOrders(merged);

        // Quotes for this client. Same union pattern as orders --
        // catering teams send quotes by email before sign-up so we
        // need to catch orphan rows (NULL client_id) too. Filtered
        // to non-deleted, tenant-scoped, ordered newest first.
        const baseQuotes = supabase
          .from("quotes")
          .select(
            "id, public_token, quote_number, quote_name, status, total, total_amount, event_date, sent_at, valid_until",
          )
          .eq("company_id", tenantCompanyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        let quotesQuery = baseQuotes;
        if (clientIds.length > 0 && user.email) {
          quotesQuery = quotesQuery.or(
            `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
          );
        } else if (clientIds.length > 0) {
          quotesQuery = quotesQuery.in("client_id", clientIds);
        } else if (user.email) {
          quotesQuery = quotesQuery.ilike("client_email", user.email);
        }
        const { data: quoteRows } = await quotesQuery;
        if (!cancelled) {
          setQuotes(((quoteRows as PortalQuote[]) || []));
        }
      } catch (e) {
        console.error("Client dashboard load failed:", e);
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Realtime subscription: refresh when any of the client's orders
    // changes. We re-run the full load so the headline event gets
    // recomputed correctly when statuses transition.
    const channel = supabase
      .channel(`client-orders-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (!cancelled) load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.email, company?.id]);

  // ── Live driver tracking polling for the headline event ─────────────
  // Polls every 30 seconds whenever the headline event is out for
  // delivery. The map component does its own internal polling once
  // mounted, but we keep the hero "ETA: 12 minutes" line fresh by
  // pulling the same gps_tracking row server-side.
  const headline = useMemo(() => pickHeadlineEvent(orders), [orders]);
  const headlineIsLive =
    headline && (headline.status === "in_transit" || headline.status === "out_for_delivery");

  useEffect(() => {
    if (!headline || !headlineIsLive || !headline.driver_id) {
      setDriverPin(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        // Current-location lookup off driver_locations (P1-23 split):
        // single PK row per driver instead of scanning gps_tracking
        // history.
        const { data: pin } = await (supabase as any)
          .from("driver_locations")
          .select("latitude, longitude, updated_at")
          .eq("driver_id", headline.driver_id)
          .maybeSingle();

        // Driver name + phone live on the profiles row -- there's no
        // separate drivers table. Fetched in parallel so a missing
        // profile (e.g. a deleted driver) doesn't hide the location.
        const { data: driverProfile } = await supabase
          .from("profiles")
          .select("full_name, phone, phone_number")
          .eq("id", headline.driver_id)
          .maybeSingle();

        if (!cancelled && pin) {
          const driver = (driverProfile || {}) as any;
          setDriverPin({
            lat: Number((pin as any).latitude),
            lng: Number((pin as any).longitude),
            driver_name: driver.full_name || "Your driver",
            driver_phone: driver.phone || driver.phone_number || undefined,
            last_updated: (pin as any).timestamp,
          });
        }
      } catch {
        /* ignore -- we'll retry next interval */
      }
    };
    poll();
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [headline?.id, headline?.driver_id, headlineIsLive]);

  // ── Past events strip ───────────────────────────────────────────────
  const pastOrders = useMemo(
    () =>
      orders
        .filter((o) => ["delivered", "completed"].includes(o.status))
        .sort((a, b) => b.event_date.localeCompare(a.event_date))
        .slice(0, 8),
    [orders],
  );

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>{companyName} | Your portal</title>
      </Head>
      <ClientNav />

      {/*
        Layout wrapper:
          lg:pl-64 / xl:pl-72   match the ClientNav sidebar widths
                                exactly so cards sit flush against the
                                menu, no gap (Bobby: "aligned left next
                                to the menu, take up full width").
          pt-16 lg:pt-0         leave room for the mobile sticky header.
          overflow-x-hidden     guards against any rogue child overflow
                                on small screens.
      */}
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        {/*
          Branded greeting strip. Uses inline styles for the gradient so
          each tenant's brand colours apply without a Tailwind safelist
          gymnastic. Content stretches the full width of the available
          area, no inner max-w cap.
        */}
        <header
          className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 text-white shadow-md"
          style={{ background: brandGradient }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg flex-shrink-0">
                {companyLogo ? (
                  <img src={companyLogo} alt={companyName} className="w-10 h-10 sm:w-12 sm:h-12 object-contain rounded-lg" />
                ) : (
                  <ChefHat className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-white/80 font-medium">{companyName}</p>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate">
                  {greeting}, {firstName}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {orders.length > 0 && (
                <Badge variant="outline" className="bg-white/15 border-white/30 text-white text-xs">
                  {orders.length} event{orders.length === 1 ? "" : "s"} on file
                </Badge>
              )}
              {pastOrders.filter((o) => o.rating == null).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const el = typeof document !== "undefined"
                      ? document.getElementById("past-events")
                      : null;
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center rounded-full border border-white/30 bg-white/15 hover:bg-white/25 transition px-3 py-1 text-xs font-medium text-white"
                >
                  Rate a recent event
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 space-y-6">

          {/* ── Pending quotes hero band ─────────────────────────────
              Renders above the next-event card whenever there are
              quotes the client hasn't acted on. This is the most
              important "you need to do something" moment so it gets
              top billing. Accepting / declining lives on the public
              quote view at /q/[token] -- we just deep-link there. */}
          {(() => {
            const pending = quotes.filter(
              (q) => q.status === "sent" || q.status === "viewed",
            );
            if (pending.length === 0) return null;
            const fmt = new Intl.NumberFormat("en-ZA", {
              style: "currency", currency: "ZAR", maximumFractionDigits: 0,
            });
            // Brand-coloured accent strip on the left + plain white card.
            // The previous 10%-opacity gradient washed out to pinkish on
            // most brand colours; this reads as the brand instead.
            return (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="flex">
                  <div
                    className="w-1.5 flex-shrink-0"
                    style={{ background: brandGradient }}
                    aria-hidden
                  />
                  <CardContent className="flex-1 py-5 px-5 sm:px-6 space-y-4 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brandPrimary }}>
                          {pending.length === 1 ? "Quote ready for you" : `${pending.length} quotes ready for you`}
                        </p>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                          {pending.length === 1
                            ? "Have a look, accept, or push back for changes"
                            : "Pick the option that suits, accept, or request changes"}
                        </h2>
                      </div>
                      {quotes.length > pending.length && (
                        <Link
                          href={withSlug("/client-portal/quotes")}
                          className="text-sm font-medium hover:underline"
                          style={{ color: brandPrimary }}
                        >
                          See all quotes ({quotes.length})
                        </Link>
                      )}
                    </div>

                    <ul className="space-y-2">
                      {pending.slice(0, 3).map((q) => {
                        const total = Number(q.total ?? q.total_amount ?? 0);
                        const eventLabel = q.event_date
                          ? new Date(q.event_date).toLocaleDateString("en-ZA", {
                              day: "numeric", month: "short", year: "numeric",
                            })
                          : null;
                        const acceptHref = q.public_token
                          ? `/q/${q.public_token}`
                          : withSlug("/client-portal/quotes");
                        return (
                          <li
                            key={q.id}
                            className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 transition-colors p-4"
                          >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {q.quote_name || `Quote ${q.quote_number}`}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {q.quote_number}
                                  {eventLabel && <span> · event {eventLabel}</span>}
                                </p>
                              </div>
                              <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
                                {total > 0 ? fmt.format(total) : "TBD"}
                              </p>
                            </div>
                            <div className="flex gap-2 flex-wrap mt-3">
                              <Button
                                asChild
                                size="sm"
                                className="text-white hover:opacity-90"
                                style={{ background: brandPrimary }}
                              >
                                <a
                                  href={acceptHref}
                                  target={q.public_token ? "_blank" : undefined}
                                  rel={q.public_token ? "noopener noreferrer" : undefined}
                                >
                                  Open + accept
                                </a>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditsQuote({ id: q.id, quote_number: q.quote_number })
                                }
                              >
                                Request changes
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {pending.length > 3 && (
                      <Link
                        href={withSlug("/client-portal/quotes")}
                        className="block text-center text-sm font-medium pt-1"
                        style={{ color: brandPrimary }}
                      >
                        View {pending.length - 3} more
                      </Link>
                    )}
                  </CardContent>
                </div>
              </Card>
            );
          })()}

          {/* ── Rebook hero ──────────────────────────────────────────
              When there's at least one completed event, surface a
              warm "do it again" prompt above the next-event card.
              Hidden when the client already has a live upcoming
              booking -- the hero card will be more useful there. */}
          {(() => {
            const lastCompleted = orders.find((o) => o.status === "completed");
            if (!lastCompleted) return null;
            return (
              <Card
                className="border-0 shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition"
                onClick={() => setRebookOrder(lastCompleted)}
              >
                <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ background: brandSoftBg }}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: brandPrimary, color: "white" }}
                    >
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: brandPrimary }}>
                        Liked your last event?
                      </p>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                        Book your next one with {companyName}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        We'll prefill from{" "}
                        {lastCompleted.event_name || "your last booking"}
                        {lastCompleted.event_date
                          ? ` on ${new Date(lastCompleted.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
                          : ""}
                        .
                      </p>
                    </div>
                  </div>
                  <Button
                    className="text-white hover:opacity-90 flex-shrink-0"
                    style={{ background: brandPrimary }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRebookOrder(lastCompleted);
                    }}
                  >
                    Book again
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Hero: next event ─────────────────────────────────────── */}
          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center">
                <Loader2 className="w-7 h-7 mx-auto text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 mt-3">Loading your events...</p>
              </CardContent>
            </Card>
          ) : !headline ? (
            <Card className="border-0 shadow-lg" style={{ background: brandSoftBg }}>
              <CardContent className="py-10 text-center space-y-3">
                <PartyPopper className="w-10 h-10 mx-auto" style={{ color: brandPrimary }} />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    No events on the books yet
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    When {companyName} confirms your next booking, it'll show up here with live tracking and updates.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <HeroCard
              order={headline}
              brandPrimary={brandPrimary}
              brandSecondary={brandSecondary}
              brandGradient={brandGradient}
              driverPin={driverPin}
            />
          )}

          {/* ── Quick actions ───────────────────────────────────────── */}
          {headline && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ActionTile
                label="Live tracking"
                icon={MapPin}
                href={withSlug("/client-portal/tracking")}
                tone={brandPrimary}
              />
              <ActionTile
                label="Invoice"
                icon={Receipt}
                href={withSlug("/client-portal/billing")}
                tone={brandPrimary}
              />
              <ActionTile
                label="Note for chef"
                icon={MessageSquare}
                href={withSlug(`/client-portal/my-orders?focus=${headline.id}`)}
                tone={brandPrimary}
              />
              <ActionTile
                label="Contact us"
                icon={Phone}
                href={company?.phone ? `tel:${company.phone}` : `mailto:${company?.email || ""}`}
                tone={brandPrimary}
                external
              />
            </div>
          )}

          {/* ── Past events strip ───────────────────────────────────── */}
          {pastOrders.length > 0 && (
            <section id="past-events" className="space-y-3 pt-2 scroll-mt-20">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                  Past events
                </h2>
                <Link href={withSlug("/client-portal/my-orders")} className="text-sm font-medium" style={{ color: brandPrimary }}>
                  See all
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
                {pastOrders.map((o) => (
                  <PastEventTile
                    key={o.id}
                    order={o}
                    brandPrimary={brandPrimary}
                    slugPrefix={resolvedSlug ? `/${resolvedSlug}` : ""}
                    onRebook={(target) => {
                      // Open the RebookDialog -- it manages its own
                      // form state internally now (date, items, notes).
                      setRebookOrder(target);
                    }}
                    onRate={async (target, rating) => {
                      // Inline rating insert. RLS on delivery_feedback
                      // gates this to client_id rows the user owns,
                      // and the unique-ish (order_id) constraint isn't
                      // enforced at the DB so we guard at the call
                      // site by only showing the prompt when
                      // order.rating is null.
                      if (!company?.id || !tenantClientId) {
                        toast({
                          title: "Could not save rating",
                          description: "Please refresh and try again.",
                          variant: "destructive",
                        });
                        return;
                      }
                      const { error } = await supabase
                        .from("delivery_feedback")
                        .insert({
                          company_id: company.id,
                          order_id: target.id,
                          client_id: tenantClientId,
                          overall_rating: rating,
                        });
                      if (error) {
                        toast({
                          title: "Could not save rating",
                          description: error.message,
                          variant: "destructive",
                        });
                        return;
                      }
                      // Optimistic local update so the stars fill
                      // immediately without a full refetch.
                      setOrders((prev) =>
                        prev.map((r) =>
                          r.id === target.id ? { ...r, rating } : r,
                        ),
                      );
                      toast({
                        title: "Thanks for the rating",
                        description: "We've shared this with the team.",
                      });
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {/*
        Rebook dialog. Lets the client build a quote request inline:
        new event date, guest count, venue, plus picks from the
        catering company's actual menu (no pricing). Submits a lead
        with structured `requested_items` JSONB the catering team
        converts into a formal quote on the admin side.
      */}
      <RebookDialog
        open={!!rebookOrder}
        onOpenChange={(o) => {
          if (!o) setRebookOrder(null);
        }}
        sourceOrder={
          rebookOrder
            ? {
                id: rebookOrder.id,
                event_name: rebookOrder.event_name,
                event_date: rebookOrder.event_date,
                guest_count: rebookOrder.guest_count,
                venue_name: rebookOrder.venue_name,
                venue_address: rebookOrder.venue_address,
              }
            : null
        }
        companyId={company?.id}
        companyName={companyName}
        brandPrimary={brandPrimary}
        brandSecondary={brandSecondary}
        user={user ? { id: user.id, email: user.email } : null}
        profileFullName={profile?.full_name || (user as any)?.full_name || null}
        profilePhone={(profile as any)?.phone_number || null}
      />

      <RequestEditsDialog
        open={!!editsQuote}
        onOpenChange={(o) => { if (!o) setEditsQuote(null); }}
        quoteId={editsQuote?.id || null}
        quoteNumber={editsQuote?.quote_number || null}
        onSuccess={() => {
          // Drop the quote out of the pending bucket locally so the
          // hero band updates without a full refetch -- the server
          // already flipped it to 'revised'.
          setQuotes((prev) =>
            prev.map((q) => (q.id === editsQuote?.id ? { ...q, status: "revised" } : q)),
          );
          setEditsQuote(null);
        }}
      />

      <ChatBot userRole="client" companyId={company?.id} />
    </>
  );
}

// ── Hero card -- the one piece that adapts to the phase ───────────────

function HeroCard({
  order,
  brandPrimary,
  brandSecondary,
  brandGradient,
  driverPin,
}: {
  order: Order;
  brandPrimary: string;
  brandSecondary: string;
  brandGradient: string;
  driverPin: DriverPin | null;
}) {
  const copy = smartStatusCopy(order);
  const tone = STATUS_TONES[order.status] || STATUS_TONES.pending;
  const isLive = order.status === "in_transit" || order.status === "out_for_delivery";
  const t = timeUntil(order.event_date, order.event_time);

  // Live tracking variant: map takes the spotlight, summary below.
  if (isLive && order.venue_lat && order.venue_lng) {
    return (
      <Card className="border-0 shadow-xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 text-white" style={{ background: brandGradient }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/80 uppercase tracking-wide">Right now</p>
              <h2 className="text-xl sm:text-2xl font-bold mt-0.5">{copy.headline}</h2>
              <p className="text-sm text-white/90 mt-1">{copy.sub}</p>
            </div>
            {driverPin?.driver_phone && (
              <a
                href={`tel:${driverPin.driver_phone}`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 backdrop-blur text-sm font-semibold hover:bg-white/30 transition"
              >
                <Phone className="w-4 h-4" />
                Call {driverPin.driver_name?.split(" ")[0] || "driver"}
              </a>
            )}
          </div>
        </div>
        <div className="h-64 sm:h-80">
          <ClientTrackingMap
            orderId={order.id}
            driverLocation={driverPin || undefined}
            venueLocation={{
              lat: order.venue_lat,
              lng: order.venue_lng,
              address: order.venue_address || "",
            }}
            orderStatus={order.status}
          />
        </div>
        <div className="px-5 sm:px-6 py-4 grid grid-cols-3 gap-3 border-t border-slate-100">
          <Stat label="Event" value={order.event_name || "Your event"} />
          <Stat label="Guests" value={`${order.guest_count || 0}`} />
          <Stat label="Total" value={fmtMoney.format(Number(order.total_amount || 0))} />
        </div>
      </Card>
    );
  }

  // Default variant: countdown + status timeline.
  return (
    <Card className="border-0 shadow-xl overflow-hidden">
      <div className="px-5 sm:px-6 py-5 text-white" style={{ background: brandGradient }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/80 uppercase tracking-wide">
              Your next event
            </p>
            <h2 className="text-xl sm:text-2xl font-bold mt-0.5 truncate">
              {order.event_name || "Your event"}
            </h2>
            <p className="text-sm text-white/90 mt-1">
              {new Date(order.event_date).toLocaleDateString("en-ZA", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {order.event_time && ` • ${order.event_time}`}
            </p>
          </div>
          <Badge variant="outline" className={`${tone} border capitalize text-xs flex-shrink-0`}>
            {order.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      <CardContent className="p-5 sm:p-6 space-y-5">
        {/* Smart copy + countdown */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between">
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl sm:text-3xl font-bold"
              style={{
                background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {copy.headline}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{copy.sub}</p>
          </div>
          {!t.isPast && t.days <= 30 && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <CountdownChip value={t.days} label="days" />
              <CountdownChip value={t.hours} label="hrs" />
              <CountdownChip value={t.minutes} label="min" />
            </div>
          )}
        </div>

        {/* Status timeline */}
        <div>
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            {STATUS_TIMELINE.map((step, i) => {
              const idx = STATUS_TIMELINE.findIndex((s) => s.id === order.status);
              const reached = idx >= 0 && idx >= i;
              const isCurrent = idx === i;
              const Icon = step.icon;
              return (
                <div key={step.id} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition ${
                      reached ? "shadow-md" : "bg-slate-100"
                    }`}
                    style={{
                      background: reached
                        ? `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`
                        : undefined,
                    }}
                  >
                    <Icon className={`w-4 h-4 ${reached ? "text-white" : "text-slate-400"}`} />
                  </div>
                  <span
                    className={`text-[10px] sm:text-xs text-center leading-tight ${
                      isCurrent ? "font-semibold text-slate-900 dark:text-white" : "text-slate-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Event details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Stat
            icon={Calendar}
            label="Date"
            value={new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
          />
          <Stat icon={Clock} label="Start" value={order.event_time || "TBD"} />
          <Stat icon={Users} label="Guests" value={`${order.guest_count || 0}`} />
          <Stat icon={MapPin} label="Venue" value={order.venue_name || "TBD"} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Small reusable bits ───────────────────────────────────────────────

function CountdownChip({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 min-w-[3.5rem]">
      <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        <span>{label}</span>
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{value}</div>
    </div>
  );
}

function ActionTile({
  label,
  icon: Icon,
  href,
  tone,
  external,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  tone: string;
  external?: boolean;
}) {
  const content = (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col items-start gap-2 hover:shadow-md transition group"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: `${tone}1a`, color: tone }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition" />
    </div>
  );
  return external ? (
    <a href={href}>{content}</a>
  ) : (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

function PastEventTile({
  order,
  brandPrimary,
  onRebook,
  onRate,
  slugPrefix,
}: {
  order: Order;
  brandPrimary: string;
  onRebook: (o: Order) => void;
  onRate: (o: Order, rating: number) => Promise<void> | void;
  slugPrefix: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const date = new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  const myOrdersHref = `${slugPrefix}/client-portal/my-orders?focus=${order.id}`;
  return (
    <div className="snap-start flex-shrink-0 w-[260px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition">
      {/*
        The whole card is browseable, the inner Link wraps just the
        summary so a click on the Rebook button at the bottom doesn't
        navigate. This keeps "go look at the order" and "request a
        rebook" as two separate intents.
      */}
      <Link href={myOrdersHref} className="block">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{date}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {order.event_name || "Event"}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">
            {order.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{order.guest_count || 0} guests</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {fmtMoney.format(Number(order.total_amount || 0))}
          </span>
        </div>
      </Link>
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        {order.rating ? (
          <div className="flex items-center gap-0.5" title={`You rated ${order.rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`w-3.5 h-3.5 ${n <= (order.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
              />
            ))}
          </div>
        ) : (
          // Inline rating: each star is its own click target. We track
          // a hover index for the fill preview, and disable the row
          // mid-submit so a double-click doesn't insert two rows.
          <div
            className="flex items-center gap-0.5"
            onMouseLeave={() => setHover(null)}
            title="Tap a star to rate this event"
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = (hover ?? 0) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={submitting}
                  onMouseEnter={() => setHover(n)}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (submitting) return;
                    setSubmitting(true);
                    try {
                      await onRate(order, n);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="p-0.5 -m-0.5 disabled:opacity-50"
                  aria-label={`Rate ${n} out of 5`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${filled ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
                  />
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRebook(order);
          }}
          className="text-xs font-semibold flex items-center gap-1 hover:underline"
          style={{ color: brandPrimary }}
        >
          <RotateCcw className="w-3 h-3" />
          Rebook
        </button>
      </div>
    </div>
  );
}
