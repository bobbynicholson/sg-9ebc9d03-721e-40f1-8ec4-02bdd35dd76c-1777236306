/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /client-portal/quotes -- the client's quote history.
 *
 * Lists every quote issued to this client by the catering company,
 * grouped by status: pending action, accepted, declined/expired,
 * drafts (rare -- usually internal). Each row links straight to
 * /q/[token] for the rendered, brand-tinted quote view where the
 * client can accept or request changes. We don't try to re-render
 * the quote inside the portal -- that would duplicate the public
 * view and inevitably drift from it.
 *
 * Tenant-scoped strictly to companies.id resolved from the URL slug
 * (and from the user's profile.company_id). A user who is a client
 * of multiple catering tenants will see only one tenant's quotes
 * here.
 */

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, ExternalLink, Calendar, Clock, X } from "lucide-react";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ClientPageHeader } from "@/components/client-portal/ClientPageHeader";
import { RequestEditsDialog } from "@/components/client-portal/RequestEditsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NoIndexMeta } from "@/components/NoIndexMeta";
// Wave 28.4: Decline button is new on this page (audit found
// /client-portal/quotes had no decline action -- only the magic-link
// /q/[token] did). Routes through the same wizard the public page
// uses, mode='quote' so the payout step is skipped.
import { CancellationWizard } from "@/components/cancellation/CancellationWizard";
import { useToast } from "@/hooks/use-toast";

interface PortalQuote {
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
  created_at: string | null;
}

// Wave 18 audit: hardcoded ZAR rendered "R5,000" for non-ZA tenants.
// Resolve from the loaded company row inside the component instead of
// a module-scope constant.
function fmtMoneyFor(currencyCode: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currencyCode || "ZAR",
      maximumFractionDigits: 0,
    });
  } catch {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    });
  }
}

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : null;

const STATUS_TONE: Record<string, string> = {
  sent: "bg-blue-100 text-blue-800 border-blue-200",
  viewed: "bg-indigo-100 text-indigo-800 border-indigo-200",
  accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
  expired: "bg-slate-200 text-slate-700 border-slate-300",
  revised: "bg-violet-100 text-violet-800 border-violet-200",
  draft: "bg-amber-100 text-amber-800 border-amber-200",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting your response",
  viewed: "Viewed",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
  revised: "Changes requested",
  draft: "Draft",
};

export default function ClientQuotesPage() {
  const { user, company } = useAuth() as any;
  const fmtMoney = fmtMoneyFor((company as any)?.currency || "ZAR");
  const [quotes, setQuotes] = useState<PortalQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editsQuote, setEditsQuote] = useState<{ id: string; quote_number: string } | null>(null);
  // Wave 28.4: which quote is in the decline wizard. Holds the row
  // (or null when closed) so the wizard can read public_token and
  // event_date.
  const [declineQuote, setDeclineQuote] = useState<PortalQuote | null>(null);
  const { toast } = useToast();

  const brandPrimary = company?.primary_color || "#059669";
  const companyName = company?.company_name || "your caterer";

  useEffect(() => {
    if (!user?.id || !company?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: clientRowsRaw } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .eq("company_id", company.id);
        const clientIds = ((clientRowsRaw as any[]) || []).map((r) => r.id);

        let q = supabase
          .from("quotes")
          .select(
            "id, public_token, quote_number, quote_name, status, total, total_amount, event_date, sent_at, valid_until, created_at",
          )
          .eq("company_id", company.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (clientIds.length > 0 && user.email) {
          q = q.or(
            `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
          );
        } else if (clientIds.length > 0) {
          q = q.in("client_id", clientIds);
        } else if (user.email) {
          q = q.ilike("client_email", user.email);
        } else {
          if (!cancelled) {
            setQuotes([]);
            setLoading(false);
          }
          return;
        }

        const { data } = await q;
        if (!cancelled) setQuotes((data as PortalQuote[]) || []);
      } catch (err) {
        console.error("Client quotes load failed:", err);
        if (!cancelled) setQuotes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, company?.id]);

  const grouped = useMemo(() => {
    const out = {
      pending: [] as PortalQuote[],
      accepted: [] as PortalQuote[],
      historical: [] as PortalQuote[],
    };
    for (const q of quotes) {
      const s = q.status || "draft";
      if (s === "sent" || s === "viewed") out.pending.push(q);
      else if (s === "accepted") out.accepted.push(q);
      else out.historical.push(q);
    }
    return out;
  }, [quotes]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Quotes | {companyName}</title></Head>
      <ClientNav />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <ClientPageHeader
          title="Your quotes"
          subtitle={`Every quote ${companyName} has sent through. Tap one to open the full quote, accept it, or request changes.`}
        />
        <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 space-y-6">

          {loading ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" />
                <p className="text-sm text-slate-500 mt-3">Loading your quotes...</p>
              </CardContent>
            </Card>
          ) : quotes.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <FileText className="w-10 h-10 mx-auto text-slate-300" />
                <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">No quotes yet</h2>
                <p className="text-sm text-slate-500 mt-1">
                  When {companyName} sends you a quote it'll appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {grouped.pending.length > 0 && (
                <QuoteGroup
                  title="Awaiting your response"
                  description="Open to accept, or push back with the changes you'd like before signing off."
                  items={grouped.pending}
                  brandPrimary={brandPrimary}
                  onRequestEdits={(q) => setEditsQuote({ id: q.id, quote_number: q.quote_number })}
                  onDecline={(q) => setDeclineQuote(q)}
                  fmtMoney={fmtMoney}
                />
              )}
              {grouped.accepted.length > 0 && (
                <QuoteGroup
                  title="Accepted"
                  description="You've signed off on these. The deposit invoice (if any) lives under Billing."
                  items={grouped.accepted}
                  brandPrimary={brandPrimary}
                  fmtMoney={fmtMoney}
                />
              )}
              {grouped.historical.length > 0 && (
                <QuoteGroup
                  title="History"
                  description="Drafts, declined, expired, and quotes the team is revising."
                  items={grouped.historical}
                  brandPrimary={brandPrimary}
                  fmtMoney={fmtMoney}
                />
              )}
            </>
          )}
        </main>
      </div>

      <RequestEditsDialog
        open={!!editsQuote}
        onOpenChange={(o) => { if (!o) setEditsQuote(null); }}
        quoteId={editsQuote?.id || null}
        quoteNumber={editsQuote?.quote_number || null}
        onSuccess={() => {
          // Mark the quote as 'revised' locally so it drops out of
          // the pending bucket and shows up under History without a
          // refetch.
          setQuotes((prev) =>
            prev.map((q) => (q.id === editsQuote?.id ? { ...q, status: "revised" } : q)),
          );
          setEditsQuote(null);
        }}
      />

      {/* Wave 28.4: Decline wizard. mode='quote' renders the 2-step
          variant (no payout step -- nothing has been paid yet). Uses
          the existing /api/public/quotes/[token]/reject endpoint --
          token-bearer auth means the auth-portal user can call it
          since they hold the public_token in their portal feed. */}
      {declineQuote && (
        <CancellationWizard
          open={!!declineQuote}
          onOpenChange={(o) => {
            if (!o) setDeclineQuote(null);
          }}
          mode="quote"
          companyName={companyName}
          companyPhone={(company as any)?.phone || null}
          termsInput={{
            amountPaid: 0,
            depositAmount: 0,
            depositPaid: false,
            eventDate:
              declineQuote.event_date || new Date().toISOString().slice(0, 10),
            status: declineQuote.status || "sent",
            policy: ((company as any)?.cancellation_policy as any) || {},
          }}
          onSubmit={async (payload) => {
            const r = await fetch(
              `/api/public/quotes/${encodeURIComponent(declineQuote.public_token)}/reject`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  reason: payload.reason || payload.reason_category,
                }),
              },
            );
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j?.ok) {
              throw new Error(j?.error || "Could not decline the quote.");
            }
            // Local update -- drops the quote out of pending into
            // history without a refetch.
            setQuotes((prev) =>
              prev.map((q) =>
                q.id === declineQuote.id ? { ...q, status: "rejected" } : q,
              ),
            );
            toast({
              title: "Quote declined",
              description: `${companyName} has been notified.`,
            });
          }}
        />
      )}
    </>
  );
}

function QuoteGroup({
  title,
  description,
  items,
  brandPrimary,
  onRequestEdits,
  onDecline,
  fmtMoney,
}: {
  title: string;
  description: string;
  items: PortalQuote[];
  brandPrimary: string;
  onRequestEdits?: (q: PortalQuote) => void;
  onDecline?: (q: PortalQuote) => void;
  fmtMoney: Intl.NumberFormat;
}) {
  return (
    <section className="w-full">
      <div className="mb-3">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <ul className="w-full space-y-2 list-none p-0">
        {items.map((q) => {
          const total = Number(q.total ?? q.total_amount ?? 0);
          const statusKey = q.status || "draft";
          const statusClass = STATUS_TONE[statusKey] || STATUS_TONE.draft;
          const statusLabel = STATUS_LABEL[statusKey] || statusKey;
          const eventLabel = fmtDate(q.event_date);
          const sentLabel = fmtDate(q.sent_at);
          const validLabel = fmtDate(q.valid_until);
          const open = q.public_token ? `/q/${q.public_token}` : null;
          return (
            <li key={q.id} className="w-full">
              <Card className="w-full border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                        {q.quote_name || `Quote ${q.quote_number}`}
                      </h3>
                      <Badge className={statusClass}>{statusLabel}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{q.quote_number}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                      {eventLabel && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Event {eventLabel}
                        </span>
                      )}
                      {sentLabel && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Sent {sentLabel}
                        </span>
                      )}
                      {validLabel && (statusKey === "sent" || statusKey === "viewed") && (
                        <span className="inline-flex items-center gap-1">
                          Valid until {validLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                    <p className="text-base sm:text-lg font-bold tabular-nums" style={{ color: brandPrimary }}>
                      {total > 0 ? fmtMoney.format(total) : "TBD"}
                    </p>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {open && (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                        >
                          <a href={open} target="_blank" rel="noopener noreferrer">
                            Open <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      )}
                      {onRequestEdits && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRequestEdits(q)}
                        >
                          Request changes
                        </Button>
                      )}
                      {onDecline && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDecline(q)}
                          className="text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          Decline
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
