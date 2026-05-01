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
 *   - Renders a clean branded view (header, line items, total, terms)
 *   - Accept button collects the acceptor's name then stamps
 *     accepted_at + flips status to 'accepted'
 *
 * Future hooks (Phase 4 design pass + Phase 3 PDF):
 *   - Spit-braai-style branded look will land here
 *   - 'Download PDF' button will sit alongside Accept
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, MapPin, Calendar, Users, Loader2, AlertCircle,
} from "lucide-react";
import { fetchByToken, recordView, recordAccept, type PublicQuoteView } from "@/services/publicQuoteService";

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

export default function PublicQuotePage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  const [quote, setQuote] = useState<PublicQuoteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Accept flow
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptName, setAcceptName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md">
          <CardContent className="py-8 px-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
            <h1 className="text-lg font-semibold text-slate-900">Quote not found</h1>
            <p className="text-sm text-slate-600">
              The link looks broken, or the quote has been removed. Reach out to the catering company to ask for a fresh link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const company = quote.company;
  const companyName = company?.company_name || "Your caterer";
  const companyAddress = [company?.address_line1, company?.address_line2, company?.city]
    .filter(Boolean).join(", ") || null;
  const accepted = !!quote.accepted_at;
  const eventDate = quote.event_date
    ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const validUntil = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <>
      <Head>
        <title>{`Quote ${quote.quote_number} from ${companyName}`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

          {/* HEADER */}
          <div className="mb-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{companyName}</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                  {quote.quote_name || `Quote ${quote.quote_number}`}
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Reference <span className="font-mono">{quote.quote_number}</span>
                </p>
              </div>
              {accepted ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-0 gap-1 px-3 py-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Accepted
                </Badge>
              ) : (
                <Badge className="bg-blue-100 text-blue-800 border-0 px-3 py-1.5 text-sm">
                  Awaiting your response
                </Badge>
              )}
            </div>
          </div>

          {/* EVENT DETAILS */}
          <Card className="mb-4 border-0 shadow-sm">
            <CardContent className="py-5 px-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {quote.client_name && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">For</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{quote.client_name}</p>
                </div>
              )}
              {eventDate && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Event date
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{eventDate}</p>
                </div>
              )}
              {quote.guest_count != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
                    <Users className="w-3 h-3" /> Guests
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{quote.guest_count}</p>
                </div>
              )}
              {quote.venue_address && (
                <div className="sm:col-span-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Venue
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{quote.venue_address}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* MENU ITEMS */}
          {Array.isArray(quote.menu_items) && quote.menu_items.length > 0 && (
            <Card className="mb-4 border-0 shadow-sm">
              <CardContent className="py-5 px-5">
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
                  Menu
                </p>
                <div className="space-y-2">
                  {quote.menu_items.map((item: any, i: number) => {
                    const name = item?.name || item?.menu_item_name || `Item ${i + 1}`;
                    const qty = item?.quantity ?? item?.qty ?? 1;
                    const unitPrice = Number(item?.unit_price ?? item?.price ?? 0);
                    const lineTotal = Number(item?.total ?? unitPrice * qty);
                    return (
                      <div key={i} className="flex justify-between gap-3 text-sm py-1.5 border-b border-slate-100 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900">{name}</p>
                          {qty > 1 && (
                            <p className="text-xs text-slate-500">
                              {qty} x {fmtMoney.format(unitPrice)}
                            </p>
                          )}
                        </div>
                        <p className="text-slate-900 font-medium tabular-nums shrink-0">
                          {fmtMoney.format(lineTotal)}
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
            <Card className="mb-4 border-0 shadow-sm">
              <CardContent className="py-5 px-5">
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
                  Equipment
                </p>
                <div className="space-y-2">
                  {quote.equipment_items.map((item: any, i: number) => {
                    const name = item?.name || `Equipment ${i + 1}`;
                    const qty = item?.quantity ?? item?.qty ?? 1;
                    const lineTotal = Number(item?.total ?? Number(item?.unit_price ?? 0) * qty);
                    return (
                      <div key={i} className="flex justify-between gap-3 text-sm py-1.5 border-b border-slate-100 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900">{name}</p>
                          {qty > 1 && (
                            <p className="text-xs text-slate-500">{qty} x</p>
                          )}
                        </div>
                        {lineTotal > 0 && (
                          <p className="text-slate-900 font-medium tabular-nums shrink-0">
                            {fmtMoney.format(lineTotal)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* TOTALS */}
          <Card className="mb-4 border-0 shadow-sm">
            <CardContent className="py-5 px-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="text-slate-900 tabular-nums">{fmtMoney.format(quote.subtotal || 0)}</span>
              </div>
              {!!quote.discount_amount && quote.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="text-emerald-700 tabular-nums">-{fmtMoney.format(quote.discount_amount)}</span>
                </div>
              )}
              {!!quote.tax_amount && quote.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">VAT</span>
                  <span className="text-slate-900 tabular-nums">{fmtMoney.format(quote.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200">
                <span className="text-slate-900">Total</span>
                <span className="text-slate-900 tabular-nums">{fmtMoney.format(quote.total || quote.total_amount || 0)}</span>
              </div>
            </CardContent>
          </Card>

          {/* NOTES + T&Cs */}
          {(quote.notes || quote.terms_and_conditions) && (
            <Card className="mb-4 border-0 shadow-sm">
              <CardContent className="py-5 px-5 space-y-4">
                {quote.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Notes</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{quote.notes}</p>
                  </div>
                )}
                {quote.terms_and_conditions && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Terms</p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap">{quote.terms_and_conditions}</p>
                  </div>
                )}
                {validUntil && (
                  <p className="text-[11px] text-slate-500">Valid until {validUntil}.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ACCEPT */}
          {accepted ? (
            <Card className="border-0 bg-emerald-50 shadow-sm">
              <CardContent className="py-6 px-5 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h2 className="text-base font-semibold text-emerald-900">
                  {justAccepted ? "Thanks, your quote is accepted!" : "Quote accepted"}
                </h2>
                <p className="text-sm text-emerald-800">
                  {companyName} will be in touch shortly with the next steps. Keep an eye on your inbox.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-6 px-5">
                {acceptOpen ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Confirm acceptance</p>
                    <p className="text-sm text-slate-600">
                      Type your name to lock this in. {companyName} will follow up with the deposit invoice.
                    </p>
                    <Input
                      value={acceptName}
                      onChange={(e) => setAcceptName(e.target.value)}
                      placeholder="Your full name"
                      autoFocus
                    />
                    {acceptError && (
                      <p className="text-xs text-rose-600">{acceptError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => { setAcceptOpen(false); setAcceptError(null); }} disabled={accepting}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAccept}
                        disabled={accepting || !acceptName.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                      >
                        {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {accepting ? "Accepting..." : "Accept quote"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-slate-700">
                      Happy with the quote? Hit accept and {companyName} will send the deposit invoice.
                    </p>
                    <Button
                      onClick={() => setAcceptOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 px-6"
                      size="lg"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Accept this quote
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* COMPANY FOOTER */}
          {company && (company.email || company.phone || companyAddress) && (
            <div className="mt-8 text-center text-xs text-slate-500 space-y-0.5">
              <p className="font-semibold text-slate-700">{companyName}</p>
              {company.email && <p>{company.email}</p>}
              {company.phone && <p>{company.phone}</p>}
              {companyAddress && <p>{companyAddress}</p>}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
