/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// The team can spend a client's store credit on an invoice from the
// Record payment window, once per request id.
const INVOICE_ID = "11111111-1111-1111-1111-111111111111";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const rpcCalls: any[] = [];
let invoiceRow: any;

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/services/cancellation/clientCreditBalance", () => ({ getClientCreditBalance: async () => ({ available: 175 }) }));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    rpc: async (name: string, args: any) => { rpcCalls.push({ name, args }); return { data: { redeemed_amount: 175 }, error: null }; },
    from: () => {
      const api: any = { select: () => api, eq: () => api, insert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: { status: "partially_paid", amount_paid: 175, balance_due: 6650 }, error: null }) };
      return api;
    },
  }),
}));
jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const api: any = { select: () => api, eq: () => api,
        maybeSingle: async () => ({ data: table === "profiles" ? { role: "company_admin", company_id: "co-1" } : invoiceRow }) };
      return api;
    },
  }),
}));

import handler from "@/pages/api/admin/invoices/[id]/apply-credit";

async function call(method: string, body?: any) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method, query: { id: INVOICE_ID }, headers: {}, body } as any, res);
  return res;
}

beforeEach(() => {
  rpcCalls.length = 0;
  invoiceRow = { id: INVOICE_ID, company_id: "co-1", client_id: "client-1", order_id: "order-1", balance_due: 6825, status: "sent" };
});

describe("using client credit from Record payment", () => {
  it("shows how much credit the client has", async () => {
    const res = await call("GET");
    expect(res.body).toMatchObject({ ok: true, available: 175, maxApplicable: 175 });
  });

  it("spends it through the once-only credit RPC", async () => {
    const res = await call("POST", { amount: 175, requestId: REQUEST_ID });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([{ name: "redeem_client_credit_once", args: expect.objectContaining({
      p_client_id: "client-1", p_invoice_id: INVOICE_ID, p_requested_amount: 175, p_request_id: REQUEST_ID,
    }) }]);
    expect(res.body).toMatchObject({ used: 175, balanceDue: 6650 });
  });

  it("refuses without a request id, so a retry can't spend twice", async () => {
    const res = await call("POST", { amount: 175 });
    expect(res.statusCode).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses when the invoice has no client", async () => {
    invoiceRow = { ...invoiceRow, client_id: null };
    const res = await call("POST", { amount: 175, requestId: REQUEST_ID });
    expect(res.statusCode).toBe(400);
  });
});
