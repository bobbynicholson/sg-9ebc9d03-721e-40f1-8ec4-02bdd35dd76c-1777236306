/** @jest-environment node */
import { drainEmailQueue, getEmailQueueHealth } from "@/lib/email/drainQueue";
import { emailService } from "@/services/emailService";
import { queuedEmailReference } from "@/lib/email/queuePolicy";
jest.mock("@/services/emailService", () => ({ emailService: { sendEmailDetailed: jest.fn() } }));

function queueClient(rows: any[], receiptError = false) {
  const sb: any = { rpc: jest.fn() };
  sb.from = jest.fn(() => {
    const filters: Array<(r: any) => boolean> = [];
    let patch: any = null;
    let size = Infinity;
    const q: any = {};
    q.eq = (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; };
    q.in = (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return q; };
    q.lt = (k: string, v: number) => { filters.push(r => r[k] < v); return q; };
    q.or = () => { filters.push(r => !r.scheduled_for || r.scheduled_for <= new Date().toISOString()); return q; };
    q.order = q.select = () => q;
    q.limit = (n: number) => { size = n; return q; };
    q.update = (value: any) => { patch = value; return q; };
    function execute(single = false) {
      if (receiptError && patch?.status === "sent") return { error: { message: "database offline" }, data: null };
      const matching = rows.filter(r => filters.every(f => f(r))).slice(0, size);
      if (patch) matching.forEach(r => Object.assign(r, patch));
      const data = matching.map(r => ({ ...r }));
      return { data: single ? data[0] || null : data, error: null };
    }
    q.then = (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject);
    q.maybeSingle = async () => execute(true);
    return q;
  });
  return sb;
}
const quote = { id: "mail-1", company_id: "company-1", to_email: "client@example.com", subject: "Quote", body: "Your quote", trigger_event: "quote.sent", trigger_ref_id: "quote-1", attempts: 0, status: "queued", template_type: "quote.sent" };

describe("transactional queue delivery", () => {
  beforeEach(() => { jest.clearAllMocks(); (emailService.sendEmailDetailed as jest.Mock).mockResolvedValue({ success: true }); });
  it("delivers operational mail independently of follow-ups and respects tenant and due-date scope", async () => {
    const rows = [ { ...quote }, { ...quote, id: "marketing", trigger_event: "aftersales" }, { ...quote, id: "other", company_id: "company-2" }, { ...quote, id: "future", scheduled_for: "2099-01-01" } ];
    const sb = queueClient(rows);
    expect(await drainEmailQueue(sb, ["company-1"], { transactionalOnly: true })).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(emailService.sendEmailDetailed).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1", quoteId: "quote-1", idempotencyKey: "email-queue/mail-1", templateType: "quote.sent" }));
    expect(rows.map(r => r.status)).toEqual(["sent", "queued", "queued", "queued"]);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("prevents two concurrent workers from dispatching the same row", async () => {
    const sb = queueClient([{ ...quote }]);
    const results = await Promise.all([drainEmailQueue(sb, ["company-1"], { transactionalOnly: true }), drainEmailQueue(sb, ["company-1"], { transactionalOnly: true })]);
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1);
    expect(emailService.sendEmailDetailed).toHaveBeenCalledTimes(1);
  });
  it("retains the provider diagnosis and retries with a stable key", async () => {
    const rows = [{ ...quote }];
    const sb = queueClient(rows);
    (emailService.sendEmailDetailed as jest.Mock).mockResolvedValueOnce({ success: false, error_code: "resend_auth", error: "Missing server API key" });
    expect(await drainEmailQueue(sb, ["company-1"], { transactionalOnly: true })).toMatchObject({ failed: 1 });
    expect(rows[0]).toMatchObject({ status: "queued", attempts: 1, error_message: "resend_auth: Missing server API key" });
    await drainEmailQueue(sb, ["company-1"], { transactionalOnly: true });
    expect(rows[0]).toMatchObject({ status: "sent", attempts: 2, error_message: null });
    expect((emailService.sendEmailDetailed as jest.Mock).mock.calls[0][0].idempotencyKey).toBe((emailService.sendEmailDetailed as jest.Mock).mock.calls[1][0].idempotencyKey);
  });
  it("does not claim success when persisting the receipt fails", async () => {
    await expect(drainEmailQueue(queueClient([{ ...quote }], true), ["company-1"], { transactionalOnly: true })).rejects.toThrow("queue receipt failed");
  });
  it("preserves the explicit marketing opt-in path", async () => {
    const sb = queueClient([]);
    sb.rpc.mockResolvedValue({ data: [{ ...quote, status: "in_progress", attempts: 1 }], error: null });
    await drainEmailQueue(sb, ["opted-in-company"]);
    expect(sb.rpc).toHaveBeenCalledWith("claim_email_batch", { p_allow_list: ["opted-in-company"], p_batch_size: 25, p_max_attempts: 5 });
  });
  it("does not report an unreadable queue as empty", async () => {
    const q: any = { select: () => q, eq: () => q, then: (resolve: any) => Promise.resolve({ error: new Error("Read failed") }).then(resolve) };
    await expect(getEmailQueueHealth({ from: () => q }, "company-1")).rejects.toThrow("Read failed");
  });
  it("correlates dotted quote/order and scheduled reminder events", () => {
    expect(queuedEmailReference("quote.sent", "q")).toEqual({ quoteId: "q" });
    expect(queuedEmailReference("order.created", "o")).toEqual({ orderId: "o" });
    expect(queuedEmailReference("kitchen_pre_event", "o")).toEqual({ orderId: "o" });
    expect(queuedEmailReference("aftersales", "o")).toEqual({});
  });
});
