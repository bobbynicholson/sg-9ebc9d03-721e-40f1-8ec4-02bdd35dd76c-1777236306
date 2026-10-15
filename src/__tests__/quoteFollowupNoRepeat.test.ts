/** @jest-environment node */
/**
 * The quote follow-up job never chases a client twice with the same
 * follow-up: already-sent follow-ups are recorded instead of re-sent.
 */
import handler from "@/pages/api/cron/quote-followup-send";
import { deliverAutomatedEmail } from "@/lib/email/automatedDelivery";
import { recordFollowupSent } from "@/services/quoteFollowupService";

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (h: any) => h }));
jest.mock("@/lib/cronAuth", () => ({ requireCronAuth: jest.fn(async () => ({ ok: true, source: "cron" })) }));
jest.mock("@/lib/cronHeartbeat", () => ({ recordCronHeartbeat: jest.fn() }));
jest.mock("@/lib/email/automatedDelivery", () => ({ deliverAutomatedEmail: jest.fn() }));
jest.mock("@/services/email/templateResolver", () => ({
  resolveEmailTemplate: jest.fn(async ({ fallback }: any) => ({ subject: fallback.subject, bodyHtml: fallback.bodyHtml })),
}));
jest.mock("@/services/quoteFollowupService", () => ({
  computeFollowupState: jest.fn(() => ({ light: "amber", nextPosition: 1 })),
  templateKeyFor: jest.fn(() => "email_lead_quoted"),
  recordFollowupSent: jest.fn(async () => ({ ok: true })),
  DEFAULT_FOLLOWUP_CADENCE: {},
}));

let tables: Record<string, any[]> = {};
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      const filters: Array<(r: any) => boolean> = [];
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        not: () => q,
        is: () => q,
        in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; },
        ilike: (k: string, v: string) => { filters.push((r) => String(r[k]).toLowerCase() === v.replace(/\\/g, "").toLowerCase()); return q; },
        gte: (k: string, v: string) => { filters.push((r) => r[k] >= v); return q; },
        limit: () => q,
        then: (resolve: any, reject: any) =>
          Promise.resolve({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject),
      };
      return q;
    },
  }),
}));

const quote = (id: string, email: string) => ({
  id, company_id: "co-1", status: "sent", sent_at: "2026-10-08T10:00:00Z", client_email: email, client_name: "Natasha Cupido",
  quote_number: id, quote_name: "Birthday",
});

async function run() {
  const res: any = { statusCode: 0, body: null, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method: "GET", headers: {}, query: {} } as any, res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  tables = { companies: [{ id: "co-1", auto_followups_enabled: true }], quote_followup_log: [], email_automation_log: [] };
});

describe("quote follow-up job", () => {
  it("records, and does not resend, a follow-up the client already received", async () => {
    tables.quotes = [quote("q-1", "natasha@example.com")];
    tables.email_automation_log = [{ user_id: "co-1", status: "sent", recipient_email: "Natasha@example.com", subject: "Just checking in on Birthday", created_at: "2026-10-14T09:00:00Z" }];
    const res = await run();
    expect(deliverAutomatedEmail).not.toHaveBeenCalled();
    expect(recordFollowupSent).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "q-1", position: 1, notes: expect.stringMatching(/already sent/) }));
    expect(res.body.sent).toBe(0);
  });

  it("sends and records a follow-up the client has not had yet", async () => {
    tables.quotes = [quote("q-1", "natasha@example.com")];
    (deliverAutomatedEmail as jest.Mock).mockResolvedValue({ success: true });
    const res = await run();
    expect(deliverAutomatedEmail).toHaveBeenCalledTimes(1);
    expect(recordFollowupSent).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "q-1", notes: "auto-sent by quote-followup-send cron" }));
    expect(res.body.sent).toBe(1);
  });

  it("records a follow-up Resend says it already sent in the last 24 hours, without an error", async () => {
    tables.quotes = [quote("q-1", "natasha@example.com")];
    (deliverAutomatedEmail as jest.Mock).mockResolvedValue({
      success: false,
      error: "This idempotency key has been used with this HTTP method and endpoint within the last 24 hours, but the request body was modified",
    });
    const res = await run();
    expect(recordFollowupSent).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "q-1", notes: expect.stringMatching(/last 24 hours/) }));
    expect(res.body.errors).toBeUndefined();
    expect(res.body.sent).toBe(0);
  });

  it("records the second quote's follow-up when the duplicate guard skipped the identical email", async () => {
    tables.quotes = [quote("q-1", "natasha@example.com"), quote("q-2", "natasha@example.com")];
    (deliverAutomatedEmail as jest.Mock)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, skipped_duplicate: true });
    const res = await run();
    expect(recordFollowupSent).toHaveBeenCalledTimes(2);
    expect(res.body.sent).toBe(1);
  });

  it("reports a follow-up that could not be recorded (it would be sent again)", async () => {
    tables.quotes = [quote("q-1", "natasha@example.com")];
    (deliverAutomatedEmail as jest.Mock).mockResolvedValue({ success: true });
    (recordFollowupSent as jest.Mock).mockResolvedValueOnce({ ok: false, error: "insert blocked" });
    const res = await run();
    expect(res.body.errors?.[0]).toMatch(/not recorded: insert blocked/);
  });
});
