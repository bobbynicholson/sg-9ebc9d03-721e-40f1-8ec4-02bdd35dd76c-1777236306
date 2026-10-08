/**
 * Returns the customer-facing payment-terms wording for an invoice.
 *
 * The invoice snapshot wins so a later change to a customer's account
 * terms cannot rewrite an already-issued document. Older invoices did not
 * keep that snapshot, so their linked client's numeric terms provide the
 * backwards-compatible fallback.
 */
export function invoicePaymentTerms(
  snapshotTerms: unknown,
  clientTermDays: unknown,
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

  return "Payment due within 30 days";
}
