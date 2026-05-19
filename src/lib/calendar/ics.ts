/**
 * ICS (iCalendar) generator for client-portal "Add to calendar"
 * (CLI-I / CLI-29).
 *
 * Why a hand-rolled generator: a tiny VEVENT block does not justify
 * pulling in the `ics` npm package (45kB) when the spec is fixed -
 * single event, no recurrence, no attendees. The escape rules in
 * RFC 5545 §3.3.11 are small enough to inline.
 *
 * Outlook quirk: the file must end with CRLF + "END:VCALENDAR" +
 * CRLF or Outlook silently drops the event. Every line uses CRLF.
 *
 * Pure module - safe to import from both server (API routes) and
 * client (the AddToCalendarButton blob construction).
 */

export interface IcsEventInput {
  /** Event date in YYYY-MM-DD. Required. */
  eventDate: string;
  /** Event time in HH:MM or HH:MM:SS. Optional - defaults to 12:00 */
  eventTime?: string | null;
  /** SUMMARY text - the calendar title the user sees. */
  summary: string;
  /** Free-form description body. Newlines, commas allowed. */
  description?: string | null;
  /** LOCATION text - venue address. */
  location?: string | null;
  /** Order number for the filename + DESCRIPTION breadcrumb. */
  orderNumber?: string | null;
  /** Default duration in hours when no end time is given. Default: 4. */
  durationHours?: number;
  /** Stable UID. When omitted we synthesise from order number + date. */
  uid?: string;
}

export interface IcsEventOutput {
  ics: string;
  filename: string;
  mimeType: "text/calendar";
}

/**
 * Escape a string for an ICS TEXT property per RFC 5545 §3.3.11:
 *   backslash, comma, semicolon get backslash-escaped;
 *   newlines become the literal "\n".
 * Carriage returns are stripped because Outlook chokes on bare CR
 * inside a property value.
 */
export function escapeIcsText(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Pad a number to two digits (e.g. 9 -> "09"). */
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/**
 * Parse an HH:MM[:SS] string into {hours, minutes}. Returns midday
 * when the input is missing or unparseable so an all-day-ish event
 * still lands at a reasonable time rather than 00:00 in the user's
 * calendar.
 */
function parseTime(raw: string | null | undefined): { hours: number; minutes: number } {
  if (!raw) return { hours: 12, minutes: 0 };
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw).trim());
  if (!m) return { hours: 12, minutes: 0 };
  const hours = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const minutes = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return { hours, minutes };
}

/**
 * Floating-time DATE-TIME per RFC 5545 §3.3.5 (no Z suffix). The
 * caterer enters a wall-clock event_time and that's what the client
 * means - we don't know the venue's tz, and converting to UTC against
 * the server tz produces wrong-by-2-hours bugs every BST/SAST swap.
 * Floating time means "render in the calendar's local tz" which is
 * what every popular calendar app does.
 */
function toFloatingDateTime(eventDate: string, hours: number, minutes: number): string {
  const date = eventDate.replace(/-/g, "");
  return `${date}T${pad2(hours)}${pad2(minutes)}00`;
}

/**
 * Stable DTSTAMP - now in UTC. Required by RFC 5545; some clients
 * reject the file without it. We use UTC for this property (Z
 * suffix) because DTSTAMP is "when the calendar item was last
 * touched", not "when the event happens".
 */
function nowUtcStamp(): string {
  const d = new Date();
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/**
 * Sanitise a string for use in a filename. Lifted from
 * services/pdf/renderPdf.ts but inlined to keep this module
 * dependency-free.
 */
function sanitiseFilename(raw: string): string {
  return String(raw || "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "event";
}

/**
 * Wrap a single ICS content line at 75 octets per RFC 5545 §3.1.
 * Continuation lines start with a single space. Most clients tolerate
 * unwrapped long lines but Outlook truncates them, so we wrap.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const end = Math.min(i + (out.length === 0 ? 75 : 74), line.length);
    out.push((out.length === 0 ? "" : " ") + line.slice(i, end));
    i = end;
  }
  return out.join("\r\n");
}

/**
 * Build a single-event VCALENDAR. Returns the file body, suggested
 * filename, and the standard MIME type.
 */
export function buildEventIcs(input: IcsEventInput): IcsEventOutput {
  const time = parseTime(input.eventTime);
  const durationHours = Math.max(0.5, Math.min(24, input.durationHours ?? 4));
  const startDT = toFloatingDateTime(input.eventDate, time.hours, time.minutes);

  // End time = start + durationHours, clamped to same calendar day so
  // an evening start doesn't roll past midnight in a way most users
  // wouldn't expect. ICS supports cross-day events but our typical
  // catering window is 2-6 hours, comfortably inside the day.
  const endMinutes = Math.min(
    23 * 60 + 59,
    time.hours * 60 + time.minutes + Math.round(durationHours * 60),
  );
  const endDT = toFloatingDateTime(
    input.eventDate,
    Math.floor(endMinutes / 60),
    endMinutes % 60,
  );

  // UID per RFC 5545 must be globally unique. We synthesise from
  // order number + date so a single order produces a stable UID
  // across re-downloads (calendars dedupe on UID -> a second
  // download updates the existing entry rather than creating a
  // duplicate).
  const uid = input.uid
    || `order-${(input.orderNumber || "unknown").toLowerCase()}-${input.eventDate}@cateringms`;

  // Fold the order number into the DESCRIPTION so it's searchable
  // inside the calendar app. CLI-29 spec asked for the order number
  // to appear in the description.
  const descBody = input.description ? `${input.description}\n\n` : "";
  const descRef = input.orderNumber ? `Order ref: ${input.orderNumber}` : "";
  const description = `${descBody}${descRef}`.trim();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CateringMS//Client portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${nowUtcStamp()}`,
    `DTSTART:${startDT}`,
    `DTEND:${endDT}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
  ];
  if (input.location) {
    lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  }
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  const ics = lines.map(foldLine).join("\r\n") + "\r\n";

  const filename = `event-${sanitiseFilename(input.orderNumber || input.eventDate)}.ics`;
  return { ics, filename, mimeType: "text/calendar" };
}
