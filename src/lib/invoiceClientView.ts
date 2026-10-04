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

export function isInvoiceFullPaymentDueByDate(args: {
  eventDate?: unknown;
  dueDate?: unknown;
  now?: Date;
}): boolean {
  return isInvoiceFullPaymentDue(args.dueDate, args.now)
    || isInvoiceFullPaymentDue(args.eventDate, args.now);
}

/**
 * Resolve the agreed first-payment amount for an invoice. Explicit order
 * amounts and invoice snapshots win; percentage policy is only a fallback
 * for order invoices created before a fixed amount was saved.
 */
export function resolveInvoiceFirstPaymentAmount(args: {
  totalAmount: unknown;
  orderDepositAmount?: unknown;
  snapshotFirstPaymentAmount?: unknown;
  orderDepositPercent?: unknown;
  companyDepositPercent?: unknown;
  defaultDepositPercent?: unknown;
}): number {
  const total = Math.max(0, Number(args.totalAmount) || 0);
  if (total <= 0) return 0;

  const resolveExplicitAmount = (value: unknown): number => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0
      ? Math.round(Math.min(total, amount) * 100) / 100
      : 0;
  };
  const orderAmount = resolveExplicitAmount(args.orderDepositAmount);
  if (orderAmount > 0) return orderAmount;

  const snapshotAmount = resolveExplicitAmount(args.snapshotFirstPaymentAmount);
  if (snapshotAmount > 0) return snapshotAmount;

  const validPercent = (value: unknown): number | null => {
    const percent = Number(value);
    return Number.isFinite(percent) && percent > 0 && percent < 100
      ? percent
      : null;
  };
  const percent = validPercent(args.orderDepositPercent)
    ?? validPercent(args.companyDepositPercent)
    ?? validPercent(args.defaultDepositPercent);
  if (percent == null) return 0;

  return Math.round(total * (percent / 100) * 100) / 100;
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
  amountPaid?: unknown;
  depositPercent: unknown;
  firstPaymentAmount?: unknown;
  eventDate: unknown;
  dueDate?: unknown;
  now?: Date;
}): number {
  const balance = Math.max(0, Number(args.balanceDue) || 0);
  if (isInvoiceFullPaymentDueByDate({
    eventDate: args.eventDate,
    dueDate: args.dueDate,
    now: args.now,
  })) return balance;
  const paid = Math.max(0, Number(args.amountPaid) || 0);

  const savedFirstPayment = Number(args.firstPaymentAmount);
  if (args.firstPaymentAmount != null && Number.isFinite(savedFirstPayment) && savedFirstPayment > 0) {
    const stillNeededForFirstPayment = Math.max(0, Math.round((savedFirstPayment - paid) * 100) / 100);
    return Math.min(stillNeededForFirstPayment || (paid >= savedFirstPayment ? balance : 0), balance);
  }

  const rawPercent = Number(args.depositPercent);
  const depositPercent = Number.isFinite(rawPercent)
    && rawPercent > 0
    && rawPercent < 100
    ? rawPercent
    : 50;
  const total = Math.max(0, Number(args.totalAmount) || 0);
  const suggested = Math.round(total * (depositPercent / 100) * 100) / 100;
  const stillNeededForDeposit = Math.max(0, Math.round((suggested - paid) * 100) / 100);
  return Math.min(stillNeededForDeposit || (paid >= suggested ? balance : 0), balance);
}

/**
 * The invoice ledger keeps the full unpaid balance until money arrives, but
 * the client order page also shows the later balance after the agreed first
 * payment. This keeps the staged payment schedule clear without changing the
 * invoice's actual outstanding-balance figure.
 */
export function getInvoiceBalanceAfterFirstPayment(args: {
  totalAmount: unknown;
  balanceDue: unknown;
  amountPaid: unknown;
  firstPaymentAmount: unknown;
  eventDate: unknown;
  dueDate?: unknown;
  now?: Date;
}): number {
  const outstanding = Math.max(0, Number(args.balanceDue) || 0);
  if (isInvoiceFullPaymentDueByDate({
    eventDate: args.eventDate,
    dueDate: args.dueDate,
    now: args.now,
  })) return outstanding;

  const total = Math.max(0, Number(args.totalAmount) || 0);
  const amountPaid = Math.max(0, Number(args.amountPaid) || 0);
  const firstPayment = Math.max(0, Number(args.firstPaymentAmount) || 0);
  if (firstPayment <= 0) return outstanding;

  const balanceAfterFirstPayment = Math.max(0, total - Math.max(firstPayment, amountPaid));
  return Math.min(outstanding, Math.round(balanceAfterFirstPayment * 100) / 100);
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
