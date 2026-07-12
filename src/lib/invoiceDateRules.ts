const MS_PER_DAY = 86_400_000;

/**
 * Parse invoice/order date fields as local business calendar dates.
 * Database yyyy-MM-dd values are not UTC instants and must not shift a
 * day according to the process or browser timezone.
 */
export function parseInvoiceCalendarDate(value: unknown): Date | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      const day = Number(match[3]);
      const parsed = new Date(year, monthIndex, day);
      if (
        parsed.getFullYear() === year
        && parsed.getMonth() === monthIndex
        && parsed.getDate() === day
      ) {
        return parsed;
      }
      return null;
    }
  }

  const parsed = typeof value === "number"
    ? new Date(value)
    : typeof value === "string"
      ? new Date(value)
      : null;
  if (!parsed) return null;
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function invoiceCalendarDayNumber(value: unknown): number | null {
  const parsed = parseInvoiceCalendarDate(value);
  if (!parsed) return null;
  return Math.floor(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / MS_PER_DAY,
  );
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Catering balance rule used when an invoice is created:
 *
 * - start with invoice day + configured term days;
 * - prefer the day before the event;
 * - never place the due date after the event; and
 * - never backdate it before the invoice day.
 *
 * Consequently, a same-day or already-past event is due on the invoice
 * day, not termDays later and not on a historical date.
 */
export function calculateInvoiceDueDate(args: {
  invoiceDate: Date;
  termDays: number;
  eventDate?: unknown;
}): Date {
  const invoiceDay = parseInvoiceCalendarDate(args.invoiceDate);
  if (!invoiceDay) throw new Error("A valid invoice date is required");

  const rawTermDays = Number(args.termDays);
  const termDays = Number.isFinite(rawTermDays) && rawTermDays >= 0
    ? Math.trunc(rawTermDays)
    : 30;
  const computedDue = addCalendarDays(invoiceDay, termDays);
  const eventDay = parseInvoiceCalendarDate(args.eventDate);
  if (!eventDay) return computedDue;

  const dayBeforeEvent = addCalendarDays(eventDay, -1);
  let finalDue = dayBeforeEvent.getTime() < computedDue.getTime()
    ? dayBeforeEvent
    : computedDue;
  if (finalDue.getTime() > eventDay.getTime()) finalDue = eventDay;
  if (finalDue.getTime() < invoiceDay.getTime()) finalDue = invoiceDay;
  return finalDue;
}
