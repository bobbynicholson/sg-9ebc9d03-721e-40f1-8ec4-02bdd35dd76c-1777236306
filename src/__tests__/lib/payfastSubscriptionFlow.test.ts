import crypto from "crypto";
import handler, { computePayfastSignature } from "@/pages/api/webhooks/subscriptions/payfast";
import manageHandler from "@/pages/api/subscription/manage";
import { PayFastService, getPlanById } from "@/lib/payfastService";
import { billingEmailService } from "@/services/billingEmailService";

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => mockDb }));
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { company_id: "company-1", role: "company_admin" } }) }) }) }),
}) }));
jest.mock("@/services/billingEmailService", () => ({ billingEmailService: {
  notifySubscriptionStarted: jest.fn(), notifyPaymentSucceeded: jest.fn(), notifyPaymentFailed: jest.fn(), notifySubscriptionCancelled: jest.fn(),
} }));
jest.mock("@/services/notificationService", () => ({ notificationService: { broadcastNotification: jest.fn() } }));

const mockEvents = new Map<string, any>();
const mockLedger = new Map<string, any>();
const mockSubscriptions = new Map<string, any>();
let mockCompany: any;
let mockActivationFailure = false;
const mockDb = { from: (table: string) => {
  let operation = "select", payload: any;
  const filters: Record<string, any> = {};
  const run = () => {
    if (table === "subscription_webhook_events") {
      const key = payload?.event_id || filters.event_id;
      if (operation === "insert") {
        if (mockEvents.has(key)) return { data: null, error: { code: "23505" } };
        mockEvents.set(key, { ...payload, id: key, processed_at: new Date().toISOString() });
      }
      if (operation === "update") {
        const event = mockEvents.get(key);
        if (filters.processed_at && filters.processed_at !== event?.processed_at) return { data: [], error: null };
        Object.assign(event, payload);
      }
      return { data: operation === "update" ? [{ id: key }] : mockEvents.get(key), error: null };
    }
    if (table === "companies") {
      if (operation === "update") {
        if (mockActivationFailure) return { data: null, error: { message: "database unavailable" } };
        Object.assign(mockCompany, payload);
        return { data: [{ id: mockCompany.id }], error: null };
      }
      return { data: mockCompany, error: null };
    }
    if (table === "billing_history") { mockLedger.set(payload.id, payload); return { data: null, error: null }; }
    if (table === "subscriptions") {
      if (operation === "upsert") mockSubscriptions.set(payload.id, payload);
      if (operation === "update") Object.assign(mockSubscriptions.get(filters.id), payload);
      return { data: mockSubscriptions.get(filters.id) || null, error: null };
    }
    return { data: null, error: null };
  };
  const query: any = {
    select: () => query, eq: (k: string, v: any) => { filters[k] = v; return query; },
    insert: (v: any) => { operation = "insert"; payload = v; return query; },
    upsert: (v: any) => { operation = "upsert"; payload = v; return query; },
    update: (v: any) => { operation = "update"; payload = v; return query; },
    maybeSingle: () => query, single: () => query, not: () => query, limit: () => query,
    then: (resolve: any) => Promise.resolve(run()).then(resolve),
  };
  return query;
} };

const plan = getPlanById("starter")!;
function notification(overrides = {}) {
  const fields: any = { m_payment_id: "checkout-1", pf_payment_id: "payment-1", payment_status: "COMPLETE",
    item_name: "Cal's plan (monthly)", amount_gross: String(plan.monthlyPrice), custom_str1: "company-1",
    custom_str2: plan.id, custom_str3: "monthly", merchant_id: "merchant", token: "token-1", ...overrides };
  fields.signature = computePayfastSignature(fields, "secret");
  return fields;
}
async function deliver(body: any) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
  await handler({ method: "POST", body } as any, res);
  return res;
}
async function manage(body: any) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
  await manageHandler({ method: "POST", body } as any, res);
  return res;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockEvents.clear(); mockLedger.clear(); mockSubscriptions.clear(); mockActivationFailure = false;
  mockCompany = { id: "company-1", owner_id: "owner-1", subscription_plan: plan.id, subscription_status: "trial", trial_ends_at: "2099-01-01" };
  process.env.PAYFAST_PLATFORM_MERCHANT_ID = "merchant";
  process.env.PAYFAST_PLATFORM_MERCHANT_KEY = "key";
  process.env.PAYFAST_PLATFORM_PASSPHRASE = "secret";
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "VALID" });
});

it("signs received fields in wire order with PHP punctuation encoding", () => {
  const fields = { payment_status: "COMPLETE", item_name: "Cal's plan (monthly)", merchant_id: "merchant" };
  const expected = crypto.createHash("md5").update("payment_status=COMPLETE&item_name=Cal%27s+plan+%28monthly%29&merchant_id=merchant&passphrase=secret").digest("hex");
  expect(computePayfastSignature(fields, "secret")).toBe(expected);
});
it("activates the company and records one ledger entry across duplicate delivery", async () => {
  expect((await deliver(notification())).statusCode).toBe(200);
  expect(mockCompany.subscription_status).toBe("active");
  expect(mockCompany.payfast_subscription_token).toBe("token-1");
  expect((await deliver(notification())).body.duplicate).toBe(true);
  expect(mockLedger.size).toBe(1);
  expect(billingEmailService.notifySubscriptionStarted).toHaveBeenCalledTimes(1);
  expect(billingEmailService.notifyPaymentSucceeded).toHaveBeenCalledWith("owner-1", expect.objectContaining({
    billing_mode: "recurring", billing_cycle: "monthly", amount: plan.monthlyPrice, recurring_amount: plan.monthlyPrice,
  }));
});
it("retries activation after a database failure without losing the event", async () => {
  mockActivationFailure = true;
  expect((await deliver(notification())).statusCode).toBe(500);
  mockActivationFailure = false;
  expect((await deliver(notification())).statusCode).toBe(200);
  expect(mockCompany.subscription_status).toBe("active");
  expect(mockLedger.size).toBe(1);
});
it("rejects bad signatures and provider rejection without activating", async () => {
  expect((await deliver({ ...notification(), signature: "invalid" })).statusCode).toBe(401);
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => "INVALID" });
  expect((await deliver(notification())).statusCode).toBe(401);
  expect(mockCompany.subscription_status).toBe("trial");
  expect(mockLedger.size).toBe(0);
});
it("rejects an underpayment without granting paid access", async () => {
  expect((await deliver(notification({ amount_gross: "1.00" }))).statusCode).toBe(400);
  expect(mockCompany.subscription_status).toBe("trial");
});
it("keeps a verified zero-amount trial setup in trial", async () => {
  expect((await deliver(notification({ amount_gross: "0.00" }))).statusCode).toBe(200);
  expect(mockCompany.subscription_status).toBe("trial");
  expect(mockCompany.payfast_subscription_token).toBe("token-1");
  expect(billingEmailService.notifySubscriptionStarted).toHaveBeenCalledWith("owner-1", expect.objectContaining({
    amount: plan.monthlyPrice, paid_amount: 0, subscription_status: "trial",
  }));
  expect(billingEmailService.notifyPaymentSucceeded).not.toHaveBeenCalled();
});
it("builds zero initial trial amount and charges the plan after trial expiry", () => {
  const svc = new PayFastService({ merchantId: "merchant", merchantKey: "key", passphrase: "secret", testMode: false });
  const buyer = { firstName: "Cal", lastName: "Buyer", email: "cal@example.com", userId: "company-1" };
  const trial: any = svc.createSubscriptionParams(plan, buyer, "monthly", "https://example.com", "2099-01-01");
  const paid: any = svc.createSubscriptionParams(plan, buyer, "annual", "https://example.com");
  expect(trial.amount).toBe("0.00"); expect(trial.recurring_amount).toBe(plan.monthlyPrice.toFixed(2));
  expect(paid.amount).toBe(plan.annualPrice.toFixed(2)); expect(paid.frequency).toBe("6");
  expect(trial.custom_str1).toBe("company-1");
  expect(trial.notify_url).toBe("https://example.com/api/webhooks/subscriptions/payfast");
  expect(svc.generatePaymentForm(trial)).not.toContain("secret");
});
it("returns PayFast to the tenant-scoped success and cancellation routes", () => {
  const svc = new PayFastService({ merchantId: "merchant", merchantKey: "key", passphrase: "secret", testMode: false });
  const params: any = svc.createSubscriptionParams(
    plan,
    { firstName: "Cal", lastName: "Buyer", email: "cal@example.com", userId: "company-1" },
    "monthly",
    "https://example.com",
    undefined,
    "raj267748-payfast-test",
  );
  expect(params.return_url).toBe("https://example.com/raj267748-payfast-test/subscription/success");
  expect(params.cancel_url).toBe("https://example.com/raj267748-payfast-test/admin/subscription?cancelled=1");
  expect(params.notify_url).toBe("https://example.com/api/webhooks/subscriptions/payfast");
});
it("records annual automatic renewals without repeated checkout metadata", async () => {
  const first = notification({ custom_str3: "annual", amount_gross: String(plan.annualPrice) });
  expect((await deliver(first)).statusCode).toBe(200);
  const renewal = notification({ pf_payment_id: "renewal-2", custom_str1: "", custom_str2: "", custom_str3: "", amount_gross: String(plan.annualPrice) });
  expect((await deliver(renewal)).statusCode).toBe(200);
  expect(mockSubscriptions.size).toBe(1);
  expect([...mockSubscriptions.values()][0].billing_cycle).toBe("yearly");
  expect(mockLedger.size).toBe(2);
  expect(mockCompany.subscription_status).toBe("active");
});
it("marks failed renewal past due and allows a later successful payment", async () => {
  await deliver(notification());
  expect((await deliver(notification({ pf_payment_id: "failure-2", payment_status: "FAILED" }))).statusCode).toBe(200);
  expect(mockCompany.subscription_status).toBe("past_due");
  expect((await deliver(notification({ pf_payment_id: "recovery-3" }))).statusCode).toBe(200);
  expect(mockCompany.subscription_status).toBe("active");
});
it("signs recurring API calls and uses the sandbox testing parameter", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
  const svc = new PayFastService({ merchantId: "merchant", merchantKey: "key", passphrase: "secret", testMode: true });
  expect(await svc.cancelSubscription("token-1")).toBe(true);
  const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("https://api.payfast.co.za/subscriptions/token-1/cancel?testing=true");
  const headers = options.headers;
  const source = `merchant-id=merchant&passphrase=secret&timestamp=${encodeURIComponent(headers.timestamp)}&version=v1`;
  expect(headers.signature).toBe(crypto.createHash("md5").update(source).digest("hex"));
  expect(options.method).toBe("PUT");
  expect(JSON.stringify(options)).not.toContain("secret");
});
it("retains paid access when provider confirms cancellation at period end", async () => {
  await deliver(notification());
  const stored = [...mockSubscriptions.values()][0];
  stored.cancel_at_period_end = true;
  const end = stored.current_period_end;
  expect((await deliver(notification({ pf_payment_id: "cancel-2", payment_status: "CANCELLED" }))).statusCode).toBe(200);
  expect(mockCompany.subscription_status).toBe("active");
  expect([...mockSubscriptions.values()][0].current_period_end).toBe(end);
});
it("cancels future provider charges and retains access until the paid period ends", async () => {
  await deliver(notification());
  const subscription = [...mockSubscriptions.values()][0];
  expect((await manage({ action: "cancel", subscriptionId: subscription.id, immediate: false })).statusCode).toBe(200);
  expect(subscription.cancel_at_period_end).toBe(true);
  expect(subscription.status).toBe("active");
  expect((global.fetch as jest.Mock).mock.calls.at(-1)[0]).toContain("/token-1/cancel");
  expect((await manage({ action: "resume", subscriptionId: subscription.id })).statusCode).toBe(409);
});
it("does not claim cancellation succeeded when PayFast refuses it", async () => {
  await deliver(notification());
  const subscription = [...mockSubscriptions.values()][0];
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
  expect((await manage({ action: "cancel", subscriptionId: subscription.id, immediate: true })).statusCode).toBe(502);
  expect(mockCompany.subscription_status).toBe("active");
  expect(subscription.status).toBe("active");
});
