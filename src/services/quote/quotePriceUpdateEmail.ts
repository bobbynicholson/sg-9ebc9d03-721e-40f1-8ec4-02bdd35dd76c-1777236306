import { getTemplateDefinition } from "@/lib/messageTemplates/registry";

export const QUOTE_PRICE_UPDATE_TEMPLATE = "quote_price_updated";

export function shouldSendQuotePriceUpdate(input: {
  previousStatus: string | null;
  converted: boolean;
  previousTotal: number;
  updatedTotal: number;
  email: string;
  manualSendPending?: boolean;
}): boolean {
  return !input.converted && !input.manualSendPending && input.previousStatus === "sent" &&
    !!input.email.trim() && Number.isFinite(input.previousTotal) && Number.isFinite(input.updatedTotal) &&
    input.updatedTotal > input.previousTotal + 0.009;
}

/** Pass the template key through to the server so saved wording and on/off settings both apply. */
export function buildQuotePriceUpdateEmail(input: {
  companyId: string;
  companyName: string;
  quoteId: string;
  quoteNumber: string;
  updatedAt?: string | null;
  quoteUrl: string;
  clientName: string;
  email: string;
  eventName: string;
  eventDate: string;
  guestCount: number;
  currency: string;
  previousTotal: number;
  updatedTotal: number;
}) {
  const definition = getTemplateDefinition(QUOTE_PRICE_UPDATE_TEMPLATE);
  if (!definition) throw new Error("Quote price update template is unavailable.");
  const formatAmount = (amount: number) => {
    try {
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: input.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    } catch { return `${input.currency} ${amount.toFixed(2)}`; }
  };
  const clientName = input.clientName.trim() || "there";
  const variables = {
    first_name: clientName.split(/\s+/)[0], client_name: clientName,
    company_name: input.companyName, tenant_name: input.companyName, from_name: input.companyName,
    quote_number: input.quoteNumber, quote_ref: input.quoteNumber,
    event_name: input.eventName || "your event", event_date: input.eventDate, guest_count: String(input.guestCount),
    total: formatAmount(input.updatedTotal), total_zar: formatAmount(input.updatedTotal),
    previous_total: formatAmount(input.previousTotal), increase_amount: formatAmount(input.updatedTotal - input.previousTotal),
    quote_url: input.quoteUrl,
  };
  return {
    companyId: input.companyId, to: input.email.trim(), quoteId: input.quoteId,
    template: QUOTE_PRICE_UPDATE_TEMPLATE,
    subject: definition.defaultSubject || "Updated quote {{quote_number}}",
    body: input.quoteUrl ? definition.defaultBody : definition.defaultBody.replace("Review the updated quote:\n{{quote_url}}\n\n", ""),
    variables,
    attachQuotePdf: true,
    idempotencyKey: `quote-price-update/${input.quoteId}/${String(input.updatedAt || input.updatedTotal).replace(/[^\w.-]/g, "")}`,
  };
}
