/** @jest-environment node */
import handler from "@/pages/api/admin/whatsapp/settings";

let mockExisting: { id: string; settings: Record<string, unknown>; is_active?: boolean } | null = null;
const mockWrites: Array<{ kind: string; row: Record<string, unknown>; filters?: Array<[string, unknown]> }> = [];
const mockVaultAvailable = jest.fn();

jest.mock("@/lib/subscriptionApiGate", () => ({ isSubscriptionGatedRequest: () => false, blockIfCompanyUnpaid: jest.fn() }));
jest.mock("@/lib/platformApiGate", () => ({ isPlatformOnlyRequest: () => false, blockUnlessPlatformAdmin: jest.fn() }));
jest.mock("@/lib/whatsapp/adminAccess", () => ({
  companyForAdmin: async () => ({ companyId: "company-1", userId: "user-1" }),
}));
jest.mock("@/lib/whatsapp/credentials", () => ({
  canStoreWhatsAppToken: () => true,
  isWhatsAppCredentialVaultAvailable: (...args: unknown[]) => mockVaultAvailable(...args),
  hasWhatsAppWebhookVerifyToken: async (_sb: unknown, _companyId: string, settings: Record<string, unknown> | null | undefined) => !!settings?.webhookVerifyToken,
  loadWhatsAppWebhookVerifyToken: async (_sb: unknown, _companyId: string, settings: Record<string, unknown> | null | undefined) => String(settings?.webhookVerifyToken || "") || null,
  storeWhatsAppCredentials: jest.fn().mockResolvedValue(undefined),
  storeWhatsAppVerifyToken: jest.fn().mockResolvedValue(undefined),
  loadWhatsAppCredentials: jest.fn().mockResolvedValue(null),
  postWhatsAppMessage: jest.fn(),
  callMeta: jest.fn(),
  verifyWhatsAppCredentials: async () => ({ ok: true, displayNumber: "+27826411373" }),
}));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: () => {
      const filters: Array<[string, unknown]> = [];
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
        maybeSingle: async () => ({ data: mockExisting, error: null }),
        insert: async (row: Record<string, unknown>) => {
          mockWrites.push({ kind: "insert", row });
          mockExisting = { id: "integration-new", settings: row.settings as Record<string, unknown>, is_active: true };
          return { error: null };
        },
        update: (row: Record<string, unknown>) => {
          mockWrites.push({ kind: "update", row, filters });
          return chain;
        },
        then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

async function call(body: Record<string, unknown> = { action: "connect", phoneNumberId: "118302861227098", businessAccountId: "101680439572707", accessToken: "token", appSecret: "secret" }, method = "POST", query: Record<string, string> = {}) {
  const res: any = {
    statusCode: 200, body: null,
    setHeader() { return this; }, getHeader() { return undefined; }, end() { return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  await handler({
    method, url: "/api/admin/whatsapp/settings", headers: {}, cookies: {}, query,
    body,
  } as any, res);
  return res;
}

describe("WhatsApp connection storage", () => {
  beforeEach(() => { mockExisting = null; mockWrites.length = 0; mockVaultAvailable.mockResolvedValue(true); });

  it("does not alter existing credentials before the service-only vault exists", async () => {
    mockExisting = { id: "integration-1", settings: { preserved: true }, is_active: true };
    mockVaultAvailable.mockResolvedValue(false);
    const response = await call();
    expect(response.statusCode).toBe(503);
    expect(mockWrites).toHaveLength(0);
  });

  it("inserts a new connection without a partial-index upsert", async () => {
    const response = await call();
    expect(response.statusCode).toBe(200);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]).toMatchObject({ kind: "insert", row: { company_id: "company-1", integration_type: "whatsapp", is_active: true } });
  });

  it("updates the existing company connection", async () => {
    mockExisting = { id: "integration-1", settings: { preserved: true } };
    const response = await call();
    expect(response.statusCode).toBe(200);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]).toMatchObject({ kind: "update", row: { settings: { preserved: true } } });
    expect(mockWrites[0].filters).toEqual([["id", "integration-1"], ["company_id", "company-1"]]);
  });

  it("replaces a shared verify token and clears its verification state", async () => {
    mockExisting = { id: "integration-1", settings: { webhookVerifyToken: "old-token", webhookVerifiedAt: "2026-11-06T00:00:00Z" } };
    mockExisting.is_active = true;
    const response = await call({ action: "rotate_verify_token" });
    expect(response.statusCode).toBe(200);
    expect(mockWrites[0].kind).toBe("update");
    const settings = mockWrites[0].row.settings as Record<string, unknown>;
    expect(settings.webhookVerifyToken).toBeUndefined();
    expect(settings.webhookVerifyTokenEncrypted).toBeUndefined();
    expect(settings.webhookVerifyTokenHash).toBeUndefined();
    expect(settings.webhookVerifiedAt).toBeNull();
  });

  it("keeps the verify token out of routine settings responses", async () => {
    mockExisting = { id: "integration-1", is_active: true, settings: { webhookVerifyToken: "private-token" } };
    const ordinary = await call({}, "GET");
    expect(ordinary.body.webhookVerifyToken).toBeNull();
    expect(ordinary.body.verifyTokenAvailable).toBe(true);
    const revealed = await call({}, "GET", { revealToken: "1" });
    expect(revealed.body.webhookVerifyToken).toBe("private-token");
  });
});
