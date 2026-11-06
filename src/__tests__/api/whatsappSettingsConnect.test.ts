/** @jest-environment node */
import handler from "@/pages/api/admin/whatsapp/settings";

let mockExisting: { id: string; settings: Record<string, unknown> } | null = null;
const mockWrites: Array<{ kind: string; row: Record<string, unknown>; filters?: Array<[string, unknown]> }> = [];

jest.mock("@/lib/subscriptionApiGate", () => ({ isSubscriptionGatedRequest: () => false, blockIfCompanyUnpaid: jest.fn() }));
jest.mock("@/lib/platformApiGate", () => ({ isPlatformOnlyRequest: () => false, blockUnlessPlatformAdmin: jest.fn() }));
jest.mock("@/lib/whatsapp/adminAccess", () => ({
  companyForAdmin: async () => ({ companyId: "company-1", userId: "user-1" }),
}));
jest.mock("@/lib/whatsapp/credentials", () => ({
  canStoreWhatsAppToken: () => true,
  encryptWhatsAppToken: (value: string) => `encrypted:${value}`,
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
        insert: async (row: Record<string, unknown>) => { mockWrites.push({ kind: "insert", row }); return { error: null }; },
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

async function connect() {
  const res: any = {
    statusCode: 200, body: null,
    setHeader() { return this; }, getHeader() { return undefined; }, end() { return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  await handler({
    method: "POST", url: "/api/admin/whatsapp/settings", headers: {}, cookies: {}, query: {},
    body: { action: "connect", phoneNumberId: "118302861227098", businessAccountId: "101680439572707", accessToken: "token", appSecret: "secret" },
  } as any, res);
  return res;
}

describe("WhatsApp connection storage", () => {
  beforeEach(() => { mockExisting = null; mockWrites.length = 0; });

  it("inserts a new connection without a partial-index upsert", async () => {
    const response = await connect();
    expect(response.statusCode).toBe(200);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]).toMatchObject({ kind: "insert", row: { company_id: "company-1", integration_type: "whatsapp", is_active: true } });
  });

  it("updates the existing company connection", async () => {
    mockExisting = { id: "integration-1", settings: { preserved: true } };
    const response = await connect();
    expect(response.statusCode).toBe(200);
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0]).toMatchObject({ kind: "update", row: { settings: { preserved: true } } });
    expect(mockWrites[0].filters).toEqual([["id", "integration-1"], ["company_id", "company-1"]]);
  });
});
