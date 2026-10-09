import { DEFAULT_PAYMENT_TERMS } from "@/lib/paymentTerms";

/**
 * Returns the customer-facing payment-terms wording for an invoice.
 *
 * Precedence is: current company-wide wording, linked client's numeric
 * fallback, invoice snapshot for legacy callers without company settings,
 * then the shared default. The company policy is the default shown on all
 * documents, including legacy invoices whose clients still carry an old
 * Net-X value.
 */
export function invoicePaymentTerms(
  snapshotTerms: unknown,
  clientTermDays: unknown,
  companyTerms?: unknown,
): string {
  if (typeof companyTerms === "string" && companyTerms.trim()) {
    return companyTerms.trim();
  }

  const hasTermDays = clientTermDays !== null
    && clientTermDays !== undefined
    && String(clientTermDays).trim() !== "";
  const days = hasTermDays ? Number(clientTermDays) : Number.NaN;
  if (Number.isFinite(days) && days >= 0) {
    const wholeDays = Math.floor(days);
    if (wholeDays === 0) return "Payment due on receipt";
    return `Payment due within ${wholeDays} day${wholeDays === 1 ? "" : "s"}`;
  }
  if (typeof snapshotTerms === "string" && snapshotTerms.trim()) {
    return snapshotTerms.trim();
  }
  return DEFAULT_PAYMENT_TERMS;
}
