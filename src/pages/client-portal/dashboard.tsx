/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
/**
 * Client portal dashboard - Phase 3 rebuild.
 *
 * What changed from the old scaffold:
 *   - Hero card adapts to the next event's phase (countdown / preparing
 *     / live tracking / "no upcoming" empty state)
 *   - Branded header uses company.primary_color + secondary_color +
 *     logo so each catering company's portal feels like their own
 *   - Past events compact strip with one-tap rebook and rating display
 *   - Quick actions row - tracking, invoice, contact, rebook
 *   - Real-time subscription on the orders table so status changes
 *     appear without a refresh (e.g. "Preparing" -> "Out for delivery")
 *
 * Structure:
 *   [Branded header] - always
 *   [Hero card]      - next event, transforms by phase
 *   [Quick actions]  - 4-up grid
 *   [Past events]    - horizontal scroll, only when there are any
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
import { OrderClientChatPanel } from "@/components/chat/OrderClientChatPanel";
import { orderChatService } from "@/services/orderChatService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AddToCalendarButton } from "@/components/client-portal/AddToCalendarButton";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { onOrderUpdated } from "@/lib/events/orderEvents";

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

// Wave 18 audit: hardcoded ZAR formatter rendered "R5,000" for UK / US
// / EU tenants, breaking the dashboard for non-ZA caterers. Replaced
// the module-scope constant with a per-currency factory so the
// component can resolve the tenant currency from the loaded company
// row at render time. fmtMoneyFor("GBP") -> "£5,000", etc.
function fmtMoneyFor(currencyCode: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currencyCode || "ZAR",
      maximumFractionDigits: 0,
    });
  } catch {
    // Bad currency code - fall back to a safe formatter.
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    });
  }
}

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
  delivered:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed:  "bg-slate-100 text-slate-800 border-slate-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
};

/** Time-of-day greeting - adapts every six hours. */
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
 *      status straight away - the client still wants the portal to show
 *      "your event was on Sunday" rather than going blank.
 *   4. null if there's nothing live
 */
/**
 * CLI-E (client deep audit, CLI-25): pick a just-delivered event
 * worth celebrating on the dashboard. A client whose meal arrived
 * yesterday + hasn't left a star rating gets a soft banner with a
 * party-popper icon + "How was it?" CTA scrolling to the rating
 * row. Closes within 7 days regardless to keep the dashboard
 * non-cluttered for inactive clients.
 *
 * Returns null when:
 *   - No order delivered in the last 7 days
 *   - The latest delivered order is already rated
 *   - There's a live in-flight headline (don't fight the hero band)
 */
function pickJustDeliveredEvent(orders: Order[]): Order | null {
  const live = orders.find((o) =>
    ["in_transit", "ready", "preparing"].includes(o.status),
  );
  if (live) return null;
  const todayISO = toLocalISO(new Date());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffISO = toLocalISO(sevenDaysAgo);
  const recent = orders
    .filter(
      (o) =>
        o.event_date <= todayISO &&
        o.event_date >= cutoffISO &&
        (o.status === "delivered" || o.status === "completed") &&
        !o.rating,
    )
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
  return recent[0] || null;
}

function pickHeadlineEvent(orders: Order[]): Order | null {
  const live = orders.find((o) =>
    ["in_transit", "ready", "preparing"].includes(o.status),
  );
  if (live) return live;
  const todayISO = toLocalISO(new Date());
  const upcoming = orders
    .filter((o) => o.event_date >= todayISO && !["cancelled", "completed"].includes(o.status))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  if (upcoming[0]) return upcoming[0];

  // Recent-past fallback. We only care about confirmed/in-flight bookings
  // whose date has just passed - not draft, not cancelled. 3 days is the
  // window the admin team has to mark completion before the portal stops
  // surfacing it as the headline.
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoffISO = toLocalISO(threeDaysAgo);
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
 * "Silicon Valley feel" - the difference between a bland status badge
 * and a portal that feels intelligent is mostly here.
 */
function smartStatusCopy(order: Order): { headline: string; sub: string } {
  const t = timeUntil(order.event_date, order.event_time);
  if (order.status === "in_transit") {
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

function ClientPortalDashboardInner() {
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
  // declined / draft quotes don't appear here - the full list lives
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
  // CLI-F (client deep audit, CLI-32 / CLI-61): outstanding-balance
  // tile. Pre-fix, the client had to navigate to /billing to find
  // money owed. Now the dashboard surfaces the unpaid total above
  // the past-events strip with a one-tap Pay action. Drives the
  // 5-second-answer hierarchy Bobby's brief specified.
  const [outstanding, setOutstanding] = useState<{
    total: number;
    invoiceCount: number;
    overdueCount: number;
  }>({ total: 0, invoiceCount: 0, overdueCount: 0 });
  // CLI-I (client deep audit, CLI-30): paid-invoice lookup. Two
  // shapes:
  //   - paidInvoiceByOrderId: map order_id -> {invoiceId, invoiceNumber}
  //     so each past-event tile can offer a per-event Receipt button
  //     when the underlying invoice settled.
  //   - lastPaidInvoice: most recent paid invoice the client owns
  //     full-stop, surfaced as a small "Download last receipt" link
  //     beside the outstanding-balance tile so a partially-paid
  //     client can still grab proof of their last payment from the
  //     dashboard.
  const [paidInvoiceByOrderId, setPaidInvoiceByOrderId] = useState<
    Record<string, { invoiceId: string; invoiceNumber: string | null }>
  >({});
  const [lastPaidInvoice, setLastPaidInvoice] = useState<{
    invoiceId: string;
    invoiceNumber: string | null;
    paidAt: string | null;
  } | null>(null);

  // Rebook dialog state - when the client taps "Rebook" on a past
  // event we open the RebookDialog component, which presents:
  //   - new event details (date defaulting to ~4 weeks out, guests, venue)
  //   - the catering company's actual menu items, by category, with
  //     quantity steppers (no pricing)
  //   - dietary requirements + free-form notes
  // On submit it writes a row to `leads` with structured
  // `requested_items` JSONB and a source_order_id pointing back to the
  // past event for context.
  const [rebookOrder, setRebookOrder] = useState<Order | null>(null);
  // Quote-edits dialog state - the client opens this from the
  // dashboard hero band when they want changes before accepting.
  const [editsQuote, setEditsQuote] = useState<{ id: string; quote_number: string } | null>(null);
  // CLI-J (CLI-31): per-order chat thread dialog. Opens from the hero
  // card + past event tiles. Same OrderClientChatPanel is reused on
  // the admin side via the OrderDetailsModal Messages tab so both
  // ends share one render path.
  const [messageOrder, setMessageOrder] = useState<Order | null>(null);
  const [unreadByOrder, setUnreadByOrder] = useState<Record<string, number>>({});

  // Branding tones - fall back to a calm emerald so unbranded companies
  // still look polished.
  const brandPrimary = company?.primary_color || "#059669";
  // CLI-H (client deep audit, CLI-27 / CLI-59): pick legible text
  // colour for the brand background. Pre-fix every brand-tile
  // hardcoded text-white - fine for emerald, broken for a yellow /
  // peach / cream brand. YIQ luminance is good enough for the
  // hex-shorthand palettes tenants pick (more accurate is WCAG
  // contrast ratio but YIQ avoids a lib dep).
  const contrastText = (hex: string | null | undefined): "white" | "black" => {
    if (!hex) return "white";
    const h = hex.replace("#", "");
    if (h.length < 6) return "white";
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (Number.isNaN(r + g + b)) return "white";
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 160 ? "black" : "white";
  };
  const brandText = contrastText(brandPrimary);
  const brandSecondary = company?.secondary_color || "#10b981";
  const brandGradient = `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`;
  const brandSoftBg = `linear-gradient(135deg, ${brandPrimary}10 0%, ${brandSecondary}10 100%)`;
  const companyName = company?.company_name || profile?.company_name || "Your portal";
  const companyLogo = company?.logo_url || null;
  // Wave 18 audit: dashboard used to render every order total with a
  // hardcoded ZAR formatter - UK / US / EU tenants saw R5,000 against
  // a £/$/€ caterer. Resolve from the loaded company row with a ZAR
  // fallback for legacy NULL values.
  const fmtMoney = useMemo(
    () => fmtMoneyFor(((company as any)?.currency as string) || "ZAR"),
    [(company as any)?.currency],
  );

  const greeting = useMemo(() => greetingFor(new Date()), []);

  // Client-facing greeting: prefer the per-tenant clients.client_name
  // (what the catering company actually has them stored as in their
  // books) over profiles.full_name (a global identity that gets
  // written once on auth signup and never refreshed). Same email
  // can be "Bobby Nicholson" on Spit Braai's books and "Tollie Le
  // Roux" on the auth side - the greeting in this catering company's
  // portal should say what THIS catering company calls them.
  const [clientName, setClientName] = useState<string | null>(null);
  const firstName = (
    clientName || profile?.full_name || user?.full_name || ""
  ).split(" ")[0] || "there";

  // Canonical clients.id for THIS tenant. Used as the FK target when the
  // client submits an inline rating from a past-event tile - the
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
        // Find every clients row this user owns - under THIS tenant
        // only. Catering companies often create order rows before the
        // user signs up (linked by email only), and a single user might
        // also have multiple client rows under the same company through
        // historical data entry. We collect every candidate id and
        // email so the orders query catches all of them. Tenant scope
        // is enforced by company_id; user might be a client of several
        // companies but this portal renders one tenant at a time.
        const { data: clientRowsRaw, error: clientRowsError } = await supabase
          .from("clients")
          .select("id, client_name")
          .eq("user_id", user.id)
          .eq("company_id", tenantCompanyId);
        if (clientRowsError) {
          console.error("[client-portal/dashboard] clients fetch failed:", clientRowsError);
        }
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
          const { data: feedback, error: feedbackError } = await supabase
            .from("delivery_feedback")
            .select("order_id, overall_rating")
            .in("order_id", orderIds);
          if (feedbackError) {
            console.error("[client-portal/dashboard] delivery_feedback fetch failed:", feedbackError);
          }
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

        // CLI-F (CLI-32 / CLI-61): outstanding-balance aggregation.
        // Fetch invoices in pending/overdue status for this client +
        // sum balance_due. Same client-scoping pattern as the rest
        // of the page. Failure is best-effort - tile stays at 0
        // rather than blocking the dashboard.
        try {
          const baseInvoices = (supabase as any)
            .from("invoices")
            .select("id, status, balance_due, total_amount, due_date")
            .eq("company_id", tenantCompanyId)
            .in("status", ["pending", "overdue"]);
          let invoicesQuery = baseInvoices;
          if (clientIds.length > 0 && user.email) {
            invoicesQuery = invoicesQuery.or(
              `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
            );
          } else if (clientIds.length > 0) {
            invoicesQuery = invoicesQuery.in("client_id", clientIds);
          } else if (user.email) {
            invoicesQuery = invoicesQuery.ilike("client_email", user.email);
          }
          const { data: invoiceRows } = await invoicesQuery;
          if (!cancelled) {
            const todayMS = Date.now();
            const rows = (invoiceRows || []) as Array<{ id: string; status: string; balance_due: number | null; total_amount: number | null; due_date: string | null }>;
            const total = rows.reduce((sum, r) => sum + Number(r.balance_due ?? r.total_amount ?? 0), 0);
            const overdueCount = rows.filter((r) => {
              if (r.status === "overdue") return true;
              if (r.status !== "pending" || !r.due_date) return false;
              const due = new Date(r.due_date).getTime();
              return Number.isFinite(due) && due < todayMS;
            }).length;
            setOutstanding({
              total: Math.max(0, total),
              invoiceCount: rows.length,
              overdueCount,
            });
          }
        } catch (invErr) {
          console.warn("[client-portal/dashboard] outstanding-balance fetch failed:", invErr);
        }

        // CLI-I (CLI-30): paid-invoice lookup. Pull every paid
        // invoice for this client under this tenant so:
        //   1. PastEventTile knows which past orders have a
        //      receipt to download (by order_id)
        //   2. The outstanding-balance tile can surface a
        //      "Download last receipt" link to the most-recent
        //      one, even when the client still has other invoices
        //      outstanding (the partial-payment case)
        // Best-effort - if this fails the dashboard still works,
        // the Receipt link just doesn't appear.
        try {
          const basePaid = (supabase as any)
            .from("invoices")
            .select("id, invoice_number, order_id, paid_at")
            .eq("company_id", tenantCompanyId)
            .eq("status", "paid")
            .not("paid_at", "is", null)
            .order("paid_at", { ascending: false });
          let paidQuery = basePaid;
          if (clientIds.length > 0 && user.email) {
            paidQuery = paidQuery.or(
              `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
            );
          } else if (clientIds.length > 0) {
            paidQuery = paidQuery.in("client_id", clientIds);
          } else if (user.email) {
            paidQuery = paidQuery.ilike("client_email", user.email);
          }
          const { data: paidRows } = await paidQuery;
          if (!cancelled) {
            const rows = (paidRows || []) as Array<{
              id: string;
              invoice_number: string | null;
              order_id: string | null;
              paid_at: string | null;
            }>;
            const byOrder: Record<string, { invoiceId: string; invoiceNumber: string | null }> = {};
            for (const r of rows) {
              if (r.order_id && !byOrder[r.order_id]) {
                byOrder[r.order_id] = {
                  invoiceId: r.id,
                  invoiceNumber: r.invoice_number,
                };
              }
            }
            setPaidInvoiceByOrderId(byOrder);
            // Rows already sorted paid_at desc, so [0] is the
            // most recent. Stash it for the outstanding-tile link.
            const head = rows[0];
            setLastPaidInvoice(
              head
                ? {
                    invoiceId: head.id,
                    invoiceNumber: head.invoice_number,
                    paidAt: head.paid_at,
                  }
                : null,
            );
          }
        } catch (paidErr) {
          console.warn("[client-portal/dashboard] paid-invoice fetch failed:", paidErr);
        }
      } catch (e) {
        console.error("Client dashboard load failed:", e);
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Realtime subscription scoped to THIS tenant only. Audit (May
    // 2026, Item 5): the previous version subscribed to every
    // orders INSERT/UPDATE/DELETE platform-wide. Every order edit
    // on any tenant fired this callback in every client's browser,
    // and the payload includes the full row of every order change
    // depending on REPLICA IDENTITY - a real leak vector if RLS
    // ever wavers on the realtime channel. Filter by company_id.
    // CLI-D (client deep audit, CLI-16 / CLI-19 / CLI-20): broaden
    // the realtime channel to cover invoices, quotes, and payments
    // alongside orders. Pre-fix:
    //   - admin "Mark paid" only flipped /admin/invoices; client
    //     /dashboard had no signal until window focus
    //   - admin "Send quote" wrote to quotes; pending-quotes hero
    //     band didn't surface until reload
    //   - admin "Capture payment" wrote to payments; outstanding
    //     balance (when CLI-F lands) wouldn't refresh
    // All four tables are company-scoped via filter so RLS + the
    // server-side filter together stop cross-tenant leakage.
    const channel = supabase
      .channel(`client-orders-${user.id}-${tenantCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `company_id=eq.${tenantCompanyId}`,
        },
        () => {
          if (!cancelled) load();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `company_id=eq.${tenantCompanyId}`,
        },
        () => {
          if (!cancelled) load();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quotes",
          filter: `company_id=eq.${tenantCompanyId}`,
        },
        () => {
          if (!cancelled) load();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `company_id=eq.${tenantCompanyId}`,
        },
        () => {
          if (!cancelled) load();
        },
      )
      .subscribe();

    // CLI-D (CLI-16): cross-tab event bus listener.
    // /admin/orders, /admin/invoices, /admin/quotes, driver / kitchen
    // dashboards all emit `cateringms:order-updated` on their action
    // callbacks (DRV-E, KIT2-E, etc.). The postgres realtime sub
    // above catches DB changes cross-device, but a driver in
    // another tab of the SAME browser session may not see the row
    // mutation on the realtime channel if the connection is still
    // re-establishing. The event bus is the in-browser belt-and-
    // braces.
    const offOrderUpdated = onOrderUpdated(() => {
      if (!cancelled) load();
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      offOrderUpdated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.email, company?.id]);

  // ── CLI-J: per-order chat unread counts + realtime ping ─────────────
  // Loads initial unread counts for every order on screen, then keeps
  // them fresh via a postgres_changes sub on order_chat_messages
  // scoped to this tenant. A staff -> client message fires the chime
  // and a toast so the client notices even with the dashboard buried
  // behind another tab. The dialog itself marks-read on open.
  useEffect(() => {
    if (!user?.id || !company?.id || orders.length === 0) return;
    let cancelled = false;
    const tenantCompanyId = company.id;

    const loadUnread = async () => {
      const orderIds = orders.map((o) => o.id);
      const map = await orderChatService.getUnreadCountByOrder("client", {
        companyId: tenantCompanyId,
        orderIds,
      });
      if (!cancelled) setUnreadByOrder(map);
    };
    loadUnread();

    const playChime = () => {
      try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
        osc.stop(ctx.currentTime + 0.25);
        setTimeout(() => ctx.close(), 400);
      } catch {
        // best-effort; toast still fires
      }
    };

    const channel = supabase
      .channel(`client-order-chat-${user.id}-${tenantCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_chat_messages",
          filter: `company_id=eq.${tenantCompanyId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          if (!row || cancelled) return;
          // Only ping for staff -> client messages, and only for
          // orders this client actually owns.
          if (row.sender_role === "client") return;
          if (!orders.some((o) => o.id === row.order_id)) return;
          setUnreadByOrder((prev) => ({
            ...prev,
            [row.order_id]: (prev[row.order_id] || 0) + 1,
          }));
          // Suppress the chime when the dialog for that order is
          // already open - the message renders inline anyway.
          if (messageOrder?.id === row.order_id) return;
          playChime();
          toast({
            title: "New message from the team",
            description: (row.body && row.body.length > 140)
              ? `${row.body.slice(0, 137)}...`
              : (row.body || ""),
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, company?.id, orders.map((o) => o.id).join(","), messageOrder?.id]);

  // ── Live driver tracking polling for the headline event ─────────────
  // Polls every 30 seconds whenever the headline event is out for
  // delivery. The map component does its own internal polling once
  // mounted, but we keep the hero "ETA: 12 minutes" line fresh by
  // pulling the same gps_tracking row server-side.
  const headline = useMemo(() => pickHeadlineEvent(orders), [orders]);
  // CLI-E (CLI-25): just-delivered celebration. Renders only when
  // there's no live headline + a delivered order from the last
  // 7 days is unrated.
  const justDelivered = useMemo(() => pickJustDeliveredEvent(orders), [orders]);
  const headlineIsLive =
    headline && headline.status === "in_transit";

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
        const { data: pin, error: pinError } = await (supabase as any)
          .from("driver_locations")
          .select("latitude, longitude, updated_at")
          .eq("driver_id", headline.driver_id)
          .maybeSingle();
        if (pinError) {
          console.error("[client-portal/dashboard] driver_locations fetch failed:", pinError);
        }

        // Driver name + phone live on the profiles row - there's no
        // separate drivers table. Fetched in parallel so a missing
        // profile (e.g. a deleted driver) doesn't hide the location.
        const { data: driverProfile, error: driverProfileError } = await supabase
          .from("profiles")
          .select("full_name, phone, phone_number")
          .eq("id", headline.driver_id)
          .maybeSingle();
        if (driverProfileError) {
          console.error("[client-portal/dashboard] profiles fetch failed:", driverProfileError);
        }

        if (!cancelled && pin) {
          const driver = (driverProfile || {}) as any;
          setDriverPin({
            lat: Number((pin as any).latitude),
            lng: Number((pin as any).longitude),
            driver_name: driver.full_name || "Your driver",
            driver_phone: driver.phone || driver.phone_number || undefined,
            // CLI-A (client deep audit, CLI-8): the select pulls
            // `updated_at` (the canonical driver_locations column
            // after the P1-23 split); reading `timestamp` here was
            // a stale column name that always evaluated to undefined.
            // Any "Last updated 2 min ago" UI on the map was
            // silently rendering wrong.
            last_updated: (pin as any).updated_at,
          });
        }
      } catch {
        /* ignore - we'll retry next interval */
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
              quote view at /q/[token] - we just deep-link there. */}
          {(() => {
            const pending = quotes.filter(
              (q) => q.status === "sent" || q.status === "viewed",
            );
            if (pending.length === 0) return null;
            // Use the same tenant-aware formatter as the rest of the page.
            const fmt = fmtMoney;
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
              booking - the hero card will be more useful there. */}
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
                      style={{ background: brandPrimary, color: brandText }}
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
              brandText={brandText}
              companyName={companyName}
              driverPin={driverPin}
              fmtMoney={fmtMoney}
              unreadCount={unreadByOrder[headline.id] || 0}
              onMessage={() => {
                setUnreadByOrder((prev) => ({ ...prev, [headline.id]: 0 }));
                setMessageOrder(headline);
              }}
            />
          )}

          {/* CLI-E (client deep audit, CLI-25): just-delivered
              celebration. When the most-recent delivered order is
              still unrated and there's no live headline, surface a
              soft banner with a party popper + a "How was it?" CTA
              scrolling to the past-events strip below. Renders only
              when justDelivered is non-null (closes itself after the
              rating is left, or after 7 days regardless). */}
          {!headline && justDelivered && (
            <Card
              className="border-2 shadow-md"
              style={{ borderColor: brandPrimary, background: brandSoftBg }}
            >
              <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PartyPopper
                    className="w-8 h-8 shrink-0"
                    style={{ color: brandPrimary }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: brandPrimary }}>
                      How was it?
                    </p>
                    <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      Your {justDelivered.event_name || "event"} on
                      {" "}
                      {new Date(justDelivered.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                      {" "}was delivered.
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Tap a star below to let {companyName} know how it went.
                    </p>
                  </div>
                </div>
                <a
                  href="#past-events"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("past-events")?.scrollIntoView({
                      behavior: "smooth", block: "start",
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-3 rounded-lg font-semibold shadow-sm min-h-11 shrink-0"
                  style={{ background: brandPrimary, color: brandText }}
                >
                  <Star className="w-4 h-4" />
                  Rate
                </a>
              </CardContent>
            </Card>
          )}

          {/* CLI-F (client deep audit, CLI-32 / CLI-61): outstanding-
              balance tile + one-tap Pay. Renders only when there is
              actually money owed - dashboard stays uncluttered for
              fully-paid-up clients. Overdue invoices get a rose
              accent vs an amber accent for in-window pending.
              CLI-I (CLI-30): when a paid invoice also exists, a
              "Download last receipt" link sits in the tile footer
              so partially-paid clients can grab proof of the last
              payment from the same place they go to pay. */}
          {outstanding.total > 0 && (
            <div
              className={`rounded-xl border-2 px-4 py-4 flex flex-col gap-3 ${
                outstanding.overdueCount > 0
                  ? "border-rose-300 bg-rose-50"
                  : "border-amber-300 bg-amber-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Receipt className={`w-6 h-6 shrink-0 ${outstanding.overdueCount > 0 ? "text-rose-700" : "text-amber-700"}`} />
                  <div className="min-w-0">
                    <p className={`text-xs uppercase tracking-wide ${outstanding.overdueCount > 0 ? "text-rose-700" : "text-amber-700"}`}>
                      Outstanding balance
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                      {fmtMoney.format(outstanding.total)}
                    </p>
                    <p className="text-xs text-slate-600">
                      {outstanding.invoiceCount} {outstanding.invoiceCount === 1 ? "invoice" : "invoices"}
                      {outstanding.overdueCount > 0 && (
                        <span className="text-rose-700 font-semibold">
                          {" - "}{outstanding.overdueCount} overdue
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <Link
                  href={withSlug("/client-portal/billing")}
                  className={`inline-flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-white shadow-sm min-h-11 shrink-0 ${
                    outstanding.overdueCount > 0
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  Pay
                </Link>
              </div>
              {/* CLI-I (CLI-30): last-receipt footer. Surfaces a
                  Download receipt link when the client has at
                  least one paid invoice on file alongside the
                  outstanding balance. Hidden when there's no
                  paid history to download. */}
              {lastPaidInvoice && (
                <a
                  href={`/api/invoices/${lastPaidInvoice.invoiceId}/receipt-pdf`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline self-start"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Download last receipt{lastPaidInvoice.invoiceNumber ? ` (${lastPaidInvoice.invoiceNumber})` : ""}
                </a>
              )}
            </div>
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
                    fmtMoney={fmtMoney}
                    unreadCount={unreadByOrder[o.id] || 0}
                    onMessage={(target) => {
                      setUnreadByOrder((prev) => ({ ...prev, [target.id]: 0 }));
                      setMessageOrder(target);
                    }}
                    paidInvoice={paidInvoiceByOrderId[o.id] || null}
                    onRebook={(target) => {
                      // Open the RebookDialog - it manages its own
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
          // hero band updates without a full refetch - the server
          // already flipped it to 'revised'.
          setQuotes((prev) =>
            prev.map((q) => (q.id === editsQuote?.id ? { ...q, status: "revised" } : q)),
          );
          setEditsQuote(null);
        }}
      />

      {/* CLI-J (CLI-31): per-order chat thread dialog. Renders the
          shared OrderClientChatPanel scoped to the selected order
          with sender_role="client". Two-way realtime is handled by
          the panel itself - posting a message also fires a tenant
          notification broadcast so admin + kitchen see it. */}
      <Dialog
        open={!!messageOrder}
        onOpenChange={(o) => {
          if (!o) setMessageOrder(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Message the team
              {messageOrder?.event_name ? ` - ${messageOrder.event_name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {messageOrder?.event_date
                ? `Event ${new Date(messageOrder.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}. We usually reply within working hours.`
                : "We usually reply within working hours."}
            </DialogDescription>
          </DialogHeader>
          {messageOrder && user?.id && company?.id && (
            <OrderClientChatPanel
              companyId={company.id}
              orderId={messageOrder.id}
              userId={user.id}
              senderRole="client"
              orderLabel={messageOrder.event_name || messageOrder.order_number || null}
            />
          )}
        </DialogContent>
      </Dialog>

      <ChatBot userRole="client" companyId={company?.id} />
    </>
  );
}

// CLI-A (client deep audit, CLI-3): defense-in-depth at the
// component layer. Driver / shopping / cleaning / kitchen all wrap
// in ProtectedRoute now; the client portal dashboard was the last
// staff/role surface relying purely on the inner loader returning
// empty when role/company didn't match. Admin trio admitted for
// "view as client" cross-tenant support.
export default function ClientPortalDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ClientPortalDashboardInner />
    </ProtectedRoute>
  );
}

// ── Hero card - the one piece that adapts to the phase ───────────────

function HeroCard({
  order,
  brandPrimary,
  brandSecondary,
  brandGradient,
  brandText,
  companyName,
  driverPin,
  fmtMoney,
  unreadCount,
  onMessage,
}: {
  order: Order;
  brandPrimary: string;
  brandSecondary: string;
  brandGradient: string;
  // CLI-I (CLI-29): the calendar event SUMMARY embeds the caterer's
  // name + the brand-coloured button is rendered with the same
  // contrast helper the rest of the dashboard uses, so the props
  // come through from the page rather than being recomputed here.
  brandText: "white" | "black";
  companyName: string;
  driverPin: DriverPin | null;
  // Wave 18: tenant currency formatter passed down from the parent
  // so the totals render in the actual tenant currency, not a
  // module-scope ZAR constant.
  fmtMoney: Intl.NumberFormat;
  // CLI-J (CLI-31): unread chat count + open-thread callback.
  unreadCount: number;
  onMessage: () => void;
}) {
  const copy = smartStatusCopy(order);
  const tone = STATUS_TONES[order.status] || STATUS_TONES.pending;
  const isLive = order.status === "in_transit";
  const t = timeUntil(order.event_date, order.event_time);

  // CLI-I (CLI-29): Add-to-calendar payload. Kept inline rather
  // than memoised because HeroCard is one element per dashboard
  // render. Skipped when the event is past - no point adding a
  // historical event to a calendar.
  const calendarEvent = !t.isPast
    ? {
        eventDate: order.event_date,
        eventTime: order.event_time,
        summary: order.event_name
          ? `${order.event_name} - ${companyName}`
          : `Catering by ${companyName}`,
        location: order.venue_address || order.venue_name || null,
        description: [
          order.event_name ? `Event: ${order.event_name}` : null,
          order.guest_count ? `Guests: ${order.guest_count}` : null,
          `Catered by ${companyName}`,
        ]
          .filter(Boolean)
          .join("\n"),
        orderNumber: order.order_number,
      }
    : null;

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
            <div className="flex items-center gap-2 flex-wrap">
              {driverPin?.driver_phone && (
                <a
                  href={`tel:${driverPin.driver_phone}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 backdrop-blur text-sm font-semibold hover:bg-white/30 transition min-h-11"
                >
                  <Phone className="w-4 h-4" />
                  Call {driverPin.driver_name?.split(" ")[0] || "driver"}
                </a>
              )}
              <button
                type="button"
                onClick={onMessage}
                className="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 backdrop-blur text-sm font-semibold hover:bg-white/30 transition min-h-11"
              >
                <MessageSquare className="w-4 h-4" />
                Message
                {unreadCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
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
        {/* CLI-I (CLI-29): Add to calendar on the in-transit
            variant too - a client tracking the truck may still want
            to drop the event into their calendar from the same
            screen. */}
        {calendarEvent && (
          <div className="px-5 sm:px-6 pb-4 -mt-1 flex">
            <AddToCalendarButton
              event={calendarEvent}
              brandPrimary={brandPrimary}
              brandText={brandText}
              variant="solid"
            />
          </div>
        )}
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className={`${tone} border capitalize text-xs`}>
              {order.status.replace(/_/g, " ")}
            </Badge>
            <button
              type="button"
              onClick={onMessage}
              className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/20 backdrop-blur text-xs font-semibold hover:bg-white/30 transition min-h-11"
            >
              <MessageSquare className="w-4 h-4" />
              Message
              {unreadCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
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

        {/* CLI-I (CLI-29): Add to calendar. Renders a brand-coloured
            solid button so it lands inside the hero's existing
            visual hierarchy. Hidden when the event is already past
            (calendarEvent === null). */}
        {calendarEvent && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex">
            <AddToCalendarButton
              event={calendarEvent}
              brandPrimary={brandPrimary}
              brandText={brandText}
              variant="solid"
            />
          </div>
        )}
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
  onMessage,
  unreadCount,
  slugPrefix,
  fmtMoney,
  paidInvoice,
}: {
  order: Order;
  brandPrimary: string;
  onRebook: (o: Order) => void;
  onRate: (o: Order, rating: number) => Promise<void> | void;
  // CLI-J: open the chat thread for this order.
  onMessage: (o: Order) => void;
  unreadCount: number;
  slugPrefix: string;
  fmtMoney: Intl.NumberFormat;
  // CLI-I (CLI-30): paid invoice for this order, if any. When
  // present the tile shows a small "Receipt" link in the footer
  // that downloads the receipt PDF for this order's invoice.
  paidInvoice: { invoiceId: string; invoiceNumber: string | null } | null;
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
          <div className="flex items-center gap-1" title={`You rated ${order.rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`w-5 h-5 ${n <= (order.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
              />
            ))}
          </div>
        ) : (
          // CLI-H (client deep audit, CLI-26 / CLI-58): interactive
          // stars were ~16x16px tap targets - far below the Apple HIG
          // 44px floor + impossible to land cleanly with a finger.
          // Now: each button is min-w-11 + min-h-11 with a bigger
          // w-6 h-6 star icon. Touch area scales the right way; the
          // visual row is still compact because the stars are
          // centred in the larger tap zone.
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
                  className="inline-flex items-center justify-center min-w-11 min-h-11 disabled:opacity-50"
                  aria-label={`Rate ${n} out of 5`}
                >
                  <Star
                    className={`w-6 h-6 ${filled ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
                  />
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMessage(order);
            }}
            className="relative text-xs font-semibold flex items-center gap-1 hover:underline min-h-11 px-2"
            style={{ color: brandPrimary }}
            aria-label="Message the team about this event"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Message
            {unreadCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {/* CLI-I (CLI-30): per-tile receipt link. Renders only
              when the tenant has a paid invoice linked to this
              order. The aria-label embeds the invoice number for
              screen readers; the visible label stays terse so it
              fits the narrow tile footer beside Rebook. */}
          {paidInvoice && (
            <a
              href={`/api/invoices/${paidInvoice.invoiceId}/receipt-pdf`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-semibold flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline min-h-11 px-2"
              aria-label={
                paidInvoice.invoiceNumber
                  ? `Download receipt ${paidInvoice.invoiceNumber}`
                  : "Download receipt"
              }
            >
              <Receipt className="w-3 h-3" />
              Receipt
            </a>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRebook(order);
            }}
            className="text-xs font-semibold flex items-center gap-1 hover:underline min-h-11 px-2"
            style={{ color: brandPrimary }}
          >
            <RotateCcw className="w-3 h-3" />
            Rebook
          </button>
        </div>
      </div>
    </div>
  );
}
