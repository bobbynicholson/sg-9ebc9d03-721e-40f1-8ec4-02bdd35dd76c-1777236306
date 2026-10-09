import { DEFAULT_PAYMENT_TERMS } from "@/lib/paymentTerms";

/**
 * Returns the customer-facing payment-terms wording for an invoice.
 *
 * Precedence is: invoice snapshot, linked client's numeric override,
 * company-wide wording, then the shared default. This keeps issued invoices
 * stable while giving new documents one consistent company policy.
 */
export function invoicePaymentTerms(
  snapshotTerms: unknown,
  clientTermDays: unknown,
  companyTerms?: unknown,
): string {
  if (typeof snapshotTerms === "string" && snapshotTerms.trim()) {
    return snapshotTerms.trim();
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

  if (typeof companyTerms === "string" && companyTerms.trim()) {
    return companyTerms.trim();
  }
  return DEFAULT_PAYMENT_TERMS;
}
