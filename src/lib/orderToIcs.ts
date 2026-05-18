/**
 * orderToIcs - build a minimal RFC 5545 .ics file body for a
 * single order so the operator can drop it into Outlook /
 * Google Calendar / Apple Calendar.
 *
 * Phase 17 #1. The dispatch lead was creating manual calendar
 * entries for every confirmed event so they showed up on their
 * phone alongside personal commitments. Pulling the existing
 * order data into a one-click .ics download removes that
 * duplicate work.
 *
 * Single VEVENT, no recurrence, no attendees - the catering
 * team is the audience, not the client. setup_time becomes the
 * VEVENT start when set, otherwise event_time. duration defaults
 * to 4 hours (typical event window) when no end is known.
 */

interface OrderForIcs {
  order_number: string | null;
  client_name: string | null;
  event_date: string | null;
  event_time: string | null;
  setup_time?: string | null;
  pickup_time?: string | null;
  guest_count: number | null;
  venue_address: string | null;
  special_instructions?: string | null;
  internal_notes?: string | null;
}

// RFC 5545 escape - backslash, semicolon, comma and newline.
const escIcs = (s: string): string =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

const fmtIcsDate = (d: Date): string => {
  // Local-time DTSTART format YYYYMMDDTHHmmSS (no Z - floating
  // local time so the calendar app pins it to whatever the
  // recipient's timezone is, which matches the operator's
  // working timezone).
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
};

function combineDateTime(date: string | null, time: string | null | undefined): Date | null {
  if (!date) return null;
  const safeTime = time ? time.slice(0, 5) : "12:00";
  const [h, m] = safeTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

export function orderToIcs(order: OrderForIcs): string {
  // Prefer setup_time as the calendar start so the prep window
  // shows up. End at pickup_time when set, otherwise +4h from
  // start as a sane default.
  const start = combineDateTime(order.event_date, order.setup_time || order.event_time)
    || combineDateTime(order.event_date, "12:00");
  if (!start) return "";
  const end = combineDateTime(order.event_date, order.pickup_time)
    || new Date(start.getTime() + 4 * 60 * 60 * 1000);

  const summary = [
    order.order_number,
    order.client_name,
    order.guest_count != null ? `(${order.guest_count} pax)` : null,
  ].filter(Boolean).join(" ").trim() || "Catering event";

  const description = [
    order.client_name && `Client: ${order.client_name}`,
    order.guest_count != null && `Guests: ${order.guest_count}`,
    order.event_time && `Event start: ${order.event_time.slice(0, 5)}`,
    order.setup_time && `Setup at: ${order.setup_time.slice(0, 5)}`,
    order.pickup_time && `Pickup at: ${order.pickup_time.slice(0, 5)}`,
    order.special_instructions && `Client note: ${order.special_instructions}`,
    order.internal_notes && `Internal: ${order.internal_notes}`,
  ].filter(Boolean).join("\n");

  const uid = `${order.order_number || "order"}-${Date.now()}@cateringms`;
  const dtstamp = fmtIcsDate(new Date()) + "Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CateringMS//Order Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${fmtIcsDate(start)}`,
    `DTEND:${fmtIcsDate(end)}`,
    `SUMMARY:${escIcs(summary)}`,
    order.venue_address ? `LOCATION:${escIcs(order.venue_address)}` : "",
    description ? `DESCRIPTION:${escIcs(description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

export function downloadOrderIcs(order: OrderForIcs): void {
  const body = orderToIcs(order);
  if (!body) return;
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeNum = String(order.order_number || "order").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.download = `${safeNum}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
