/**
 * @jest-environment node
 */
import crypto from "crypto";
import { Readable } from "stream";
import handler from "@/pages/api/webhooks/whatsapp";
import { encryptWhatsAppToken, isValidMetaSignature } from "@/lib/whatsapp/credentials";

const SECRET = "app-secret";
const mockTables: Record<string, any[]> = {};
const mockUpdates: Array<{ table: string; patch: any; filters: Record<string, unknown>; neq: Record<string, unknown> }> = [];
const mockDeletes: Array<Record<string, unknown>> = [];
const mockUpserts: any[] = [];
const mockAlert = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/whatsapp/alerts", () => ({ alertWhatsAppReply: (...args: unknown[]) => mockAlert(...args) }));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const neq: Record<string, unknown> = {};
      let mode = "select";
      let patch: any = null;
      const rows = () => (mockTables[table] || []).filter((row) => Object.entries(filters).filter(([key]) => key !== "__or").every(([key, value]) => {
        if (key.includes("->>")) {
          const [column, field] = key.split("->>");
          return row[column]?.[field] === value;
        }
        return row[key] === value;
      }));
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => { filters[column] = value; return chain; },
        neq: (column: string, value: unknown) => { neq[column] = value; return chain; },
        limit: () => chain,
        is: () => chain,
        or: (value: string) => { filters.__or = value; return chain; },
        upsert: async (row: any) => { mockUpserts.push(row); return { error: null }; },
        update: (next: unknown) => { mode = "update"; patch = next; return chain; },
        delete: () => { mode = "delete"; return chain; },
        insert: async (row: any) => {
          const list = (mockTables[table] = mockTables[table] || []);
          if (table === "whatsapp_inbound_messages" && list.some((item) => item.wa_message_id === row.wa_message_id)) {
            return { error: { code: "23505" } };
          }
          list.push(row);
          return { error: null };
        },
        then: (resolve: any) => {
          if (mode === "update") mockUpdates.push({ table, patch, filters, neq });
          if (mode === "delete") mockDeletes.push(filters);
          return Promise.resolve({ data: rows(), error: null }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));

function sign(body: string, secret = SECRET) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function post(payload: unknown, signature?: string, splitAt?: number) {
  const raw = JSON.stringify(payload);
  const bytes = Buffer.from(raw);
  const req: any = Readable.from(splitAt ? [bytes.subarray(0, splitAt), bytes.subarray(splitAt)] : [bytes]);
  req.method = "POST";
  req.query = {};
  req.headers = { "x-hub-signature-256": signature ?? sign(raw) };
  const res: any = { statusCode: 0, status(code: number) { this.statusCode = code; return this; }, json() { return this; }, send() { return this; } };
  await handler(req, res);
  return res.statusCode;
}

const reply = (body: string, id = "wamid.1") => ({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: "111" },
    contacts: [{ wa_id: "27825550001", profile: { name: "Sam" } }],
    messages: [{ id, from: "27825550001", type: "text", timestamp: "1790000000", text: { body } }],
  } }] }],
});

describe("WhatsApp webhook", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-key";
    for (const key of Object.keys(mockTables)) delete mockTables[key];
    mockUpdates.length = 0;
    mockDeletes.length = 0;
    mockUpserts.length = 0;
    mockAlert.mockClear();
    mockTables.integrations = [{
      company_id: "company-1",
      integration_type: "whatsapp",
      is_active: true,
      credentials: { phoneNumberId: "111", appSecretEncrypted: encryptWhatsAppToken(SECRET) },
      settings: { webhookVerifyToken: "verify-me" },
    }];
  });

  it("checks signatures against the exact body", () => {
    expect(isValidMetaSignature("body", sign("body"), SECRET)).toBe(true);
    expect(isValidMetaSignature("changed", sign("body"), SECRET)).toBe(false);
    expect(isValidMetaSignature("body", "sha256=abc", SECRET)).toBe(false);
    expect(isValidMetaSignature("body", "", SECRET)).toBe(false);
  });

  it("rejects a faked message and saves nothing", async () => {
    expect(await post(reply("hello"), sign("something else", "wrong-secret"))).toBe(401);
    expect(mockTables.whatsapp_inbound_messages).toBeUndefined();
  });

  it("rejects webhook posts that cannot be tied to a verified number", async () => {
    expect(await post({ entry: [] })).toBe(401);
    expect(await post({ entry: [{ changes: [{ value: { event: "ACCOUNT_UPDATED" } }] }] })).toBe(401);
    expect(mockTables.whatsapp_inbound_messages).toBeUndefined();
  });

  it("saves a real reply and alerts admins once, even if Meta resends it", async () => {
    expect(await post(reply("Yes please"))).toBe(200);
    expect(await post(reply("Yes please"))).toBe(200);
    expect(mockTables.whatsapp_inbound_messages).toHaveLength(1);
    expect(mockTables.whatsapp_inbound_messages[0]).toMatchObject({ company_id: "company-1", from_phone: "27825550001", body: "Yes please" });
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockUpserts).toHaveLength(1);
    expect(mockUpserts[0]).toMatchObject({ company_id: "company-1", phone: "27825550001", contact_name: "Sam", last_preview: "Yes please" });
  });

  it("accepts a real message when an emoji is split across network chunks", async () => {
    const payload = reply("Thanks 🎉");
    const emojiAt = Buffer.from(JSON.stringify(payload)).indexOf(Buffer.from("🎉"));
    expect(await post(payload, undefined, emojiAt + 2)).toBe(200);
    expect(mockTables.whatsapp_inbound_messages[0].body).toBe("Thanks 🎉");
  });

  it("marks the client as opted out in every number format", async () => {
    await post(reply("STOP"));
    const update = mockUpdates.find((item) => item.table === "clients")!;
    expect(update.patch.whatsapp_opt_in).toBe(false);
    expect(update.filters.__or).toContain("phone.eq.0825550001");
    expect(update.filters.__or).toContain("mobile_number.eq.+27825550001");
  });

  it("blocks a client who replies STOP", async () => {
    await post(reply("stop"));
    expect(mockTables.blocked_contacts).toEqual([
      expect.objectContaining({ company_id: "company-1", phone: "27825550001", reason: "Replied STOP on WhatsApp" }),
    ]);
  });

  it("START only removes a block the client made, never an admin's", async () => {
    await post(reply("START"));
    expect(mockDeletes[0]).toMatchObject({ company_id: "company-1", phone: "27825550001", reason: "Replied STOP on WhatsApp" });
  });

  it("records delivery updates without letting a late one undo read", async () => {
    await post({ entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "111" },
      statuses: [{ id: "wamid.9", status: "delivered", timestamp: "1790000000" }],
    } }] }] });
    expect(mockUpdates[0]).toMatchObject({ table: "whatsapp_messages", filters: { gateway_message_id: "wamid.9" }, neq: { status: "read" } });
    expect(mockUpdates[0].patch.status).toBe("delivered");
  });

  it("only confirms the callback for a real verify token", async () => {
    const verify = async (token: string) => {
      const res: any = { statusCode: 0, body: "", status(code: number) { this.statusCode = code; return this; }, json() { return this; }, send(value: string) { this.body = value; return this; } };
      await handler({ method: "GET", headers: {}, query: { "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "ok-123" } } as any, res);
      return res;
    };
    expect((await verify("verify-me")).body).toBe("ok-123");
    expect((await verify("guess")).statusCode).toBe(403);
  });
});
