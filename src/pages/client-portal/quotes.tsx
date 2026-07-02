/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /client-portal/quotes - the client's quote history.
 *
 * Lists every quote issued to this client by the catering company,
 * grouped by status: pending action, accepted, declined/expired,
 * drafts (rare - usually internal). Each row links straight to
 * /q/[token] for the rendered, brand-tinted quote view where the
 * client can accept or request changes. We don't try to re-render
 * the quote inside the portal - that would duplicate the public
 * view and inevitably drift from it.
 *
 * Tenant-scoped strictly to companies.id resolved from the URL slug
 * (and from the user's profile.company_id). A user who is a client
 * of multiple catering tenants will see only one tenant's quotes
 * here.
 */

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { toLocalISO } from "@/lib/localDate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink, Calendar, Clock, X } from "lucide-react";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalShell, PortalHeader, PortalCard, PortalOverview,
  PageWorkbench,
} from "@/components/portal/ui";
import { RequestEditsDialog } from "@/components/client-portal/RequestEditsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { UserRole } from "@/types/app";
// Wave 28.4: Decline button is new on this page (audit found
// /client-portal/quotes had no decline action - only the magic-link
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

// Restrained, semantic tints only: slate + amber, with brand for
// accepted and rose for declined. No blue/indigo/violet on the
// customer-facing portal.
const STATUS_TONE: Record<string, string> = {
  sent: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  viewed: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  accepted: "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/10 dark:text-brand-primary dark:border-brand-primary/20",
  rejected: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  expired: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  revised: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  draft: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
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

function ClientQuotesPageInner() {
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

        const normEmail = (user.email || "").toLowerCase();
        if (clientIds.length > 0 && normEmail) {
          q = q.or(
            `client_id.in.(${clientIds.join(",")}),client_email.eq.${normEmail}`,
          );
        } else if (clientIds.length > 0) {
          q = q.in("client_id", clientIds);
        } else if (normEmail) {
          q = q.eq("client_email", normEmail);
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
      // TIGHTEN I.75: dropped dead 'viewed' status check.
      if (s === "sent") out.pending.push(q);
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
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Your quotes"
            subtitle={`Every quote ${companyName} has sent through. Tap one to open the full quote, accept it, or request changes.`}
            icon={FileText}
          />
          <PageWorkbench />

          <PortalOverview
            eyebrow="Quotes"
            title={grouped.pending.length > 0 ? "You have quotes waiting for a response" : "Quote history is organised by decision state"}
            description="Open a quote to review the public quote page, accept it, request edits, or decline. Accepted quotes move toward bookings and invoices."
            items={[
              { label: "Waiting", value: grouped.pending.length, helper: "Needs your response", icon: Clock, tone: grouped.pending.length > 0 ? "warning" : "success" },
              { label: "Accepted", value: grouped.accepted.length, helper: "Signed off", icon: FileText, tone: "success" },
              { label: "History", value: grouped.historical.length, helper: "Expired, declined, revised", icon: X, tone: "neutral" },
              { label: "Total", value: quotes.length, helper: "All quotes", icon: Calendar, tone: quotes.length > 0 ? "brand" : "neutral" },
            ]}
          />

          {loading ? (
            // Skeleton placeholders - the page settles into rows without
            // a layout jump or a spinner flash.
            <div className="space-y-3">
              <div className="h-5 w-48 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse"
                />
              ))}
            </div>
          ) : quotes.length === 0 ? (
            <PortalCard padded={false}>
              <div className="py-16 px-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">No quotes yet</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  When {companyName} sends you a quote it'll appear here. You can open it,
                  accept it, or request changes - all from this page.
                </p>
              </div>
            </PortalCard>
          ) : (
            <div className="space-y-6">
              {grouped.pending.length > 0 && (
                <QuoteGroup
                  title="Awaiting your response"
                  description="Open to accept, or push back with the changes you'd like before signing off."
                  items={grouped.pending}
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
                  fmtMoney={fmtMoney}
                />
              )}
              {grouped.historical.length > 0 && (
                <QuoteGroup
                  title="History"
                  description="Drafts, declined, expired, and quotes the team is revising."
                  items={grouped.historical}
                  fmtMoney={fmtMoney}
                />
              )}
            </div>
          )}
        </PortalShell>
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
          variant (no payout step - nothing has been paid yet). Uses
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
              declineQuote.event_date || toLocalISO(new Date()),
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
            // Local update - drops the quote out of pending into
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

export default function ClientQuotesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ClientQuotesPageInner />
    </ProtectedRoute>
  );
}

function QuoteGroup({
  title,
  description,
  items,
  onRequestEdits,
  onDecline,
  fmtMoney,
}: {
  title: string;
  description: string;
  items: PortalQuote[];
  onRequestEdits?: (q: PortalQuote) => void;
  onDecline?: (q: PortalQuote) => void;
  fmtMoney: Intl.NumberFormat;
}) {
  return (
    <section className="w-full">
      <div className="mb-3">
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <ul className="w-full space-y-3 list-none p-0">
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
              <PortalCard interactive className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                      {q.quote_name || `Quote ${q.quote_number}`}
                    </h3>
                    <Badge className={statusClass}>{statusLabel}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{q.quote_number}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex-wrap">
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
                    {validLabel && statusKey === "sent" && (
                      <span className="inline-flex items-center gap-1">
                        Valid until {validLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                  <p className="text-base sm:text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
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
                        className="text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        Decline
                      </Button>
                    )}
                  </div>
                </div>
              </PortalCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
