/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// A client uploads EFT proof for more than the balance: the claim is capped
// at the balance and keeps the real amount. Confirming it asks the team
// whether the extra becomes client credit or a refund.
const PAYMENT_ID = "22222222-2222-2222-2222-222222222222";
const CLAIM = {
  company_id: "co-1", payment_proof_path: "co-1/inv/proof.pdf", amount: 6825, payment_status: "pending",
  gateway_response: { client_reported_amount: 7000 }, client_id: "client-1", order_id: "order-1",
  invoice_id: "inv-1", currency: "ZAR", invoices: { invoice_number: "INV-1" },
};
let claim: any = { ...CLAIM };
let rpcError: any = null;
const writes: Array<{ table: string; kind: string; values: any }> = [];

function from(table: string) {
  let kind = "select";
  const api: any = {
    select: () => api, eq: () => api,
    update: (values: any) => { kind = "update"; writes.push({ table, kind, values }); return api; },
    insert: (values: any) => { writes.push({ table, kind: "insert", values }); return api; },
    single: async () => ({ data: { id: "extra-1" }, error: null }),
    maybeSingle: async () => ({
      data: table === "profiles" ? { role: "company_admin", company_id: "co-1" } : kind === "select" && table === "payments" && writes.length === 0 ? claim : null,
      error: null,
    }),
    then: (resolve: any) => resolve({ error: null }),
  };
  return api;
}
const admin = {
  from,
  rpc: jest.fn(async () => (rpcError ? { data: null, error: rpcError } : { data: { invoice_status: "paid" }, error: null })),
};

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => admin }));
jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));

import handler from "@/pages/api/payments/verify-claim";

async function confirm(extra_handling?: string) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method: "POST", headers: {}, body: { payment_id: PAYMENT_ID, action: "confirm", bank_statement_verified: true, extra_handling } } as any, res);
  return res;
}

beforeEach(() => { claim = { ...CLAIM }; rpcError = null; writes.length = 0; admin.rpc.mockClear(); });

describe("confirming an EFT claim where the client transferred more", () => {
  it("asks what to do with the extra before confirming", async () => {
    const res = await confirm();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/R 175\.00 more/);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("credit: confirms the claim as owed and adds the extra as client credit", async () => {
    const res = await confirm("credit");
    expect(res.statusCode).toBe(200);
    expect(writes.find((w) => w.kind === "update")).toBeUndefined();
    expect(writes).toContainEqual({ table: "payments", kind: "insert", values: expect.objectContaining({ payment_type: "credit_issue", amount: 175 }) });
  });

  it("refund: raises the claim to the full transfer, then queues the extra as a refund", async () => {
    const res = await confirm("refund");
    expect(res.statusCode).toBe(200);
    expect(writes[0]).toMatchObject({ kind: "update", values: { amount: 7000 } });
    expect(writes).toContainEqual({ table: "payments", kind: "insert", values: expect.objectContaining({ payment_type: "refund", amount: 175, payment_status: "pending" }) });
  });

  it("refund: puts the claim amount back if confirming fails, so a retry still sees the extra", async () => {
    rpcError = { code: "XX000" };
    const res = await confirm("refund");
    expect(res.statusCode).toBe(503);
    expect(writes.filter((w) => w.kind === "update").map((w) => w.values.amount)).toEqual([7000, 6825]);
  });

  it("a normal claim confirms without asking", async () => {
    claim = { ...CLAIM, gateway_response: null };
    const res = await confirm();
    expect(res.statusCode).toBe(200);
    expect(writes.filter((w) => w.kind === "insert")).toHaveLength(0);
  });
});
