/** @jest-environment node */
import handler from "@/pages/api/payments/create-session";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createPaymentSession, resolveActivePaymentGateway } from "@/lib/paymentService";
import { createPaymentAttempt, attachPaymentAttemptSession } from "@/services/paymentAttemptService";

jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
jest.mock("@/lib/paymentService", () => ({ createPaymentSession: jest.fn(), resolveActivePaymentGateway: jest.fn() }));
jest.mock("@/services/paymentAttemptService", () => ({ createPaymentAttempt: jest.fn(), attachPaymentAttemptSession: jest.fn(), transitionPaymentAttempt: jest.fn() }));
jest.mock("@/services/payments/notifyPaymentAttemptFailed", () => ({ notifyPaymentAttemptFailed: jest.fn() }));
jest.mock("@/lib/publicAppOrigin", () => ({ publicAppOrigin: () => "https://payments.example.test" }));

const invoiceId = "00000000-0000-0000-0000-000000000001";
const token = "00000000-0000-0000-0000-000000000002";
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res); return res;
}
function query(data: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({ data, error: null }), single: jest.fn().mockResolvedValue({ data, error: null }) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain); return chain;
}
function setup(credit = 0, order: Record<string, unknown> | null = null, replayed = false) {
  const invoice = { id: invoiceId, company_id: "company-1", client_id: "client-1", order_id: order?.id || null,
    invoice_number: "INV-1", public_token: token, amount_paid: 0, balance_due: 1000, total_amount: 1000, status: "sent", currency: "ZAR" };
  const admin = {
    from: jest.fn((table: string) => query(table === "clients" ? { id: "client-1", client_name: "Buyer", email: "buyer@example.test" }
      : table === "orders" ? order : { ...invoice, amount_paid: credit, balance_due: 1000 - credit, status: credit >= 1000 ? "paid" : "partial" })),
    rpc: jest.fn(async (name: string) => ({ data: name === "redeem_client_credit_once" ? { redeemed_amount: credit, payment_id: "credit-payment", replayed }
      : name === "capture_checkout_gateway_credentials" ? "version-1" : { amount_paid: replayed ? credit : 0, balance_due: replayed ? 1000-credit : 1000, invoice_status: "sent" }, error: null })),
  };
  // Initial invoice must have its original balance before credit is redeemed.
  admin.from.mockImplementationOnce(() => query(invoice));
  (getServiceSupabase as jest.Mock).mockReturnValue(admin);
  return admin;
}
function request(body: Record<string, unknown>) { return { method: "POST", headers: {}, body: { invoice_id: invoiceId, public_token: token, ...body } } as never; }
beforeEach(() => {
  jest.clearAllMocks();
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
  (resolveActivePaymentGateway as jest.Mock).mockResolvedValue({ gateway: { id: "gateway-1", company_id: "company-1", provider: "payfast", is_test: true }, credentials: { merchantId: "123", merchantKey: "key" } });
  (createPaymentSession as jest.Mock).mockResolvedValue({ ok: true, provider: "payfast", paymentUrl: "<form></form>", isHtmlForm: true });
});

test.each([0, -1, Infinity, NaN, "", "junk", null, true, {}, 0.001, 100.001])("invalid explicit payment %p cannot fall back to a default or redeem credit", async (pay_amount) => {
  const res = response(); await handler(request({ pay_amount, apply_credit: true }), res as never);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(getServiceSupabase).not.toHaveBeenCalled();
});
test.each([-1, Infinity, "junk", null, false, 0.001])("invalid explicit credit %p is rejected before financial writes", async (apply_credit_amount) => {
  const res = response(); await handler(request({ apply_credit_amount }), res as never);
  expect(res.status).toHaveBeenCalledWith(400); expect(getServiceSupabase).not.toHaveBeenCalled();
});
test("credit cannot exceed a chosen partial payment even if the wallet/invoice has more", async () => {
  const admin = setup(100); const res = response();
  await handler(request({ pay_amount: 100, apply_credit_amount: 900 }), res as never);
  expect(admin.rpc).toHaveBeenCalledWith("redeem_client_credit_once", expect.objectContaining({ p_requested_amount: 100 }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, provider: "store_credit", settled: false, creditApplied: 100 }));
  expect(createPaymentSession).not.toHaveBeenCalled();
});
test("a selected amount partly covered by credit charges only its remainder", async () => {
  const admin = setup(40); const res = response();
  await handler(request({ pay_amount: "100.00", apply_credit_amount: 40 }), res as never);
  expect(admin.rpc).toHaveBeenCalledWith("redeem_client_credit_once", expect.objectContaining({ p_requested_amount: 40 }));
  expect(createPaymentSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 60, companyId: "company-1" }), expect.anything());
  expect(createPaymentAttempt).toHaveBeenCalledWith(expect.objectContaining({ amount: 60, invoiceId, orderId: null }));
  expect(attachPaymentAttemptSession).toHaveBeenCalled();
});
test("explicit zero credit preserves the wallet even when apply_credit is true", async () => {
  const admin = setup(); const res = response();
  await handler(request({ pay_amount: 100, apply_credit: true, apply_credit_amount: 0 }), res as never);
  expect(admin.rpc.mock.calls.some(([name]) => name === "redeem_client_credit_once")).toBe(false);
  expect(createPaymentSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }), expect.anything());
});
test("full credit settlement needs no configured gateway", async () => {
  setup(1000); const res = response(); (resolveActivePaymentGateway as jest.Mock).mockResolvedValue(null);
  await handler(request({ pay_amount: 1000, apply_credit: true }), res as never);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, provider: "store_credit", settled: true }));
  expect(resolveActivePaymentGateway).not.toHaveBeenCalled();
});
test("request above balance is capped and preserves exact cents", async () => {
  setup(); const res = response(); await handler(request({ pay_amount: 1200 }), res as never);
  expect(createPaymentSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000 }), expect.anything());
});
test("invalid public token cannot refresh balances, redeem credit or create checkout", async () => {
  const admin = setup(); const res = response();
  await handler({ method: "POST", headers: {}, body: { invoice_id: invoiceId, public_token: "wrong", pay_amount: 100 } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(403); expect(admin.rpc).not.toHaveBeenCalled();
  expect(createPaymentSession).not.toHaveBeenCalled();
});

test("the client's stable checkout key is forwarded to the atomic redemption", async () => {
  const admin = setup(100); const res = response();
  await handler(request({ pay_amount: 100, apply_credit: true, checkout_request_id: token }), res as never);
  expect(admin.rpc).toHaveBeenCalledWith("redeem_client_credit_once", expect.objectContaining({ p_request_id: token }));
});

test("an invalid checkout replay key is rejected before any financial write", async () => {
  const res = response(); await handler(request({ checkout_request_id: "invalid", apply_credit: true }), res as never);
  expect(res.status).toHaveBeenCalledWith(400); expect(getServiceSupabase).not.toHaveBeenCalled();
});

test("a gateway configuration failure still reports credit that already committed", async () => {
  setup(40); const res = response(); (resolveActivePaymentGateway as jest.Mock).mockResolvedValue(null);
  await handler(request({ pay_amount: 100, apply_credit: true, checkout_request_id: token }), res as never);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ creditApplied: 40, creditPaymentId: "credit-payment", refreshRequired: true }));
  expect(createPaymentSession).not.toHaveBeenCalled();
});

test("replayed credit does not subtract the same debit twice from a refreshed full balance", async () => {
  const admin = setup(800, null, true); const res = response();
  await handler(request({ pay_amount: 1000, apply_credit_amount: 800, checkout_request_id: token }), res as never);
  expect(admin.rpc).toHaveBeenCalledWith("redeem_client_credit_once", expect.objectContaining({ p_requested_amount: 800 }));
  expect(createPaymentSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 200 }), expect.anything());
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ chargedAmount: 200, creditApplied: 800 }));
});
