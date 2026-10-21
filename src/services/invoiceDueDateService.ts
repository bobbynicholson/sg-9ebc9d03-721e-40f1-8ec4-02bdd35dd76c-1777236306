import { calculateInvoiceDueDate, parseInvoiceCalendarDate } from "@/lib/invoiceDateRules";
import { toLocalISO, toZonedISO } from "@/lib/localDate";
import {
  DEFAULT_PAYMENT_REMINDERS, readClientPaymentSchedule, readPaymentDueSettings,
  resolvePaymentSchedule,
} from "@/lib/paymentReminderSchedule";

type Row = Record<string, any>;
const OPEN_STATUSES = ["sent", "partially_paid", "overdue"];

/** Pure correction plan shared by repairs, settings, payments and reminders.
 * Standalone/manual invoices and settled or cancelled records are untouched.
 * Only a client payment_schedule overrides the company event-based rule;
 * legacy client Net-X terms do not shorten an event balance's due date.
 */
export function planInvoiceDueDateCorrection(invoice: Row, company: Row, clientSchedule: unknown, now = new Date()) {
  const order = Array.isArray(invoice.orders) ? invoice.orders[0] : invoice.orders;
  if (!order?.id || !OPEN_STATUSES.includes(invoice.status) || !(Number(invoice.balance_due) > 0.005)
    || invoice.deleted_at || ["cancelled", "canceled"].includes(order.status)) return null;
  if (invoice.invoice_data?.dueDateSource === "manual") return null;
  const invoiceDay = parseInvoiceCalendarDate(invoice.invoice_date);
  if (!invoiceDay || !parseInvoiceCalendarDate(order.event_date)) return null;
  const policy = resolvePaymentSchedule({
    due: readPaymentDueSettings(company.dispatch_settings, company.balance_due_days),
    reminders: DEFAULT_PAYMENT_REMINDERS,
  }, readClientPaymentSchedule(clientSchedule));
  const dueDate = toLocalISO(calculateInvoiceDueDate({
    invoiceDate: invoiceDay, termDays: 30, eventDate: order.event_date, paymentDue: policy.due,
  }));
  const today = toZonedISO(now, company.timezone);
  const status = dueDate < today ? "overdue" : invoice.status === "overdue"
    ? Number(invoice.amount_paid) > 0.005 ? "partially_paid" : "sent"
    : invoice.status;
  const orderDue = order.balance_due_date ? String(order.balance_due_date).slice(0, 10) : null;
  const changeInvoice = invoice.due_date !== dueDate || invoice.invoice_data?.dueDate !== dueDate || invoice.status !== status;
  const changeOrder = orderDue !== dueDate;
  if (!changeInvoice && !changeOrder) return null;
  return {
    invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, orderId: order.id,
    previousDueDate: invoice.due_date, dueDate, previousStatus: invoice.status, status,
    previousOrderDueDate: order.balance_due_date, changeInvoice, changeOrder,
  };
}

/** Reconcile dates without creating invoices, changing money or sending email.
 * All reads/writes are tenant-scoped; optimistic checks prevent overwriting
 * a payment or an order edit that arrived while the repair was running.
 */
export async function reconcileCompanyInvoiceDueDates(db: any, companyId: string, options: {
  orderId?: string; dryRun?: boolean; now?: Date;
} = {}) {
  const { data: company, error: companyError } = await db.from("companies")
    .select("id, balance_due_days, dispatch_settings, timezone").eq("id", companyId).single();
  if (companyError || !company) throw new Error(companyError?.message || "Company payment settings unavailable");
  const invoices: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from("invoices")
      .select("id, invoice_number, invoice_date, due_date, status, amount_paid, balance_due, invoice_data, updated_at, orders:order_id(id, event_date, balance_due_date, status, client_id)")
      .eq("company_id", companyId).is("deleted_at", null).in("status", OPEN_STATUSES)
      .gt("balance_due", 0.005).not("order_id", "is", null).order("id").range(offset, offset + 499);
    if (options.orderId) query = query.eq("order_id", options.orderId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    invoices.push(...(data || []).map((row: Row) => ({
      ...row, orders: Array.isArray(row.orders) ? row.orders[0] : row.orders,
    })));
    if (!data || data.length < 500) break;
  }
  const clientIds = [...new Set(invoices.map((row) => row.orders?.client_id).filter(Boolean))];
  const schedules = new Map<string, unknown>();
  for (let offset = 0; offset < clientIds.length; offset += 200) {
    const { data, error } = await db.from("clients").select("id, payment_schedule")
      .eq("company_id", companyId).in("id", clientIds.slice(offset, offset + 200));
    // Fail closed: a missing client override must not become an early chase.
    if (error) throw new Error(error.message);
    for (const row of data || []) schedules.set(row.id, row.payment_schedule);
  }
  const corrections = invoices.flatMap((invoice) => {
    const plan = planInvoiceDueDateCorrection(invoice, company, schedules.get(invoice.orders?.client_id), options.now);
    return plan ? [{ invoice, plan }] : [];
  });
  let updatedInvoices = 0;
  let updatedOrders = 0;
  const ordersDone = new Set<string>();
  if (!options.dryRun) for (const { invoice, plan } of corrections) {
    if (plan.changeInvoice) {
      const snapshot = invoice.invoice_data && typeof invoice.invoice_data === "object" ? invoice.invoice_data : {};
      let update = db.from("invoices").update({
        due_date: plan.dueDate,
        ...(plan.status !== invoice.status ? { status: plan.status } : {}),
        invoice_data: { ...snapshot, dueDate: plan.dueDate }, updated_at: new Date().toISOString(),
      }).eq("company_id", companyId).eq("id", plan.invoiceId).eq("status", invoice.status)
        .eq("amount_paid", invoice.amount_paid).eq("balance_due", invoice.balance_due).is("deleted_at", null);
      if (invoice.updated_at) update = update.eq("updated_at", invoice.updated_at);
      const { data, error } = await update.select("id");
      if (error || !data?.length) throw new Error(error?.message || "Invoice changed during date reconciliation; retry");
      updatedInvoices++;
    }
    if (plan.changeOrder && !ordersDone.has(plan.orderId)) {
      const { data, error } = await db.from("orders").update({ balance_due_date: `${plan.dueDate}T00:00:00Z` })
        .eq("company_id", companyId).eq("id", plan.orderId).eq("event_date", invoice.orders.event_date).select("id");
      if (error || !data?.length) throw new Error(error?.message || "Order changed during date reconciliation; retry");
      ordersDone.add(plan.orderId);
      updatedOrders++;
    }
    const { error: auditError } = await db.from("audit_logs").insert({
      company_id: companyId, action: "invoice_due_date_corrected", entity_type: "invoice", entity_id: plan.invoiceId,
      details: { ...plan, reason: "Align balance due date with the event payment schedule" },
    });
    if (auditError) console.warn("[invoice-due-date] audit write failed:", auditError.message);
  }
  return { scanned: invoices.length, updatedInvoices, updatedOrders, corrections: corrections.map(({ plan }) => plan) };
}

/** Used before the overdue sweep, which must not notify from stale dates. */
export async function reconcileOpenInvoiceDueDates(db: any) {
  const companyIds = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("invoices").select("company_id, id")
      .is("deleted_at", null).in("status", OPEN_STATUSES).gt("balance_due", 0.005)
      .not("order_id", "is", null).order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const row of data || []) companyIds.add(row.company_id);
    if (!data || data.length < 1000) break;
  }
  let corrected = 0;
  for (const companyId of companyIds) corrected += (await reconcileCompanyInvoiceDueDates(db, companyId)).updatedInvoices;
  return corrected;
}
