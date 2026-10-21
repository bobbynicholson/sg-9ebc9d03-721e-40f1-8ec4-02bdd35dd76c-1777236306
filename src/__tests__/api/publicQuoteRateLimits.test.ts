/** @jest-environment node */
import getQuote from "@/pages/api/public/quotes/[token]/get";
import requestChange from "@/pages/api/public/quotes/[token]/change-request";
import { checkAndIncrementRateLimit } from "@/lib/embedFormApi";
import { getRequestSupabase } from "@/lib/supabase/service";

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({ getRequestSupabase: jest.fn() }));
jest.mock("@/services/emailService", () => ({ emailService: { sendEmail: jest.fn(async () => true) } }));
jest.mock("@/lib/eventCapacity", () => ({ getEventCapacityForDate: jest.fn(async () => ({ status: "available", blocksPublicAcceptance: false })), publicCapacityMessage: () => "Full" }));
jest.mock("@/lib/paymentService", () => ({ getPublicPaymentAvailability: jest.fn(async () => ({ provider: null, online_available: false })) }));

const token = "00000000-0000-0000-0000-000000000001";
function setup() {
  const counters = new Map<string, number>();
  const requests: any[] = [];
  const quote = { id: "quote1", company_id: "company1", status: "sent", guest_count: 100, event_date: "2099-12-31", menu_items: [],
    company: { id: "company1", company_name: "Fixture caterer", currency: "ZAR" } };
  const db: any = {
    // Model the actual database's UNIQUE(token, ip_hash, window_start).
    // The real limiter derives each key and every handler uses that limiter.
    rpc: jest.fn(async (_name, p) => {
      const key = JSON.stringify([p.p_token, p.p_ip_hash, p.p_window_start]);
      const count = (counters.get(key) || 0) + 1;
      counters.set(key, count);
      return { data: { allowed: count <= p.p_limit, count }, error: null };
    }),
    from: (table: string) => {
      const query: any = {};
      for (const method of ["select", "eq", "is", "in", "order", "limit", "update"]) query[method] = () => query;
      query.insert = (rows: any[]) => { if (table === "quote_change_requests") requests.push(...rows); return query; };
      query.maybeSingle = async () => ({ data: table === "quotes" ? quote : null, error: null });
      query.single = async () => ({ data: { id: `request-${requests.length}` }, error: null });
      query.then = (resolve: any) => Promise.resolve({ data: [], count: requests.length, error: null }).then(resolve);
      return query;
    },
  };
  (getRequestSupabase as jest.Mock).mockResolvedValue(db);
  const invoke = async (handler: any, method: string) => {
    const req: any = { method, query: { token }, headers: { "x-forwarded-for": "192.0.2.5" }, body: { message: "Please change the serving times.", requestedChanges: {} } };
    const res: any = { setHeader: jest.fn(), status: jest.fn(function (this: any, code) { this.statusCode = code; return this; }), json: jest.fn(function (this: any, body) { this.body = body; return this; }) };
    await handler(req, res); return res;
  };
  return { db, counters, requests, read: () => invoke(getQuote, "GET"), change: () => invoke(requestChange, "POST") };
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-22T12:00:00Z")); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

it("viewing a quote repeatedly does not spend its change-request allowance", async () => {
  const state = setup();
  for (let n = 0; n < 28; n++) expect((await state.read()).statusCode).toBe(200);
  expect((await state.change()).statusCode).toBe(200);
  expect(state.requests).toHaveLength(1);
});

it("the normal 15-second refresh interval works for a full hour", async () => {
  const state = setup();
  for (let n = 0; n < 240; n++) {
    jest.setSystemTime(new Date(Date.parse("2026-10-22T12:00:00Z") + n * 15000));
    expect((await state.read()).statusCode).toBe(200);
  }
  expect((await state.change()).statusCode).toBe(200);
});

it("even a blocked read budget leaves the change form usable", async () => {
  const state = setup();
  for (let n = 0; n < 60; n++) expect((await state.read()).statusCode).toBe(200);
  expect((await state.read()).statusCode).toBe(429);
  expect((await state.change()).statusCode).toBe(200);
});

it("real change-request flooding is still limited and tells the client when to retry", async () => {
  jest.setSystemTime(new Date("2026-10-22T12:34:00Z"));
  const state = setup();
  for (let n = 0; n < 10; n++) expect((await state.change()).statusCode).toBe(200);
  const blocked = await state.change();
  expect(blocked.statusCode).toBe(429);
  expect(blocked.setHeader).toHaveBeenCalledWith("Retry-After", "1560");
  expect(blocked.body).toMatchObject({ error_code: "rate_limited", retry_after_seconds: 1560 });
  expect(blocked.body.error).toContain("26 minutes");
  expect(state.requests).toHaveLength(10);
  expect((await state.read()).statusCode).toBe(200);
});

it("minute and hour counters stay separate even when their window starts match", async () => {
  const { db } = setup();
  expect((await checkAndIncrementRateLimit(token, "ip", db, { scope: "same-operation", bucket: "minute", limit: 1 })).allowed).toBe(true);
  expect((await checkAndIncrementRateLimit(token, "ip", db, { scope: "same-operation", bucket: "hour", limit: 1 })).allowed).toBe(true);
  expect((await checkAndIncrementRateLimit(token, "ip", db, { scope: "same-operation", bucket: "minute", limit: 1 })).allowed).toBe(false);
});

it("old polluted counters do not block scoped actions, while unscoped callers keep their limits", async () => {
  const { db } = setup();
  expect((await checkAndIncrementRateLimit(token, "ip", db, { limit: 1 })).allowed).toBe(true);
  expect((await checkAndIncrementRateLimit(token, "ip", db, { limit: 1 })).allowed).toBe(false);
  for (const action of ["get", "view", "pdf", "change-request", "accept", "reject", "order-link"]) {
    expect((await checkAndIncrementRateLimit(token, "ip", db, { scope: `quote.${action}`, limit: 1 })).allowed).toBe(true);
  }
});
