export const DEFAULT_PAYMENT_TERMS =
  "50% Deposit to secure booking.\nBalance due 48 hours prior to the event.";

export function configuredPaymentTerms(dispatchSettings: unknown): string {
  let settings = dispatchSettings;
  if (typeof settings === "string") {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = null;
    }
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return DEFAULT_PAYMENT_TERMS;
  }
  const terms = (settings as Record<string, unknown>).paymentTermsText;
  return typeof terms === "string" && terms.trim()
    ? terms.trim()
    : DEFAULT_PAYMENT_TERMS;
}
