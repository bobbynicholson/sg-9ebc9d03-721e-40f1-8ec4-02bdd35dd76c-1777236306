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
import { formatQuoteSubject } from "@/lib/email/subjectFormatters";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
}

export interface QuoteSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tenant company id. Required to resolve the template + post the
   *  send. */
  companyId: string;
  /** The quote being sent. Null when the dialog is closed. */
  quote: QuoteSendDialogQuote | null;
  /** Tenant display name to use in the body / subject. Falls back to
   *  the company row when not supplied. */
  tenantName?: string | null;
  onSent?: (quote: QuoteSendDialogQuote) => void;
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

  const total = Number(quote?.total ?? quote?.total_amount ?? 0);
  const eventLabel = quote?.event_name || quote?.quote_name || "your event";
  const firstName = String(quote?.client_name || "there").split(" ")[0] || "there";
  const tn = (tenantName || "Your Catering Company").trim();
  const currency = quote?.currency || "ZAR";
  const totalLabel = `${currency} ${total.toFixed(2)}`;

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
            // Legacy {clientName}/{companyName}/{quoteNumber}/{totalAmount}
            // single-brace tokens are also substituted by emailService at
            // send time, so the fallback works either way.
          },
          fallback: {
            subject: formatQuoteSubject({
              eventName: eventLabel,
              tenantName: tn,
              total: total,
              quoteNumber: quote.quote_number || quote.id,
              currencyCode: currency,
            }),
            bodyHtml:
              `Hi {{first_name}},\n\n` +
              `Thanks for letting {{tenant_name}} quote on {{event_name}}. Your quote ` +
              `{{quote_number}} is ready - total {{amount}}.\n\n` +
              `Open the quote in your portal to review, accept, or send through any ` +
              `tweaks.\n\n` +
              `Thanks,\n{{tenant_name}}`,
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
              eventName: eventLabel,
              tenantName: tn,
              total,
              quoteNumber: quote.quote_number || quote.id,
              currencyCode: currency,
            }),
            body: `Hi ${firstName},\n\nYour quote is ready. Total: ${totalLabel}.\n\nThanks,\n${tn}`,
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
  }, [open, quote?.id, companyId]);

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
          return {
            success: false as const,
            error: { message: err?.message || "Send failed unexpectedly." },
          };
        }
      }}
    />
  );
}
