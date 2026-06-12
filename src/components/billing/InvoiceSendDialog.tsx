/**
 * Invoice-specific wrapper around SendEmailDialog.
 *
 * Resolves the right template (deposit_invoice_issued vs
 * balance_invoice_issued based on whether a deposit has already been
 * paid) through the central templateResolver, substitutes merge tags,
 * and pre-populates the composer with the final text the client will
 * see. Send hands off to sendInvoiceEmail with the operator's
 * (possibly edited) subject + body.
 */
import { useEffect, useState } from "react";
import { SendEmailDialog } from "./SendEmailDialog";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import { sendInvoiceEmail } from "@/services/invoiceGenerationService";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface InvoiceSendDialogInvoice {
  id: string;
  invoice_number?: string;
  invoice_data?: any;
}

export interface InvoiceSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  invoice: InvoiceSendDialogInvoice | null;
  onSent?: (invoice: InvoiceSendDialogInvoice) => void;
}

export function InvoiceSendDialog({
  open,
  onOpenChange,
  companyId,
  invoice,
  onSent,
}: InvoiceSendDialogProps) {
  const { toast } = useToast();
  const [resolved, setResolved] = useState<{ subject: string; body: string } | null>(null);
  const [resolving, setResolving] = useState(false);

  const invoiceData = invoice?.invoice_data || {};
  const invoiceNumber = invoice?.invoice_number || invoiceData.invoiceNumber || "";
  const recipientEmail = invoiceData.clientEmail || "";
  const clientName = invoiceData.clientName || "there";
  const firstName = String(clientName).split(" ")[0] || "there";
  const isBalance = Number(invoiceData.depositPaid || 0) > 0;
  const templateType = isBalance ? "balance_invoice_issued" : "deposit_invoice_issued";
  // Don't fall back to the order number for {{event_name}} - "deposit
  // invoice for ORD-003841" reads broken. Use a generic phrase.
  const eventLabel = invoiceData.eventName || "your event";
  const totalAmount = Number(invoiceData.balanceDue || invoiceData.total || 0);
  // Wave 66 - multi-currency parameterisation. Pre-Wave-66 the
  // amount label was hardcoded `R${totalAmount}` so any tenant in
  // the UK (£) / US ($) / Botswana (P) saw an "R" prefix in their
  // outbound invoice email body. Now: pull the tenant currency
  // symbol from the same hook the pages use.
  const { user } = useAuth() as any;
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  const amountLabel = tenantCurrency.format(totalAmount);
  // Bare numeric form for the deposit/balance templates that hardcode
  // their own "R" prefix ("Amount due: R {{deposit_amount}}") - the
  // currency-formatted label here would double the symbol.
  const amountBare = totalAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // The deposit/balance templates carry {{invoice_link}}. Resolve the
  // invoice's public_token and build the no-login /pay/i/{token} link
  // so the previewed (and sent) body has a working pay link, not a
  // blank "Pay or download here:".
  const [payLink, setPayLink] = useState<string>("");
  useEffect(() => {
    if (!open || !invoice?.id) { setPayLink(""); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("invoices")
          .select("public_token")
          .eq("id", invoice.id)
          .maybeSingle();
        const tok = (data as any)?.public_token;
        if (!cancelled && tok) {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          setPayLink(`${origin}/pay/i/${tok}`);
        }
      } catch { /* link stays empty; body still sends */ }
    })();
    return () => { cancelled = true; };
  }, [open, invoice?.id]);

  // Resolve subject + body whenever the dialog opens for a different
  // invoice. Pre-substitution means the operator sees real values, not
  // {{merge_tag}} placeholders.
  useEffect(() => {
    if (!open || !invoice || !companyId) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    (async () => {
      try {
        const result = await resolveEmailTemplate({
          companyId,
          templateType,
          variables: {
            first_name: firstName,
            client_name: clientName,
            tenant_name: invoiceData.companyName || "",
            event_name: eventLabel,
            invoice_number: invoiceNumber,
            amount: amountLabel,
            deposit_amount: isBalance ? "" : amountBare,
            balance_amount: isBalance ? amountBare : "",
            invoice_link: payLink,
            invoice_url: payLink,
          },
          fallback: {
            subject: `Invoice ${invoiceNumber} ready - ${eventLabel}`,
            bodyHtml:
              `Hi {{first_name}},\n\n` +
              `{{tenant_name}} issued invoice {{invoice_number}} for {{event_name}}. Total: {{amount}}.\n\n` +
              `Pay or download here: {{invoice_link}}\n\n` +
              `Thanks,\n{{tenant_name}}`,
          },
        });
        if (!cancelled) {
          setResolved({ subject: result.subject, body: result.bodyHtml });
        }
      } catch (e) {
        console.warn("[InvoiceSendDialog] template resolve failed:", e);
        if (!cancelled) {
          setResolved({
            subject: `Invoice ${invoiceNumber} ready`,
            body: `Hi ${firstName},\n\nPlease find your invoice attached.\n\nThanks.`,
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
  }, [open, invoice?.id, companyId, templateType, payLink]);

  if (!invoice) return null;

  return (
    <SendEmailDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send invoice to client"
      description={resolving ? "Loading template..." : "Review and edit the email before sending."}
      defaultTo={recipientEmail}
      defaultSubject={resolved?.subject || ""}
      defaultBody={resolved?.body || ""}
      attachmentFilename={invoiceNumber ? `Invoice-${invoiceNumber}.pdf` : "Invoice.pdf"}
      sendLabel="Send invoice"
      onSend={async (payload) => {
        const result = await sendInvoiceEmail(invoiceData, payload.to, {
          invoiceId: invoice.id,
          companyId,
          subject: payload.subject,
          body: payload.body,
          attachInvoicePdf: payload.attachPdf,
          cc: payload.cc,
          bcc: payload.bcc,
        });
        if (result.success) {
          toast({
            title: "Invoice sent",
            description: `Sent to ${payload.to}.`,
          });
          onSent?.(invoice);
          return { success: true } as const;
        }
        return {
          success: false as const,
          error: {
            message: result.error || "Failed to send invoice.",
            fix_link: result.fix_link,
          },
        };
      }}
    />
  );
}
