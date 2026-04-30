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
import Head from "next/head";
import {
  Calendar, Clock, MapPin, Users, ChefHat, Truck, CheckCircle2,
  Sparkles, ArrowRight, Receipt, Phone, MessageSquare,
  Loader2, PartyPopper, RotateCcw, Star, Send, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ClientNav } from "@/components/navigation/ClientNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ChatBot } from "@/components/ChatBot";
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
 *   3. null if there's nothing live
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
  return upcoming[0] || null;
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
    return { headline: "Event in progress", sub: "Hope it's going brilliantly." };
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
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverPin, setDriverPin] = useState<DriverPin | null>(null);

  // Rebook dialog state -- when the client taps "Rebook" on a past
  // event we open a modal that lets them confirm + add a quick note,
  // then write a row to leads so the catering company sees the request
  // in their pipeline.
  const [rebookOrder, setRebookOrder] = useState<Order | null>(null);
  const [rebookNote, setRebookNote] = useState("");
  const [rebookSending, setRebookSending] = useState(false);

  const submitRebookRequest = async () => {
    if (!rebookOrder || !user || !company?.id) return;
    setRebookSending(true);
    try {
      const noteParts: string[] = [];
      noteParts.push(`Rebook request via client portal.`);
      if (rebookOrder.event_name) noteParts.push(`Original event: ${rebookOrder.event_name}.`);
      if (rebookOrder.event_date) noteParts.push(`Original date: ${rebookOrder.event_date}.`);
      if (rebookOrder.guest_count) noteParts.push(`Guests: ${rebookOrder.guest_count}.`);
      if (rebookOrder.venue_address) noteParts.push(`Venue: ${rebookOrder.venue_address}.`);
      if (rebookNote.trim()) noteParts.push(`Client note: ${rebookNote.trim()}`);

      // RLS on leads requires company_id = caller's company_id, which is
      // already true for an authenticated client of this tenant.
      const { error } = await supabase.from("leads").insert({
        company_id: company.id,
        contact_name: profile?.full_name || user.full_name || user.email,
        email: user.email,
        phone: (profile as any)?.phone_number || null,
        event_type: rebookOrder.event_name || "Repeat booking",
        guest_count: rebookOrder.guest_count,
        venue_address: rebookOrder.venue_address,
        source: "client_portal_rebook",
        status: "new",
        notes: noteParts.join(" "),
      } as any);

      if (error) throw error;

      toast({
        title: "Request sent",
        description: `${company.company_name || "The team"} will be in touch shortly to plan your next event.`,
      });
      setRebookOrder(null);
      setRebookNote("");
    } catch (e: any) {
      toast({
        title: "Could not send rebook request",
        description: e?.message || "Try again in a moment, or call the catering company directly.",
        variant: "destructive",
      });
    } finally {
      setRebookSending(false);
    }
  };

  // Branding tones -- fall back to a calm emerald so unbranded companies
  // still look polished.
  const brandPrimary = company?.primary_color || "#059669";
  const brandSecondary = company?.secondary_color || "#10b981";
  const brandGradient = `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`;
  const brandSoftBg = `linear-gradient(135deg, ${brandPrimary}10 0%, ${brandSecondary}10 100%)`;
  const companyName = company?.company_name || profile?.company_name || "Your portal";
  const companyLogo = company?.logo_url || null;

  const greeting = useMemo(() => greetingFor(new Date()), []);
  const firstName = (profile?.full_name || user?.full_name || "").split(" ")[0] || "there";

  // ── Load orders for this client ─────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // Find every clients row this user owns. Catering companies
        // often create order rows before the user signs up (linked by
        // email only), and a single user might also have multiple
        // client rows under the same company through historical data
        // entry. We collect every candidate id and email so the orders
        // query catches all of them.
        const { data: clientRowsRaw } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id);
        const clientIds = ((clientRowsRaw as any[]) || []).map((r) => r.id);

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
  }, [user?.id, user?.email]);

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
        // gps_tracking schema: latitude, longitude, timestamp (not
        // lat/lng/last_updated). One row per ping; we want the freshest
        // for this driver.
        const { data: pin } = await supabase
          .from("gps_tracking")
          .select("latitude, longitude, timestamp")
          .eq("driver_id", headline.driver_id)
          .order("timestamp", { ascending: false })
          .limit(1)
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
          area -- no inner max-w cap.
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
                <Badge variant="outline" className="bg-white/15 border-white/30 text-white text-xs">
                  Rate a recent event
                </Badge>
              )}
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 space-y-6">
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
                href="/client-portal/tracking"
                tone={brandPrimary}
              />
              <ActionTile
                label="Invoice"
                icon={Receipt}
                href="/client-portal/billing"
                tone={brandPrimary}
              />
              <ActionTile
                label="Note for chef"
                icon={MessageSquare}
                href={`/client-portal/my-orders?focus=${headline.id}`}
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
            <section className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                  Past events
                </h2>
                <Link href="/client-portal/my-orders" className="text-sm font-medium" style={{ color: brandPrimary }}>
                  See all
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
                {pastOrders.map((o) => (
                  <PastEventTile
                    key={o.id}
                    order={o}
                    brandPrimary={brandPrimary}
                    onRebook={(target) => {
                      setRebookOrder(target);
                      setRebookNote("");
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {/*
        Rebook confirm dialog. Opens when the client taps Rebook on a
        past event tile. Submits a row to `leads` with the past order
        as context so the catering company sees the request in their
        sales pipeline (source = client_portal_rebook).
      */}
      <Dialog
        open={!!rebookOrder}
        onOpenChange={(o) => {
          if (!o) {
            setRebookOrder(null);
            setRebookNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" style={{ color: brandPrimary }} />
              Plan another event like this
            </DialogTitle>
            <DialogDescription>
              We'll send your details to {company?.company_name || "the team"} and they'll get back to you with a fresh quote.
            </DialogDescription>
          </DialogHeader>
          {rebookOrder && (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {rebookOrder.event_name || "Your past event"}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(rebookOrder.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
                  {rebookOrder.guest_count ? ` • ${rebookOrder.guest_count} guests` : ""}
                </p>
                {rebookOrder.venue_address && (
                  <p className="text-xs text-slate-500 truncate">{rebookOrder.venue_address}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Anything different this time? <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Textarea
                  value={rebookNote}
                  onChange={(e) => setRebookNote(e.target.value)}
                  placeholder="e.g. larger guest list, different venue, dietary changes..."
                  className="min-h-[88px] text-sm"
                  maxLength={1000}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRebookOrder(null);
                setRebookNote("");
              }}
              disabled={rebookSending}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitRebookRequest}
              disabled={rebookSending}
              className="text-white"
              style={{ background: brandGradient }}
            >
              {rebookSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1.5" />
                  Send request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
}: {
  order: Order;
  brandPrimary: string;
  onRebook: (o: Order) => void;
}) {
  const date = new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="snap-start flex-shrink-0 w-[260px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition">
      {/*
        The whole card is browseable -- the inner Link wraps just the
        summary so a click on the Rebook button at the bottom doesn't
        navigate. This keeps "go look at the order" and "request a
        rebook" as two separate intents.
      */}
      <Link href={`/client-portal/my-orders?focus=${order.id}`} className="block">
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
          <span className="text-xs text-slate-400">Not yet rated</span>
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
