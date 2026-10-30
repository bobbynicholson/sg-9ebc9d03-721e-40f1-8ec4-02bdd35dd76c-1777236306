/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Customer order links for emails sent from the browser are minted by a
// server route that checks the caller is staff of the order's company.
const ORDER_ID = "11111111-1111-1111-1111-111111111111";
const rpcCalls: any[] = [];
let profile: any;
let order: any;

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    rpc: async (name: string, args: any) => { rpcCalls.push({ name, args }); return { data: { raw_token: "tok-123" }, error: null }; },
    from: () => {
      const api: any = { select: () => api, eq: () => api, maybeSingle: async () => ({ data: order, error: null }) };
      return api;
    },
  }),
}));
jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: profile ? { id: "u1" } : null } }) },
    from: () => {
      const api: any = { select: () => api, eq: () => api, maybeSingle: async () => ({ data: profile, error: null }) };
      return api;
    },
  }),
}));

import handler from "@/pages/api/orders/[id]/customer-link";

async function call(body: any = { label: "driver-whatsapp-on_the_way" }) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method: "POST", query: { id: ORDER_ID }, headers: {}, body } as any, res);
  return res;
}

beforeEach(() => {
  rpcCalls.length = 0;
  profile = { role: "driver", company_id: "co-1", is_active: true, deleted_at: null };
  order = { id: ORDER_ID, company_id: "co-1", deleted_at: null };
});

test("staff of the order's company get a link token", async () => {
  const res = await call();
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ token: "tok-123" });
  expect(rpcCalls).toEqual([{ name: "mint_client_order_token",
    args: { p_company_id: "co-1", p_order_id: ORDER_ID, p_label: "driver-whatsapp-on_the_way" } }]);
});

test("another company's order is refused without minting", async () => {
  order.company_id = "co-2";
  expect((await call()).statusCode).toBe(404);
  expect(rpcCalls).toHaveLength(0);
});

test("customers, inactive staff and signed-out callers cannot mint", async () => {
  profile.role = "client";
  expect((await call()).statusCode).toBe(403);
  profile = { role: "driver", company_id: "co-1", is_active: false, deleted_at: null };
  expect((await call()).statusCode).toBe(403);
  profile = null;
  expect((await call()).statusCode).toBe(401);
  expect(rpcCalls).toHaveLength(0);
});
