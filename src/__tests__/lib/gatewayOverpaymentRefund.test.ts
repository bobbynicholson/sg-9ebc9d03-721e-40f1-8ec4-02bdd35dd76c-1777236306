/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// An online payment that settles above the invoice balance queues a pending
// refund for the extra, net of refunds already open, and never twice.
jest.mock("@/services/invoiceDueDateService", () => ({ reconcileCompanyInvoiceDueDates: jest.fn(async () => undefined) }));

import { applyVerifiedPayment } from "@/lib/tenantGatewaySettlement";

const inserts: any[] = [];
let openRefunds: any[] = [];
let settlement: any = {};

function from(table: string) {
  const api: any = {
    select: () => api, eq: () => api, in: () => api, or: () => api,
    insert: (values: any) => { inserts.push({ table, values }); return api; },
    single: async () => ({ data: { id: "refund-1" }, error: null }),
    maybeSingle: async () => ({ data: table === "invoices" ? { invoice_number: "INV-1", client_id: "client-1", order_id: "order-1" } : null, error: null }),
    then: (resolve: any) => resolve({ data: table === "payments" ? openRefunds : [], error: null }),
  };
  return api;
}
const admin = { from, rpc: async () => ({ data: settlement, error: null }) };
const payment = { provider: "payfast" as const, transactionId: "pf-1", companyId: "co-1", orderId: "order-1", paymentType: "balance", invoiceId: "inv-1", amount: 7000, currency: "ZAR" };

beforeEach(() => {
  inserts.length = 0; openRefunds = [];
  settlement = { payment_id: "pay-1", invoice_id: "inv-1", order_id: "order-1", duplicate: false, amount_paid: 7000, balance_due: 0, overpayment_amount: 175 };
});

describe("online payment above the balance", () => {
  it("queues a pending refund for the extra", async () => {
    await applyVerifiedPayment(admin, payment, "evt-1");
    expect(inserts).toEqual([{ table: "payments", values: expect.objectContaining({
      payment_type: "refund", payment_status: "pending", amount: 175, invoice_id: "inv-1", transaction_id: "gateway-overpayment:pay-1",
    }) }]);
  });

  it("leaves out refunds already open for the same money", async () => {
    openRefunds = [{ amount: 175 }];
    await applyVerifiedPayment(admin, payment, "evt-1");
    expect(inserts).toHaveLength(0);
  });

  it("does nothing on a repeated webhook or a normal payment", async () => {
    settlement = { ...settlement, duplicate: true };
    await applyVerifiedPayment(admin, payment, "evt-1");
    settlement = { ...settlement, duplicate: false, overpayment_amount: 0 };
    await applyVerifiedPayment(admin, payment, "evt-1");
    expect(inserts).toHaveLength(0);
  });
});
