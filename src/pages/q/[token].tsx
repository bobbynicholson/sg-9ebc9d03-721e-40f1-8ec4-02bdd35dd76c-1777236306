/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /q/[token] -- public quote view.
 *
 * No login required. Anyone with the URL sees the quote; the URL
 * carries an unguessable uuid as the token. Lets the catering
 * company send a single link the client opens on any device and
 * accepts in one click.
 *
 * What the page does:
 *   - Loads the quote + company branding via fetchByToken
 *   - Stamps viewed_at the first time the page renders
 *   - Renders a branded, spit-braai-style view (warm palette, big
 *     serif headlines, signature feel) in screen mode, and a clean
 *     printer-friendly version in print mode
 *   - Accept button collects the acceptor's name then stamps
 *     accepted_at + flips status to 'accepted'
 *   - 'Download PDF' uses the browser's native print dialog so we
 *     don't need a server-side renderer or a new dependency. The
 *     print CSS strips chrome (header background, navigation,
 *     accept button) and produces a clean A4-shaped output the
 *     operator saves as PDF and attaches to email / WhatsApp.
 *
 * URL flag: /q/[token]?print=1 auto-fires the print dialog after
 * the quote loads. Used by the admin 'Download PDF' button so the
 * operator opens, prints, attaches without an extra click.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, MapPin, Calendar, Users, Loader2, AlertCircle,
  Printer, MessageSquare, ArrowRight, Pencil, X,
} from "lucide-react";
import {
  fetchByToken, recordView, recordAccept, submitChangeRequest,
  type PublicQuoteView,
} from "@/services/publicQuoteService";

// Phase 5 #10: per-tenant currency formatter. The Intl 'currency'
// style honours each currency's standard symbol + grouping (so GBP
// shows £, USD shows $, EUR shows €, ZAR shows R). Locale is hung
// off the currency code -- en-GB for GBP / EUR works for ZAR too;
// for USD / AUD we prefer en-US.
function fmtMoneyFor(code: string | null | undefined): (n: number) => string {
  const safe = (code && ["ZAR", "USD", "EUR", "GBP", "AUD"].includes(code) ? code : "ZAR") as
    "ZAR" | "USD" | "EUR" | "GBP" | "AUD";
  const locale =
    safe === "USD" ? "en-US" :
    safe === "AUD" ? "en-AU" :
    safe === "GBP" ? "en-GB" :
    safe === "EUR" ? "en-GB" :
    "en-ZA";
  const f = new Intl.NumberFormat(locale, { style: "currency", currency: safe, maximumFractionDigits: 0 });
  return (n: number) => f.format(n || 0);
}

/**
 * Convert "#f59e0b" -> "245 158 11". Tailwind's bg-brand-primary
 * utility expects the rgb triplet form so it can layer alpha
 * (bg-brand-primary/10). Returns null on invalid input so we leave
 * the globals.css default in place.
 */
function hexToRgbTriplet(hex: string | null | undefined): string | null {
  if (!hex || typeof hex !== "string") return null;
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/**
 * Build the company name initials for a logo fallback. "Spit Braai
 * Delivery" -> "SB". Caps at two letters.
 */
function companyInitials(name: string | null | undefined): string {
  if (!name) return "C";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function PublicQuotePage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;
  const autoPrint = router.query.print === "1";

  const [quote, setQuote] = useState<PublicQuoteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Accept flow
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptName, setAcceptName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

  // Wave 21 audit: Decline flow. Used to be missing entirely -- the
  // client could only Accept or Request changes; saying "no thanks"
  // meant emailing the caterer. Quotes sat in the operator's
  // In-play bucket until they expired, masking conversion stats.
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [justDeclined, setJustDeclined] = useState(false);

  const handleDecline = async () => {
    if (!token) return;
    setDeclining(true);
    setDeclineError(null);
    try {
      const r = await fetch(`/api/public/quotes/${encodeURIComponent(token)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason.trim() || null }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        setDeclineError(data?.error || "Could not decline the quote right now.");
        return;
      }
      setJustDeclined(true);
      setDeclineOpen(false);
      if (quote) setQuote({ ...quote, status: "rejected" });
    } catch (e: any) {
      setDeclineError(e?.message || "Try again");
    } finally {
      setDeclining(false);
    }
  };

  // Request-changes flow. Inline expansion (matches accept-flow
  // precedent + plays nicely with mobile keyboards) rather than a
  // Dialog. Caterers commonly receive 1-3 requests per quote --
  // "drop the dessert", "add 20 guests", "shift to a Saturday".
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesName, setChangesName] = useState("");
  const [changesMessage, setChangesMessage] = useState("");
  const [changesEventDate, setChangesEventDate] = useState("");
  const [changesGuestCount, setChangesGuestCount] = useState("");
  const [changesMenu, setChangesMenu] = useState("");
  const [changesSubmitting, setChangesSubmitting] = useState(false);
  const [changesError, setChangesError] = useState<string | null>(null);
  const [changesSent, setChangesSent] = useState(false);

  // Apply per-tenant brand colours. The public page is unauthenticated
  // so BrandingContext (which keys off the logged-in user's company_id)
  // is not available -- we set the CSS vars directly on documentElement
  // once fetchByToken returns. Falls back to the globals.css defaults
  // when a tenant hasn't picked colours yet.
  useEffect(() => {
    if (!quote?.company) return;
    const root = document.documentElement;
    const apply = (key: string, hex: string | null) => {
      if (!hex) return;
      const rgb = hexToRgbTriplet(hex);
      if (!rgb) return;
      root.style.setProperty(`--brand-${key}`, hex);
      root.style.setProperty(`--brand-${key}-rgb`, rgb);
    };
    apply("primary",   quote.company.primary_color);
    apply("secondary", quote.company.secondary_color);
    apply("accent",    quote.company.accent_color);
  }, [quote?.company]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchByToken(token);
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setQuote(data);
      setLoading(false);
      // Fire-and-forget viewed_at stamp.
      recordView(token, data.viewed_at).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Auto-print when the admin 'Download PDF' button opens us with
  // ?print=1. Wait for the quote to render so the print preview
  // captures the full content.
  useEffect(() => {
    if (!autoPrint || !quote || loading) return;
    const t = setTimeout(() => {
      try { window.print(); } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [autoPrint, quote, loading]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    const res = await recordAccept({ token, acceptedByName: acceptName.trim() });
    setAccepting(false);
    if (!res.ok) {
      setAcceptError(res.error || "Could not accept the quote, please try again.");
      return;
    }
    setJustAccepted(true);
    setAcceptOpen(false);
    if (quote) {
      setQuote({ ...quote, accepted_at: new Date().toISOString(), status: "accepted" });
    }
  };

  const handleSubmitChanges = async () => {
    if (!token) return;
    if (changesMessage.trim().length < 10) {
      setChangesError("Please give us at least 10 characters so we know what to change.");
      return;
    }
    setChangesSubmitting(true);
    setChangesError(null);
    const res = await submitChangeRequest({
      token,
      message: changesMessage.trim(),
      submitterName: changesName.trim() || quote?.client_name || null,
      requestedChanges: {
        event_date: changesEventDate || null,
        guest_count: changesGuestCount.trim()
          ? Number.parseInt(changesGuestCount, 10)
          : null,
        menu_changes: changesMenu.trim() || null,
      },
    });
    setChangesSubmitting(false);
    if (!res.ok) {
      setChangesError(res.error || "Could not send your message, please try again.");
      return;
    }
    setChangesSent(true);
    setChangesOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <Card className="max-w-md">
          <CardContent className="py-8 px-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <h1 className="text-lg font-semibold text-stone-900">Quote not found</h1>
            <p className="text-sm text-stone-600">
              The link looks broken, or the quote has been removed. Reach out to the catering company to ask for a fresh link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const company = quote.company;
  const companyName = company?.company_name || "Your caterer";
  // Phase 5 #10: tenant currency. Lives on company.currency now;
  // ZAR fallback for legacy rows where it's NULL.
  const fmtMoney = fmtMoneyFor((company as any)?.currency || "ZAR");
  const companyAddress = [company?.address_line1, company?.address_line2, company?.city]
    .filter(Boolean).join(", ") || null;
  const accepted = !!quote.accepted_at;
  // VAT-aware labelling. SARS rule: VAT-registered businesses issue
  // 'Tax Invoice' (and the document must show their VAT number).
  // Everyone else issues a plain Quote / Invoice. The caterer flips
  // these via /admin/company-profile -> VAT registration toggle.
  const vatRegistered = !!company?.vat_registered;
  const vatNumber = company?.vat_number || null;
  const registrationNumber = (company as any)?.registration_number || null;
  const eventDate = quote.event_date
    ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null;
  // Optional start time + setup time. Stored as HH:MM on the quote;
  // render as 5pm / 5:30pm so the client sees a friendly version
  // under the event date.
  const friendlyTime = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const [hStr, mStr] = String(raw).split(":");
    const h = Number(hStr);
    const m = Number(mStr || 0);
    if (!Number.isFinite(h)) return null;
    const period = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
  };
  const eventTime = friendlyTime((quote as any).event_time);
  const setupTime = friendlyTime((quote as any).setup_time);
  const validUntil = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null;
  // Days remaining until quote validity expires. Surfaces a chip at
  // the top of the page so the client sees the deadline before they
  // scroll. Negative when already expired.
  const daysToExpiry = quote.valid_until
    ? Math.ceil((new Date(quote.valid_until).getTime() - Date.now()) / 86_400_000)
    : null;
  const expiryChipTone =
    daysToExpiry === null
      ? null
      : daysToExpiry < 0
      ? "expired"
      : daysToExpiry <= 3
      ? "soon"
      : "ok";
  const expiryChipLabel =
    daysToExpiry === null
      ? null
      : daysToExpiry < 0
      ? `Expired ${validUntil}`
      : daysToExpiry === 0
      ? "Expires today"
      : daysToExpiry === 1
      ? "Expires tomorrow"
      : `Expires in ${daysToExpiry} days`;
  const total = Number(quote.total ?? quote.total_amount ?? 0);
  const today = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

  // The quote is the trusted source for the public view. While in
  // flight, syncOrderArtifacts mirrors order edits across header,
  // menu_items and totals atomically. Once accepted, the quote is
  // frozen (orderSyncService skips the quote mirror), so what the
  // client sees stays equal to what they signed. No reconciliation
  // needed here -- read values directly.
  const displayGuestCount = quote.guest_count;

  return (
    <>
      <Head>
        <title>{`Quote ${quote.quote_number} from ${companyName}`}</title>
        <meta name="robots" content="noindex, nofollow" />
        {/* Print-friendly styling. Browser-native Save as PDF gives
            us a clean A4-style export with no extra dependencies. */}
        <style>{`
          /* Force browsers to honour the brand colour on the printed
             quote -- without this Chrome/Edge default to "background
             graphics off" and the tenant header prints as plain white.
             html selector is for Safari (which sometimes ignores the
             body-level rule on print). */
          @media print {
            html, body, .brand-print {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body { background: white !important; }
            .no-print { display: none !important; }
            .print-shadow-none { box-shadow: none !important; }
            .print-border-none { border: none !important; }
            .print-bg-white { background: white !important; }
            /* Avoid splitting the branded header across pages on Safari
               which doesn't honour break-inside on flex children unless
               page-break-inside is set explicitly. */
            .brand-print { page-break-inside: avoid; break-inside: avoid; }
            @page { margin: 16mm; }
          }
        `}</style>
      </Head>

      <div className="min-h-screen bg-stone-50 print-bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

          {/* Floating action bar -- screen only */}
          <div className="no-print flex items-center justify-between gap-2 mb-4 flex-wrap">
            {expiryChipLabel && !accepted ? (
              <Badge
                className={
                  expiryChipTone === "expired"
                    ? "bg-red-100 text-red-800 border border-red-200 gap-1.5"
                    : expiryChipTone === "soon"
                    ? "bg-amber-100 text-amber-800 border border-amber-200 gap-1.5"
                    : "bg-stone-100 text-stone-700 border border-stone-200 gap-1.5"
                }
              >
                <Calendar className="w-3.5 h-3.5" />
                {expiryChipLabel}
              </Badge>
            ) : <span />}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Download PDF
            </Button>
          </div>

          {/* BRANDED HEADER --
              White-label per tenant: header band tinted with the
              company's primary colour, logo (or initials fallback),
              serif headline. Reads like a printed quote on the
              caterer's letterhead, not a generic SaaS page. */}
          <div className="brand-print bg-brand-primary/10 border border-brand-primary/30 rounded-xl p-6 sm:p-8 mb-4 print-shadow-none">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  {company?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={company.logo_url}
                      alt={`${companyName} logo`}
                      className="h-10 w-auto max-w-[180px] object-contain"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm">
                      {companyInitials(companyName)}
                    </div>
                  )}
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-primary font-bold">
                    {companyName}
                  </p>
                </div>
                <h1 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 leading-tight">
                  {quote.quote_name || `Quote for ${quote.client_name || "your event"}`}
                </h1>
                <p className="text-sm text-stone-600 mt-2">
                  Reference <span className="font-mono">{quote.quote_number}</span> · prepared {today}
                </p>
                {registrationNumber && (
                  <p className="text-xs text-stone-500 mt-1">
                    Reg No: <span className="font-mono">{registrationNumber}</span>
                  </p>
                )}
                {vatRegistered && vatNumber && (
                  <p className="text-xs text-stone-500 mt-0.5">
                    VAT Reg No: <span className="font-mono">{vatNumber}</span>
                  </p>
                )}
              </div>
              {accepted ? (
                <Badge className="bg-emerald-600 text-white border-0 gap-1 px-3 py-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Accepted
                </Badge>
              ) : (
                /* Wave 26.2: clicking the status pill anchor-scrolls
                   the client down to the bottom action panel where
                   they can accept / tweak / decline. Most quotes are
                   long enough that the action buttons are below the
                   fold, and the previous static badge gave no hint
                   that there was anything to do. Smooth scroll to
                   #quote-actions so the client lands on the buttons
                   instead of being dropped to the page bottom. */
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("quote-actions");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="brand-print bg-brand-primary text-white border-0 px-3 py-1.5 text-sm rounded-full font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 cursor-pointer"
                  aria-label="Jump to response options"
                >
                  Awaiting your response
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* EVENT DETAILS */}
          <Card className="mb-4 border border-stone-200 shadow-sm print-shadow-none">
            <CardContent className="py-5 px-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {quote.client_name && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold">For</p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">{quote.client_name}</p>
                </div>
              )}
              {eventDate && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Event date
                  </p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">
                    {eventDate}{eventTime ? ` -- ${eventTime} start` : ""}
                  </p>
                  {setupTime && setupTime !== eventTime && (
                    <p className="text-xs text-stone-600 mt-0.5">
                      Setup / arrival: <span className="font-semibold text-stone-900">{setupTime}</span>
                    </p>
                  )}
                </div>
              )}
              {displayGuestCount != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold flex items-center gap-1">
                    <Users className="w-3 h-3" /> Guests
                  </p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">{displayGuestCount}</p>
                </div>
              )}
              {quote.venue_address && (
                <div className="sm:col-span-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-brand-primary font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Venue
                  </p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">{quote.venue_address}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* MENU ITEMS */}
          {Array.isArray(quote.menu_items) && quote.menu_items.length > 0 && (
            <Card className="mb-4 border border-stone-200 shadow-sm print-shadow-none">
              <CardContent className="py-5 px-5">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-3">
                  From the kitchen
                </p>
                <div className="space-y-2">
                  {quote.menu_items.map((item: any, i: number) => {
                    const name = item?.name || item?.menu_item_name || `Item ${i + 1}`;
                    const description = item?.description || item?.notes || null;
                    const unitPrice = Number(item?.unit_price ?? item?.price ?? 0);
                    const qty = Number(item?.quantity ?? item?.qty ?? 1);
                    const lineTotal = Number(item?.total ?? unitPrice * qty);
                    return (
                      <div key={i} className="flex justify-between gap-3 text-sm py-2 border-b border-stone-100 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-900">{name}</p>
                          {description && (
                            <p className="text-xs text-stone-500 mt-0.5">{description}</p>
                          )}
                          {qty > 1 && (
                            <p className="text-xs text-stone-500 mt-0.5">
                              {qty} x {fmtMoney(unitPrice)}
                            </p>
                          )}
                        </div>
                        <p className="text-stone-900 font-semibold tabular-nums shrink-0">
                          {fmtMoney(lineTotal)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* EQUIPMENT */}
          {Array.isArray(quote.equipment_items) && quote.equipment_items.length > 0 && (
            <Card className="mb-4 border border-stone-200 shadow-sm print-shadow-none">
              <CardContent className="py-5 px-5">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-3">
                  Equipment
                </p>
                <div className="space-y-2">
                  {quote.equipment_items.map((item: any, i: number) => {
                    const name = item?.name || `Equipment ${i + 1}`;
                    const qty = item?.quantity ?? item?.qty ?? 1;
                    const lineTotal = Number(item?.total ?? Number(item?.unit_price ?? 0) * qty);
                    return (
                      <div key={i} className="flex justify-between gap-3 text-sm py-2 border-b border-stone-100 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-900">{name}</p>
                          {qty > 1 && (
                            <p className="text-xs text-stone-500">{qty} x</p>
                          )}
                        </div>
                        {lineTotal > 0 && (
                          <p className="text-stone-900 font-semibold tabular-nums shrink-0">
                            {fmtMoney(lineTotal)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* TOTALS -- spit-braai accent bar.

              Wave 12 audit: the totals card needs to AGREE with the
              line items shown above it. For inc-VAT tenants the
              line item unit_prices are gross (what the client pays
              per item), so the "Items" line on the totals card has
              to be the gross sum too -- not subtotal-minus-delivery,
              which is the ex-VAT extraction and reads ~15% lower.

              Switch by tenant pricing convention:
                - inc-VAT: Items = total - delivery (gross), Delivery,
                  Total (gross) shown. VAT is shown as a small "(VAT
                  included)" hint, not added on top.
                - ex-VAT: legacy display kept -- Items = subtotal -
                  delivery (net), Delivery, Subtotal (ex-VAT), VAT
                  added on top, Total. */}
          {(() => {
            const incVat = (company as any)?.pricing_includes_vat === true;
            const deliveryFee = Number((quote as any).delivery_fee || 0);
            const persistedSubtotal = Number(quote.subtotal || 0);
            const persistedTax = Number(quote.tax_amount || 0);
            const persistedTotal = total;
            const discount = Number(quote.discount_amount || 0);
            // Items figure for the totals card. Under inc-VAT we show
            // gross (= total - delivery); under ex-VAT we show net
            // (= subtotal - delivery).
            const itemsLine = incVat
              ? Math.max(0, persistedTotal - deliveryFee)
              : Math.max(0, persistedSubtotal - deliveryFee);
            return (
              <Card className="mb-4 border border-stone-200 shadow-sm print-shadow-none">
                <CardContent className="py-5 px-5 space-y-2">
                  {deliveryFee > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-600">Items</span>
                        <span className="text-stone-900 tabular-nums">
                          {fmtMoney(itemsLine)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-600">Delivery</span>
                        <span className="text-stone-900 tabular-nums">
                          {fmtMoney(deliveryFee)}
                        </span>
                      </div>
                    </>
                  ) : null}

                  {discount > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-600">Subtotal</span>
                        <span className="text-stone-900 tabular-nums">
                          {fmtMoney(
                            (incVat ? persistedTotal : persistedSubtotal) + discount,
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-600">Discount</span>
                        <span className="text-emerald-700 tabular-nums">
                          -{fmtMoney(discount)}
                        </span>
                      </div>
                    </>
                  ) : (
                    !incVat && (
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-600">Subtotal</span>
                        <span className="text-stone-900 tabular-nums">
                          {fmtMoney(persistedSubtotal)}
                        </span>
                      </div>
                    )
                  )}

                  {!incVat && persistedTax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-600">
                        VAT {company?.vat_rate ? `(${Number(company.vat_rate).toFixed(0)}%)` : ""}
                      </span>
                      <span className="text-stone-900 tabular-nums">{fmtMoney(persistedTax)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-bold text-xl pt-3 border-t-2 border-brand-primary">
                    <span className="text-stone-900 font-serif">
                      Total{vatRegistered ? " incl. VAT" : ""}
                    </span>
                    <span className="text-brand-primary tabular-nums">{fmtMoney(persistedTotal)}</span>
                  </div>

                  {incVat && persistedTax > 0 && (
                    <p className="text-[11px] text-stone-500 text-right pt-1">
                      Includes VAT {company?.vat_rate ? `(${Number(company.vat_rate).toFixed(0)}%)` : ""} of {fmtMoney(persistedTax)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* TERMS + valid-until -- kept above the accept block so the
              client reads the legal context before signing. The free-form
              "A note from us" message moved below the footer (per Bobby's
              call) so it doesn't compete with the totals + accept CTA. */}
          {(quote.terms_and_conditions || validUntil) && (
            <Card className="mb-4 border border-stone-200 shadow-sm print-shadow-none">
              <CardContent className="py-5 px-5 space-y-4">
                {quote.terms_and_conditions && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-1.5">Terms</p>
                    <p className="text-xs text-stone-600 whitespace-pre-wrap">{quote.terms_and_conditions}</p>
                  </div>
                )}
                {validUntil && (
                  <p className="text-[11px] text-stone-500">Valid until {validUntil}.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ACCEPT -- screen only, hidden in print */}
          <div className="no-print">
            {accepted ? (
              <Card className="border-0 bg-gradient-to-br from-emerald-50 to-brand-primary/10 shadow-sm">
                <CardContent className="py-8 px-5 text-center space-y-5">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-600 shadow-lg">
                    <CheckCircle2 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-serif font-bold text-emerald-900">
                      {justAccepted
                        ? `Thanks${acceptName ? `, ${acceptName.split(" ")[0]}` : ""} -- you're booked in`
                        : "Quote accepted"}
                    </h2>
                    <p className="text-sm text-emerald-800 mt-1.5 max-w-md mx-auto">
                      {companyName} has been notified. Here's what happens from here.
                    </p>
                  </div>

                  {/* Next-steps timeline. Three concrete steps so the
                      client knows they're not in a black hole. */}
                  <ol className="text-left max-w-md mx-auto space-y-3">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">Confirmation email</p>
                        <p className="text-xs text-stone-600">A copy of this quote and the next steps will arrive in your inbox shortly.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">Deposit invoice</p>
                        <p className="text-xs text-stone-600">{companyName} will send the deposit invoice to lock in your event date.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">
                          {eventDate ? `Event day -- ${eventDate}` : "Event day"}
                        </p>
                        <p className="text-xs text-stone-600">We'll be in touch the week before with final headcount + final tweaks.</p>
                      </div>
                    </li>
                  </ol>

                  <div className="pt-2 border-t border-emerald-200 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                      className="gap-1.5 text-stone-700"
                    >
                      <Printer className="w-4 h-4" />
                      Save a copy of this quote
                    </Button>
                    {/* Post-acceptance, the "tweak something" path is
                        the primary interaction left -- catering plans
                        commonly shift in the week or two after sign-off
                        (final guest count, dietary additions). Surface
                        it as a peer to "Save a copy". */}
                    {!changesSent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setChangesOpen(true); setChangesError(null); }}
                        className="gap-1.5 text-stone-700"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Need to tweak something?
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-6 px-5">
                  {acceptOpen ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-stone-900">Confirm acceptance</p>
                      <p className="text-sm text-stone-600">
                        Type your name to lock this in. {companyName} will follow up with the deposit invoice.
                      </p>
                      <Input
                        value={acceptName}
                        onChange={(e) => setAcceptName(e.target.value)}
                        placeholder="Your full name"
                        autoFocus
                      />
                      {acceptError && (
                        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2">
                          <p className="text-xs text-rose-700 font-medium">{acceptError}</p>
                          <p className="text-[11px] text-rose-600 mt-1">
                            Tap accept again to retry. If it keeps failing, refresh the page or contact {companyName} directly.
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => { setAcceptOpen(false); setAcceptError(null); }} disabled={accepting}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAccept}
                          disabled={accepting || !acceptName.trim()}
                          className="bg-brand-primary hover:opacity-90 gap-1.5"
                        >
                          {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {accepting ? "Accepting..." : acceptError ? "Try again" : "Accept quote"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Wave 26.2: anchor target for the "Awaiting your
                    // response" pill at the top + restructured action
                    // row. Three buttons of equal weight, Accept first
                    // + green so the eye lands on the commitment
                    // action immediately. The previous layout buried
                    // Tweak + Decline as plain text links underneath,
                    // which felt invisible (clients didn't know they
                    // could decline) or sketchy ("am I sure I'm
                    // allowed to push back?"). Three buttons give
                    // every client a clear choice.
                    <div id="quote-actions" className="text-center space-y-4 scroll-mt-24">
                      {validUntil && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 inline-block">
                          This quote is valid until <strong>{validUntil}</strong>.
                        </p>
                      )}
                      <p className="text-sm text-stone-700">
                        Happy with the quote? Hit accept and {companyName} will send the deposit invoice.
                      </p>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
                        {/* Primary -- Accept. Green so it reads as
                            "go" without depending on the tenant's
                            brand colour (which can be anything). */}
                        <Button
                          onClick={() => setAcceptOpen(true)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 px-6 shadow-sm"
                          size="lg"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Accept this quote
                        </Button>
                        {/* Secondary -- Tweak. Neutral outline. Hidden
                            once the inline change-request form is
                            already open or a request has been sent
                            (don't double-prompt). */}
                        {!changesSent && !changesOpen && (
                          <Button
                            variant="outline"
                            onClick={() => { setChangesOpen(true); setChangesError(null); }}
                            className="gap-1.5 px-6 border-stone-300 hover:bg-stone-50"
                            size="lg"
                          >
                            <Pencil className="w-4 h-4" />
                            Need a tweak
                          </Button>
                        )}
                        {/* Tertiary -- Decline. Rose-tinted outline so
                            it's clearly a refusal action without
                            shouting. Hidden once already declined
                            (justDeclined) or the quote was already
                            rejected server-side. */}
                        {!justDeclined && quote.status !== "rejected" && (
                          <Button
                            variant="outline"
                            onClick={() => { setDeclineOpen(true); setDeclineError(null); }}
                            className="gap-1.5 px-6 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                            size="lg"
                          >
                            <X className="w-4 h-4" />
                            Decline
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* DECLINE inline form -- screen only. Mirrors the request-
              changes block's inline-expansion pattern. */}
          {(declineOpen || justDeclined) && (
            <div className="no-print mt-4">
              {justDeclined ? (
                <Card className="border-0 bg-stone-50 shadow-sm">
                  <CardContent className="py-6 px-5 text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-stone-700">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-base font-semibold text-stone-900">
                      Thanks for letting {companyName} know
                    </h3>
                    <p className="text-sm text-stone-600">
                      We've closed this quote on our side. If anything changes, just reply to the original email.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-5 px-5 space-y-3">
                    <p className="text-sm font-semibold text-stone-900">Decline this quote</p>
                    <p className="text-sm text-stone-600">
                      No need to give a reason if you'd rather not. A quick line just helps {companyName} learn what didn't fit.
                    </p>
                    <textarea
                      rows={3}
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      placeholder="Optional -- e.g. went with another option, budget didn't work, postponing..."
                      className="w-full px-3 py-2 rounded-md border border-stone-300 text-sm"
                      autoFocus
                    />
                    {declineError && (
                      <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2">
                        <p className="text-xs text-rose-700 font-medium">{declineError}</p>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => { setDeclineOpen(false); setDeclineError(null); }} disabled={declining}>
                        Back
                      </Button>
                      <Button
                        onClick={handleDecline}
                        disabled={declining}
                        variant="outline"
                        className="text-rose-700 border-rose-200 hover:bg-rose-50 gap-1.5"
                      >
                        {declining ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {declining ? "Sending..." : "Send decline"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* REQUEST-CHANGES inline form -- screen only.
              Sits below the accept block so it's reachable both pre-
              and post-acceptance. Inline expansion (matches accept
              flow) over a Dialog so mobile keyboards don't crop it. */}
          {(changesOpen || changesSent) && (
            <div className="no-print mt-4">
              {changesSent ? (
                <Card className="border-0 bg-blue-50 shadow-sm">
                  <CardContent className="py-6 px-5 text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-base font-semibold text-stone-900">
                      Got it -- {companyName} will be in touch shortly
                    </h3>
                    <p className="text-sm text-stone-600 max-w-md mx-auto">
                      Your message has been sent. They'll usually reply within a working day.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-6 px-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">Request changes</p>
                      <p className="text-xs text-stone-600 mt-0.5">
                        Tell {companyName} what you'd like adjusted. They'll send a fresh quote.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label htmlFor="changes-message" className="text-xs font-medium text-stone-700">
                          What would you like changed? *
                        </label>
                        <Textarea
                          id="changes-message"
                          value={changesMessage}
                          onChange={(e) => setChangesMessage(e.target.value)}
                          rows={4}
                          placeholder='e.g. "Could you swap the chicken option for a vegetarian alternative? And see if we can drop guest count to 80."'
                          className="mt-1"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="changes-event-date" className="text-xs font-medium text-stone-700">
                            New event date (optional)
                          </label>
                          <Input
                            id="changes-event-date"
                            type="date"
                            value={changesEventDate}
                            onChange={(e) => setChangesEventDate(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label htmlFor="changes-guests" className="text-xs font-medium text-stone-700">
                            New guest count (optional)
                          </label>
                          <Input
                            id="changes-guests"
                            type="number"
                            min={0}
                            value={changesGuestCount}
                            onChange={(e) => setChangesGuestCount(e.target.value)}
                            placeholder="e.g. 80"
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="changes-menu" className="text-xs font-medium text-stone-700">
                          Specific menu changes (optional)
                        </label>
                        <Input
                          id="changes-menu"
                          value={changesMenu}
                          onChange={(e) => setChangesMenu(e.target.value)}
                          placeholder="e.g. swap chicken for veg option"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <label htmlFor="changes-name" className="text-xs font-medium text-stone-700">
                          Your name (optional)
                        </label>
                        <Input
                          id="changes-name"
                          value={changesName}
                          onChange={(e) => setChangesName(e.target.value)}
                          placeholder={quote.client_name || "Your name"}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    {changesError && (
                      <p className="text-xs text-rose-600">{changesError}</p>
                    )}

                    <div className="flex gap-2 justify-end pt-1">
                      <Button
                        variant="outline"
                        onClick={() => { setChangesOpen(false); setChangesError(null); }}
                        disabled={changesSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSubmitChanges}
                        disabled={changesSubmitting || changesMessage.trim().length < 10}
                        className="bg-brand-primary hover:opacity-90 gap-1.5"
                      >
                        {changesSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                        {changesSubmitting ? "Sending..." : "Send to caterer"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* COMPANY FOOTER */}
          {company && (company.email || company.phone || companyAddress) && (
            <div className="mt-8 text-center text-xs text-stone-500 space-y-0.5">
              <p className="font-bold text-stone-700">{companyName}</p>
              {company.email && <p>{company.email}</p>}
              {company.phone && <p>{company.phone}</p>}
              {companyAddress && <p>{companyAddress}</p>}
            </div>
          )}

          {/* A NOTE FROM US -- sits below the address footer so it
              reads like a personal sign-off rather than competing with
              the totals + accept CTA above. */}
          {quote.notes && (
            <Card className="mt-6 border border-stone-200 shadow-sm print-shadow-none">
              <CardContent className="py-5 px-5">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-primary font-bold mb-1.5">
                  A note from us
                </p>
                <p className="text-sm text-stone-700 whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </>
  );
}
