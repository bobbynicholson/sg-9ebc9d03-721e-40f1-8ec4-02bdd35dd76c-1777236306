import { render, act } from "@testing-library/react";
import { QuoteSendDialog } from "@/components/billing/QuoteSendDialog";
import { supabase } from "@/integrations/supabase/client";

let mockSendProps: any;
jest.mock("@/components/billing/SendEmailDialog", () => ({ SendEmailDialog: (props: any) => { mockSendProps = props; return null; } }));
jest.mock("@/integrations/supabase/client", () => ({ supabase: { from: jest.fn() } }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/observability", () => ({ captureException: jest.fn() }));
jest.mock("@/services/email/templateResolver", () => ({ resolveEmailTemplate: jest.fn() }));
jest.mock("@/services/publicQuoteService", () => ({ buildPublicQuoteUrl: jest.fn() }));

describe("quote composer delivery", () => {
  const quote = { id: "quote-1", client_email: "client@example.com", total: 100 };
  const payload = { to: "client@example.com", subject: "Quote", body: "Your quote", attachPdf: false };
  let writes: string[];
  let onSent: jest.Mock;
  const originalFetch = global.fetch;
  beforeEach(() => {
    writes = [];
    onSent = jest.fn();
    Object.defineProperty(global.crypto, "randomUUID", { configurable: true, value: jest.fn(() => "attempt-1") });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const q: any = { then: (resolve: any) => Promise.resolve({ error: null }).then(resolve) };
      for (const method of ["eq", "in"]) q[method] = () => q;
      q.update = () => { writes.push(table); return q; };
      return q;
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<QuoteSendDialog open={false} onOpenChange={jest.fn()} companyId="company-1" quote={quote} tenantName="Company" onSent={onSent} />);
  });
  afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });
  it("records the lifecycle and queued duplicate only after explicit success", async () => {
    let result;
    await act(async () => { result = await mockSendProps.onSend(payload); });
    expect(result).toEqual({ success: true });
    expect(writes).toEqual(["quotes", "outgoing_email_queue", "quote_change_requests"]);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(mockSendProps.testRecipient).toBeUndefined();
  });
  it("keeps the quote unsent and the retry key stable on an ambiguous response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    let result;
    await act(async () => { result = await mockSendProps.onSend(payload); });
    expect(result).toMatchObject({ success: false });
    expect(writes).toEqual([]);
    expect(onSent).not.toHaveBeenCalled();
    await act(async () => { await mockSendProps.onSend(payload); });
    const requests = (global.fetch as jest.Mock).mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
  });
  it("does not treat a test/copy to another recipient as delivery to the customer", async () => {
    let result;
    await act(async () => { result = await mockSendProps.onSend({ ...payload, to: "owner@example.com" }); });
    expect(result).toEqual({ success: true });
    expect(writes).toEqual([]);
    expect(onSent).not.toHaveBeenCalled();
  });
});
