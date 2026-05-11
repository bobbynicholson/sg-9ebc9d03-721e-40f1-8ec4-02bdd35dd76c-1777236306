/**
 * Local-timezone date helpers.
 *
 * Why this exists:
 *   `new Date().toISOString().slice(0, 10)` is the most popular way
 *   to get a "today" string in JS, and it's wrong for anyone east of
 *   the prime meridian. In SA (UTC+2), at 00:30 SAST the user is
 *   clearly on the new day, but `toISOString()` returns 22:30Z of
 *   the previous day, so the slice produces yesterday. The same trap
 *   bit our calendar grid: cells built with new Date(year, month, day)
 *   are local midnight, which is the previous UTC day, so every
 *   event ended up rendered one cell to the right of where it should.
 *
 *   These helpers do the formatting from the Date's local-tz
 *   components directly. No UTC conversion. The output matches what
 *   the user sees on their wall clock.
 */

/**
 * Format a Date as YYYY-MM-DD using its local timezone.
 *
 * Use anywhere a calendar cell key, "today" comparison, day filter,
 * or display-only date string needs to match the user's actual day.
 * Equivalent to toISOString().slice(0,10) on a server running in UTC,
 * but correct everywhere else.
 */
export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Phase 4 #3: format a Date as YYYY-MM-DD using an explicit IANA
 * timezone. Use this for tenant-scoped server code where the user's
 * browser timezone is irrelevant -- the tenant's wall clock is what
 * counts (e.g. server-side BCEA pay calc, kitchen lead-time gates,
 * cron daily-window boundaries).
 *
 * Falls back to toLocalISO if the timezone string is missing /
 * invalid so we never crash on a bad config.
 */
export function toZonedISO(d: Date, timezone: string | null | undefined): string {
  if (!timezone) return toLocalISO(d);
  try {
    // Intl.DateTimeFormat with the en-CA locale emits the YYYY-MM-DD
    // shape natively. Cheaper than juggling parts.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return toLocalISO(d);
  }
}

/**
 * Common IANA timezone choices Bobby's tenants use today + the ones
 * imminent for UK/US expansion. Mounted in the company-profile
 * picker. Order is "current populations first" so the most common
 * choice is at the top.
 */
export const TENANT_TIMEZONE_CHOICES: Array<{ value: string; label: string }> = [
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (SAST, UTC+2)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
  { value: "America/Denver", label: "America/Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (NZST/NZDT)" },
];

/** Default if no tenant timezone is set anywhere -- matches the
 *  companies.timezone column default. */
export const DEFAULT_TENANT_TIMEZONE = "Africa/Johannesburg";

/** Validate an IANA timezone string. Used by the company-profile
 *  save handler to refuse a bogus value before it lands in the DB. */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    // Throws RangeError on an unknown zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
