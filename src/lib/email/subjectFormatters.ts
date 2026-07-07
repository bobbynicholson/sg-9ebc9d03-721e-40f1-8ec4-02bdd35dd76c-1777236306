/**
 * Centralised email subject builders.
 *
 * Generic subjects ("Your catering quote QT-20260504-KZBHFY") look
 * transactional and forgettable - inboxes treat them as spam-adjacent.
 * Each helper here produces a personalised subject that fronts the
 * event name, the tenant doing the catering, and the amount where
 * relevant. Tenants stay in the FROM name where it makes the inbox
 * cleaner (invoices), and surface in the subject only when the recipient
 * actually needs the disambiguation (quote arrival, cancellation).
 *
 * Every helper:
 *   - takes a typed input
 *   - returns a trimmed string
 *   - falls back to a less-personal version when fields are missing
 *   - never uses em dashes (we use double-hyphen)
 *   - South African English ("organise", not "organize")
 *
 * Wave 24: currency formatting is tenant-aware. Each input takes an
 * optional `currencyCode` (ZAR / GBP / USD / EUR / ...). Defaults to
 * ZAR so existing call sites that don't pass it render unchanged.
 * No decimal places - inbox subjects look cleaner at "R 12 345" than
 * at "R 12 345.00".
 */

// ── Internal formatting helpers ─────────────────────────────────────

const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
  AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE", CAD: "en-CA",
};

/** "R 12 345" / "£12,345" / "$12,345" - empty when amount is
 *  missing / zero. Currency code defaults to ZAR for back-compat.
 *  TIGHTEN I.111 (2026-06-02): exported so QuoteSendDialog can match
 *  the subject's money rendering exactly in the body (was producing
 *  "ZAR 3601.71" via local toFixed - ugly + inconsistent). */
export function fmtMoney(amount: number | null | undefined, currencyCode?: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const code = (currencyCode || "ZAR").toUpperCase();
  const locale = CURRENCY_LOCALE[code] || "en-ZA";
  try {
    // Consistency (Callum 2026-07-08): exact cents + dot-decimal / space
    // grouping like formatZAR so the subject amount matches the body,
    // quote, invoice + PDF instead of rounding "R 5 833.86" to "R 5 834".
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(amount).map((p) => {
      if (p.type === "group") return " ";
      if (p.type === "decimal") return ".";
      return p.value.replace(/\s/g, " ");
    }).join("");
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** "5 May 2026" long form, locale-aware. Wave 24: takes a currency
 *  code so a US tenant reads "May 5, 2026" and a UK tenant reads
 *  "5 May 2026" instead of always en-ZA. Long-form months stay
 *  unambiguous; this fixes word order + comma differences across
 *  English locales. Defaults to en-ZA when no code passed. */
function fmtDate(date: string | Date | null | undefined, currencyCode?: string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const code = (currencyCode || "ZAR").toUpperCase();
  const locale = CURRENCY_LOCALE[code] || "en-ZA";
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

// ── Quote ───────────────────────────────────────────────────────────

export interface QuoteSubjectInput {
  eventName?: string | null;
  tenantName?: string | null;
  total?: number | null;
  quoteNumber?: string | null;
  currencyCode?: string | null;
}

/**
 * Quote send.
 *
 * Test cases:
 *   formatQuoteSubject({ eventName: "30th braai", tenantName: "Spit Co", total: 12345 })
 *     -> "30th braai quote from Spit Co - R 12 345"
 *   formatQuoteSubject({ tenantName: "Spit Co", total: 12345, quoteNumber: "Q-001" })
 *     -> "Quote Q-001 from Spit Co - R 12 345"
 *   formatQuoteSubject({ tenantName: "Spit Co" })
 *     -> "Your quote from Spit Co"
 */
export function formatQuoteSubject(input: QuoteSubjectInput): string {
  const eventName = clean(input.eventName);
  const tenantName = clean(input.tenantName) || "your caterer";
  const totalLabel = fmtMoney(input.total ?? null, input.currencyCode);
  const quoteNumber = clean(input.quoteNumber);

  if (eventName) {
    return `${eventName} quote from ${tenantName}`;
  }

  if (quoteNumber) {
    return `Quote ${quoteNumber} from ${tenantName}`;
  }

  return `Your quote from ${tenantName}`;
}

// ── Quote accepted ──────────────────────────────────────────────────

export interface QuoteAcceptedSubjectInput {
  firstName?: string | null;
  eventName?: string | null;
  tenantName?: string | null;
}

/**
 * Acceptance receipt.
 *
 * Test cases:
 *   formatQuoteAcceptedSubject({ firstName: "Bobby", eventName: "Wedding", tenantName: "Spit Co" })
 *     -> "Bobby, you're booked in for Wedding with Spit Co"
 *   formatQuoteAcceptedSubject({ eventName: "Wedding", tenantName: "Spit Co" })
 *     -> "Booked in - Wedding with Spit Co"
 *   formatQuoteAcceptedSubject({ tenantName: "Spit Co" })
 *     -> "You're booked in with Spit Co"
 */
export function formatQuoteAcceptedSubject(input: QuoteAcceptedSubjectInput): string {
  const firstName = clean(input.firstName);
  const eventName = clean(input.eventName);
  const tenantName = clean(input.tenantName) || "your caterer";

  if (firstName && eventName) {
    return `${firstName}, you're booked in for ${eventName} with ${tenantName}`;
  }
  if (eventName) {
    return `Booked in - ${eventName} with ${tenantName}`;
  }
  if (firstName) {
    return `${firstName}, you're booked in with ${tenantName}`;
  }
  return `You're booked in with ${tenantName}`;
}

// ── Invoice ─────────────────────────────────────────────────────────

export type InvoiceSubjectType = "deposit" | "balance" | "full";

export interface InvoiceSubjectInput {
  invoiceNumber?: string | null;
  eventName?: string | null;
  tenantName?: string | null;
  total?: number | null;
  type: InvoiceSubjectType;
  currencyCode?: string | null;
}

/**
 * Invoice send. tenantName goes in the FROM name, not the subject.
 *
 * Test cases:
 *   formatInvoiceSubject({ type: "deposit", eventName: "Wedding", total: 5000 })
 *     -> "Deposit invoice for Wedding - R 5 000"
 *   formatInvoiceSubject({ type: "balance", eventName: "Wedding", total: 7500 })
 *     -> "Balance invoice for Wedding - R 7 500"
 *   formatInvoiceSubject({ type: "full", eventName: "Wedding", total: 12500 })
 *     -> "Invoice for Wedding - R 12 500"
 *   formatInvoiceSubject({ type: "deposit", invoiceNumber: "INV-001", total: 5000 })
 *     -> "Deposit invoice INV-001 - R 5 000"
 */
export function formatInvoiceSubject(input: InvoiceSubjectInput): string {
  const eventName = clean(input.eventName);
  const invoiceNumber = clean(input.invoiceNumber);
  const totalLabel = fmtMoney(input.total ?? null, input.currencyCode);

  const labelMap: Record<InvoiceSubjectType, string> = {
    deposit: "Deposit invoice",
    balance: "Balance invoice",
    full: "Invoice",
  };
  const label = labelMap[input.type];

  let base: string;
  if (eventName) {
    base = `${label} for ${eventName}`;
  } else if (invoiceNumber) {
    base = `${label} ${invoiceNumber}`;
  } else {
    base = label;
  }
  return totalLabel ? `${base} - ${totalLabel}` : base;
}

// ── Payment received ────────────────────────────────────────────────

export type PaymentSubjectType = "deposit" | "balance" | "full";

export interface PaymentReceivedSubjectInput {
  paymentType: PaymentSubjectType;
  eventName?: string | null;
  total?: number | null;
  tenantName?: string | null;
}

/**
 * Payment receipt confirmation.
 *
 * Test cases:
 *   formatPaymentReceivedSubject({ paymentType: "deposit", eventName: "Wedding" })
 *     -> "Deposit received - Wedding confirmed"
 *   formatPaymentReceivedSubject({ paymentType: "balance", eventName: "Wedding" })
 *     -> "Balance received - Wedding fully paid"
 *   formatPaymentReceivedSubject({ paymentType: "full", eventName: "Wedding" })
 *     -> "Payment received - Wedding confirmed"
 *   formatPaymentReceivedSubject({ paymentType: "deposit" })
 *     -> "Deposit received"
 */
export function formatPaymentReceivedSubject(input: PaymentReceivedSubjectInput): string {
  const eventName = clean(input.eventName);

  if (input.paymentType === "deposit") {
    return eventName ? `Deposit received - ${eventName} confirmed` : "Deposit received";
  }
  if (input.paymentType === "balance") {
    return eventName ? `Balance received - ${eventName} fully paid` : "Balance received";
  }
  return eventName ? `Payment received - ${eventName} confirmed` : "Payment received";
}

// ── Cancellation ────────────────────────────────────────────────────

export interface CancellationSubjectInput {
  eventName?: string | null;
  tenantName?: string | null;
  refundAmount?: number | null;
  currencyCode?: string | null;
}

/**
 * Cancellation receipt. Refund amount, when present, headlines the
 * subject so the client sees the money signal at a glance.
 *
 * Test cases:
 *   formatCancellationSubject({ eventName: "Wedding", refundAmount: 2500 })
 *     -> "Wedding cancelled - R 2 500 refund coming"
 *   formatCancellationSubject({ eventName: "Wedding", refundAmount: 0 })
 *     -> "Wedding cancelled"
 *   formatCancellationSubject({ eventName: "Wedding" })
 *     -> "Wedding cancelled"
 *   formatCancellationSubject({ refundAmount: 1000 })
 *     -> "Booking cancelled - R 1 000 refund coming"
 *   formatCancellationSubject({})
 *     -> "Booking cancelled"
 */
export function formatCancellationSubject(input: CancellationSubjectInput): string {
  const eventName = clean(input.eventName) || "Booking";
  const refund = input.refundAmount ?? 0;
  const refundLabel = refund > 0 ? fmtMoney(refund, input.currencyCode) : "";

  if (refundLabel) {
    return `${eventName} cancelled - ${refundLabel} refund coming`;
  }
  return `${eventName} cancelled`;
}

// ── Postponement ────────────────────────────────────────────────────

export interface PostponementSubjectInput {
  eventName?: string | null;
  newDate?: string | Date | null;
  currencyCode?: string | null;
}

/**
 * Postponement approval.
 *
 * Test cases:
 *   formatPostponementSubject({ eventName: "Wedding", newDate: "2026-08-12" })
 *     -> "Wedding moved to 12 August 2026"
 *   formatPostponementSubject({ eventName: "Wedding" })
 *     -> "Wedding postponed"
 *   formatPostponementSubject({ newDate: "2026-08-12" })
 *     -> "Booking moved to 12 August 2026"
 *   formatPostponementSubject({})
 *     -> "Postponement approved"
 */
export function formatPostponementSubject(input: PostponementSubjectInput): string {
  const eventName = clean(input.eventName);
  const dateLabel = fmtDate(input.newDate, input.currencyCode);

  if (eventName && dateLabel) return `${eventName} moved to ${dateLabel}`;
  if (eventName) return `${eventName} postponed`;
  if (dateLabel) return `Booking moved to ${dateLabel}`;
  return "Postponement approved";
}

// ── Refund paid ─────────────────────────────────────────────────────

export interface RefundPaidSubjectInput {
  amount?: number | null;
  eventName?: string | null;
  currencyCode?: string | null;
}

/**
 * Refund EFT confirmation.
 *
 * Test cases:
 *   formatRefundPaidSubject({ amount: 2500, eventName: "Wedding" })
 *     -> "Refund paid - R 2 500 for Wedding"
 *   formatRefundPaidSubject({ amount: 2500 })
 *     -> "Refund paid - R 2 500"
 *   formatRefundPaidSubject({ eventName: "Wedding" })
 *     -> "Refund paid for Wedding"
 *   formatRefundPaidSubject({})
 *     -> "Refund paid"
 */
export function formatRefundPaidSubject(input: RefundPaidSubjectInput): string {
  const eventName = clean(input.eventName);
  const amountLabel = fmtMoney(input.amount ?? null, input.currencyCode);

  if (amountLabel && eventName) return `Refund paid - ${amountLabel} for ${eventName}`;
  if (amountLabel) return `Refund paid - ${amountLabel}`;
  if (eventName) return `Refund paid for ${eventName}`;
  return "Refund paid";
}
