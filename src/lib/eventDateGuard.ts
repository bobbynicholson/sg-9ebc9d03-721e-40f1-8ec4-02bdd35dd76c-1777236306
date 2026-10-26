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
    toZonedISO(now, timezone || DEFAULT_TENANT_TIMEZONE),
  );
}
