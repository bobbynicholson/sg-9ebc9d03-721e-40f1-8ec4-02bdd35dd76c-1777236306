/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Public client view of a single order. No login required -- the access
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
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar, Clock, MapPin, Users, Truck, CheckCircle2, AlertTriangle,
  Mail, Phone, Globe, Loader2, ShieldCheck, Sparkles, ChefHat, Receipt,
  Radar, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";

type OrderView = {
  ok: true;
  order: any;
  items: any[];
  company: any;
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
  useEffect(() => {
    if (!router.isReady || !orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (queryToken) {
          const r = await fetch("/api/client-tokens/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, token: queryToken }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data?.error || "Invalid link");
          if (cancelled) return;
          setView(data as OrderView);
          // Strip the token from the URL
          router.replace(`/c/order/${orderId}`, undefined, { shallow: true });
        } else {
          // No token in URL -- try the cookie
          const r = await fetch("/api/client-tokens/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data?.error || "Link expired");
          if (cancelled) return;
          setView(data as OrderView);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load this booking");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, orderId, queryToken]);

  // Apply branding -- company colours go on a CSS var the page reads
  const primary   = view?.company?.primary_color   || "#9333ea";
  const secondary = view?.company?.secondary_color || "#ec4899";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !view) {
    return (
      <>
        <NoIndexMeta />
        <Head><title>Booking link - CateringMS</title></Head>
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <Card className="max-w-md w-full border-0 shadow-lg">
            <CardContent className="pt-8 pb-6 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">This link can't be opened</h1>
              <p className="text-sm text-slate-600 mb-1">
                {error === "expired" ? "The link has expired." :
                 error === "revoked" ? "The catering company has revoked this link." :
                 "We couldn't verify this booking link."}
              </p>
              <p className="text-xs text-slate-500 mt-3">
                Ask the catering company to send you a fresh link.
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const { order, items, company } = view;
  const status = String(order.status || "").toLowerCase();
  const statusTone = STATUS_TONES[status] || STATUS_TONES.confirmed;
  const eventDate = new Date(order.event_date);
  const daysOut = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const fmtMoney = new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: order.currency || "ZAR", maximumFractionDigits: 0,
  });

  return (
    <>
      <NoIndexMeta />
      <Head><title>{`${order.event_name || "Your booking"} - ${company.company_name}`}</title></Head>

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
              <p className="text-xs uppercase tracking-wide text-white/70">Booking with</p>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
                <Stat icon={Calendar} label={daysOut > 0 ? `In ${daysOut} day${daysOut === 1 ? "" : "s"}` : daysOut === 0 ? "Today" : "Past"} value={eventDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} />
                <Stat icon={Clock} label="Start" value={order.event_time || "TBD"} />
                <Stat icon={Users} label="Guests" value={`${order.guest_count}`} />
                <Stat icon={Receipt} label="Payment" value={String(order.payment_status || "pending")} valueClass="capitalize" />
              </div>
            </CardContent>
          </Card>

          {/* Status timeline */}
          {status !== "cancelled" && (
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Where we're at</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  {STATUS_TIMELINE.map((step, i) => {
                    const idx = STATUS_TIMELINE.findIndex((s) => s.id === status);
                    const reached = idx >= i;
                    const isCurrent = idx === i;
                    const Icon = step.icon;
                    return (
                      <div key={step.id} className="flex-1 flex flex-col items-center text-center">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all ${
                            isCurrent ? "ring-4 ring-offset-2" : ""
                          }`}
                          style={{
                            background: reached ? primary : "#e2e8f0",
                            color: reached ? "white" : "#64748b",
                          }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[11px] font-medium ${reached ? "text-slate-900" : "text-slate-400"}`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
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

          {/* Menu / line items */}
          {Array.isArray(items) && items.length > 0 && (
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
                  <div className="flex items-center justify-between px-6 py-3 bg-slate-50">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="font-bold text-slate-900 tabular-nums">{fmtMoney.format(Number(order.total_amount || 0))}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Catering company contact */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Get in touch with {company.company_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {company.email && (
                <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Mail className="w-4 h-4" style={{ color: primary }} /> {company.email}
                </a>
              )}
              {company.phone && (
                <a href={`tel:${company.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Phone className="w-4 h-4" style={{ color: primary }} /> {company.phone}
                </a>
              )}
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener" className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
                  <Globe className="w-4 h-4" style={{ color: primary }} /> {company.website}
                </a>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-400">
            This is a private link to your booking. Anyone with the link can see this page, please don't share publicly.
          </p>
        </div>

        <Footer />
      </div>
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
