/** @jest-environment node */
import { Readable } from "node:stream";
import { createHmac } from "node:crypto";
import handler from "@/pages/api/webhooks/yoco-confirmation";
import { verifyYocoSignature, createYocoCheckout, pingYocoCredentials } from "@/lib/yocoService";
import { getCheckoutGatewayCredentials } from "@/lib/checkoutGatewayCredentials";
import { getPaymentAttemptByReference, touchPaymentAttempt, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { settleTenantGatewayPayment } from "@/lib/tenantGatewaySettlement";
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => ({}) }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
jest.mock("@/lib/checkoutGatewayCredentials", () => ({ getCheckoutGatewayCredentials: jest.fn() }));
jest.mock("@/services/paymentAttemptService", () => ({ getPaymentAttemptByReference: jest.fn(), touchPaymentAttempt: jest.fn(), transitionPaymentAttempt: jest.fn() }));
jest.mock("@/services/payments/notifyPaymentAttemptFailed", () => ({ notifyPaymentAttemptFailed: jest.fn() }));
jest.mock("@/lib/observability", () => ({ captureException: jest.fn() }));
jest.mock("@/lib/tenantGatewaySettlement", () => ({ ...jest.requireActual("@/lib/tenantGatewaySettlement"), settleTenantGatewayPayment: jest.fn() }));
const key = Buffer.from("offline-yoco-webhook-secret-32bytes");
const secret = `whsec_${key.toString("base64")}`;
const attempt = { id: "00000000-0000-0000-0000-000000000001", company_id: "company-1", order_id: "order-1", invoice_id: "invoice-1",
  provider: "yoco", payment_type: "deposit", provider_session_id: "checkout-1", amount: 100, currency: "ZAR", metadata: { gatewayId: "gateway-1" } };
function event(type = "payment.succeeded", patch: Record<string, unknown> = {}) {
  return { type, payload: { id: "payment-1", type: "payment", status: "succeeded", amount: 10000, currency: "ZAR", mode: "test",
    metadata: { checkoutId: "checkout-1" }, ...patch } };
}
function signed(raw: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const id = "event-1";
  return { "webhook-id": id, "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64")}` };
}
async function call(value: unknown, headers?: Record<string, string>) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const req = Object.assign(Readable.from([raw]), { method: "POST", headers: headers || signed(raw) });
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() }; res.status.mockReturnValue(res);
  await handler(req as never, res as never); return res;
}
beforeEach(() => {
  jest.clearAllMocks();
  (getPaymentAttemptByReference as jest.Mock).mockResolvedValue(attempt);
  (getCheckoutGatewayCredentials as jest.Mock).mockResolvedValue({ gateway: { company_id: "company-1", provider: "yoco", is_test: true }, credentials: { webhookSecret: secret } });
  (settleTenantGatewayPayment as jest.Mock).mockResolvedValue({ duplicate: false });
  (transitionPaymentAttempt as jest.Mock).mockResolvedValue({ changed: false });
});

test("documented signed callback containing only checkoutId resolves the saved tenant and settles", async () => {
  const res = await call(event());
  expect(res.status).toHaveBeenCalledWith(200);
  expect(getPaymentAttemptByReference).toHaveBeenCalledWith("yoco", "checkout-1");
  expect(settleTenantGatewayPayment).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1", orderId: "order-1", invoiceId: "invoice-1", amount: 100, transactionId: "payment-1" }));
});
test.each(["refund.succeeded", "refund.failed", "refund.partial.succeeded", "something.succeeded"])("%s never becomes an incoming payment", async (type) => {
  expect((await call(event(type))).status).toHaveBeenCalledWith(200);
  expect(settleTenantGatewayPayment).not.toHaveBeenCalled(); expect(transitionPaymentAttempt).not.toHaveBeenCalled();
});
test.each([-181, 181])("timestamp outside the three-minute window (%p seconds) is rejected", async (offset) => {
  const raw = JSON.stringify(event()); const headers = signed(raw, String(Math.floor(Date.now() / 1000) + offset));
  expect((await call(raw, headers)).status).toHaveBeenCalledWith(401); expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test("modified body fails authentication even with the original headers", async () => {
  const headers = signed(JSON.stringify(event()));
  expect((await call(event("payment.succeeded", { amount: 20000 }), headers)).status).toHaveBeenCalledWith(401);
  expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test("multiple versioned signatures accept any valid v1 during rotation", () => {
  const raw = JSON.stringify(event()); const headers = signed(raw);
  expect(verifyYocoSignature(raw, `v2,invalid v1,invalid ${headers["webhook-signature"]}`, secret, headers["webhook-id"], headers["webhook-timestamp"])).toBe(true);
});
test("unsigned callbacks are rejected even in test mode", async () => {
  (getCheckoutGatewayCredentials as jest.Mock).mockResolvedValue({ gateway: { company_id: "company-1", provider: "yoco", is_test: true }, credentials: {} });
  expect((await call(event(), {})).status).toHaveBeenCalledWith(401); expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test.each([
  { metadata: { checkoutId: "other-checkout" } },
  { metadata: { checkoutId: "checkout-1", companyId: "company-2" } },
  { mode: "live" }, { type: "refund" }, { status: "pending" },
])("signed mismatched checkout/status/mode %p does not settle", async (patch) => {
  expect((await call(event("payment.succeeded", patch))).status).toHaveBeenCalledWith(400); expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test("callback before checkout tracking is attached requests a retry", async () => {
  (getPaymentAttemptByReference as jest.Mock).mockResolvedValue(null);
  expect((await call(event())).status).toHaveBeenCalledWith(503); expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test("non-terminal signed payment event leaves the attempt pending", async () => {
  expect((await call(event("payment.processing", { status: "processing" }))).status).toHaveBeenCalledWith(200);
  expect(touchPaymentAttempt).toHaveBeenCalledWith(attempt.id, "processing"); expect(transitionPaymentAttempt).not.toHaveBeenCalled();
});
test("malformed JSON is a client error and does not touch the database", async () => {
  expect((await call("{broken")).status).toHaveBeenCalledWith(400); expect(getPaymentAttemptByReference).not.toHaveBeenCalled();
});
test("duplicate settlement returns success without adding new money", async () => {
  (settleTenantGatewayPayment as jest.Mock).mockResolvedValue({ duplicate: true });
  expect((await call(event())).json).toHaveBeenCalledWith({ ok: true, duplicate: true });
});
test("checkout uses failure return, cents, provider idempotency and a bounded timeout", async () => {
  const original = global.fetch; const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "checkout-1", redirectUrl: "https://c.yoco.com/checkout/1" }) });
  global.fetch = fetchMock;
  try {
    await createYocoCheckout({ secretKey: "offline", amount: 100.25, successUrl: "https://app.test/success", cancelUrl: "https://app.test/cancel", metadata: { paymentAttemptId: attempt.id } });
    const options = fetchMock.mock.calls[0][1];
    expect(JSON.parse(options.body)).toMatchObject({ amount: 10025, failureUrl: "https://app.test/cancel" });
    expect(options.headers["Idempotency-Key"]).toBe(attempt.id); expect(options.signal).toBeDefined();
  } finally { global.fetch = original; }
});


test("Yoco credential check uses read-only documented webhooks API with a bounded timeout", async () => {
  const transport = jest.fn().mockResolvedValue({ status: 200 }); global.fetch = transport;
  expect((await pingYocoCredentials("sk_test_offline")).ok).toBe(true);
  expect(transport).toHaveBeenCalledWith("https://payments.yoco.com/api/webhooks", expect.objectContaining({
    method: "GET", headers: { Authorization: "Bearer sk_test_offline" }, signal: expect.any(AbortSignal),
  }));
});
test.each([401, 403, 404, 405, 500])("Yoco HTTP %i cannot mark credentials verified", async (status) => {
  global.fetch = jest.fn().mockResolvedValue({ status }); expect((await pingYocoCredentials("sk_test_offline")).ok).toBe(false);
});

test("a declined card stays retryable: attempt kept pending, no failure notice", async () => {
  const res = await call(event("payment.failed", { status: "failed" }));
  expect(res.status).toHaveBeenCalledWith(200);
  expect(touchPaymentAttempt).toHaveBeenCalledWith(attempt.id, "payment_failed_retryable");
  expect(transitionPaymentAttempt).not.toHaveBeenCalled();
  expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test("platform plan payments on a shared Yoco account are acknowledged, not retried", async () => {
  const res = await call(event("payment.succeeded", { metadata: { checkoutId: "x", purpose: "platform_plan" } }));
  expect(res.status).toHaveBeenCalledWith(200);
  expect(getPaymentAttemptByReference).not.toHaveBeenCalled();
});
test("webhook registration replaces an existing hook for the URL and returns the one-time secret", async () => {
  const { registerYocoWebhook } = await import("@/lib/yocoService");
  const url = "https://app.test/api/webhooks/yoco-confirmation";
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ subscriptions: [{ id: "wh_old", url }, { id: "wh_other", url: "https://elsewhere" }] }) })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "wh_new", secret, mode: "test" }) });
  global.fetch = fetchMock;
  await expect(registerYocoWebhook("sk_test_offline", url)).resolves.toEqual({ id: "wh_new", secret, mode: "test" });
  expect(fetchMock.mock.calls[1][0]).toBe("https://payments.yoco.com/api/webhooks/wh_old");
  expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ name: "cateringms-payments", url });
});
test("webhook registration fails loudly on a rejected key or a missing secret", async () => {
  const { registerYocoWebhook } = await import("@/lib/yocoService");
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
  await expect(registerYocoWebhook("sk_bad", "https://app.test/h")).rejects.toThrow(/rejected/);
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "wh_1" }) });
  await expect(registerYocoWebhook("sk_test", "https://app.test/h")).rejects.toThrow(/no signing secret/);
});
