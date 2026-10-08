/**
 * One time zone and one time format for the whole portal.
 *
 * Every company picks a time zone (companies.timezone) and a time
 * format (companies.time_format: "24h" -> "14:30", "12h" -> "2:30 PM")
 * on the Company profile page. Once set here (PortalTimeSync does it
 * after sign-in), every date / time the portal shows follows them, no
 * matter which country the person looking at the screen is in.
 *
 * How: the portal formats dates in ~700 places with toLocaleString /
 * toLocaleDateString / toLocaleTimeString / Intl.DateTimeFormat, none
 * of which named a time zone, so the browser's own zone was used. This
 * module makes the company's zone and format the DEFAULT for those
 * calls. A call that names its own timeZone / hour12 / hourCycle keeps
 * it (e.g. building "14:30" for an <input type="time">).
 *
 * Calendar dates stay on their day: a value at midnight shown WITHOUT
 * a time ("10 Oct") is a calendar date, not a moment, so it is not
 * moved into another zone (that would show 9 Oct for someone east of
 * the company).
 *
 * Event / pickup times are stored as a date plus a clock time
 * ("2026-10-10" + "13:00") meaning 13:00 company time. Build those
 * with tenantDateTime(), never new Date(`${date}T${time}`), which
 * would read 13:00 in the viewer's own zone.
 */

export type TimeFormat = "24h" | "12h";

export interface PortalTimeSettings {
  timeZone: string | null;
  timeFormat: TimeFormat | null;
}

const DATE_KEYS = ["weekday", "era", "year", "month", "day", "dateStyle"] as const;
const TIME_KEYS = ["hour", "minute", "second", "dayPeriod", "fractionalSecondDigits", "timeStyle"] as const;

let settings: PortalTimeSettings = { timeZone: null, timeFormat: null };
let installed = false;

const hasWindow = typeof window !== "undefined";
const NativeDTF = Intl.DateTimeFormat;
const native = {
  toLocaleString: Date.prototype.toLocaleString,
  toLocaleDateString: Date.prototype.toLocaleDateString,
  toLocaleTimeString: Date.prototype.toLocaleTimeString,
};

function hasAny(o: Intl.DateTimeFormatOptions | undefined, keys: readonly string[]): boolean {
  return !!o && keys.some((k) => (o as any)[k] !== undefined);
}

/** "local" / "utc" when the value sits exactly on midnight there. */
function midnightKind(d: Date): "local" | "utc" | null {
  if (isNaN(d.getTime())) return null;
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0) return "local";
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) return "utc";
  return null;
}

/** Options with the company zone / format filled in where the caller left them out. */
function withPortalDefaults(
  options: Intl.DateTimeFormatOptions | undefined,
  showsTime: boolean,
  date?: Date,
): Intl.DateTimeFormatOptions | undefined {
  const { timeZone, timeFormat } = settings;
  if (!timeZone && !timeFormat) return options;
  const out: Intl.DateTimeFormatOptions = { ...(options || {}) };
  if (out.timeZone === undefined && timeZone) {
    if (showsTime) {
      out.timeZone = timeZone;
    } else if (date) {
      const kind = midnightKind(date);
      if (kind === "utc") out.timeZone = "UTC"; // "2026-10-10" parsed as UTC midnight
      else if (kind === null) out.timeZone = timeZone; // a real moment, e.g. created_at
      // "local": a calendar day built in the browser - leave it on its day.
    }
    // Intl.DateTimeFormat without a time part: the date isn't known yet,
    // so leave it (calendar-day formatters).
  }
  if (showsTime && timeFormat && out.hour12 === undefined && out.hourCycle === undefined) {
    out.hour12 = timeFormat === "12h";
  }
  return out;
}

function install() {
  if (installed || !hasWindow) return;
  installed = true;
  // eslint-disable-next-line no-extend-native
  Date.prototype.toLocaleString = function (locales?: any, options?: Intl.DateTimeFormatOptions) {
    const showsTime = hasAny(options, TIME_KEYS) || !hasAny(options, DATE_KEYS);
    return native.toLocaleString.call(this, locales, withPortalDefaults(options, showsTime, this));
  };
  // eslint-disable-next-line no-extend-native
  Date.prototype.toLocaleDateString = function (locales?: any, options?: Intl.DateTimeFormatOptions) {
    return native.toLocaleDateString.call(this, locales, withPortalDefaults(options, hasAny(options, TIME_KEYS), this));
  };
  // eslint-disable-next-line no-extend-native
  Date.prototype.toLocaleTimeString = function (locales?: any, options?: Intl.DateTimeFormatOptions) {
    return native.toLocaleTimeString.call(this, locales, withPortalDefaults(options, true, this));
  };
  const Patched = function DateTimeFormat(locales?: any, options?: Intl.DateTimeFormatOptions) {
    return new NativeDTF(locales, withPortalDefaults(options, hasAny(options, TIME_KEYS)));
  } as unknown as typeof Intl.DateTimeFormat;
  (Patched as any).prototype = NativeDTF.prototype;
  (Patched as any).supportedLocalesOf = NativeDTF.supportedLocalesOf.bind(NativeDTF);
  (Intl as any).DateTimeFormat = Patched;
}

/** Undo install() - tests only. */
export function resetPortalTime() {
  settings = { timeZone: null, timeFormat: null };
  if (!installed) return;
  Date.prototype.toLocaleString = native.toLocaleString;
  Date.prototype.toLocaleDateString = native.toLocaleDateString;
  Date.prototype.toLocaleTimeString = native.toLocaleTimeString;
  (Intl as any).DateTimeFormat = NativeDTF;
  installed = false;
}

function validZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    new NativeDTF("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
}

/** Set the company's zone + format for everything the portal shows. */
export function setPortalTimeSettings(next: { timeZone?: string | null; timeFormat?: string | null }) {
  settings = {
    timeZone: validZone(next.timeZone),
    timeFormat: next.timeFormat === "12h" || next.timeFormat === "24h" ? next.timeFormat : null,
  };
  if (settings.timeZone || settings.timeFormat) install();
}

export function getPortalTimeSettings(): PortalTimeSettings {
  return { ...settings };
}

/** Offset of `zone` from UTC at instant `t`, in ms. */
function zoneOffsetMs(zone: string, t: number): number {
  const parts = new NativeDTF("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/**
 * The moment a stored date + clock time ("2026-10-10", "13:00")
 * happens in the company's zone. Use instead of
 * new Date(`${date}T${time}`), which reads the clock time in the
 * viewer's zone. Without a company zone it behaves exactly like that.
 * `fallbackTime` is used when `time` is empty (e.g. "12:00").
 * `zone` overrides the company zone (server code that knows it).
 */
export function tenantDateTime(
  date: string | null | undefined,
  time?: string | null,
  fallbackTime = "00:00",
  zone?: string | null,
): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || "").trim());
  if (!dm) return null;
  const tm = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?/.exec(String(time || fallbackTime).trim());
  if (!tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])];
  const [h, mi, s] = [Number(tm[1]), Number(tm[2] || 0), Number(tm[3] || 0)];
  const useZone = (zone && validZone(zone)) || settings.timeZone;
  if (!useZone) {
    const local = new Date(y, mo, d, h, mi, s);
    return isNaN(local.getTime()) ? null : local;
  }
  const wall = Date.UTC(y, mo, d, h, mi, s);
  let t = wall - zoneOffsetMs(useZone, wall);
  // Second pass lands on the right side of a daylight-saving change.
  const again = wall - zoneOffsetMs(useZone, t);
  if (again !== t) t = again;
  return new Date(t);
}

/**
 * A stored clock time ("14:30" / "14:30:00") in the company's format:
 * "14:30" or "2:30 PM". Anything that isn't a clock time comes back
 * unchanged.
 */
export function formatClock(value: string | null | undefined, fallback = ""): string {
  return formatClockAs(value, settings.timeFormat, fallback);
}

/**
 * Client-facing version: the company's chosen format first, the other
 * one in brackets - "13:00 (1:00 PM)" for 24h, "1:00 PM (13:00)" for 12h
 * - so every client can read it. Non-clock values come back unchanged.
 */
export function formatClockBoth(
  value: string | null | undefined,
  format: string | null | undefined,
  fallback = "",
): string {
  const primary = formatClockAs(value, format, "");
  if (!primary) return fallback;
  const other = formatClockAs(value, format === "12h" ? "24h" : "12h", "");
  // Non-breaking spaces so "13:00 (1:00 PM)" never wraps mid-time
  // (it split as "(1:00 / PM)" in the quote PDF's event date cell).
  const keep = (t: string) => t.replace(/ /g, " ");
  return other && other !== primary ? `${keep(primary)} (${keep(other)})` : primary;
}

/** formatClockBoth with the signed-in company's format (portal pages). */
export function formatClockWithAlt(value: string | null | undefined, fallback = ""): string {
  return formatClockBoth(value, settings.timeFormat, fallback);
}

/**
 * Same as formatClock, but with the format passed in. For code that has
 * no signed-in portal session - server-rendered PDFs, emails and the
 * public quote / invoice links - which reads companies.time_format and
 * passes it here. null / unknown format = 24-hour (the default).
 */
export function formatClockAs(
  value: string | null | undefined,
  format: string | null | undefined,
  fallback = "",
): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  if (!s) return fallback;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
  if (!m) return s;
  const h = Number(m[1]);
  const mm = m[2];
  if (h > 23) return s;
  if (format === "12h") {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  }
  return `${String(h).padStart(2, "0")}:${mm}`;
}
