/** @jest-environment node */
import paidHandler from "@/pages/api/refunds/[id]/mark-paid";
import retryHandler from "@/pages/api/refunds/[id]/retry";
import { createPagesServerClient } from "@/lib/supabase/server";
import { refundService } from "@/services/refundService";
import { sendRefundPaidEmail } from "@/services/email/cancellationEmails";
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/services/refundService", () => ({ refundService: { processRefund: jest.fn() } }));
jest.mock("@/services/email/cancellationEmails", () => ({ sendRefundPaidEmail: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
function response() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res); return res;
}
function query(data: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), update: jest.fn(), insert: jest.fn().mockResolvedValue({ error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.update.mockReturnValue(chain); return chain;
}
function setup(status = "pending", company = "company-1", claimWon = true, amount = 100) {
  const update = query(claimWon ? { id: "refund-1" } : null);
  const from = jest.fn().mockReturnValueOnce(query({ role: "owner", company_id: "company-1" }))
    .mockReturnValueOnce(query({ id: "refund-1", company_id: company, order_id: "order-1", amount, payment_type: "refund",
      payment_status: status, processed_at: status === "completed" ? "2026-10-03T10:00:00Z" : null, reason: "Original reason" }))
    .mockReturnValueOnce(update).mockReturnValue(query(null));
  (createPagesServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from });
  return { from, update };
}
const req = { method: "POST", query: { id: "refund-1" }, body: {} };
beforeEach(() => jest.clearAllMocks());

test.each([["manual confirmation", paidHandler], ["automatic retry", retryHandler]] as const)("%s cannot race an already processing payout", async (_name, handler) => {
  const { from } = setup("processing"); const res = response(); await handler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(409); expect(from).toHaveBeenCalledTimes(2);
  expect(refundService.processRefund).not.toHaveBeenCalled(); expect(sendRefundPaidEmail).not.toHaveBeenCalled();
});
test.each([["manual confirmation", paidHandler], ["automatic retry", retryHandler]] as const)("%s rejects another company's completed refund before returning its status", async (_name, handler) => {
  setup("completed", "company-2"); const res = response(); await handler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(403);
});
test("repeated manual confirmation is successful without another audit/email", async () => {
  const { from } = setup("completed"); const res = response(); await paidHandler(req as never, res as never);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, duplicate: true }));
  expect(from).toHaveBeenCalledTimes(2); expect(sendRefundPaidEmail).not.toHaveBeenCalled();
});
test("manual confirmation loses safely if a provider retry claims the row first", async () => {
  const { from, update } = setup("pending", "company-1", false); const res = response(); await paidHandler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(409); expect(update.eq).toHaveBeenCalledWith("payment_status", "pending");
  expect(from).toHaveBeenCalledTimes(3); expect(sendRefundPaidEmail).not.toHaveBeenCalled();
});
test("one manual confirmation preserves the prior reason and leaves durable receipt delivery to the database", async () => {
  const { update } = setup(); const res = response(); await paidHandler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ payment_status: "completed", reason: "Original reason" }));
  expect(sendRefundPaidEmail).not.toHaveBeenCalled();
});
test("definitively failed legacy refund can be recorded after finance pays it", async () => {
  const { update } = setup("failed"); const res = response(); await paidHandler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(200); expect(update.eq).toHaveBeenCalledWith("payment_status", "failed");
});
test("invalid payment date is a client error rather than a server crash", async () => {
  const { from } = setup(); const res = response(); await paidHandler({ ...req, body: { paid_at: "not a date" } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(400); expect(from).toHaveBeenCalledTimes(1);
});
test("unknown provider refund outcome is not reported as a successful retry", async () => {
  setup(); (refundService.processRefund as jest.Mock).mockResolvedValue({ status: "pending_reconciliation", message: "Check provider" });
  const res = response(); await retryHandler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(409); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, status: "pending_reconciliation" }));
});
test("manual fallback after a safe eligibility check is returned without claiming a payout succeeded", async () => {
  setup(); (refundService.processRefund as jest.Mock).mockResolvedValue({ status: "pending_manual", message: "Bank payout details required" });
  const res = response(); await retryHandler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(200); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_manual" }));
});

test.each([0, -100, Infinity, 1.001])("invalid refund amount %p cannot be manually confirmed", async (amount) => {
  const { from, update } = setup("pending", "company-1", true, amount); const res = response();
  await paidHandler(req as never, res as never);
  expect(res.status).toHaveBeenCalledWith(400); expect(from).toHaveBeenCalledTimes(2);
  expect(update.update).not.toHaveBeenCalled(); expect(sendRefundPaidEmail).not.toHaveBeenCalled();
});
