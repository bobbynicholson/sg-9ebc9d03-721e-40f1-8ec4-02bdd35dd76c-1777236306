/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Public client view of a single order. No login required - the access
 * token in the URL (or the cookie set by it) is the auth.
 *
 * Flow:
 *   1. First visit:    /c/order/{id}?t=ord_xxxxx -> POST /validate -> cookie set, redirect to /c/order/{id}
 *   2. Repeat visits:  /c/order/{id} -> POST /view -> reads cookie -> renders
 *   3. Bad/expired:    error screen with "Ask the catering company for a fresh link"
 *
 * Page is fully branded by the catering company (logo + primary/secondary
 * colours read from companies row). The catering company's name/email/
 * phone show up at the top so the client knows exactly who's catering.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar, Clock, MapPin, Users, Truck, CheckCircle2, AlertTriangle,
  Mail, Phone, Globe, Loader2, ShieldCheck, Sparkles, ChefHat, Receipt,
  Radar, ArrowRight, Send,
} from "lucide-react";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { computeOrderTimeline, toClientTimeline } from "@/services/order/orderTimeline";
import { TimelineTrack } from "@/components/admin/orders/TimelineTrack";
// Wave 28.4: route the magic-link cancel button through the new
// 3-step Cancellation Companion. The wizard owns the consequence
// preview + payout choice; this page just opens it and POSTs the
// payload to the existing /api/client-tokens/cancel-order endpoint.
import { CancellationWizard } from "@/components/cancellation/CancellationWizard";
// Wave 33: full client-facing order editor (menu / equipment / guests /
// venue / timing). Replaces the old guest-count-only amend panel. Submits
// the whole edit as one proposed_changes payload; the caterer approves it
// and the existing amendment cascade does the money / quote / notify work.
import { OrderEditDialog } from "@/components/order/OrderEditDialog";

type OrderView = {
  ok: true;
  order: any;
  items: any[];
  company: any;
  // Wave 19: live unpaid invoice (if any) so the magic-link page
  // can render Pay buttons. Null when the order has no outstanding
  // invoice.
  invoice?: {
    id: string;
    invoice_number: string;
    public_token: string;
    total_amount: number;
    amount_paid: number;
    balance_due: number;
    status: string;
    due_date: string | null;
  } | null;
  token: { expires_at: string; scope: string };
};

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

const STATUS_TIMELINE = [
  { id: "confirmed",  label: "Confirmed",  icon: CheckCircle2 },
  { id: "preparing",  label: "Preparing",  icon: ChefHat },
  { id: "ready",      label: "Ready",      icon: Sparkles },
  { id: "in_transit", label: "On the way", icon: Truck },
  { id: "delivered",  label: "Delivered",  icon: CheckCircle2 },
];

export default function ClientOrderPage() {
  const router = useRouter();
  const orderId = router.query.id as string | undefined;
  const queryToken = router.query.t as string | undefined;

  const [view, setView] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 1: if there's a ?t= param, validate it and set the cookie,
  // then strip the token from the URL.
  // Load the order view. `silent` = background refresh (no spinner, don't
  // clobber the page with an error if a poll blips) so the page can
  // auto-update without flicker.
  const loadView = useCallback(async (opts?: { silent?: boolean }) => {
    if (!orderId) return;
    if (!opts?.silent) { setLoading(true); setError(null); }
    try {
      let r: Response;
      if (queryToken) {
        // TIGHTEN I.126 (2026-06-03): token is bound to one order with a
        // 24h TTL, so we keep it in the URL (survives refresh/share) and
        // validate server-side.
        let urlSlug = "";
        if (typeof window !== "undefined") {
          const parts = window.location.pathname.split("/").filter(Boolean);
          if (parts.length >= 4 && parts[1] === "c" && parts[2] === "order") {
            urlSlug = parts[0];
          }
        }
        r = await fetch("/api/client-tokens/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId, token: queryToken, slug: urlSlug || undefined }),
        });
      } else {
        // No token in URL - try the cookie.
        r = await fetch("/api/client-tokens/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        });
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ? `${data.error}: ${data.detail}` : (data?.error || (queryToken ? "Invalid link" : "Link expired")));
      setView(data as OrderView);
      if (opts?.silent) setError(null);
    } catch (e: any) {
      // A background poll failing (transient) shouldn't blank the page the
      // client is reading - only surface errors on the foreground load.
      if (!opts?.silent) setError(e?.message || "Could not load this booking");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [orderId, queryToken]);

  useEffect(() => {
    if (!router.isReady) return;
    void loadView();
  }, [router.isReady, loadView]);

  // Live updates without a manual refresh: poll the order every 20s and
  // on tab focus. This page is a token/magic-link surface (no Supabase
  // session), so realtime postgres_changes is blocked by RLS - polling is
  // the reliable way to keep the status + timeline current as the kitchen
  // / driver advance the order. Silent so it never flickers or shows a
  // spinner over what the client is reading.
  useEffect(() => {
    if (!router.isReady || !orderId) return;
    const t = setInterval(() => { void loadView({ silent: true }); }, 20000);
    const onFocus = () => { void loadView({ silent: true }); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [router.isReady, orderId, loadView]);

  // Apply branding - company colours go on a CSS var the page reads
  const primary   = view?.company?.primary_color   || "#9333ea";
  const secondary = view?.company?.secondary_color || "#ec4899";

  // Wave 20 audit: lightweight Cancel + Amend dialogs so the magic-link
  // client can act on their order without signing in. Both go through
  // token-bearer API endpoints (cookie set by /api/client-tokens/validate
  // is the auth surface). Local UI state only - the request body is
  // hand-built per dialog rather than dragging in a heavier form lib.
  // Wave 28.4: cancel goes through the new CancellationWizard now.
  // The inline panel below is kept for postpone-only - the cancel
  // path opens a Dialog with Reason -> Consequences -> Payout choice.
  const [cancelOpen, setCancelOpen] = useState(false);
  // cancelType locked to "postpone" for this inline panel; cancel
  // routes through wizardOpen instead.
  const cancelType = "postpone" as const;
  const [cancelReason, setCancelReason] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardJustDone, setWizardJustDone] = useState(false);

  // Wave 33: full editor dialog (replaces the old inline guest-count panel).
  const [editOpen, setEditOpen] = useState(false);
  const [editJustDone, setEditJustDone] = useState(false);

  async function submitCancel() {
    if (!view?.order?.id) return;
    setCancelBusy(true);
    setCancelMsg(null);
    try {
      const r = await fetch("/api/client-tokens/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: view.order.id,
          request_type: cancelType,
          reason: cancelReason.trim() || null,
          requested_postpone_date: cancelType === "postpone" ? postponeDate : null,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        setCancelMsg({ tone: "err", text: data?.error || `Request failed (${r.status})` });
        return;
      }
      setCancelMsg({
        tone: "ok",
        text: cancelType === "cancel"
          ? `We've received your cancellation. The team will email shortly.${data.refund_preview ? ` Refund preview: ${data.currency || "ZAR"} ${Number(data.refund_preview).toFixed(2)}.` : ""}`
          : "We've received your postponement request. The team will confirm shortly.",
      });
    } catch (e: any) {
      setCancelMsg({ tone: "err", text: e?.message || "Try again" });
    } finally {
      setCancelBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !view) {
    return <ExpiredLinkCard reason={error} />;
  }

  const { order, items, company, invoice } = view;
  const status = String(order.status || "").toLowerCase();
  const statusTone = STATUS_TONES[status] || STATUS_TONES.confirmed;
  // Friendly payment label that AGREES with the pay page (/pay/i/[token])
  // and the deposit flags, instead of the raw enum ("partial"). Prefer the
  // invoice's paid/balance figures; fall back to the order's deposit flag.
  const paidToDate = Number((invoice as any)?.amount_paid ?? 0);
  const balanceDue = Number((invoice as any)?.balance_due ?? 0);
  const paymentLabel = invoice
    ? balanceDue <= 0 && paidToDate > 0
      ? "Paid"
      : paidToDate > 0
        ? "Deposit paid"
        : "Awaiting payment"
    : order.deposit_paid
      ? "Deposit paid"
      : String(order.payment_status || "").toLowerCase() === "paid"
        ? "Paid"
        : "Awaiting payment";
  const eventDate = new Date(order.event_date);
  const daysOut = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const fmtMoney = new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: order.currency || "ZAR", maximumFractionDigits: 0,
  });

  return (
    <>
      <NoIndexMeta />
      {/* TIGHTEN I.113: page header reads "Your order" not "Your
          booking" - matches Bobby's "client portal should label this
          as Order once a quote is converted" requirement. */}
      <Head><title>{`${order.event_name || "Your order"} - ${company.company_name}`}</title></Head>

      <div
        className="min-h-screen"
        style={{
          background: `linear-gradient(135deg, ${primary}08 0%, ${secondary}08 100%)`,
        }}
      >
        {/* Branded header */}
        <div
          className="px-4 py-6 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
        >
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={company.company_name} className="w-12 h-12 rounded-lg bg-white/90 object-contain p-1" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-white/70">Your order with</p>
              <h1 className="text-xl sm:text-2xl font-bold truncate">{company.company_name}</h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/80">
              <ShieldCheck className="w-4 h-4" />
              <span>Private link</span>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {/*
            Sign-in nudge, bridges the read-only token view into the
            full /client-portal experience (live driver tracking, real-
            time status, billing). The catering company's brand colours
            stay, this card uses a soft tinted version, not the full
            gradient, so the headline event card below stays the focal
            point.

            The link pre-fills the email so the user sees one tap on
            the login page (`Email me a sign-in link` button).
          */}
          {company.slug && (
            <Card
              className="border-0 shadow-lg overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${primary}10 0%, ${secondary}10 100%)`,
                borderLeft: `4px solid ${primary}`,
              }}
            >
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
                >
                  <Radar className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm sm:text-base">
                    Want live tracking on the day?
                  </p>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-0.5">
                    Sign in for free, we'll email a magic link. Then watch your driver on the map, see ETA, and tap to call.
                  </p>
                </div>
                <Link
                  href={`/${company.slug}/client/login?email=${encodeURIComponent(order.client_email || "")}&next=${encodeURIComponent(`/client-portal/tracking?orderId=${order.id}`)}`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90 flex-shrink-0 w-full sm:w-auto justify-center"
                  style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
                >
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Event headline */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <Badge variant="outline" className={`${statusTone} border capitalize mb-2`}>
                    {status.replace("_", " ")}
                  </Badge>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {order.event_name || "Your event"}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">Order #{order.order_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: primary }}>
                    {fmtMoney.format(Number(order.total_amount || 0))}
                  </p>
                </div>
              </div>

              {/* Wave 60 - 5-stat grid (was 4): added Setup time so the
                  client knows when the team will arrive on-site. Pre-Wave-60
                  the client only saw the event Start and had to email to
                  ask "what time are you arriving to set up?". */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5 pt-5 border-t border-slate-100">
                <Stat icon={Calendar} label={daysOut > 0 ? `In ${daysOut} day${daysOut === 1 ? "" : "s"}` : daysOut === 0 ? "Today" : "Past"} value={eventDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} />
                <Stat icon={Clock} label="Event start" value={order.event_time || "TBD"} />
                {order.setup_time && (
                  <Stat icon={Clock} label="Setup arrives" value={String(order.setup_time)} />
                )}
                <Stat icon={Users} label="Guests" value={`${order.guest_count}`} />
                <Stat icon={Receipt} label="Payment" value={paymentLabel} />
              </div>
            </CardContent>
          </Card>

          {/* Status timeline - Wave 26: replaced the legacy 5-step
              row with the same TimelineTrack the admin sees, projected
              down to ~9 client-friendly stages via toClientTimeline().
              The client now sees the full lifecycle the operator
              tracks (deposit received, preparing, on the way,
              delivered, equipment collected if applicable, balance
              received, all wrapped up) instead of just the 5 status
              dots that didn't tell them whether their deposit had
              landed or what was happening between confirmed and
              in-transit. */}
          {status !== "cancelled" && (
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Where we're at</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Wave 60 - pass the related rows from the
                  // RPC. Pre-Wave-60 the timeline computed from
                  // order columns alone, which meant
                  // "Preparing your food" + "Equipment collected"
                  // could never advance because they read
                  // kitchen_prep_tasks + driver_assignments.
                  // Now: client sees the same stage statuses the
                  // admin sees, exactly when they advance.
                  const operatorTl = computeOrderTimeline({
                    order,
                    payments: (view as any)?.payments || [],
                    driverAssignments: (view as any)?.driver_assignments || [],
                    kitchenPrepTasks: (view as any)?.kitchen_prep_tasks || [],
                    equipmentBookings: (view as any)?.equipment_bookings || [],
                    invoices: invoice ? [invoice] : [],
                  });
                  const clientTl = toClientTimeline(operatorTl);
                  // Wave 70.49e - hide the operator glossary in the
                  // per-stage tooltip ("Completes when / All
                  // kitchen_prep_tasks marked done / Owner: Head chef"
                  // etc). That copy is internal operational language;
                  // clients should never see table names or role
                  // assignments.
                  return <TimelineTrack timeline={clientTl} hideOperatorGlossary />;
                })()}
              </CardContent>
            </Card>
          )}

          {/* Venue */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" style={{ color: primary }} />
                Venue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {order.venue_name && <p className="font-semibold text-slate-900">{order.venue_name}</p>}
              <p className="text-slate-700">{order.venue_address}</p>
              {order.venue_contact_person && (
                <p className="text-xs text-slate-500 mt-2">
                  Contact on the day: {order.venue_contact_person}
                  {order.venue_contact_phone && ` · ${order.venue_contact_phone}`}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Menu / line items + full money breakdown.
              Wave 60 - pre-Wave-60 the client jumped from line-item
              prices straight to "Total" with no transparency on
              subtotal, discount, delivery, or VAT. Bobby's request:
              "wheres the vat and delivery, and all info for the
              order? I want everything here for the client to be up
              to date". Now: every component of the total is shown
              when present, so the client can reconcile the maths
              themselves and never wonder "what's the R200 for". */}
          {Array.isArray(items) && items.length > 0 && (() => {
            // Compute the line-item subtotal locally as a fallback
            // when order.subtotal isn't on the magic-link payload.
            const computedSubtotal = items.reduce(
              (s: number, it: any) => s + Number(it.line_total || 0),
              0,
            );
            const subtotal = Number(order.subtotal ?? computedSubtotal) || 0;
            const discount = Number(order.discount_amount || 0);
            const deliveryFee = Number(order.delivery_fee || 0);
            const taxAmount = Number(order.tax_amount ?? order.tax ?? 0);
            const total = Number(order.total_amount || 0);
            return (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ChefHat className="w-4 h-4" style={{ color: primary }} />
                    What we're catering
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {items.map((it: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{it.item_name}</p>
                          {it.special_instructions && (
                            <p className="text-xs text-slate-500 mt-0.5">{it.special_instructions}</p>
                          )}
                        </div>
                        <div className="text-right tabular-nums flex-shrink-0">
                          <p className="text-slate-700">{it.quantity} × {fmtMoney.format(Number(it.unit_price || 0))}</p>
                          <p className="text-xs text-slate-500">{fmtMoney.format(Number(it.line_total || 0))}</p>
                        </div>
                      </div>
                    ))}
                    {/* Breakdown: every line only renders when there's a
                        non-zero value to show, so a no-discount /
                        no-delivery / VAT-inclusive order doesn't pad
                        the receipt with R0.00 lines. */}
                    {subtotal > 0 && (
                      <div className="flex items-center justify-between px-6 py-2 text-sm bg-slate-50/60">
                        <span className="text-slate-600">Subtotal</span>
                        <span className="text-slate-700 tabular-nums">{fmtMoney.format(subtotal)}</span>
                      </div>
                    )}
                    {discount > 0 && (
                      <div className="flex items-center justify-between px-6 py-2 text-sm bg-slate-50/60">
                        <span className="text-emerald-700">Discount</span>
                        <span className="text-emerald-700 tabular-nums">-{fmtMoney.format(discount)}</span>
                      </div>
                    )}
                    {deliveryFee > 0 && (
                      <div className="flex items-center justify-between px-6 py-2 text-sm bg-slate-50/60">
                        <span className="text-slate-600">
                          Delivery
                          {Number(order.delivery_distance_km) > 0 && (
                            <span className="text-xs text-slate-500 ml-1">
                              ({Number(order.delivery_distance_km).toFixed(1)} km)
                            </span>
                          )}
                        </span>
                        <span className="text-slate-700 tabular-nums">{fmtMoney.format(deliveryFee)}</span>
                      </div>
                    )}
                    {Number(order.collection_fee) > 0 && (
                      <div className="flex items-center justify-between px-6 py-2 text-sm bg-slate-50/60">
                        <span className="text-slate-600">
                          Collection
                          {Number(order.collection_distance_km) > 0 && (
                            <span className="text-xs text-slate-500 ml-1">
                              ({Number(order.collection_distance_km).toFixed(1)} km)
                            </span>
                          )}
                        </span>
                        <span className="text-slate-700 tabular-nums">{fmtMoney.format(Number(order.collection_fee))}</span>
                      </div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex items-center justify-between px-6 py-2 text-sm bg-slate-50/60">
                        <span className="text-slate-600">VAT</span>
                        <span className="text-slate-700 tabular-nums">{fmtMoney.format(taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-6 py-3 bg-slate-100">
                      <span className="font-semibold text-slate-900">Total</span>
                      <span className="font-bold text-slate-900 text-lg tabular-nums">{fmtMoney.format(total)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Payment summary */}
          {(order.deposit_amount || order.balance_amount) && (
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4" style={{ color: primary }} />
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {order.deposit_amount && (
                  <Row label={`Deposit ${order.deposit_paid ? "(paid)" : "(due)"}`} value={fmtMoney.format(Number(order.deposit_amount))} paid={order.deposit_paid} />
                )}
                {order.balance_amount && (
                  <Row label={`Balance ${order.balance_paid ? "(paid)" : order.balance_due_date ? `(due ${new Date(order.balance_due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })})` : "(due)"}`} value={fmtMoney.format(Number(order.balance_amount))} paid={order.balance_paid} />
                )}
                {/* Wave 19: Pay button when there's an outstanding invoice.
                    Routes through the public /pay/i/{token} flow which is
                    itself token-bearer auth - no sign-in needed. Only
                    renders when invoice.balance_due > 0 AND status is
                    actionable (sent / partially_paid / overdue). */}
                {invoice && Number(invoice.balance_due) > 0 && (
                  <a
                    href={`/pay/i/${invoice.public_token}`}
                    className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
                  >
                    <Receipt className="w-4 h-4" />
                    Pay {fmtMoney.format(Number(invoice.balance_due))} now
                  </a>
                )}
                {/* TIGHTEN I.113: Download invoice PDF button. Available
                    whenever an invoice exists (paid OR unpaid) so the
                    client can keep a copy for their records. Opens the
                    pay page with ?print=1 which auto-fires the browser
                    print dialog (set up in /pay/i/[token] as part of
                    this same PR). */}
                {invoice && (
                  <a
                    href={`/pay/i/${invoice.public_token}?print=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Download invoice {invoice.invoice_number || ""}
                  </a>
                )}
                {invoice && Number(invoice.balance_due) > 0 && (
                  <p className="text-[11px] text-slate-500 text-center mt-1">
                    Secure pay link for invoice {invoice.invoice_number}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Wave 19: live driver tracking. Token-bearer hint - when
              the order is in_transit AND we have venue coords, surface
              the existing /client-portal/tracking page. The page itself
              still requires sign-in for the live map (it's the existing
              auth-gated experience), but the button + clear copy beats
              "Sign in for free" buried at the top. */}
          {status === "in_transit" && (
            <Card className="border-0 shadow-lg" style={{ borderLeft: `4px solid ${primary}` }}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
                  >
                    <Truck className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm sm:text-base">
                      Your driver is on the way
                    </p>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      Sign in to your portal for the live map + ETA + tap-to-call.
                    </p>
                  </div>
                  {company.slug && (
                    <Link
                      href={`/${company.slug}/client/login?email=${encodeURIComponent(order.client_email || "")}&next=${encodeURIComponent(`/client-portal/tracking?orderId=${order.id}`)}`}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-md hover:opacity-90 transition-opacity flex-shrink-0 w-full sm:w-auto text-center"
                      style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
                    >
                      Track live
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Special / dietary */}
          {(order.special_instructions || order.dietary_requirements) && (
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Special notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                {order.special_instructions && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Instructions</p>
                    <p className="whitespace-pre-line">{order.special_instructions}</p>
                  </div>
                )}
                {order.dietary_requirements && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Dietary</p>
                    <p className="whitespace-pre-line">{order.dietary_requirements}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Wave 20 audit: Need to change something? card. Lightweight
              token-bearer Cancel + Amend so the magic-link client can
              act without signing in. Hidden when the order is in a
              terminal state since neither action makes sense then. */}
          {!["cancelled", "completed", "delivered"].includes(status) && (
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Need to change something?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditOpen(true);
                      setCancelOpen(false);
                    }}
                    className="w-full"
                  >
                    Request a change
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCancelOpen((v) => !v);
                    }}
                    className="w-full text-amber-700 border-amber-200 hover:bg-amber-50"
                  >
                    Postpone
                  </Button>
                </div>

                {/* Wave 28.4: dedicated full-width Cancel button that opens
                    the wizard. Sits below the Amend/Postpone duo so
                    it's distinct - a destructive action shouldn't
                    share visual weight with a benign one. */}
                <Button
                  variant="outline"
                  onClick={() => {
                    setWizardOpen(true);
                    setCancelOpen(false);
                  }}
                  className="w-full text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  Cancel this order
                </Button>

                {cancelOpen && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Postpone this booking</p>
                    {/* Client persona follow-up (client.md 5.2):
                        consequence preview that mirrors the
                        CancellationWizard's shape - what happens to
                        deposit, what gets carried, what's at risk.
                        The original copy was just "deposit travels
                        with you" which hides edge cases
                        (postponement notice window, the caterer's
                        right to refuse). Now matches the cancel
                        wizard's tone. */}
                    <div className="rounded-md bg-white/60 border border-amber-200 px-3 py-2 text-xs text-slate-700 space-y-1">
                      <p className="font-medium text-slate-900">What happens when you postpone</p>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                        <li>Your deposit moves to the new date - no refund processed, nothing forfeit.</li>
                        <li>The team reviews the new date and confirms by email. If they can't cover it they'll suggest alternatives.</li>
                        <li>Same-week postponements may incur a committed-cost charge (shopping already done, kitchen prep started). The team will tell you on review.</li>
                      </ul>
                    </div>
                    <p className="text-xs text-slate-600">
                      Pick a new date and the team will confirm by email.
                    </p>
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">New event date</label>
                      <input
                        type="date"
                        value={postponeDate}
                        min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                        onChange={(e) => setPostponeDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">Reason (optional)</label>
                      <textarea
                        rows={2}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Anything the team should know..."
                        className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
                      />
                    </div>
                    {cancelMsg && (
                      <p className={`text-xs ${cancelMsg.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
                        {cancelMsg.text}
                      </p>
                    )}
                    <Button
                      onClick={submitCancel}
                      disabled={
                        cancelBusy ||
                        (cancelMsg?.tone === "ok") ||
                        !postponeDate
                      }
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {cancelBusy ? "Sending..." : cancelMsg?.tone === "ok" ? "Sent" : "Send postponement request"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Catering company contact. Client persona follow-up
              (client.md 5.7): defensive fallback when the company
              hasn't filled in email + phone + website at all. Rare
              case (admin email is required at signup) but possible
              for tenants who haven't completed onboarding. */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Get in touch with {company.company_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {company.email && (
                <a
                  href={`mailto:${company.email}?subject=${encodeURIComponent(`Booking ${order.order_number || order.id}`)}`}
                  className="flex items-center gap-2 text-slate-700 hover:text-slate-900 min-h-11 py-1"
                >
                  <Mail className="w-4 h-4" style={{ color: primary }} /> {company.email}
                </a>
              )}
              {company.phone && (
                <a href={`tel:${company.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-slate-900 min-h-11 py-1">
                  <Phone className="w-4 h-4" style={{ color: primary }} /> {company.phone}
                </a>
              )}
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener" className="flex items-center gap-2 text-slate-700 hover:text-slate-900 min-h-11 py-1">
                  <Globe className="w-4 h-4" style={{ color: primary }} /> {company.website}
                </a>
              )}
              {!company.email && !company.phone && !company.website && (
                <p className="text-sm text-slate-500 italic">
                  No contact info on file. Reply to your booking-confirmation email if you need to reach the team.
                </p>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-400">
            This is a private link to your booking. Anyone with the link can see this page, please don't share publicly.
          </p>
        </div>

        <Footer />
      </div>

      {/* Wave 33: full order editor. Loads the catalogue + current lines,
          lets the client edit menu / equipment / guests / venue / timing,
          and submits one proposed_changes payload to amend-order. */}
      {view?.order && (
        <OrderEditDialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o && editJustDone) window.location.reload();
          }}
          orderId={view.order.id}
          primary={primary}
          secondary={secondary}
          onSubmitted={() => setEditJustDone(true)}
        />
      )}

      {/* Wave 28.4: Cancellation Companion. Posts to the existing
          token-bearer endpoint - the wizard owns the UX, the API
          handles the side-effects (cascade, refund/credit, audit). */}
      {view?.order && (
        <CancellationWizard
          open={wizardOpen}
          onOpenChange={(o) => {
            setWizardOpen(o);
            if (!o && wizardJustDone) {
              // Refresh on close after a successful cancel so the
              // page status flips and the action card hides.
              window.location.reload();
            }
          }}
          mode="order"
          companyName={view.company?.company_name || "the catering team"}
          companyPhone={view.company?.phone || null}
          termsInput={{
            amountPaid: Number(view.order.amount_paid) || 0,
            depositAmount: Number(view.order.deposit_amount) || 0,
            depositPaid: !!view.order.deposit_paid,
            eventDate: view.order.event_date || new Date().toISOString().slice(0, 10),
            status: view.order.status || "pending",
            kitchenPrepStarted: !!view.order.kitchen_prep_started_at,
            shoppingDone: !!view.order.shopping_completed_at,
            dispatched: ["out_for_delivery", "in_transit", "delivered"].includes(view.order.status),
            policy: (view.company?.cancellation_policy as any) || {},
            legacyCancelFeePct: Number(view.company?.cancellation_fee_percent) || undefined,
          }}
          onSubmit={async (payload) => {
            const r = await fetch("/api/client-tokens/cancel-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_id: view.order.id,
                request_type: "cancel",
                reason: payload.reason || payload.reason_category,
                payout_choice: payload.payout_choice,
                credit_amount: payload.credit_amount,
                committed_cost_note: payload.committed_cost_note,
              }),
            });
            const data = await r.json();
            if (!r.ok || !data?.ok) {
              throw new Error(data?.error || `Cancellation failed (${r.status})`);
            }
            setWizardJustDone(true);
          }}
        />
      )}
    </>
  );
}

function Stat({ icon: Icon, label, value, valueClass = "" }: any) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <p className={`font-semibold text-slate-900 ${valueClass}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, paid }: { label: string; value: string; paid?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${paid ? "text-emerald-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}

/**
 * Client persona follow-up: previously this error card was a dead end -
 * "Ask the catering company to send you a fresh link." Now offers a
 * self-serve recovery: the user enters their email and we POST to
 * /api/client-tokens/request which is rate-limited (3/min/email) and
 * always returns 200 for privacy.
 *
 * TIGHTEN I.122 (2026-06-03): the "Catering company URL" input is GONE.
 * Clients had no way to know that string and the field was a UX
 * dead-end. We now:
 *   - read the slug invisibly from the URL when it's slug-prefixed
 *   - pass it on the request alongside the email, OR
 *   - let the server look up every tenant that has this email on file
 *     and email a recovery link for each.
 *
 * See docs/personas/client.md section 5.1.
 */
function ExpiredLinkCard({ reason }: { reason: string | null }) {
  const router = useRouter();
  // Read slug invisibly from the URL. Path patterns:
  //   /c/order/[id]            - root tenant, no slug
  //   /{slug}/c/order/[id]     - slug-prefixed (the common case
  //                              after the tenant rewrite chain)
  const detectedSlug = (() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length >= 4 && parts[1] === "c" && parts[2] === "order") {
      return parts[0];
    }
    return "";
  })();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const handleRequest = async () => {
    setFormErr(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormErr("Enter a valid email.");
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch("/api/client-tokens/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Slug is passed invisibly when we have it; server falls back
        // to looking up tenants by email when missing.
        body: JSON.stringify({
          email: cleanEmail,
          ...(detectedSlug ? { company_slug: detectedSlug } : {}),
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setSent(true);
    } catch (e: any) {
      setFormErr(e?.message || "Couldn't request a fresh link. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Booking link - CateringMS</title></Head>
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <Card className="max-w-md w-full border-0 shadow-lg">
          <CardContent className="pt-8 pb-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Your booking link has expired</h1>
              {/* TIGHTEN I.123 (2026-06-03): explain WHY they're here.
                  Booking links cookie for 24 hours after the first
                  click. After that, the canonical recovery is to
                  click the original email link again - that ALWAYS
                  works because the email URL is permanent and just
                  re-mints a fresh session token on each click. The
                  magic-link form below is the fallback for people who
                  no longer have the email handy. */}
              <p className="text-sm text-slate-600">
                {reason === "expired" ? "The session for this booking link has expired." :
                 reason === "revoked" ? "The catering company has revoked this link." :
                 "We couldn't verify your booking link."}
              </p>
              <p className="text-xs text-slate-500 mt-3">
                Booking links stay valid for 24 hours after you first open them.
                After that, we ask for your email again as a security check.
              </p>
            </div>

            <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <p className="font-medium">Got the email with your quote or order?</p>
              <p className="mt-1 text-blue-800">
                Just click the link in that email again - it'll open this booking with a fresh secure session, no extra steps.
              </p>
            </div>

            {sent ? (
              <div className="mt-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-emerald-900">Check your inbox</p>
                <p className="text-xs text-emerald-800 mt-1">
                  If we have an order on file for that email, a fresh link is on its way.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
                <p className="text-sm text-slate-700 font-medium">Or, request a fresh secure link</p>
                <p className="text-[11px] text-slate-500">
                  Lost the original email? Enter the address you booked with and we'll send a new one.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="freshlink-email" className="text-xs text-slate-600">Your email</Label>
                  <Input
                    id="freshlink-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    autoFocus
                  />
                </div>
                {formErr && (
                  <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2">
                    <p className="text-xs text-rose-700">{formErr}</p>
                  </div>
                )}
                <Button
                  onClick={handleRequest}
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? "Sending..." : "Email me a fresh link"}
                </Button>
                <p className="text-[11px] text-slate-500 text-center">
                  For privacy we don't confirm whether your email is on file. If it is, a link will arrive within a minute.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
