/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// A client paying by EFT uses their store credit first and transfers only
// the rest. Pay-link token required; never while a transfer is being checked.
const INVOICE_ID = "11111111-1111-1111-1111-111111111111";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const rpcCalls: any[] = [];
let pendingClaims: any[] = [];
const INVOICE = { id: INVOICE_ID, company_id: "co-1", client_id: "client-1", order_id: "order-1", balance_due: 6825, status: "sent", deleted_at: null, public_token: "tok-1" };

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/services/cancellation/clientCreditBalance", () => ({ getClientCreditBalance: async () => ({ available: 0 }) }));
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    rpc: async (name: string, args: any) => { rpcCalls.push({ name, args }); return { data: { redeemed_amount: 175 }, error: null }; },
    from: (table: string) => {
      const api: any = { select: () => api, eq: () => api, limit: async () => ({ data: pendingClaims }),
        maybeSingle: async () => ({ data: table === "invoices" && rpcCalls.length ? { balance_due: 6650, status: "partially_paid" } : INVOICE }) };
      return api;
    },
  }),
}));

import handler from "@/pages/api/payments/use-credit";

async function call(body: any) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method: "POST", headers: {}, body: { invoice_id: INVOICE_ID, amount: 175, request_id: REQUEST_ID, ...body } } as any, res);
  return res;
}

beforeEach(() => { rpcCalls.length = 0; pendingClaims = []; });

describe("client uses credit before paying by EFT", () => {
  it("spends the credit once and returns what is left to transfer", async () => {
    const res = await call({ public_token: "tok-1" });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls[0]).toMatchObject({ name: "redeem_client_credit_once", args: { p_requested_amount: 175, p_request_id: REQUEST_ID } });
    expect(res.body).toMatchObject({ used: 175, balanceDue: 6650 });
  });

  it("refuses a wrong pay-link token", async () => {
    const res = await call({ public_token: "other" });
    expect(res.statusCode).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it("waits while a bank transfer is being checked", async () => {
    pendingClaims = [{ id: "claim-1" }];
    const res = await call({ public_token: "tok-1" });
    expect(res.statusCode).toBe(409);
    expect(rpcCalls).toHaveLength(0);
  });
});
