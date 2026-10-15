/** @jest-environment node */
/**
 * The same automatic email to the same person within an hour is not sent
 * again. Sends a person makes from a screen are never blocked.
 */
import { clearRecentSendMemory, emailService, releaseAutomaticSend } from "@/services/emailService";

jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

/** email_automation_log stand-in: rows already sent. */
function logClient(rows: Array<Record<string, any>>, fail = false) {
  return {
    from: jest.fn(() => {
      const filters: Array<(r: any) => boolean> = [];
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
        ilike: (k: string, v: string) => {
          const want = v.replace(/\\([%_\\])/g, "$1").toLowerCase();
          filters.push((r) => String(r[k]).toLowerCase() === want);
          return q;
        },
        gte: (k: string, v: string) => { filters.push((r) => r[k] >= v); return q; },
        limit: async () => (fail
          ? { data: null, error: { message: "offline" } }
          : { data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return q;
    }),
  };
}

const NOW = Date.parse("2026-10-16T09:00:00Z");
const auto = { companyId: "co-1", template: "email_lead_quoted" };
const claim = (payload: any, to: string, subject: string, client: any = logClient([])) =>
  emailService.claimAutomaticSend(payload, to, subject, client, NOW);

beforeEach(() => clearRecentSendMemory());

describe("duplicate guard for automatic emails", () => {
  it("sends once, then skips the same email to the same person in the same run", async () => {
    expect(await claim(auto, "client@example.com", "Just checking in on Birthday")).toBe("claimed");
    expect(await claim(auto, "Client@Example.com", "Just checking in on Birthday")).toBe("duplicate");
  });

  it("skips when the send log shows it already went out within the hour", async () => {
    const sentAt = new Date(NOW - 20 * 60_000).toISOString();
    const log = logClient([{ user_id: "co-1", status: "sent", recipient_email: "client@example.com", subject: "Deposit received - Birthday booking secure", created_at: sentAt, order_id: "o-1" }]);
    expect(await claim({ ...auto, template: "deposit_payment_received", orderId: "o-1" }, "client@example.com", "Deposit received - Birthday booking secure", log)).toBe("duplicate");
  });

  it("does not treat a different order, person, subject or an older send as a duplicate", async () => {
    const old = new Date(NOW - 2 * 3600_000).toISOString();
    const log = logClient([
      { user_id: "co-1", status: "sent", recipient_email: "client@example.com", subject: "Deposit received - Birthday booking secure", created_at: new Date(NOW - 60_000).toISOString(), order_id: "o-1" },
      { user_id: "co-1", status: "sent", recipient_email: "client@example.com", subject: "Event reminder", created_at: old, order_id: null },
    ]);
    const dep = { ...auto, template: "deposit_payment_received" };
    expect(await claim({ ...dep, orderId: "o-2" }, "client@example.com", "Deposit received - Birthday booking secure", log)).toBe("claimed");
    expect(await claim(dep, "other@example.com", "Deposit received - Birthday booking secure", log)).toBe("claimed");
    expect(await claim(auto, "client@example.com", "Event reminder", log)).toBe("claimed");
  });

  it("never blocks a person's own send, sign-in links, enquiries or part-payment receipts", async () => {
    for (const payload of [
      { companyId: "co-1", deliveryContext: "manual" },
      { companyId: "co-1", _userInitiated: true },
      { companyId: "co-1", template: "client_magic_link" },
      { companyId: "co-1", template: "balance_payment_received" },
      { companyId: "co-1", templateType: "embed_lead_admin_email" },
      { companyId: "co-1", automationKey: "embed_lead_thank_you_client" },
    ]) {
      expect(await claim(payload, "a@example.com", "Same subject")).toBe("exempt");
      expect(await claim(payload, "a@example.com", "Same subject")).toBe("exempt");
    }
  });

  it("lets a retry through after a failed send, and sends when the log lookup fails", async () => {
    expect(await claim(auto, "client@example.com", "Retry me")).toBe("claimed");
    releaseAutomaticSend("co-1", "client@example.com", "Retry me");
    expect(await claim(auto, "client@example.com", "Retry me")).toBe("claimed");
    expect(await claim(auto, "x@example.com", "Lookup down", logClient([], true))).toBe("claimed");
  });
});
