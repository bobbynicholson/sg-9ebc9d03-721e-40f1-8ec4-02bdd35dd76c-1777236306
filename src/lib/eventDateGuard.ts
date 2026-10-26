import { DEFAULT_TENANT_TIMEZONE, toZonedISO } from "@/lib/localDate";
import { isPastCalendarDate } from "@/lib/quotes/revisionLifecycle";

/**
 * True when an event's calendar date is before the tenant's current day.
 * Date-only values are compared as YYYY-MM-DD strings so parsing them as
 * UTC midnight cannot shift the event across a day boundary.
 */
export function hasEventDatePassed(
  eventDate: string | null | undefined,
  now: Date = new Date(),
  timezone?: string | null,
): boolean {
  if (!eventDate) return false;
  return isPastCalendarDate(
    eventDate,
    tenantCalendarDate(now, timezone),
  );
}

/** Current YYYY-MM-DD in the tenant's configured timezone. */
export function tenantCalendarDate(now: Date = new Date(), timezone?: string | null): string {
  return toZonedISO(now, timezone || DEFAULT_TENANT_TIMEZONE);
}

/** Add calendar days to a YYYY-MM-DD value without local/UTC rollover. */
export function shiftCalendarDate(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !Number.isInteger(days)) return value;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
    .toISOString()
    .slice(0, 10);
}

/** Whole calendar days from the tenant's today to an event date. */
export function daysUntilEventDate(
  eventDate: string | null | undefined,
  now: Date = new Date(),
  timezone?: string | null,
): number | null {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const today = tenantCalendarDate(now, timezone);
  const eventMidnight = Date.parse(`${eventDate}T00:00:00Z`);
  const todayMidnight = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(eventMidnight) || !Number.isFinite(todayMidnight)) return null;
  return Math.round((eventMidnight - todayMidnight) / 86_400_000);
}
