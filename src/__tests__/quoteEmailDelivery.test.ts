/** @jest-environment node */
import { quoteService } from "@/services/quoteService";
import { supabase } from "@/integrations/supabase/client";
jest.mock("@/integrations/supabase/client", () => ({ supabase: { from: jest.fn() } }));
jest.mock("@/services/whatsappIntegrationService", () => ({ whatsappIntegrationService: {} }));
jest.mock("@/services/notificationService", () => ({ notificationService: {} }));
jest.mock("@/services/regionService", () => ({ regionService: {} }));
jest.mock("@/services/lifecycleService", () => ({ lifecycleService: {} }));
jest.mock("@/services/quote/quoteNotifications", () => ({ notifyQuoteUpdated: jest.fn() }));

describe("automatic quote email receipts", () => {
  const quote = { id: "quote-1", company_id: "company-1", user_id: "staff-1", client_email: "client@example.com", client_name: "Client", quote_number: "QUO-001", public_token: "public-token", total: 100, updated_at: "2026-10-05T10:00:00Z" };
  let writes: Array<{ table: string; value: unknown }>;
  const originalFetch = global.fetch;
  beforeEach(() => {
    writes = [];
    jest.spyOn(quoteService, "getQuote").mockResolvedValue(quote as any);
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const data = table === "profiles" ? { full_name: "Staff" } : { company_name: "Company", currency: "ZAR", slug: "company" };
      const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
      for (const name of ["select", "eq", "is"]) q[name] = jest.fn(() => q);
      q.update = jest.fn((value) => { writes.push({ table, value }); return q; });
      q.single = q.maybeSingle = async () => ({ data, error: null });
      return q;
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  });
  afterEach(() => { jest.restoreAllMocks(); global.fetch = originalFetch; });

  it("uses the quote's company, then stamps only an acknowledged send and completes its duplicate", async () => {
    await quoteService._fireQuoteSentEmail(quote.id);
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(request.companyId).toBe("company-1");
    expect(request.idempotencyKey).toBe("quote-ready/quote-1/2026-10-05T100000Z");
    expect(writes).toEqual([
      { table: "quotes", value: { sent_at: expect.any(String) } },
      { table: "outgoing_email_queue", value: { status: "sent", sent_at: expect.any(String), error_message: null } },
    ]);
  });
  it.each([
    { ok: false, result: { success: false, error: "API key missing" } },
    { ok: true, result: {} },
    { ok: true, result: { success: false } },
  ])("does not record a false receipt after %j", async ({ ok, result }) => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok, json: async () => result });
    await expect(quoteService._fireQuoteSentEmail(quote.id)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
  it("retries a rejected request using the same provider key", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Temporary failure" }) });
    await expect(quoteService._fireQuoteSentEmail(quote.id)).rejects.toThrow("Temporary failure");
    await quoteService._fireQuoteSentEmail(quote.id);
    const keys = (global.fetch as jest.Mock).mock.calls.map(([, init]) => JSON.parse(init.body).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(writes).toHaveLength(2);
  });
  it("does not resend an accepted booking or a successful quote receipt", async () => {
    (quoteService.getQuote as jest.Mock).mockResolvedValue({ ...quote, converted_to_order_id: "order-1" });
    await quoteService._fireQuoteSentEmail(quote.id);
    (quoteService.getQuote as jest.Mock).mockResolvedValue({ ...quote, sent_at: "2026-10-05T10:00:00Z" });
    await quoteService._fireQuoteSentEmail(quote.id);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
