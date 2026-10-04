/** @jest-environment node */
import { drainPaymentReceipts } from "@/lib/paymentReceiptOutbox";
import { emailService } from "@/services/emailService";
jest.mock("@/services/emailService", () => ({ emailService: { sendEmailDetailed: jest.fn() } }));

const baseJob = { id: "receipt-1", company_id: "company-1", kind: "received", attempts: 1,
  payload: { reference: "INV-1<script>", currency: "ZAR", amount: 100, total_amount: 1000,
    amount_paid: 100, balance_due: 900, company_name: "Caterer", client_email: "buyer@example.test", company_email: "owner@example.test" } };
function setup(job: Record<string, unknown> = baseJob) {
  const updates: Record<string, unknown>[] = [];
  const admin = { rpc: jest.fn(async (name: string) => ({ data: name === "claim_payment_receipts" ? [job] : {}, error: null })),
    from: jest.fn((table: string) => {
      if (table !== "payment_receipt_outbox") throw new Error(`Unexpected financial write to ${table}`);
      return { update: jest.fn((values: Record<string, unknown>) => {
      updates.push(values); return { eq: jest.fn().mockResolvedValue({ error: null }) };
    }) }; }) };
  return { admin, updates };
}
beforeEach(() => { jest.clearAllMocks(); (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: true }); });

test("transport failure keeps a durable retry without changing the financial ledger", async () => {
  const { admin, updates } = setup();
  (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: false, error: "SMTP unavailable" });
  expect(await drainPaymentReceipts(admin)).toEqual({ delivered: 0, errors: ["receipt receipt-1: SMTP unavailable"] });
  expect(updates).toEqual([expect.objectContaining({ last_error: "SMTP unavailable", claimed_until: expect.any(String) })]);
  expect(admin.from.mock.calls.every(([table]) => table === "payment_receipt_outbox")).toBe(true);
});

test("a saved client checkpoint skips that recipient and retries only the owner", async () => {
  const { admin, updates } = setup({ ...baseJob, client_email_sent_at: "2026-10-04T01:00:00Z" });
  expect(await drainPaymentReceipts(admin)).toEqual({ delivered: 1, errors: [] });
  expect(emailService.sendEmailDetailed).toHaveBeenCalledTimes(1);
  expect(emailService.sendEmailDetailed).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.test", companyId: "company-1",
    idempotencyKey: "payment-receipt/receipt-1/owner" }));
  expect(updates.some((update) => "client_email_sent_at" in update)).toBe(false);
  expect(updates.at(-1)).toMatchObject({ delivered_at: expect.any(String), claimed_until: null, last_error: null });
});

test("an owner delivery failure preserves the earlier successful client checkpoint", async () => {
  const { admin, updates } = setup();
  (emailService.sendEmailDetailed as jest.Mock).mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: "Owner email unavailable" });
  expect((await drainPaymentReceipts(admin)).delivered).toBe(0);
  expect(updates[0]).toHaveProperty("client_email_sent_at");
  expect(updates.some((update) => "owner_email_sent_at" in update || "delivered_at" in update)).toBe(false);
  expect(updates.at(-1)).toHaveProperty("last_error", "Owner email unavailable");
});

test("intentional notification suppression is completed rather than retried forever", async () => {
  const { admin, updates } = setup();
  (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: false, error_code: "notification_disabled" });
  expect(await drainPaymentReceipts(admin)).toEqual({ delivered: 1, errors: [] });
  expect(updates.at(-1)).toHaveProperty("delivered_at");
});

test("in-app delivery failure defers email and retains the receipt for recovery", async () => {
  const { admin, updates } = setup();
  admin.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_payment_receipts" ? [baseJob] : {},
    error: name === "deliver_payment_receipt_in_app" ? { message: "Database unavailable" } : null }) as never);
  expect((await drainPaymentReceipts(admin)).delivered).toBe(0);
  expect(emailService.sendEmailDetailed).not.toHaveBeenCalled();
  expect(updates.at(-1)).toHaveProperty("last_error", "Database unavailable");
});

test("receipt HTML escapes references and states the partial-payment balance", async () => {
  const { admin } = setup(); await drainPaymentReceipts(admin);
  const message = (emailService.sendEmailDetailed as jest.Mock).mock.calls[0][0];
  expect(message.body).toContain("INV-1&lt;script&gt;");
  expect(message.body).not.toContain("<script>");
  expect(message.body).toContain("Remaining balance:");
  expect(message.idempotencyKey).toBe("payment-receipt/receipt-1/client");
});

test("refund delivery tells client and owner about money returned, with independent durable checkpoints", async () => {
  const { admin, updates } = setup({ ...baseJob, kind: "refunded" });
  expect(await drainPaymentReceipts(admin)).toEqual({ delivered: 1, errors: [] });
  expect(emailService.sendEmailDetailed).toHaveBeenCalledTimes(2);
  for (const [message] of (emailService.sendEmailDetailed as jest.Mock).mock.calls) {
    expect(message.subject).toMatch(/^Refund processed/);
    expect(message.body).toContain("Refund recorded:");
    expect(message.body).not.toContain("Payment received:");
    expect(message.body).not.toContain("EFT could not be matched");
  }
  expect(updates[0]).toHaveProperty("client_email_sent_at");
  expect(updates[1]).toHaveProperty("owner_email_sent_at");
});
