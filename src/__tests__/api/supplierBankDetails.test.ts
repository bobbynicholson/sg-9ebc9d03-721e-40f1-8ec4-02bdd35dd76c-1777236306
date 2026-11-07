import handler from "@/pages/api/suppliers/[id]/bank-details";
import { decryptSecret, encryptSecret } from "@/lib/credentialVault";

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";
const mockUser = { id: "user-1" };
const mockProfile: Record<string, unknown> = {
  company_id: "company-1", role: "shopping_staff", active_role: null, is_active: true, deleted_at: null,
};
const mockSupplier = { id: SUPPLIER_ID, company_id: "company-1" };
let mockBank: Record<string, unknown> | null = null;
let mockUpsert: Record<string, unknown> | null = null;

jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => table === "profiles"
          ? { data: mockProfile, error: null }
          : { data: null, error: null },
      };
      return chain;
    },
  }),
}));

jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => table === "suppliers"
          ? { data: mockSupplier, error: null }
          : { data: mockBank, error: null },
        upsert: async (row: Record<string, unknown>) => {
          mockUpsert = row;
          return { error: null };
        },
      };
      return chain;
    },
  }),
}));

function response() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    getHeader(name: string) { return this.headers[name]; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    end() { return this; },
  };
}

function request(method: string, body?: unknown, origin = "https://app.example") {
  return {
    method,
    url: `/api/suppliers/${SUPPLIER_ID}/bank-details`,
    headers: { host: "app.example", origin },
    cookies: {},
    query: { id: SUPPLIER_ID },
    body,
  } as any;
}

describe("supplier bank detail API", () => {
  const priorKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
    Object.assign(mockProfile, {
      company_id: "company-1", role: "shopping_staff", active_role: null, is_active: true, deleted_at: null,
    });
    mockBank = null;
    mockUpsert = null;
  });

  afterAll(() => {
    if (priorKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = priorKey;
  });

  it("returns decrypted bank details with private no-store headers", async () => {
    mockBank = { account_number: null, account_number_ciphertext: await encryptSecret("123456789") };
    const res = response();
    await handler(request("GET"), res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ accountNumber: "123456789" });
    expect(res.headers["Cache-Control"]).toContain("no-store");
    expect(res.headers["Vary"]).toContain("Cookie");
  });

  it("stores only encrypted bank details for an authorized same-origin update", async () => {
    const res = response();
    await handler(request("PUT", { accountNumber: "  123456789  " }), res as any);
    expect(res.statusCode).toBe(200);
    expect(mockUpsert).toMatchObject({ supplier_id: SUPPLIER_ID, company_id: "company-1", account_number: null });
    expect(String(mockUpsert?.account_number_ciphertext)).not.toContain("123456789");
    await expect(decryptSecret(String(mockUpsert?.account_number_ciphertext))).resolves.toBe("123456789");
  });

  it("refuses cross-company reads and cross-origin writes", async () => {
    mockProfile.company_id = "company-2";
    const crossTenant = response();
    await handler(request("GET"), crossTenant as any);
    expect(crossTenant.statusCode).toBe(404);

    mockProfile.company_id = "company-1";
    const crossOrigin = response();
    await handler(request("PUT", { accountNumber: "123456789" }, "https://evil.example"), crossOrigin as any);
    expect(crossOrigin.statusCode).toBe(403);
    expect(mockUpsert).toBeNull();
  });
});
