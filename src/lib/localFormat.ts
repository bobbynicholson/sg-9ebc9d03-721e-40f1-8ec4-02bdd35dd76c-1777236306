/**
 * Centralised SA-locale date / time formatters.
 *
 * Bobby's rule: dates and times across the catering portals should
 * render consistently in en-ZA - "21 May 2026", "14:30" - not the
 * browser-default US-style "5/21/2026" / "14:30:00" / "2:30 PM"
 * mix. Every customer-facing page (driver, kitchen, cleaning,
 * shopping, client portal) reaches for these instead of calling
 * Date.toLocaleDateString() directly.
 *
 * Admin / platform-only surfaces (super-admin currency monitoring,
 * trial management) can stay on their own formatters because they
 * read internally.
 *
 * Inputs accepted:
 *   - ISO date strings ("2026-05-21")
 *   - ISO timestamps ("2026-05-21T14:30:00Z")
 *   - Date objects
 *   - HH:MM(:SS) strings (clock time only - no date conversion)
 *   - null / undefined (returns the fallback)
 */

const LOCALE = "en-ZA";

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function asDate(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * "21 May 2026". Falls back to the empty fallback string when the
 * input can't be parsed.
 */
export function formatLocalDate(
  input: string | Date | null | undefined,
  fallback = "",
): string {
  const d = asDate(input);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, DATE_OPTS);
}

/**
 * "14:30". Accepts an HH:MM:SS / HH:MM clock string OR a full date
 * value. Bare clock strings skip Date parsing so we don't lose
 * accuracy across timezones.
 */
export function formatLocalTime(
  input: string | Date | null | undefined,
  fallback = "",
): string {
  if (input == null) return fallback;
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return fallback;
    // Bare clock-time pattern: HH or HH:MM or HH:MM:SS
    if (/^\d{1,2}(:\d{2})?(:\d{2})?$/.test(s)) {
      return s.length >= 5 ? s.slice(0, 5) : s;
    }
  }
  const d = asDate(input);
  if (!d) return fallback;
  return d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * "21 May 2026, 14:30". Combined display for timestamps.
 */
export function formatLocalDateTime(
  input: string | Date | null | undefined,
  fallback = "",
): string {
  const d = asDate(input);
  if (!d) return fallback;
  return d.toLocaleString(LOCALE, DATETIME_OPTS);
}
