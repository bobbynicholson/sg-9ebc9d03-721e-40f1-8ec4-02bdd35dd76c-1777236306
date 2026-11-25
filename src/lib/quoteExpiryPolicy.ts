export type QuoteExpiryMode = "valid_until" | "event_date";

export function readQuoteExpiryMode(dispatchSettings: unknown): QuoteExpiryMode {
  const value = (dispatchSettings as Record<string, unknown> | null)?.quoteExpiryMode;
  return value === "event_date" ? "event_date" : "valid_until";
}

export function quoteExpiryDate(
  quote: { valid_until?: string | null; event_date?: string | null },
  mode: QuoteExpiryMode,
): string | null {
  // A quote without an event date still needs a deadline.
  return (mode === "event_date" ? quote.event_date || quote.valid_until : quote.valid_until) || null;
}

export function isQuotePastExpiry(
  quote: { valid_until?: string | null; event_date?: string | null },
  mode: QuoteExpiryMode,
  todayIso: string,
): boolean {
  const date = quoteExpiryDate(quote, mode);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.slice(0, 10))) return false;
  const dateKey = date.slice(0, 10);
  return mode === "event_date" && quote.event_date
    ? dateKey <= todayIso
    : dateKey < todayIso;
}
