/**
 * @jest-environment node
 */
import {
  WHATSAPP_AUTOMATIONS,
  WHATSAPP_MANUAL_ONLY,
  applyAutomationChanges,
  automationPreview,
  automationVariables,
  wordingProblem,
  isAutomationReady,
  isValidTemplateName,
  readAutomationSettings,
} from "@/lib/whatsapp/automations";
import { decryptWhatsAppToken, encryptWhatsAppToken } from "@/lib/whatsapp/credentials";
import { DEFAULT_WHATSAPP_RULES, isQuietHour, readWhatsAppRules, replyIntent } from "@/lib/whatsapp/rules";
import { runWhatsAppAutomations } from "@/lib/whatsapp/runAutomations";
import { whatsappIntegrationService } from "@/services/whatsappIntegrationService";

jest.mock("@/integrations/supabase/client", () => ({ supabase: { from: jest.fn() } }));
jest.mock("@/services/commsGuardService", () => ({ isCommsAllowed: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock("@/lib/customerLinksServer", () => ({
  buildPublicQuoteUrlServer: (token: string) => (token ? `https://example.com/q/${token}` : ""),
  buildPayInvoiceUrlServer: jest.fn(),
  mintOrderCustomerLink: jest.fn(),
}));

const NOW = new Date("2026-11-04T10:00:00.000Z"); // 12:00 in South Africa.
const COMPANY = "company-1";

/** A small stand-in for the database that records what gets queued. */
function fakeDb(tables: Record<string, any[]>, settings: unknown) {
  const inserted: any[] = [];
  const query = (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    let pageRange: [number, number] | null = null;
    const chain: any = {
      select: () => chain,
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
      gte: (column: string, value: string) => { filters.push((row) => !!row[column] && row[column] >= value); return chain; },
      lte: (column: string, value: string) => { filters.push((row) => !!row[column] && row[column] <= value); return chain; },
      is: () => chain,
      not: () => chain,
      limit: () => chain,
      range: (from: number, to: number) => { pageRange = [from, to]; return chain; },
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
      then: (resolve: any) => {
        const matched = rows();
        return Promise.resolve({ data: pageRange ? matched.slice(pageRange[0], pageRange[1] + 1) : matched, error: null }).then(resolve);
      },
      insert: async (row: any) => {
        if (inserted.some((item) => item.dedup_key === row.dedup_key)) return { error: { code: "23505" } };
        inserted.push(row);
        return { error: null };
      },
    };
    const rows = () => (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
    return chain;
  };
  tables.integrations = [{ company_id: COMPANY, settings, integration_type: "whatsapp", is_active: true }];
  tables.companies = [{ id: COMPANY, company_name: "Sample Catering", slug: "sample", timezone: "Africa/Johannesburg" }];
  return { db: { from: query } as any, inserted };
}

const turnedOn = (key: string, enabledAt = "2026-11-04T08:00:00.000Z") => ({
  automations: { [key]: { enabled: true, enabledAt, templateName: "approved_template", language: "en" } },
});
const quote = (extra = {}) => ({
  id: "q1", company_id: COMPANY, client_name: "Sam Lee", client_phone: "082 555 0001", quote_name: "Year-end lunch",
  public_token: "abc", sent_at: "2026-11-04T09:00:00.000Z", ...extra,
});
const order = (extra = {}) => ({
  id: "o1", company_id: COMPANY, client_name: "Sam Lee", client_phone: "0825550001", event_name: "Wedding",
  status: "confirmed", event_date: "2026-11-04", ...extra,
});

describe("choosing WhatsApp messages", () => {
  it("has every message off until a company turns it on", () => {
    const settings = readAutomationSettings(null);
    expect(Object.values(settings).every((item) => !item.enabled)).toBe(true);
    expect(WHATSAPP_AUTOMATIONS.filter((item) => item.recommended).map((item) => item.key)).toEqual([
      "whatsapp_quote_sent", "whatsapp_quote_chase", "whatsapp_event_day_morning",
    ]);
  });

  it("needs an approved template name before a message can send", () => {
    expect(isAutomationReady({ enabled: true, enabledAt: "x", templateName: "", language: "en", wording: "" })).toBe(false);
    expect(isAutomationReady({ enabled: true, enabledAt: "x", templateName: "quote_sent", language: "en", wording: "" })).toBe(true);
    expect(isValidTemplateName("Quote Sent")).toBe(false);
  });

  it("keeps the original start time when saving again, and clears it when turned off", () => {
    const first = applyAutomationChanges(readAutomationSettings(null), { whatsapp_quote_sent: { enabled: true, templateName: "t" } }, "2026-01-01");
    const again = applyAutomationChanges(first, { whatsapp_quote_sent: { enabled: true, templateName: "t" } }, "2026-02-02");
    expect(again.whatsapp_quote_sent.enabledAt).toBe("2026-01-01");
    const off = applyAutomationChanges(again, { whatsapp_quote_sent: { enabled: false } }, "2026-03-03");
    expect(off.whatsapp_quote_sent.enabledAt).toBeNull();
  });
});

describe("the WhatsApp automation job", () => {
  it("queues nothing when no message is turned on", async () => {
    const { db, inserted } = fakeDb({ quotes: [quote()] }, {});
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(0);
  });

  it("queues only the message that is turned on, as an approved template", async () => {
    const { db, inserted } = fakeDb({ quotes: [quote({ accepted_at: "2026-11-04T09:30:00.000Z" })] }, turnedOn("whatsapp_quote_sent"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      message_type: "template", template_name: "approved_template", recipient_phone: "27825550001",
      dedup_key: "auto:whatsapp_quote_sent:q1",
    });
    expect(inserted[0].template_params.components[0].parameters.map((item: any) => item.text)).toEqual([
      "Sam", "Year-end lunch", "Sample Catering", "https://example.com/q/abc",
    ]);
  });

  it("never sends for something that happened before it was turned on", async () => {
    const { db, inserted } = fakeDb({ quotes: [quote({ sent_at: "2026-11-04T07:00:00.000Z" })] }, turnedOn("whatsapp_quote_sent"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(0);
  });

  it("sends once per quote, however often the job runs", async () => {
    const { db, inserted } = fakeDb({ quotes: [quote()] }, turnedOn("whatsapp_quote_sent"));
    await runWhatsAppAutomations(db, NOW);
    const second = await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(1);
    expect(second.skipped).toBe(1);
  });

  it("skips blocked numbers, paused orders and clients without a number", async () => {
    const { db, inserted } = fakeDb({
      blocked_contacts: [{ company_id: COMPANY, phone: "0825550001" }],
      orders: [
        order(),
        order({ id: "o2", client_phone: "0825550002", comms_paused_until: "2026-12-01T00:00:00.000Z" }),
        order({ id: "o3", client_phone: null }),
      ],
    }, turnedOn("whatsapp_event_day_morning"));
    const result = await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(0);
    expect(result.skipped).toBe(3);
  });

  it("waits until 8:00 local time for the on-the-day message", async () => {
    const { db, inserted } = fakeDb({ orders: [order()] }, turnedOn("whatsapp_event_day_morning"));
    await runWhatsAppAutomations(db, new Date("2026-11-04T05:00:00.000Z")); // 07:00 local.
    expect(inserted).toHaveLength(0);
    await runWhatsAppAutomations(db, new Date("2026-11-04T06:05:00.000Z")); // 08:05 local.
    expect(inserted).toHaveLength(1);
  });

  it("sends the quote follow-up only for the first follow-up", async () => {
    const { db, inserted } = fakeDb({
      quotes: [quote(), quote({ id: "q2" })],
      quote_followup_log: [
        { company_id: COMPANY, quote_id: "q1", sequence_position: 1, status: "sent", created_at: "2026-11-04T09:00:00.000Z" },
        { company_id: COMPANY, quote_id: "q2", sequence_position: 2, status: "sent", created_at: "2026-11-04T09:00:00.000Z" },
      ],
    }, turnedOn("whatsapp_quote_chase"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted.map((row) => row.related_entity_id)).toEqual(["q1"]);
  });
});

describe("the other automatic messages", () => {
  const lead = (extra = {}) => ({
    id: "l1", company_id: COMPANY, client_name: "Sam Lee", client_phone: "0825550001", event_type: "Wedding",
    status: "new", source: "embed", created_at: "2026-11-04T09:00:00.000Z", event_date: "2026-12-01", guest_count: 50, ...extra,
  });
  const staff = (extra = {}) => ({
    id: "p1", company_id: COMPANY, full_name: "Dan Driver", mobile_number: "0825550009", role: "driver",
    whatsapp_opt_in: true, ...extra,
  });

  it("every message has a slot for each number in its wording", () => {
    for (const automation of WHATSAPP_AUTOMATIONS) {
      const numbers = new Set(automation.wording.match(/\{\{\d\}\}/g));
      expect(numbers.size).toBe(automation.slots.length);
    }
  });

  it("asks for event details only when they are missing", async () => {
    const { db, inserted } = fakeDb(
      { leads: [lead(), lead({ id: "l2", guest_count: null })] },
      turnedOn("whatsapp_lead_details"),
    );
    await runWhatsAppAutomations(db, NOW);
    expect(inserted.map((row) => row.related_entity_id)).toEqual(["l2"]);
  });

  it("chases an open enquiry after 3 days, but not a won one or one from before it was turned on", async () => {
    const created = "2026-11-01T06:00:00.000Z";
    const { db, inserted } = fakeDb({
      leads: [lead({ created_at: created }), lead({ id: "l2", created_at: created, status: "won" }), lead({ id: "l3", created_at: "2026-10-31T23:00:00.000Z" })],
    }, turnedOn("whatsapp_lead_chase", "2026-11-01T00:00:00.000Z"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted.map((row) => row.related_entity_id)).toEqual(["l1"]);
  });

  it("skips contacts paused after a bulk import", async () => {
    const { db, inserted } = fakeDb({
      clients: [{
        id: "c1", company_id: COMPANY, client_name: "Sam", phone: "0825550001",
        created_at: "2026-11-04T09:00:00.000Z", comms_paused_until: "2026-12-01T00:00:00.000Z",
      }],
    }, turnedOn("whatsapp_touch_base"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(0);
  });

  it("tells the assigned driver about a job, unless they turned WhatsApp off", async () => {
    const tables = {
      driver_assignments: [
        { id: "a1", company_id: COMPANY, driver_id: "p1", order_id: "o1", created_at: "2026-11-04T09:00:00.000Z" },
        { id: "a2", company_id: COMPANY, driver_id: "p2", order_id: "o1", created_at: "2026-11-04T09:00:00.000Z" },
      ],
      orders: [order()],
      profiles: [staff(), staff({ id: "p2", whatsapp_opt_in: false })],
    };
    const { db, inserted } = fakeDb(tables, turnedOn("whatsapp_staff_job_assigned"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted.map((row) => row.related_entity_id)).toEqual(["a1"]);
    expect(inserted[0].recipient_phone).toBe("27825550009");
  });

  it("alerts each admin once about a website enquiry, and ignores other sources", async () => {
    const { db, inserted } = fakeDb({
      leads: [lead(), lead({ id: "l2", source: "manual_add" })],
      profiles: [staff({ id: "a1", role: "owner" }), staff({ id: "a2", role: "company_admin", mobile_number: "0825550010" }), staff({ id: "d1" })],
    }, turnedOn("embed_lead_admin_whatsapp"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted.map((row) => row.dedup_key)).toEqual([
      "auto:embed_lead_admin_whatsapp:l1:a1", "auto:embed_lead_admin_whatsapp:l1:a2",
    ]);
  });
});

describe("sending rules", () => {
  const lead = (extra = {}) => ({
    id: "l1", company_id: COMPANY, client_name: "Sam Lee", client_phone: "0825550001", event_type: "Wedding",
    status: "new", source: "embed", created_at: "2026-11-04T09:00:00.000Z", event_date: "2026-12-01", guest_count: 50, ...extra,
  });
  const withRules = (key: string, rules: object) => ({ ...turnedOn(key), rules });

  it("handles quiet hours past midnight", () => {
    const rules = readWhatsAppRules({});
    expect(isQuietHour(21, rules)).toBe(true);
    expect(isQuietHour(6, rules)).toBe(true);
    expect(isQuietHour(12, rules)).toBe(false);
  });

  it("uses safe values for missing or bad rules", () => {
    expect(readWhatsAppRules({ rules: { weeklyLimit: 999, quietStartHour: "x" } })).toEqual(DEFAULT_WHATSAPP_RULES);
  });

  it("holds a quote message during quiet hours and sends it after", async () => {
    const { db, inserted } = fakeDb({ quotes: [quote()] }, turnedOn("whatsapp_quote_sent"));
    await runWhatsAppAutomations(db, new Date("2026-11-04T19:00:00.000Z")); // 21:00 local.
    expect(inserted).toHaveLength(0);
    await runWhatsAppAutomations(db, new Date("2026-11-05T06:00:00.000Z")); // 08:00 local.
    expect(inserted).toHaveLength(1);
  });

  it("lets the on-the-way message through quiet hours", async () => {
    const { db, inserted } = fakeDb(
      { orders: [order({ picked_up_at: "2026-11-04T18:50:00.000Z" })] },
      turnedOn("whatsapp_order_on_the_way"),
    );
    await runWhatsAppAutomations(db, new Date("2026-11-04T19:00:00.000Z"));
    expect(inserted).toHaveLength(1);
  });

  it("stops at the weekly limit before booking, but not for booked events", async () => {
    const sentBefore = [1, 2].map((n) => ({
      company_id: COMPANY, recipient_phone: "27825550001", dedup_key: `auto:whatsapp_lead_followup:old${n}`, created_at: "2026-11-02T09:00:00.000Z",
    }));
    const limited = fakeDb({ whatsapp_messages: sentBefore, quotes: [quote()] }, turnedOn("whatsapp_quote_sent"));
    await runWhatsAppAutomations(limited.db, NOW);
    expect(limited.inserted).toHaveLength(0);

    const booked = fakeDb({ whatsapp_messages: sentBefore, orders: [order()] }, turnedOn("whatsapp_event_day_morning"));
    await runWhatsAppAutomations(booked.db, NOW);
    expect(booked.inserted).toHaveLength(1);
  });

  it("stops a follow-up once the person has replied", async () => {
    const { db, inserted } = fakeDb({
      quotes: [quote()],
      quote_followup_log: [{ company_id: COMPANY, quote_id: "q1", sequence_position: 1, status: "sent", created_at: "2026-11-04T09:00:00.000Z" }],
      whatsapp_inbound_messages: [{ company_id: COMPANY, from_phone: "27825550001", received_at: "2026-11-03T09:00:00.000Z" }],
    }, turnedOn("whatsapp_quote_chase"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(0);
  });

  it("never messages a client marked as opted out", async () => {
    const { db, inserted } = fakeDb({
      quotes: [quote()],
      clients: [{ company_id: COMPANY, phone: "0825550001", whatsapp_opt_in: false }],
    }, turnedOn("whatsapp_quote_sent"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(0);
  });

  it("still finds an opted-out client beyond the first 1,000 rows", async () => {
    const others = Array.from({ length: 1500 }, (_, n) => ({
      company_id: COMPANY, phone: `08200${String(n).padStart(5, "0")}`, whatsapp_opt_in: true,
    }));
    const { db, inserted } = fakeDb({
      quotes: [quote()],
      clients: [...others, { company_id: COMPANY, phone: "0825550001", whatsapp_opt_in: false }],
    }, turnedOn("whatsapp_quote_sent"));
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(0);
  });

  it("only messages agreed clients when consent is required", async () => {
    const rules = { requireConsent: true };
    const notAsked = fakeDb({ quotes: [quote()] }, withRules("whatsapp_quote_sent", rules));
    await runWhatsAppAutomations(notAsked.db, NOW);
    expect(notAsked.inserted).toHaveLength(0);

    const agreed = fakeDb({
      quotes: [quote()],
      clients: [{ company_id: COMPANY, phone: "0825550001", whatsapp_opt_in: true }],
    }, withRules("whatsapp_quote_sent", rules));
    await runWhatsAppAutomations(agreed.db, NOW);
    expect(agreed.inserted).toHaveLength(1);
  });

  it("uses the company's own enquiry follow-up timing", async () => {
    const { db, inserted } = fakeDb(
      { leads: [lead({ created_at: "2026-10-29T06:00:00.000Z" })] },
      { ...turnedOn("whatsapp_lead_chase", "2026-10-01T00:00:00.000Z"), rules: { leadChaseDays: 5 } },
    );
    await runWhatsAppAutomations(db, NOW);
    expect(inserted).toHaveLength(1);
  });

  it("reads STOP and START replies, and ignores normal messages", () => {
    expect(replyIntent(" stop. ")).toBe("stop");
    expect(replyIntent("Start")).toBe("start");
    expect(replyIntent("Please stop by at 3")).toBeNull();
  });
});

describe("message previews", () => {
  it("shows every message as readable text with no unfilled slots", () => {
    for (const automation of WHATSAPP_AUTOMATIONS) {
      const preview = automationPreview(automation, "Spit Braai Delivery");
      expect(preview).not.toMatch(/{{/);
      expect(preview).toContain("Sam");
    }
  });

  it("uses the company's own name and a date for shifts", () => {
    const shift = WHATSAPP_AUTOMATIONS.find((item) => item.key === "whatsapp_staff_shift_confirm")!;
    expect(automationPreview(shift, "Spit Braai Delivery")).toBe(
      "Hi Sam, you have a new shift on 12 December with Spit Braai Delivery. Please check it in the staff app.",
    );
  });

  it("explains what every number in the wording is filled with", () => {
    const quote = WHATSAPP_AUTOMATIONS.find((item) => item.key === "whatsapp_quote_sent")!;
    expect(automationVariables(quote, "Spit Braai Delivery")).toEqual([
      { token: "{{1}}", label: "First name", example: "Sam" },
      { token: "{{2}}", label: "Event name", example: "Year-end lunch" },
      { token: "{{3}}", label: "Your company name", example: "Spit Braai Delivery" },
      { token: "{{4}}", label: "Link to the quote", example: "https://cateringms.com/q/sample" },
    ]);
  });

  it("previews a company's own wording", () => {
    const quote = WHATSAPP_AUTOMATIONS.find((item) => item.key === "whatsapp_quote_sent")!;
    expect(automationPreview(quote, "Spit Braai", "Howzit {{1}}! {{3}} quoted your {{2}}: {{4}}")).toBe(
      "Howzit Sam! Spit Braai quoted your Year-end lunch: https://cateringms.com/q/sample",
    );
  });

  it("stops edited wording that would make Meta refuse the message", () => {
    const quote = WHATSAPP_AUTOMATIONS.find((item) => item.key === "whatsapp_quote_sent")!;
    expect(wordingProblem(quote, "")).toBeNull();
    expect(wordingProblem(quote, "Hi {{4}} for {{1}} {{2}} {{3}} thanks")).toBeNull();
    expect(wordingProblem(quote, "{{4}} for {{1}} {{2}} {{3}} thanks")).toContain("Start and end");
    expect(wordingProblem(quote, "Hi {{4}} for {{1}} {{2}} {{3}}.")).toContain("Start and end");
    expect(wordingProblem(quote, "Hi {{1}}, your quote is ready")).toBe("Keep {{2}}, {{3}}, {{4}} in the wording.");
    expect(wordingProblem(quote, "{{1}} {{2}} {{3}} {{4}} {{5}}")).toBe("Remove {{5}}. This message doesn't have that detail.");
  });

  it("keeps edited wording when a message is saved again", () => {
    const saved = applyAutomationChanges(readAutomationSettings(null), { whatsapp_quote_sent: { wording: " My text " } }, "2026-01-01");
    expect(saved.whatsapp_quote_sent.wording).toBe("My text");
    expect(readAutomationSettings({ automations: saved }).whatsapp_quote_sent.wording).toBe("My text");
  });

  it("has no suggested wording that Meta would reject for starting or ending on a number", () => {
    for (const automation of WHATSAPP_AUTOMATIONS) expect(wordingProblem(automation, automation.wording)).toBeNull();
  });

  it("lists all 22 messages, each once", () => {
    const keys = [...WHATSAPP_AUTOMATIONS, ...WHATSAPP_MANUAL_ONLY].map((item) => item.key);
    expect(new Set(keys).size).toBe(22);
  });
});

describe("WhatsApp safety", () => {
  it("stores the access token encrypted and can read it back", async () => {
    process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
    const stored = await encryptWhatsAppToken("secret-token");
    expect(stored).not.toContain("secret-token");
    await expect(decryptWhatsAppToken(stored)).resolves.toBe("secret-token");
    const parts = stored.split(".");
    parts[3] = `${parts[3].slice(0, -2)}xx`;
    await expect(decryptWhatsAppToken(parts.join("."))).rejects.toThrow();
  });

  it("refuses the older automatic send path", async () => {
    const sent = await whatsappIntegrationService.sendWhatsAppMessage(
      { to: "27825550001", type: "text", text: { body: "hello" } }, { companyId: COMPANY },
    );
    expect(sent).toBe(false);
  });

  it("does not queue automatic notifications, only messages a person chose to send", async () => {
    const id = await whatsappIntegrationService.enqueueWhatsAppMessage({
      companyId: COMPANY, recipientPhone: "27825550001", body: "hello",
    });
    expect(id).toBeNull();
  });
});
