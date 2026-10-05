/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
const updates: Array<{ table: string; values: any }> = [];
let company: any;
let renewing: any[];
let role = "super_admin";
const stripeCancel = jest.fn();
const payfastCancel = jest.fn();

function query(table: string) {
  const api: any = {
    select: () => api, eq: () => api, in: () => api, order: () => api, limit: () => api,
    update: (values: any) => { updates.push({ table, values }); return api; },
    maybeSingle: async () => ({ data: table === "companies" ? company : null, error: null }),
    then: (resolve: any) => resolve({ data: table === "subscriptions" ? renewing : [], error: null }),
  };
  return api;
}

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => ({ from: query }) }));
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role, active_role: null } }) }) }) }),
}) }));
jest.mock("@/services/platformPlanBilling", () => ({ platformStripe: () => ({ subscriptions: { cancel: stripeCancel } }) }));
jest.mock("@/lib/payfastService", () => ({ PayFastService: jest.fn().mockImplementation(() => ({ cancelSubscription: payfastCancel })) }));

import handler from "@/pages/api/platform/subscriptions";

const COMPANY = "11111111-1111-4111-8111-111111111111";
async function cancel() {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
  await handler({ method: "POST", headers: {}, body: { action: "cancel", companyId: COMPANY } } as any, res);
  return res;
}

beforeEach(() => {
  updates.length = 0;
  role = "super_admin";
  company = { id: COMPANY, payfast_subscription_token: null, subscription_status: "active" };
  renewing = [];
  stripeCancel.mockReset().mockResolvedValue({});
  payfastCancel.mockReset().mockResolvedValue(true);
  process.env.PAYFAST_PLATFORM_MERCHANT_ID = "m"; process.env.PAYFAST_PLATFORM_MERCHANT_KEY = "k"; process.env.PAYFAST_PLATFORM_PASSPHRASE = "p";
});

test("only a super admin can cancel", async () => {
  role = "company_admin";
  expect((await cancel()).statusCode).toBe(403);
  expect(updates).toHaveLength(0);
});

test("Stripe billing is stopped before the company is marked cancelled", async () => {
  renewing = [{ id: "s1", stripe_subscription_id: "sub_1" }];
  const res = await cancel();
  expect(res.statusCode).toBe(200);
  expect(stripeCancel).toHaveBeenCalledWith("sub_1");
  expect(res.body.stopped).toEqual(["Stripe"]);
  expect(updates.map((u) => u.table)).toEqual(["subscriptions", "companies"]);
  expect(updates[1].values.subscription_status).toBe("cancelled");
});

test("an unconfirmed Stripe cancellation changes nothing", async () => {
  renewing = [{ id: "s1", stripe_subscription_id: "sub_1" }];
  stripeCancel.mockRejectedValue(Object.assign(new Error("network"), { code: "api_connection_error" }));
  expect((await cancel()).statusCode).toBe(502);
  expect(updates).toHaveLength(0);
});

test("an already-deleted Stripe subscription still lets the cancel finish", async () => {
  renewing = [{ id: "s1", stripe_subscription_id: "sub_gone" }];
  stripeCancel.mockRejectedValue(Object.assign(new Error("gone"), { code: "resource_missing" }));
  expect((await cancel()).statusCode).toBe(200);
});

test("PayFast agreement is cancelled; a refusal leaves the company billed and unchanged", async () => {
  company.payfast_subscription_token = "tok";
  expect((await cancel()).body.stopped).toEqual(["PayFast"]);
  updates.length = 0;
  payfastCancel.mockResolvedValue(false);
  expect((await cancel()).statusCode).toBe(502);
  expect(updates).toHaveLength(0);
});

test("prepaid Yoco / manual plans are cancelled without any provider call", async () => {
  renewing = [{ id: "s1", payment_provider: "yoco" }];
  const res = await cancel();
  expect(res.statusCode).toBe(200);
  expect(stripeCancel).not.toHaveBeenCalled();
  expect(payfastCancel).not.toHaveBeenCalled();
  expect(res.body.stopped).toEqual([]);
});
