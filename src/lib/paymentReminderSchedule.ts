/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One company-wide payment schedule, shared by every client
 * (Settings -> Financial -> Payments):
 *
 *   Payment is due:   X days before / after the event
 *                     X = companies.balance_due_days,
 *                     direction = dispatch_settings.paymentDue.direction
 *   Payment reminder: off, or one reminder N days before payment is due
 *                     dispatch_settings.paymentReminders = { mode, days }
 *
 * Reminders are off unless the admin turns them on. Invoice due dates
 * follow the payment-due rule only once the company has saved it
 * (dispatch_settings.paymentDue present); before that the old invoice
 * rule stays in place.
 *
 * Example: due 0 days before the event, remind 5 days before -> event
 * 20 Nov: due 20 Nov, reminder 15 Nov. Due 30 days after, remind 2
 * days before -> due 20 Dec, reminder 18 Dec.
 */

export type PaymentDueDirection = "before_event" | "after_event";
export type PaymentReminderMode = "off" | "before_due";

export interface PaymentDueSettings {
  direction: PaymentDueDirection;
  days: number;
}

export interface PaymentReminderSettings {
  mode: PaymentReminderMode;
  days: number;
}

export const DEFAULT_PAYMENT_REMINDERS: PaymentReminderSettings = { mode: "off", days: 5 };

/** Days after the reminder day a missed cron run may still send it. */
export const PAYMENT_REMINDER_CATCH_UP_DAYS = 2;

const DAY_MS = 86_400_000;

function asObject(value: unknown): Record<string, any> | null {
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : null;
}

function wholeDays(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function readPaymentReminderSettings(dispatchSettings: unknown): PaymentReminderSettings {
  const raw = asObject(dispatchSettings)?.paymentReminders;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PAYMENT_REMINDERS };
  return {
    mode: raw.mode === "before_due" ? "before_due" : "off",
    days: wholeDays(raw.days, DEFAULT_PAYMENT_REMINDERS.days),
  };
}

/** Whether the company has saved the shared payment-due rule. */
export function hasPaymentDueSetting(dispatchSettings: unknown): boolean {
  const raw = asObject(dispatchSettings)?.paymentDue;
  return !!raw && typeof raw === "object";
}

/**
 * The company's payment-due rule. X days comes from balance_due_days
 * (the existing column every order already uses); the direction defaults
 * to before the event, which is what balance_due_days has always meant.
 */
export function readPaymentDueSettings(dispatchSettings: unknown, balanceDueDays: unknown): PaymentDueSettings {
  const raw = asObject(dispatchSettings)?.paymentDue;
  return {
    direction: raw?.direction === "after_event" ? "after_event" : "before_event",
    days: wholeDays(balanceDueDays, 7),
  };
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1] : null;
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Payment due date (YYYY-MM-DD) for an event, or null without an event date. */
export function paymentDueDate(eventDate: string | null | undefined, due: PaymentDueSettings): string | null {
  const event = dateOnly(eventDate);
  if (!event) return null;
  return addDays(event, due.direction === "after_event" ? due.days : -due.days);
}

/** The day the one reminder goes out, or null when off / no event date. */
export function paymentReminderTargetDate(
  reminders: PaymentReminderSettings,
  due: PaymentDueSettings,
  eventDate: string | null | undefined,
): string | null {
  if (reminders.mode !== "before_due") return null;
  const dueDate = paymentDueDate(eventDate, due);
  return dueDate ? addDays(dueDate, -reminders.days) : null;
}

/**
 * True on the reminder day and up to PAYMENT_REMINDER_CATCH_UP_DAYS after
 * it. Older reminder days never send, so turning reminders on does not
 * email every old unpaid invoice at once.
 */
export function isPaymentReminderDue(targetDate: string | null, today: string): boolean {
  if (!targetDate) return false;
  return today >= targetDate && today <= addDays(targetDate, PAYMENT_REMINDER_CATCH_UP_DAYS);
}

function dayCount(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function describePaymentDue(due: PaymentDueSettings): string {
  if (due.days === 0) return "Payment is due on the event day";
  return `Payment is due ${dayCount(due.days)} ${due.direction === "after_event" ? "after" : "before"} the event`;
}

export function describePaymentReminders(reminders: PaymentReminderSettings): string {
  if (reminders.mode !== "before_due") return "No automatic payment reminders are sent";
  if (reminders.days === 0) return "One reminder on the day payment is due, if not yet paid";
  return `One reminder ${dayCount(reminders.days)} before payment is due, if not yet paid`;
}

/**
 * Per-client override (clients.payment_schedule, Contacts -> client).
 * The client's value wins; anything it leaves out uses the company
 * setting. Empty object = client follows the company completely.
 */
export interface ClientPaymentSchedule {
  dueDirection?: PaymentDueDirection;
  dueDays?: number;
  reminderMode?: PaymentReminderMode;
  reminderDays?: number;
}

export function readClientPaymentSchedule(raw: unknown): ClientPaymentSchedule {
  const o = asObject(raw);
  if (!o) return {};
  const out: ClientPaymentSchedule = {};
  if (o.due_direction === "before_event" || o.due_direction === "after_event") out.dueDirection = o.due_direction;
  if (o.due_days !== null && o.due_days !== undefined && o.due_days !== "") {
    const d = wholeDays(o.due_days, -1);
    if (d >= 0) out.dueDays = d;
  }
  if (o.reminder_mode === "off" || o.reminder_mode === "before_due") out.reminderMode = o.reminder_mode;
  if (o.reminder_days !== null && o.reminder_days !== undefined && o.reminder_days !== "") {
    const d = wholeDays(o.reminder_days, -1);
    if (d >= 0) out.reminderDays = d;
  }
  return out;
}

/** The stored JSON for a client override; null when it overrides nothing. */
export function toClientPaymentScheduleJson(s: ClientPaymentSchedule): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (s.dueDirection) out.due_direction = s.dueDirection;
  if (s.dueDirection && s.dueDays !== undefined) out.due_days = s.dueDays;
  if (s.reminderMode) out.reminder_mode = s.reminderMode;
  if (s.reminderMode === "before_due" && s.reminderDays !== undefined) out.reminder_days = s.reminderDays;
  return Object.keys(out).length ? out : null;
}

/** Whether the client sets its own payment due date. */
export function hasClientDueOverride(s: ClientPaymentSchedule | null | undefined): boolean {
  return !!s?.dueDirection;
}

/** Client value first, company value for anything the client leaves out. */
export function resolvePaymentSchedule(
  company: { due: PaymentDueSettings; reminders: PaymentReminderSettings },
  client: ClientPaymentSchedule | null | undefined,
): { due: PaymentDueSettings; reminders: PaymentReminderSettings } {
  if (!client) return company;
  return {
    due: {
      direction: client.dueDirection ?? company.due.direction,
      days: client.dueDirection && client.dueDays !== undefined ? client.dueDays : company.due.days,
    },
    reminders: {
      mode: client.reminderMode ?? company.reminders.mode,
      days: client.reminderDays ?? company.reminders.days,
    },
  };
}

/**
 * Load overrides for a set of clients. Returns an empty map when the
 * payment_schedule column does not exist yet (before migration
 * 20261014090000) so callers fall back to the company setting.
 */
export async function fetchClientPaymentSchedules(
  db: any,
  clientIds: Array<string | null | undefined>,
): Promise<Map<string, ClientPaymentSchedule>> {
  const ids = Array.from(new Set(clientIds.filter((id): id is string => !!id)));
  const map = new Map<string, ClientPaymentSchedule>();
  if (ids.length === 0) return map;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("clients")
      .select("id, payment_schedule")
      .in("id", ids.slice(i, i + 200));
    if (error) return map;
    for (const row of (data || []) as any[]) {
      const s = readClientPaymentSchedule(row.payment_schedule);
      if (Object.keys(s).length) map.set(row.id, s);
    }
  }
  return map;
}

/** Companies with at least one client that turned reminders on for itself. */
export async function fetchCompaniesWithClientReminders(db: any): Promise<string[]> {
  const { data, error } = await db
    .from("clients")
    .select("company_id")
    .eq("payment_schedule->>reminder_mode", "before_due");
  if (error) return [];
  return Array.from(new Set(((data || []) as any[]).map((r) => r.company_id).filter(Boolean)));
}
