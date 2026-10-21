import { planInvoiceDueDateCorrection, reconcileCompanyInvoiceDueDates } from "@/services/invoiceDueDateService";

const now = new Date("2026-10-21T12:00:00Z");
const company = { id: "company-1", balance_due_days: 2, timezone: "Africa/Johannesburg", dispatch_settings: { paymentDue: { direction: "before_event" } } };
const invoice = {
  id: "invoice-1", invoice_number: "INV-1", invoice_date: "2026-10-01", due_date: "2026-10-09",
  status: "overdue", amount_paid: 500, balance_due: 500, updated_at: "2026-10-20T12:00:00Z",
  invoice_data: { dueDate: "2026-10-09", items: [{ description: "Saved catering" }] },
  orders: { id: "order-1", client_id: "client-1", event_date: "2026-11-27", balance_due_date: "2026-11-20T00:00:00Z", status: "confirmed" },
};

describe("event balance due dates", () => {
  it("uses event minus two days and removes a false overdue status after a deposit", () => {
    expect(planInvoiceDueDateCorrection(invoice, company, null, now)).toMatchObject({ dueDate: "2026-11-25", status: "partially_paid", changeOrder: true });
  });
  it("restores sent for an unpaid future invoice", () => {
    expect(planInvoiceDueDateCorrection({ ...invoice, amount_paid: 0 }, company, null, now)?.status).toBe("sent");
  });
  it("keeps a genuinely overdue small balance overdue", () => {
    const row = { ...invoice, balance_due: 1.22, orders: { ...invoice.orders, event_date: "2026-10-13" } };
    expect(planInvoiceDueDateCorrection(row, company, null, now)).toMatchObject({ dueDate: "2026-10-11", status: "overdue" });
  });
  it("respects an explicit client schedule including after-event terms", () => {
    expect(planInvoiceDueDateCorrection(invoice, company, { due_direction: "after_event", due_days: 30 }, now)?.dueDate).toBe("2026-12-27");
  });
  it("uses the stored balance offset even before the direction JSON was saved", () => {
    expect(planInvoiceDueDateCorrection(invoice, { ...company, dispatch_settings: {} }, null, now)?.dueDate).toBe("2026-11-25");
  });
  it("does not backdate a newly issued late-event invoice", () => {
    expect(planInvoiceDueDateCorrection({ ...invoice, invoice_date: "2026-11-27" }, company, null, now)?.dueDate).toBe("2026-11-27");
  });
  it("does not mark a due-today balance overdue at the start of the tenant's day", () => {
    const row = { ...invoice, orders: { ...invoice.orders, event_date: "2026-10-24" } };
    expect(planInvoiceDueDateCorrection(row, company, null, new Date("2026-10-21T22:30:00Z"))?.status).toBe("partially_paid");
  });
  it.each(["paid", "draft", "voided", "written_off"])("does not change %s invoices", (status) => {
    expect(planInvoiceDueDateCorrection({ ...invoice, status }, company, null, now)).toBeNull();
  });
  it("does not change standalone, manual, cancelled, deleted or settled records", () => {
    for (const patch of [
      { orders: null }, { invoice_data: { dueDateSource: "manual" } },
      { orders: { ...invoice.orders, status: "cancelled" } }, { deleted_at: "2026-10-20" }, { balance_due: 0 },
    ]) expect(planInvoiceDueDateCorrection({ ...invoice, ...patch }, company, null, now)).toBeNull();
  });
  it("does not manufacture dates when the event date is missing or invalid", () => {
    expect(planInvoiceDueDateCorrection({ ...invoice, orders: { ...invoice.orders, event_date: "2026-02-30" } }, company, null, now)).toBeNull();
  });
  it("is idempotent after dates, status and preview snapshot are corrected", () => {
    const row = { ...invoice, due_date: "2026-11-25", status: "partially_paid", invoice_data: { dueDate: "2026-11-25" }, orders: { ...invoice.orders, balance_due_date: "2026-11-25T00:00:00Z" } };
    expect(planInvoiceDueDateCorrection(row, company, null, now)).toBeNull();
  });
});

function fakeDb() {
  const writes: Array<{ table: string; patch: any; filters: any[] }> = [];
  const db = {
    from(table: string) {
      let patch: any;
      const filters: any[] = [];
      const builder: any = {
        select: () => builder, is: () => builder, in: () => builder, gt: () => builder,
        not: () => builder, order: () => builder, range: () => builder,
        eq: (...args: any[]) => { filters.push(args); return builder; },
        single: async () => ({ data: company, error: null }),
        update: (value: any) => { patch = value; return builder; },
        insert: (value: any) => { patch = value; return builder; },
        then: (resolve: any) => {
          if (patch) { writes.push({ table, patch, filters }); return Promise.resolve(resolve({ data: [{ id: invoice.id }], error: null })); }
          return Promise.resolve(resolve({ data: table === "invoices" ? [invoice] : [{ id: "client-1", payment_schedule: null }], error: null }));
        },
      };
      return builder;
    },
  };
  return { db, writes };
}

it("dry run plans the repair without writing any records", async () => {
  const { db, writes } = fakeDb();
  const result = await reconcileCompanyInvoiceDueDates(db, company.id, { dryRun: true, now });
  expect(result.corrections).toHaveLength(1);
  expect(writes).toHaveLength(0);
});

it("updates the date, snapshot and status with tenant/race guards while preserving financial values", async () => {
  const { db, writes } = fakeDb();
  const result = await reconcileCompanyInvoiceDueDates(db, company.id, { now });
  expect(result.updatedInvoices).toBe(1);
  expect(result.updatedOrders).toBe(1);
  const update = writes.find((row) => row.table === "invoices")!;
  expect(update.patch).toMatchObject({ due_date: "2026-11-25", status: "partially_paid", invoice_data: { dueDate: "2026-11-25", items: invoice.invoice_data.items } });
  expect(update.filters).toEqual(expect.arrayContaining([["company_id", company.id], ["updated_at", invoice.updated_at], ["amount_paid", 500]]));
  for (const field of ["amount_paid", "balance_due", "total_amount", "subtotal", "tax_amount"]) expect(update.patch).not.toHaveProperty(field);
  expect(writes.some((row) => row.table === "audit_logs")).toBe(true);
});
