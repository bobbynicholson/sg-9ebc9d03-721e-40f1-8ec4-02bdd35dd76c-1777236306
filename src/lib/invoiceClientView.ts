import { invoiceCalendarDayNumber } from "@/lib/invoiceDateRules";

export { parseInvoiceCalendarDate } from "@/lib/invoiceDateRules";

type InvoiceSnapshot = Record<string, unknown> | null | undefined;

export type InvoiceHeaderIdentifier = {
  key: "registration" | "vat";
  label: "Reg No" | "VAT Reg No";
  value: string;
};

export function resolveInvoiceEventDate(
  invoiceData: InvoiceSnapshot,
  fallbackEventDate?: unknown,
): string | null {
  const candidates = [
    invoiceData?.eventDate,
    invoiceData?.event_date,
    fallbackEventDate,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (invoiceCalendarDayNumber(candidate) != null) return candidate.trim();
  }
  return null;
}

export function isInvoiceFullPaymentDue(
  eventDate: unknown,
  now: Date = new Date(),
): boolean {
  const eventDay = invoiceCalendarDayNumber(eventDate);
  const today = invoiceCalendarDayNumber(now);
  return eventDay != null && today != null && eventDay <= today;
}

export type InvoiceDueState = {
  daysToDue: number | null;
  isOverdue: boolean;
  label: string | null;
};

export function getInvoiceDueState(
  dueDate: unknown,
  now: Date = new Date(),
): InvoiceDueState {
  const dueDay = invoiceCalendarDayNumber(dueDate);
  const today = invoiceCalendarDayNumber(now);
  if (dueDay == null || today == null) {
    return { daysToDue: null, isOverdue: false, label: null };
  }

  const daysToDue = dueDay - today;
  const overdueDays = Math.abs(daysToDue);
  const label = daysToDue < 0
    ? `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`
    : daysToDue === 0
      ? "Due today"
      : daysToDue === 1
        ? "Due tomorrow"
        : `Due in ${daysToDue} days`;

  return { daysToDue, isOverdue: daysToDue < 0, label };
}

export function getInitialInvoicePaymentAmount(args: {
  totalAmount: unknown;
  balanceDue: unknown;
  depositPercent: unknown;
  eventDate: unknown;
  now?: Date;
}): number {
  const balance = Math.max(0, Number(args.balanceDue) || 0);
  if (isInvoiceFullPaymentDue(args.eventDate, args.now)) return balance;

  const rawPercent = Number(args.depositPercent);
  const depositPercent = Number.isFinite(rawPercent)
    && rawPercent > 0
    && rawPercent < 100
    ? rawPercent
    : 50;
  const total = Math.max(0, Number(args.totalAmount) || 0);
  const suggested = Math.round(total * (depositPercent / 100) * 100) / 100;
  return Math.min(suggested || balance, balance);
}

export function getInvoiceHeaderIdentifiers(company: {
  registration_number?: unknown;
  vat_registered?: unknown;
  vat_number?: unknown;
}): InvoiceHeaderIdentifier[] {
  const identifiers: InvoiceHeaderIdentifier[] = [];
  const registrationNumber = typeof company.registration_number === "string"
    ? company.registration_number.trim()
    : "";
  const vatNumber = typeof company.vat_number === "string"
    ? company.vat_number.trim()
    : "";

  if (registrationNumber) {
    identifiers.push({ key: "registration", label: "Reg No", value: registrationNumber });
  }
  if (company.vat_registered && vatNumber) {
    identifiers.push({ key: "vat", label: "VAT Reg No", value: vatNumber });
  }
  return identifiers;
}
