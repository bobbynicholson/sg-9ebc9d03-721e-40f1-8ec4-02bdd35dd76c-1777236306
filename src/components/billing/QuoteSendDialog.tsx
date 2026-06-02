/**
 * Quote-specific wrapper around SendEmailDialog.
 *
 * Triggered by the Send button on /admin/quotes for a draft quote.
 * Pre-populates the composer with the resolved quote-ready template
 * (tenant override -> global default -> hardcoded fallback) and posts
 * directly to /api/send-email on confirm so the operator's edits ride
 * through verbatim. Stamps quotes.sent_at + flips the status to 'sent'
 * after a confirmed successful delivery.
 */
import { useEffect, useState } from "react";
import { SendEmailDialog } from "./SendEmailDialog";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import { formatQuoteSubject, fmtMoney } from "@/lib/email/subjectFormatters";
import { buildPublicQuoteUrl } from "@/services/publicQuoteService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/observability";

export interface QuoteSendDialogQuote {
  id: string;
  quote_number?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  total?: number | null;
  total_amount?: number | null;
  currency?: string | null;
  event_name?: string | null;
  quote_name?: string | null;
  user_id?: string | null;
  /** TIGHTEN I.111: public token used to build the /q/{token} client
   *  view link that goes into the email body. Required for the link
   *  to render; without it the body falls back to a no-link variant. */
  public_token?: string | null;
}

export interface QuoteSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tenant company id. Required to resolve the template + post the
   *  send. */
  companyId: string;
  /** The quote being sent. Null when the dialog is closed. */
  quote: QuoteSendDialogQuote | null;
  /** Tenant display name to use in the body / subject. When null the
   *  dialog self-fetches from companies.company_name (TIGHTEN I.111
   *  defensive: /admin/quotes/new wasn't passing this so the body said
   *  "Your Catering Company" on every quote). */
  tenantName?: string | null;
  onSent?: (quote: QuoteSendDialogQuote) => void;
}

// TIGHTEN I.111: form defaults like quote_name="Quote" / event_name=""
// leak into the email as "Thanks for letting X quote on Quote." -
// nonsense. Treat these literal strings as missing so the template
// falls through to the no-event-name variant.
const PLACEHOLDER_EVENT_NAMES = new Set([
  "", "quote", "your event", "n/a", "tbd", "tbc", "untitled",
]);
function cleanEventName(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_EVENT_NAMES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function QuoteSendDialog({
  open,
  onOpenChange,
  companyId,
  quote,
  tenantName,
  onSent,
}: QuoteSendDialogProps) {
  const { toast } = useToast();
  const [resolved, setResolved] = useState<{ subject: string; body: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  // TIGHTEN I.111: dialog self-fetches the tenant name when the
  // parent didn't pass one. /admin/quotes/new historically passed
  // tenantName={null} which made every quote-send email read "Your
  // Catering Company" instead of the actual catering business.
  const [fetchedTenantName, setFetchedTenantName] = useState<string | null>(null);
  // TIGHTEN I.115: tenant slug for the /q/{token} URL. Without it the
  // production link goes to the apex domain which doesn't serve the
  // app cleanly. Self-fetch alongside the tenant name.
  const [fetchedSlug, setFetchedSlug] = useState<string | null>(null);

  const total = Number(quote?.total ?? quote?.total_amount ?? 0);
  // Strip placeholder defaults from the event label so the body doesn't
  // read "Thanks for letting X quote on Quote."
  const cleanedEvent = cleanEventName(quote?.event_name) ?? cleanEventName(quote?.quote_name);
  const eventLabel = cleanedEvent || "your event";
  const firstName = String(quote?.client_name || "there").split(" ")[0] || "there";
  const tn = (tenantName || fetchedTenantName || "Your Catering Company").trim();
  const currency = quote?.currency || "ZAR";
  // TIGHTEN I.111: use the shared fmtMoney helper so the body and
  // subject render the same shape ("R 3 602" / "$3,602"). Previously
  // built "ZAR 3601.71" with no symbol or separator.
  const totalLabel = fmtMoney(total, currency) || `${currency} ${total.toFixed(2)}`;
  const quoteUrl =
    quote?.public_token && typeof window !== "undefined"
      ? buildPublicQuoteUrl(quote.public_token, fetchedSlug)
      : null;

  // Self-fetch company_name + slug on first open. TIGHTEN I.115:
  // always fetch slug regardless of whether the parent passed
  // tenantName - the slug is required to build a working production
  // URL via the tenant-rewrite chain.
  useEffect(() => {
    if (!open || !companyId) return;
    if (fetchedTenantName && fetchedSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("companies")
          .select("company_name, slug")
          .eq("id", companyId)
          .maybeSingle();
        if (cancelled) return;
        const row = data as any;
        if (row?.company_name && !tenantName) {
          setFetchedTenantName(String(row.company_name).trim());
        }
        if (row?.slug) setFetchedSlug(String(row.slug).trim());
      } catch (e) {
        console.warn("[QuoteSendDialog] company fetch failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, companyId, tenantName, fetchedTenantName, fetchedSlug]);

  useEffect(() => {
    if (!open || !quote || !companyId) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    (async () => {
      try {
        const result = await resolveEmailTemplate({
          companyId,
          templateType: "custom-quote-ready",
          variables: {
            first_name: firstName,
            client_name: quote.client_name || "there",
            tenant_name: tn,
            event_name: eventLabel,
            quote_number: quote.quote_number || quote.id,
            amount: totalLabel,
            company_name: tn,
            // TIGHTEN I.111: include the polished /q/{token} client view
            // URL so any tenant template can drop a `{{quote_url}}`
            // placeholder and the magic link renders. Empty string
            // when the quote has no public_token (rare).
            quote_url: quoteUrl || "",
            // Legacy {clientName}/{companyName}/{quoteNumber}/{totalAmount}
            // single-brace tokens are also substituted by emailService at
            // send time, so the fallback works either way.
          },
          fallback: {
            subject: formatQuoteSubject({
              eventName: cleanedEvent,
              tenantName: tn,
              total: total,
              quoteNumber: quote.quote_number || quote.id,
              currencyCode: currency,
            }),
            // TIGHTEN I.111: rewritten fallback body.
            //  - Drops the awkward "letting {{tenant_name}} quote on
            //    {{event_name}}" line which read terribly when event_name
            //    was missing/generic.
            //  - Embeds the magic link so the client can click straight to
            //    the polished /q/{token} view (the operator was complaining
            //    that the email only attached a PDF with no link).
            //  - Signs off with the tenant name, not "Your Catering Company".
            bodyHtml: buildFallbackBody({
              firstName,
              tenantName: tn,
              eventName: cleanedEvent,
              quoteNumber: quote.quote_number || quote.id,
              amount: totalLabel,
              quoteUrl: quoteUrl,
            }),
          },
        });
        if (!cancelled) {
          setResolved({ subject: result.subject, body: result.bodyHtml });
        }
      } catch (e) {
        console.warn("[QuoteSendDialog] template resolve failed:", e);
        if (!cancelled) {
          setResolved({
            subject: formatQuoteSubject({
              eventName: cleanedEvent,
              tenantName: tn,
              total,
              quoteNumber: quote.quote_number || quote.id,
              currencyCode: currency,
            }),
            body: buildFallbackBody({
              firstName,
              tenantName: tn,
              eventName: cleanedEvent,
              quoteNumber: quote.quote_number || quote.id,
              amount: totalLabel,
              quoteUrl,
            }),
          });
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote?.id, companyId, tn, quoteUrl]);

  if (!quote) return null;

  return (
    <SendEmailDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send quote to client"
      description={resolving ? "Loading template..." : "Review and edit the email before sending."}
      defaultTo={quote.client_email || ""}
      defaultSubject={resolved?.subject || ""}
      defaultBody={resolved?.body || ""}
      attachmentFilename={quote.quote_number ? `Quote-${quote.quote_number}.pdf` : "Quote.pdf"}
      sendLabel="Send quote"
      onSend={async (payload) => {
        try {
          const response = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              to: payload.to,
              subject: payload.subject,
              body: payload.body,
              quoteId: quote.id,
              attachQuotePdf: payload.attachPdf,
              variables: {
                clientName: quote.client_name || "there",
                companyName: tn,
                quoteNumber: quote.quote_number || quote.id,
                totalAmount: totalLabel,
                // TIGHTEN I.111: forward quote_url so any single-brace
                // {quoteUrl} tokens in tenant-saved bodies render too.
                quoteUrl: quoteUrl || "",
              },
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data?.success === false) {
            return {
              success: false as const,
              error: {
                message: data?.error || "Failed to send quote.",
                fix_link: data?.fix_link,
              },
            };
          }
          // Stamp sent_at + flip status. Mirrors what
          // quoteService._fireQuoteSentEmail used to do, only here we
          // don't double-fire the email - the dialog already sent it.
          try {
            await supabase
              .from("quotes")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("id", quote.id)
              .is("sent_at", null);
          } catch (e) {
            console.warn("[QuoteSendDialog] sent_at stamp failed:", e);
          }
          toast({
            title: "Quote sent",
            description: `Sent to ${payload.to}.`,
          });
          onSent?.(quote);
          return { success: true } as const;
        } catch (err: any) {
          // TIGHTEN I.98: route quote-send failures through Sentry.
          // Quote send is money-touching - silent failures hide outbox
          // / template / provider bugs the operator needs to see.
          captureException(err, {
            level: "error",
            tags: {
              op: "quote.send",
              companyId: companyId || "(unknown)",
              quoteId: quote?.id || "(unknown)",
            },
          });
          return {
            success: false as const,
            error: { message: err?.message || "Send failed unexpectedly." },
          };
        }
      }}
    />
  );
}

/**
 * TIGHTEN I.111: shared fallback body builder. Reads naturally whether
 * the event has a real name ("Wedding") or doesn't, and embeds the
 * polished /q/{token} link so the client can review + accept with one
 * click instead of having to dig out the PDF attachment.
 */
function buildFallbackBody(input: {
  firstName: string;
  tenantName: string;
  eventName: string | null;
  quoteNumber: string;
  amount: string;
  quoteUrl: string | null;
}): string {
  const { firstName, tenantName, eventName, quoteNumber, amount, quoteUrl } = input;
  const eventPhrase = eventName ? ` for your ${eventName}` : "";
  const lines: string[] = [
    `Hi ${firstName},`,
    "",
    `Thanks for the opportunity to quote${eventPhrase}. Your quote ${quoteNumber} is ready - total ${amount}.`,
  ];
  if (quoteUrl) {
    lines.push("");
    lines.push("View and accept the quote here:");
    lines.push(quoteUrl);
    lines.push("");
    lines.push("Or reply to this email if you'd like to chat through it first.");
  } else {
    lines.push("");
    lines.push("Have a look at the attached PDF and reply with any tweaks, or let us know you're happy to go ahead.");
  }
  lines.push("");
  lines.push("Thanks,");
  lines.push(tenantName);
  return lines.join("\n");
}
