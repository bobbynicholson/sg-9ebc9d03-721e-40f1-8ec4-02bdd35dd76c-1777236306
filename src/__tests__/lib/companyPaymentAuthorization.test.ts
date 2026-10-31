/** @jest-environment node */
import gatewaysHandler from "@/pages/api/payment-gateways";
import activateHandler from "@/pages/api/payment-gateways/[id]/activate";
import deleteHandler from "@/pages/api/payment-gateways/[id]";
import testHandler from "@/pages/api/payment-gateways/[id]/test";
import refundRetryHandler from "@/pages/api/refunds/[id]/retry";
import refundPaidHandler from "@/pages/api/refunds/[id]/mark-paid";
import proofHandler from "@/pages/api/payments/proof-url";
import cancellationHandler from "@/pages/api/orders/cancellation-review";
import amendmentHandler from "@/pages/api/orders/amendment-review";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentGatewayService } from "@/services/paymentGatewayService";
import { refundService } from "@/services/refundService";

jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
jest.mock("@/services/paymentGatewayService", () => ({
  PAYMENT_GATEWAY_PROVIDERS: ["payfast", "yoco", "stripe"],
  paymentGatewayService: { listWithCredentialHints: jest.fn(), activate: jest.fn(), softDelete: jest.fn(), getByIdWithCredentials: jest.fn() },
}));
jest.mock("@/services/refundService", () => ({ refundService: { processRefund: jest.fn() } }));
jest.mock("@/services/email/cancellationEmails", () => ({ sendRefundPaidEmail: jest.fn() }));
jest.mock("@/services/emailService", () => ({ emailService: {} }));
jest.mock("@/services/order/orderWorkflow", () => ({ cancelOrder: jest.fn() }));
jest.mock("@/services/lifecycle/resolveClientUserId", () => ({ resolveClientUserId: jest.fn() }));
jest.mock("@/services/email/templateResolver", () => ({ resolveEmailTemplate: jest.fn() }));
jest.mock("@/lib/geo/ensureVenueCoords", () => ({ ensureVenueCoords: jest.fn() }));

function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
function query(data: unknown, error: unknown = null) {
  const chain = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({ data, error }) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  return chain;
}
const endpoints = [
  ["gateway list", gatewaysHandler, "GET"],
  ["gateway save", gatewaysHandler, "POST"],
  ["gateway activation", activateHandler, "POST"],
  ["gateway deletion", deleteHandler, "DELETE"],
  ["gateway test", testHandler, "POST"],
  ["refund retry", refundRetryHandler, "POST"],
  ["refund confirmation", refundPaidHandler, "POST"],
  ["EFT proof access", proofHandler, "GET"],
  ["cancellation approval", cancellationHandler, "POST"],
  ["amendment approval", amendmentHandler, "POST"],
] as const;
beforeEach(() => jest.clearAllMocks());

test.each(endpoints)("%s denies a client with a forged selected super-admin role", async (_name, handler, method) => {
  const from = jest.fn().mockReturnValue(query({ role: "client", active_role: "super_admin", company_id: "company-1" }));
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: "client-user" } } }) }, from });
  const res = response();
  await handler({ method, headers: {}, query: { id: "gateway-1", company_id: "company-2" }, body: { company_id: "company-2" } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(from).toHaveBeenCalledTimes(1);
  expect(getServiceSupabase).not.toHaveBeenCalled();
  expect(refundService.processRefund).not.toHaveBeenCalled();
});

test.each(endpoints)("%s fails closed when permission lookup fails", async (_name, handler, method) => {
  const from = jest.fn().mockReturnValue(query({ role: "owner", company_id: "company-1" }, { message: "database unavailable" }));
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: "owner-user" } } }) }, from });
  const res = response();
  const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await handler({ method, headers: {}, query: { id: "gateway-1" }, body: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(getServiceSupabase).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

test("an owner working in a client display mode still configures only their own company", async () => {
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: "owner-user" } } }) },
    from: jest.fn().mockReturnValue(query({ role: "owner", active_role: "client", company_id: "company-1" })) });
  const service = {};
  (getServiceSupabase as jest.Mock).mockReturnValue(service);
  (paymentGatewayService.activate as jest.Mock).mockResolvedValue({ ok: true, gateway: { id: "gateway-1" } });
  const res = response();
  await activateHandler({ method: "POST", query: { id: "gateway-1", company_id: "company-2" }, body: { company_id: "company-2" } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(paymentGatewayService.activate).toHaveBeenCalledWith("company-1", "gateway-1", "owner-user", service);
});

test("a real platform super-admin can target another company's gateway", async () => {
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: "platform-user" } } }) },
    from: jest.fn().mockReturnValue(query({ role: "super_admin", active_role: "client", company_id: null })) });
  const service = {};
  (getServiceSupabase as jest.Mock).mockReturnValue(service);
  (paymentGatewayService.activate as jest.Mock).mockResolvedValue({ ok: true });
  const res = response();
  await activateHandler({ method: "POST", query: { id: "gateway-2", company_id: "company-2" }, body: {} } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(paymentGatewayService.activate).toHaveBeenCalledWith("company-2", "gateway-2", "platform-user", service);
});

const gatewayEndpoints = endpoints.slice(0, 5);
const statusCases = [
  { name: "disabled Admin", role: "admin", is_active: false, deleted_at: null },
  { name: "disabled owner", role: "owner", is_active: false, deleted_at: null },
  { name: "disabled company Admin", role: "company_admin", is_active: false, deleted_at: null },
  { name: "disabled platform Admin", role: "super_admin", is_active: false, deleted_at: null },
  { name: "deleted Admin with the active flag still set", role: "admin", is_active: true, deleted_at: "2026-10-31T00:00:00Z" },
  { name: "deleted owner", role: "owner", is_active: true, deleted_at: "2026-10-31T00:00:00Z" },
  { name: "deleted platform Admin", role: "super_admin", is_active: true, deleted_at: "2026-10-31T00:00:00Z" },
];

describe.each(statusCases)("$name with an otherwise valid Auth session", state => {
  test.each(gatewayEndpoints)("%s denies access before any privileged operation", async (_name, handler, method) => {
    (createPagesServerClient as jest.Mock).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: "disabled-user" } } }) },
      from: jest.fn().mockReturnValue(query({ ...state, active_role: "super_admin", company_id: "company-1" })),
    });
    const res = response();
    await handler({ method, headers: {}, query: { id: "gateway-1", company_id: "company-2" }, body: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Account access denied", code: "ACCOUNT_ACCESS_DENIED" });
    expect(getServiceSupabase).not.toHaveBeenCalled();
    expect(paymentGatewayService.listWithCredentialHints).not.toHaveBeenCalled();
    expect(paymentGatewayService.activate).not.toHaveBeenCalled();
    expect(paymentGatewayService.softDelete).not.toHaveBeenCalled();
    expect(paymentGatewayService.getByIdWithCredentials).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
});

test.each(gatewayEndpoints)("%s denies a missing profile", async (_name, handler, method) => {
  (createPagesServerClient as jest.Mock).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: "orphan-user" } } }) },
    from: jest.fn().mockReturnValue(query(null)),
  });
  const res = response();
  await handler({ method, headers: {}, query: { id: "gateway-1" }, body: {} } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(getServiceSupabase).not.toHaveBeenCalled();
});

test.each(gatewayEndpoints)("%s denies a rejected Auth session before reading the profile", async (_name, handler, method) => {
  const from = jest.fn();
  (createPagesServerClient as jest.Mock).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: "unverified-user" } }, error: { message: "invalid session" } }) }, from,
  });
  const res = response();
  await handler({ method, headers: {}, query: { id: "gateway-1" }, body: {} } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(from).not.toHaveBeenCalled();
  expect(getServiceSupabase).not.toHaveBeenCalled();
});

test.each(["admin", "owner", "company_admin"])("an active %s can read their own gateways", async role => {
  (createPagesServerClient as jest.Mock).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: "active-user" } } }) },
    from: jest.fn().mockReturnValue(query({ role, company_id: "company-1", is_active: true, deleted_at: null })),
  });
  const service = {};
  (getServiceSupabase as jest.Mock).mockReturnValue(service);
  (paymentGatewayService.listWithCredentialHints as jest.Mock).mockResolvedValue([]);
  const res = response();
  await gatewaysHandler({ method: "GET", headers: {}, query: { company_id: "company-2" }, body: {} } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(paymentGatewayService.listWithCredentialHints).toHaveBeenCalledWith("company-1", service);
});

test("the same session immediately loses access after disabling and regains it after reactivation", async () => {
  const profile = { role: "admin", company_id: "company-1", is_active: true, deleted_at: null };
  (createPagesServerClient as jest.Mock).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: "same-user" } } }) },
    from: jest.fn().mockReturnValue(query(profile)),
  });
  (getServiceSupabase as jest.Mock).mockReturnValue({});
  (paymentGatewayService.listWithCredentialHints as jest.Mock).mockResolvedValue([]);
  const req = { method: "GET", headers: {}, query: {}, body: {} } as never;
  const active = response();
  await gatewaysHandler(req, active as never);
  profile.is_active = false;
  const disabled = response();
  await gatewaysHandler(req, disabled as never);
  profile.is_active = true;
  const restored = response();
  await gatewaysHandler(req, restored as never);
  expect(active.status).toHaveBeenCalledWith(200);
  expect(disabled.status).toHaveBeenCalledWith(403);
  expect(restored.status).toHaveBeenCalledWith(200);
  expect(paymentGatewayService.listWithCredentialHints).toHaveBeenCalledTimes(2);
  expect(getServiceSupabase).toHaveBeenCalledTimes(2);
});
