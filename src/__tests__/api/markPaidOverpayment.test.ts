/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// A client who pays more than the invoice balance: the team records the
// real amount and chooses what happens to the extra (client credit or a
// refund to pay out). It used to be refused, so the extra was lost.
const INVOICE = { id: "11111111-1111-1111-1111-111111111111", company_id: "co-1", client_id: "client-1", total_amount: 6825, balance_due: 6825, status: "sent", invoice_number: "INV-1", order_id: "order-1" };
let invoiceRow: any = { ...INVOICE };
const rpcCalls: any[] = [];
const inserts: Array<{ table: string; values: any }> = [];

function svcFrom(table: string) {
  const api: any = {
    select: () => api, eq: () => api,
    update: () => api,
    insert: (values: any) => { inserts.push({ table, values }); return api; },
    single: async () => ({ data: { id: "extra-1" }, error: null }),
    // payments: no earlier entry with this key; invoices: the state after recording.
    maybeSingle: async () => ({ data: table === "payments" ? null : { id: INVOICE.id, status: "paid", amount_paid: 6825, balance_due: 0 }, error: null }),
    then: (resolve: any) => resolve({ error: null }),
  };
  return api;
}

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/services/payments/notifyInvoicePaid", () => ({ notifyInvoicePaid: jest.fn(async () => undefined) }));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: svcFrom,
    rpc: async (name: string, args: any) => { rpcCalls.push({ name, args }); return { data: { payment_id: "pay-1" }, error: null }; },
  }),
}));
jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const api: any = {
        select: () => api, eq: () => api,
        maybeSingle: async () => ({
          data: table === "profiles" ? { role: "company_admin", active_role: null, company_id: "co-1" }
            : table === "companies" ? { currency: "ZAR" } : invoiceRow,
          error: null,
        }),
      };
      return api;
    },
  }),
}));

import handler from "@/pages/api/admin/invoices/[id]/mark-paid";

async function record(body: any) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method: "POST", query: { id: INVOICE.id }, headers: {}, body: { paymentMethod: "eft", idempotencyKey: "key-12345678", ...body } } as any, res);
  return res;
}

beforeEach(() => { invoiceRow = { ...INVOICE }; rpcCalls.length = 0; inserts.length = 0; });

describe("recording a payment larger than the balance", () => {
  it("asks what to do with the extra instead of recording anything", async () => {
    const res = await record({ amount: 7000 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/client credit or refund/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("keeps the extra as client credit: the invoice takes what was owed", async () => {
    const res = await record({ amount: 7000, extraHandling: "credit" });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls[0].args.p_amount).toBe(6825);
    expect(inserts).toContainEqual({ table: "payments", values: expect.objectContaining({
      payment_type: "credit_issue", amount: 175, payment_status: "completed", client_id: "client-1", invoice_id: null,
    }) });
    expect(res.body).toMatchObject({ extraAmount: 175, extraHandling: "credit", extraWarning: null });
  });

  it("refunds the extra: the full amount is recorded and a pending refund is queued", async () => {
    const res = await record({ amount: 7000, extraHandling: "refund" });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls[0].args.p_amount).toBe(7000);
    expect(inserts).toContainEqual({ table: "payments", values: expect.objectContaining({
      payment_type: "refund", amount: 175, payment_status: "pending", invoice_id: INVOICE.id,
    }) });
  });

  it("refuses credit when the invoice has no client record", async () => {
    invoiceRow = { ...INVOICE, client_id: null };
    const res = await record({ amount: 7000, extraHandling: "credit" });
    expect(res.statusCode).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("still refuses money on a paid invoice without a credit/refund choice", async () => {
    invoiceRow = { ...INVOICE, status: "paid", balance_due: 0 };
    const res = await record({ amount: 500 });
    expect(res.statusCode).toBe(409);
    expect(rpcCalls).toHaveLength(0);
  });

  it("client paid twice: on a paid invoice the whole amount becomes credit, nothing added to the invoice", async () => {
    invoiceRow = { ...INVOICE, status: "paid", balance_due: 0 };
    const res = await record({ amount: 6825, extraHandling: "credit" });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toHaveLength(0);
    expect(inserts).toContainEqual({ table: "payments", values: expect.objectContaining({ payment_type: "credit_issue", amount: 6825 }) });
  });

  it("client paid twice: refunding records the money and queues the whole amount as a refund", async () => {
    invoiceRow = { ...INVOICE, status: "paid", balance_due: 0 };
    const res = await record({ amount: 6825, extraHandling: "refund" });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls[0].args.p_amount).toBe(6825);
    expect(inserts).toContainEqual({ table: "payments", values: expect.objectContaining({ payment_type: "refund", amount: 6825, payment_status: "pending" }) });
  });

  it("records an exact payment as before, with no extra rows", async () => {
    const res = await record({ amount: 6825 });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls[0].args.p_amount).toBe(6825);
    expect(inserts.filter((i) => i.table === "payments")).toHaveLength(0);
  });
});
