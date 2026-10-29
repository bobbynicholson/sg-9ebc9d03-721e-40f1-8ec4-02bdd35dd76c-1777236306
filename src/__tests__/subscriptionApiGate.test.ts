/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Staff of a company whose plan ended (expired trial, suspended, cancelled)
// cannot save changes through the API; sign-in, paying and clients still work.
let session: any = null;
let profile: any = null;
let company: any = null;

jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }),
}));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === "profiles" ? profile : company }) };
      return q;
    },
  }),
}));

import { isSubscriptionGatedRequest, subscriptionAllowsWrite } from "@/lib/subscriptionApiGate";
import { withApiLogging } from "@/lib/withApiLogging";

const DAY = 86_400_000;
let userSeq = 0;

async function call(method: string, url: string) {
  const handler = jest.fn(async (_req: any, res: any) => { res.status(200).json({ ok: true }); });
  const res: any = { statusCode: 200, headersSent: false, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(b: any) { this.body = b; return this; }, end: jest.fn() };
  await withApiLogging(handler)({ method, url, query: {}, headers: {}, body: {} } as any, res);
  return { res, ran: handler.mock.calls.length > 0 };
}

beforeEach(() => {
  // A new user each test so the 60 s cache never carries between tests.
  userSeq += 1;
  session = { user: { id: `user-${userSeq}` } };
  profile = { role: "company_admin", active_role: null, company_id: "co-1" };
  company = { subscription_status: "suspended", trial_ends_at: null };
});

describe("which requests are checked", () => {
  it("checks changes, not reads", () => {
    expect(isSubscriptionGatedRequest("POST", "/api/orders/1/cancel")).toBe(true);
    expect(isSubscriptionGatedRequest("DELETE", "/api/admin/invoices/1")).toBe(true);
    expect(isSubscriptionGatedRequest("GET", "/api/orders/1")).toBe(false);
  });
  it("never checks sign-in, paying, webhooks, client links, public forms or jobs", () => {
    for (const url of ["/api/auth/switch-role", "/api/subscription/create-session", "/api/webhooks/payment-confirmation",
      "/api/client-tokens/amend-order", "/api/public/embed/x/submit", "/api/cron/expire-trials", "/api/payments/create-session?x=1"]) {
      expect(isSubscriptionGatedRequest("POST", url)).toBe(false);
    }
  });
});

describe("who may save", () => {
  const now = Date.now();
  it("paid, grace period, running trial and unknown status may save", () => {
    for (const status of ["active", "past_due", null]) expect(subscriptionAllowsWrite({ role: "company_admin", status, trialEndsAt: null, now })).toBe(true);
    expect(subscriptionAllowsWrite({ role: "company_admin", status: "trial", trialEndsAt: new Date(now + DAY).toISOString(), now })).toBe(true);
  });
  it("expired trial, suspended and cancelled may not", () => {
    expect(subscriptionAllowsWrite({ role: "company_admin", status: "trial", trialEndsAt: new Date(now - DAY).toISOString(), now })).toBe(false);
    expect(subscriptionAllowsWrite({ role: "driver", status: "suspended", trialEndsAt: null, now })).toBe(false);
    expect(subscriptionAllowsWrite({ role: "company_admin", status: "cancelled", trialEndsAt: null, now })).toBe(false);
  });
  it("clients and super admins are never blocked", () => {
    expect(subscriptionAllowsWrite({ role: "client", status: "suspended", trialEndsAt: null, now })).toBe(true);
    expect(subscriptionAllowsWrite({ role: "super_admin", status: "cancelled", trialEndsAt: null, now })).toBe(true);
  });
});

describe("through withApiLogging", () => {
  it("stops a suspended company's save with a clear message; the route never runs", async () => {
    const { res, ran } = await call("POST", "/api/orders/1/cancel");
    expect(ran).toBe(false);
    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({ code: "SUBSCRIPTION_REQUIRED" });
  });
  it("lets a paying company save", async () => {
    company = { subscription_status: "active", trial_ends_at: null };
    const { ran } = await call("POST", "/api/orders/1/cancel");
    expect(ran).toBe(true);
  });
  it("lets the owner pay to restore access", async () => {
    const { ran } = await call("POST", "/api/subscription/create-session");
    expect(ran).toBe(true);
  });
  it("lets reads and requests without a signed-in user through", async () => {
    expect((await call("GET", "/api/orders/1")).ran).toBe(true);
    session = null;
    expect((await call("POST", "/api/integrations/leads")).ran).toBe(true);
    expect((await call("POST", "/api/orders/1/cancel")).ran).toBe(true);
  });
});
