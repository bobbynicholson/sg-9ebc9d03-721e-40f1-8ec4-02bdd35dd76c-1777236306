/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from "node:stream";
import { createHmac } from "node:crypto";

const store: Record<string, any> = {};
function table(name: string) {
  const api: any = {
    select: () => api, update: () => api, upsert: () => api, insert: () => api,
    eq: () => api, is: () => api, not: () => api, in: () => api,
    maybeSingle: async () => ({ data: store[name] ?? null, error: null }),
    single: async () => ({ data: store[name] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: null, error: null }),
  };
  return api;
}
const sb = { from: jest.fn((name: string) => table(name)) };
const settleMock = jest.fn();
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => sb }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
jest.mock("@/lib/platformSubscriptionPlans", () => ({
  loadPlatformSubscriptionPlan: jest.fn(async () => ({ id: "starter", name: "Starter", monthlyPrice: 499, annualPrice: 4990 })),
}));

import { addBillingPeriod, platformBillingProviders, settleYocoPlanPayment } from "@/services/platformPlanBilling";

describe("billing periods", () => {
  test("monthly clamps to the end of a shorter month", () => {
    expect(addBillingPeriod(new Date("2026-01-31T10:00:00Z"), "monthly").toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });
  test("yearly adds a calendar year", () => {
    expect(addBillingPeriod(new Date("2026-03-15T00:00:00Z"), "yearly").toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });
});

describe("provider availability", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  test("a provider is only offered when both its key and webhook secret are set", () => {
    process.env.STRIPE_PLATFORM_SECRET_KEY = "sk"; delete process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
    process.env.YOCO_PLATFORM_SECRET_KEY = "sk"; process.env.YOCO_PLATFORM_WEBHOOK_SECRET = "whsec_x";
    expect(platformBillingProviders()).toMatchObject({ stripe: false, yoco: true });
  });
});

describe("Yoco plan settlement guards", () => {
  const checkout = { id: "c1", company_id: "co1", amount: 499, currency: "ZAR", status: "pending", plan_id: "starter", billing_cycle: "monthly" };
  test("an already-settled checkout is a duplicate and writes nothing", async () => {
    sb.from.mockClear();
    await expect(settleYocoPlanPayment(sb, { ...checkout, status: "succeeded" }, { id: "p1", amountCents: 49900, currency: "ZAR" }))
      .resolves.toEqual({ duplicate: true });
    expect(sb.from).not.toHaveBeenCalled();
  });
  test.each([[49800, "ZAR"], [49900, "USD"]])("amount/currency mismatch (%p %p) never grants access", async (cents, currency) => {
    sb.from.mockClear();
    await expect(settleYocoPlanPayment(sb, checkout, { id: "p1", amountCents: cents, currency })).rejects.toThrow(/does not match/);
    expect(sb.from).not.toHaveBeenCalled();
  });
});

describe("platform Yoco plan webhook", () => {
  const key = Buffer.from("offline-platform-yoco-secret-32by");
  const secret = `whsec_${key.toString("base64")}`;
  let handler: any;
  beforeAll(async () => {
    process.env.YOCO_PLATFORM_WEBHOOK_SECRET = secret;
    jest.resetModules();
    jest.doMock("@/services/platformPlanBilling", () => ({
      ...jest.requireActual("@/services/platformPlanBilling"),
      settleYocoPlanPayment: settleMock,
    }));
    handler = (await import("@/pages/api/webhooks/subscriptions/yoco")).default;
  });
  beforeEach(() => {
    process.env.YOCO_PLATFORM_WEBHOOK_SECRET = secret;
    settleMock.mockReset().mockResolvedValue({ duplicate: false });
    store.platform_subscription_checkouts = { id: "c1", company_id: "co1", provider: "yoco", provider_session_id: "ch_1", amount: 499, currency: "ZAR", status: "pending" };
  });
  function signed(raw: string) {
    const ts = String(Math.floor(Date.now() / 1000));
    return { "webhook-id": "evt_1", "webhook-timestamp": ts,
      "webhook-signature": `v1,${createHmac("sha256", key).update(`evt_1.${ts}.${raw}`).digest("base64")}` };
  }
  async function call(body: unknown, headers?: Record<string, string>) {
    const raw = JSON.stringify(body);
    const req = Object.assign(Readable.from([raw]), { method: "POST", headers: headers || signed(raw) });
    const res: any = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() }; res.status.mockReturnValue(res);
    await handler(req, res); return res;
  }
  const paid = (patch: Record<string, unknown> = {}) => ({ id: "evt_1", type: "payment.succeeded", payload: {
    id: "p_1", status: "succeeded", amount: 49900, currency: "ZAR",
    metadata: { checkoutId: "ch_1", platformCheckoutId: "c1", companyId: "co1", purpose: "platform_plan" }, ...patch } });

  test("signed success settles one prepaid period", async () => {
    const res = await call(paid());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(settleMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "c1" }), { id: "p_1", amountCents: 49900, currency: "ZAR" });
  });
  test("unsigned or tampered events are rejected", async () => {
    const headers = signed(JSON.stringify(paid()));
    expect((await call(paid({ amount: 100 }), headers)).status).toHaveBeenCalledWith(401);
    expect((await call(paid(), {})).status).toHaveBeenCalledWith(401);
    expect(settleMock).not.toHaveBeenCalled();
  });
  test("events that are not plan checkouts are acknowledged without settling", async () => {
    expect((await call(paid({ metadata: { checkoutId: "ch_9" } }))).status).toHaveBeenCalledWith(200);
    expect(settleMock).not.toHaveBeenCalled();
  });
  test("a checkout from another company is refused", async () => {
    expect((await call(paid({ metadata: { checkoutId: "ch_1", platformCheckoutId: "c1", companyId: "co2", purpose: "platform_plan" } }))).status).toHaveBeenCalledWith(400);
    expect(settleMock).not.toHaveBeenCalled();
  });
  test("a webhook that beats the session attach asks Yoco to retry", async () => {
    store.platform_subscription_checkouts = { ...store.platform_subscription_checkouts, provider_session_id: null };
    expect((await call(paid())).status).toHaveBeenCalledWith(503);
  });
  test("a declined card is recorded, not settled", async () => {
    expect((await call({ id: "evt_2", type: "payment.failed", payload: { ...paid().payload, status: "failed" } })).status).toHaveBeenCalledWith(200);
    expect(settleMock).not.toHaveBeenCalled();
  });
  test("a settlement error returns 5xx so Yoco re-delivers", async () => {
    settleMock.mockRejectedValue(new Error("db down"));
    expect((await call(paid())).status).toHaveBeenCalledWith(500);
  });
  test("without the platform webhook secret nothing is processed", async () => {
    delete process.env.YOCO_PLATFORM_WEBHOOK_SECRET;
    expect((await call(paid())).status).toHaveBeenCalledWith(503);
    expect(settleMock).not.toHaveBeenCalled();
  });
});
