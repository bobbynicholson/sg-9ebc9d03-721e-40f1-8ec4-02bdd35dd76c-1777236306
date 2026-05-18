/**
 * Wave 54-58 - centralised display formatters.
 *
 * Single home for every "render this DB value as a human string"
 * transform on the platform. Pre-Wave-54 each call site invented its
 * own pattern, leading to: US date format on SA tenants
 * (toLocaleDateString() with no locale), trailing-zero-stripped money
 * (R9223.5 instead of R9 223.50), raw enum leaks (Credit_card • 1500),
 * and 5 different fallbacks for null data (blank / 0 / null / "missing" / --).
 *
 * Default locale is en-ZA. Tenant-specific overrides flow through the
 * companies table once that field exists; for now en-ZA + Africa/Johannesburg
 * cover 100% of live tenants.
 */

const DEFAULT_LOCALE = "en-ZA";

/**
 * Format a date or ISO string as a human-readable date.
 *
 * Default: "16 May" for current year, "16 May 2027" cross-year.
 * Pass `{ year: true }` to force the year. Pass `{ time: true }` to
 * include "16 May 14:30".
 *
 * Returns "--" for null / undefined / unparseable input.
 */
export function formatDate(
  input: string | Date | null | undefined,
  opts: { year?: boolean; time?: boolean; longMonth?: boolean } = {},
): string {
  if (input === null || input === undefined || input === "") return "--";
  let d: Date;
  try {
    d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return "--";
  } catch {
    return "--";
  }

  const sameYear = d.getFullYear() === new Date().getFullYear();
  const includeYear = opts.year || !sameYear;

  const dateOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: opts.longMonth ? "long" : "short",
  };
  if (includeYear) dateOptions.year = "numeric";

  const datePart = d.toLocaleDateString(DEFAULT_LOCALE, dateOptions);
  if (!opts.time) return datePart;

  const timePart = d.toLocaleTimeString(DEFAULT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart}`;
}

/**
 * Format a money value. Always 2 dp, en-ZA thousand separator (thin
 * space). The currency code prefix (e.g. "R") is provided by the
 * caller via opts.currency - the formatter itself stays
 * currency-agnostic.
 *
 * Returns "--" for null / undefined / NaN. Returns "R0.00" for
 * explicit zero (caller may swap to "Free" or "--" if that's the
 * preferred display for zero).
 */
export function formatMoney(
  amount: number | string | null | undefined,
  opts: { currency?: string } = {},
): string {
  if (amount === null || amount === undefined || amount === "") return "--";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "--";
  const formatted = n.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${opts.currency || ""}${formatted}`;
}

/**
 * Render a fallback for null / undefined / empty values. Default
 * fallback is "--" (double hyphen). Pass a custom string when "Not
 * set" reads better in context ("Venue not set", "Guests not set").
 */
export function formatNullable<T>(value: T | null | undefined, fallback = "--"): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  return String(value);
}

/**
 * Turn a snake_case enum value into a sentence-case human label.
 *   "in_transit"  -> "In transit"
 *   "credit_card" -> "Credit card"
 *   "company_admin" -> "Company admin"
 *
 * Returns the input unchanged if it's null / empty.
 */
export function humaniseEnum(value: string | null | undefined): string {
  if (!value) return "";
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Display tenant timezone identifier. Wave 54 - hardcoded en-ZA;
 *  becomes a tenant lookup once companies.timezone is the truth source. */
export const TENANT_LOCALE = DEFAULT_LOCALE;
export const TENANT_TIMEZONE = "Africa/Johannesburg";

/**
 * Wave 61 - proper SA-style ZAR formatter with thousand separators.
 *
 * Pre-Wave-61 the invoices page formatter (`useTenantCurrency.format`)
 * called `Number(n).toFixed(decimals)` which produces "R 15453.50"
 * with no thousand separator - unreadable for any tenant with
 * R250 000+ receivables. The bookkeeper has to count zeros to
 * reconcile against the bank statement.
 *
 * This util uses Intl.NumberFormat with en-ZA so the output reads
 * "R 15 453.50" (modern SA web standard: thin/non-breaking space
 * thousand separator, dot decimal). We force 2dp everywhere so a
 * row showing R890 doesn't read inconsistent next to R890.50.
 *
 * Pass `currency: "ZAR"` (default) for the auto-prefix; pass a
 * different code for tenants in BWP / NAD / etc. once multi-
 * currency lands.
 */
export function formatZAR(
  amount: number | string | null | undefined,
  opts: { currency?: string; decimals?: number } = {},
): string {
  if (amount === null || amount === undefined || amount === "") return "--";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "--";
  const decimals = opts.decimals ?? 2;
  try {
    const formatted = new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency: opts.currency || "ZAR",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
    // Intl returns "R 15 453,50" by default (comma decimal). The
    // codebase + Bobby's screenshots use dot decimal everywhere
    // (R 15 453.50) - normalise so display matches the rest of
    // the platform.
    return formatted.replace(",", ".");
  } catch {
    // Fallback: bare prefix + fixed-decimal string (matches the old
    // useTenantCurrency behaviour) so a missing Intl runtime never
    // crashes the page.
    return `R ${n.toFixed(decimals)}`;
  }
}
