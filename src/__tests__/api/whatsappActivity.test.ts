/**
 * @jest-environment node
 */
import handler from "@/pages/api/admin/whatsapp/activity";
import { messageSource, readPeriod, statusLabel } from "@/lib/whatsapp/activity";

let mockMessages: any[];
let mockBlocked: any[];
let mockRpcError: unknown;
const mockUpdates: any[] = [];

jest.mock("@/lib/subscriptionApiGate", () => ({ isSubscriptionGatedRequest: () => false, blockIfCompanyUnpaid: jest.fn() }));
jest.mock("@/lib/platformApiGate", () => ({ isPlatformOnlyRequest: () => false, blockUnlessPlatformAdmin: jest.fn() }));
jest.mock("@/lib/whatsapp/adminAccess", () => ({
  companyForAdmin: async () => ({ companyId: "company-1", userId: "user-1" }),
}));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    rpc: async () => ({ data: mockRpcError ? null : [{ template_name: "quote_sent", sent: 3, delivered: 2, read_count: 1, failed: 1 }], error: mockRpcError }),
    from: (table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let head = false;
      let range: [number, number] | null = null;
      let update: any = null;
      const source = () => {
        if (table === "whatsapp_messages") return mockMessages;
        if (table === "blocked_contacts") return mockBlocked;
        if (table === "integrations") {
          return [{ company_id: "company-1", integration_type: "whatsapp", settings: { automations: { whatsapp_quote_sent: { templateName: "quote_sent" } } } }];
        }
        return [];
      };
      const rows = () => source().filter((row) => filters.every((filter) => filter(row)));
      const chain: any = {
        select: (_fields: string, options?: { head?: boolean }) => { head = !!options?.head; return chain; },
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
        in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
        gte: (column: string, value: string) => { filters.push((row) => row[column] >= value); return chain; },
        or: (expression: string) => {
          const term = /ilike\.%([^%]+)%/.exec(expression)?.[1] || "";
          filters.push((row) => String(row.recipient_name).includes(term));
          return chain;
        },
        order: () => chain,
        range: (from: number, to: number) => { range = [from, to]; return chain; },
        update: (patch: any) => { update = patch; return chain; },
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        then: (resolve: any) => {
          if (update) {
            mockUpdates.push({ patch: update, matched: rows().length });
            return Promise.resolve({ error: null }).then(resolve);
          }
          const matched = rows();
          return Promise.resolve({ data: head ? null : range ? matched.slice(range[0], range[1] + 1) : matched, count: matched.length, error: null }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));

async function call(method: string, query: Record<string, string> = {}, body?: unknown) {
  const res: any = {
    statusCode: 0, body: null,
    setHeader() { return this; }, getHeader() { return undefined; }, end() { return this; }, on() { return this; }, once() { return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  await handler({ method, query, body, headers: {}, cookies: {}, url: "/api/admin/whatsapp/activity" } as any, res);
  return res;
}

const message = (id: number, extra = {}) => ({
  id: `m${id}`, company_id: "company-1", recipient_name: `Client ${id}`, recipient_phone: `2782000${String(id).padStart(4, "0")}`,
  template_name: "quote_sent", message_type: "template", status: "sent", failure_reason: null,
  created_at: new Date().toISOString(), dedup_key: `auto:whatsapp_quote_sent:q${id}`, ...extra,
});

describe("WhatsApp activity", () => {
  beforeEach(() => {
    mockMessages = [
      ...Array.from({ length: 30 }, (_, n) => message(n)),
      message(30, { status: "failed", failure_reason: "Number not on WhatsApp" }),
      message(31, { status: "pending" }),
      message(32, { company_id: "company-2" }),
    ];
    mockBlocked = [];
    mockRpcError = null;
    mockUpdates.length = 0;
  });

  it("pages the log and counts each status", async () => {
    const { body } = await call("GET");
    expect(body.messages).toHaveLength(25);
    expect(body.matching).toBe(32);
    expect(body.totals).toMatchObject({ sent: 30, failed: 1, waiting: 1 });
    expect((await call("GET", { page: "2" })).body.messages).toHaveLength(7);
  });

  it("skips totals and the report when only moving through the log", async () => {
    const { body } = await call("GET", { page: "2", summary: "0" });
    expect(body.messages).toHaveLength(7);
    expect(body.totals).toBeUndefined();
    expect(body.report).toBeUndefined();
  });

  it("never shows another company's messages", async () => {
    const pages = await Promise.all(["1", "2"].map((page) => call("GET", { page })));
    expect(pages.flatMap((page) => page.body.messages.map((item: any) => item.id))).not.toContain("m32");
  });

  it("uses the message's own name and says how it was sent", async () => {
    const { body } = await call("GET");
    expect(body.messages[0]).toMatchObject({ name: "Quote sent", source: "Automatic" });
    expect(body.report[0]).toEqual({ name: "Quote sent", sent: 3, delivered: 2, read: 1, failed: 1 });
  });

  it("filters by status and leaves out old messages", async () => {
    expect((await call("GET", { status: "failed" })).body.matching).toBe(1);
    mockMessages.push(message(40, { created_at: "2020-01-01T00:00:00.000Z" }));
    expect((await call("GET", { days: "7" })).body.matching).toBe(32);
  });

  it("still works before the database update, without the report", async () => {
    mockRpcError = { message: "function does not exist" };
    const { body, statusCode } = await call("GET");
    expect(statusCode).toBe(200);
    expect(body.reportReady).toBe(false);
    expect(body.messages).toHaveLength(25);
  });

  it("sends a failed message again", async () => {
    const { statusCode } = await call("POST", {}, { action: "retry", id: "m30" });
    expect(statusCode).toBe(200);
    expect(mockUpdates[0].patch).toMatchObject({ status: "pending", attempts: 0, failure_reason: null });
  });

  it("refuses to resend a message that didn't fail, or to someone who opted out", async () => {
    expect((await call("POST", {}, { action: "retry", id: "m1" })).statusCode).toBe(400);
    mockBlocked = [{ company_id: "company-1", phone: "0820000030" }];
    expect((await call("POST", {}, { action: "retry", id: "m30" })).statusCode).toBe(400);
    expect(mockUpdates).toHaveLength(0);
  });

  it("can't resend another company's message", async () => {
    expect((await call("POST", {}, { action: "retry", id: "m32" })).statusCode).toBe(404);
  });

  it("labels how each message was sent", () => {
    expect(messageSource("auto:x:1", "template")).toBe("Automatic");
    expect(messageSource("bulk:x", "template")).toBe("Bulk");
    expect(messageSource("manual:x", "template")).toBe("Manual");
    expect(messageSource(null, "text")).toBe("Reply");
    expect(statusLabel("sending")).toBe("Waiting");
    expect(readPeriod("999")).toBe(30);
  });
});
