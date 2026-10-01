import handler from "@/pages/api/subscription/create-session";

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: mockUser } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockProfile }) }) }) }),
}) }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockCompany, error: null }) }) }) }),
}) }));

let mockUser: any;
let mockProfile: any;
let mockCompany: any;
beforeEach(() => {
  mockUser = { id: "owner-1", email: "owner@example.com" };
  mockProfile = { company_id: "company-1", role: "company_admin", full_name: "Owner Buyer" };
  mockCompany = { subscription_status: "trial", trial_ends_at: "2099-01-01", payfast_subscription_token: null };
  process.env.PAYFAST_PLATFORM_MERCHANT_ID = "merchant";
  process.env.PAYFAST_PLATFORM_MERCHANT_KEY = "key";
  process.env.PAYFAST_PLATFORM_PASSPHRASE = "secret";
  process.env.PAYFAST_PLATFORM_TEST_MODE = "false";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});
async function checkout(origin = "https://example.com", body = {}) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
  await handler({ method: "POST", headers: { origin }, body: { planId: "starter", cycle: "monthly", companyId: "attacker-company", ...body } } as any, res);
  return res;
}
it("builds a live trial form using server-resolved company and keeps passphrase private", async () => {
  const result = await checkout();
  expect(result.statusCode).toBe(200);
  expect(result.body.html).toContain('action="https://www.payfast.co.za/eng/process"');
  expect(result.body.html).toContain('name="amount" value="0.00"');
  expect(result.body.html).toContain('name="custom_str1" value="company-1"');
  expect(result.body.html).not.toContain("attacker-company");
  expect(result.body.html).not.toContain("secret");
});
it("rejects localhost before sending a buyer to PayFast", async () => {
  expect((await checkout("http://localhost:3001")).statusCode).toBe(400);
});
it("prevents starting a second recurring agreement", async () => {
  mockCompany.payfast_subscription_token = "existing-token";
  expect((await checkout()).statusCode).toBe(409);
});
it("requires authentication and a billing administrator", async () => {
  mockUser = null;
  expect((await checkout()).statusCode).toBe(401);
  mockUser = { id: "staff-1" }; mockProfile.role = "kitchen_staff";
  expect((await checkout()).statusCode).toBe(403);
});
it("charges immediately after trial expiry", async () => {
  mockCompany.trial_ends_at = "2020-01-01";
  const result = await checkout();
  expect(result.statusCode).toBe(200);
  expect(result.body.html).toContain('name="amount" value="299.00"');
});
