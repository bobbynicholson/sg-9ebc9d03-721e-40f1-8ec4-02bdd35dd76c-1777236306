/** @jest-environment node */
import handler from "@/pages/api/public/quotes/[token]/accept";
import { getRequestSupabase } from "@/lib/supabase/service";
import { quoteService } from "@/services/quoteService";
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({ getRequestSupabase: jest.fn() }));
jest.mock("@/lib/embedFormApi", () => ({ applyCorsHeaders: jest.fn(), checkAndIncrementRateLimit: jest.fn(async () => ({ allowed: true })), getClientIp: () => "test-ip", hashIp: () => "hash", isUuid: () => true }));
jest.mock("@/lib/eventCapacity", () => ({ getEventCapacityForDate: jest.fn(async () => ({ blocksPublicAcceptance: false })), publicCapacityMessage: () => "Full" }));
jest.mock("@/services/quoteService", () => ({ quoteService: { convertQuoteToOrder: jest.fn(async () => ({ order: { id: "order-1" } })) } }));
jest.mock("@/services/order/postCreationCascade", () => ({ postOrderCreationCascade: jest.fn(async () => {}) }));
jest.mock("@/services/lifecycle/resolveClientUserId", () => ({ resolveClientUserId: jest.fn(async () => null) }));

const quote = { id: "quote-1", company_id: "company-1", status: "sent", guest_count: 100, event_date: "2099-12-31", valid_until: null,
  converted_to_order_id: null, venue_address: "Test venue", client_email: "test@example.test" };
const plan = [{ guestCount: 60, serviceTime: "12:00" }, { guestCount: 40, serviceTime: "18:00" }];
function setup(overrides = {}, rpcError: any = null) {
  const current = { ...quote, ...overrides };
  const db: any = { from: jest.fn(), rpc: jest.fn(async () => ({ data: rpcError ? null : {
    quote: { ...current, status: "accepted", accepted_at: "2026-10-21T19:00:00Z" }, alreadyAccepted: current.status === "accepted",
  }, error: rpcError })) };
  db.from.mockImplementation((table: string) => {
    const query: any = {};
    for (const method of ["select", "eq", "is", "in", "insert", "update", "delete", "order", "limit"]) query[method] = jest.fn(() => query);
    query.maybeSingle = async () => ({ data: table === "quotes" ? current : null, error: null });
    query.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
    return query;
  });
  (getRequestSupabase as jest.Mock).mockResolvedValue(db);
  const req: any = { method: "POST", query: { token: "quote-token" }, headers: {}, body: { acceptedByName: "Test client", serviceSittings: structuredClone(plan) } };
  const res: any = { setHeader: jest.fn(), status: jest.fn(function (this: any, code) { this.statusCode = code; return this; }), json: jest.fn(function (this: any, body) { this.body = body; return this; }) };
  return { db, req, res, current };
}
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(console, "warn").mockImplementation(() => {}); jest.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
it("saves acceptance and both timings in one tenant-scoped transaction before conversion", async () => {
  const { db, req, res } = setup(); await handler(req, res);
  expect(db.rpc).toHaveBeenCalledWith("accept_quote_service_plan", { p_quote_id: "quote-1", p_company_id: "company-1", p_service_sittings: plan.map(sitting => expect.objectContaining(sitting)) });
  expect(quoteService.convertQuoteToOrder).toHaveBeenCalledTimes(1);
  expect(db.rpc.mock.invocationCallOrder[0]).toBeLessThan((quoteService.convertQuoteToOrder as jest.Mock).mock.invocationCallOrder[0]);
  expect(db.from.mock.calls.some(([table]: string[]) => table === "service_sittings")).toBe(false);
  expect(res.body).toMatchObject({ ok: true, orderId: "order-1" });
});
it("a failed plan transaction does not convert the quote or create audit/notification records", async () => {
  const { db, req, res, current } = setup({}, { code: "23505" }); await handler(req, res);
  expect(res.statusCode).toBe(500); expect(res.body.ok).toBe(false);
  expect(current.status).toBe("sent"); expect(quoteService.convertQuoteToOrder).not.toHaveBeenCalled();
  expect(db.from.mock.calls.map(([table]: string[]) => table)).toEqual(["quotes"]);
});
it("a retry repairs a missing plan before recovering an earlier accepted quote", async () => {
  const { db, req, res } = setup({ status: "accepted" }); await handler(req, res);
  expect(db.rpc).toHaveBeenCalledTimes(1); expect(res.body).toMatchObject({ ok: true, recoveredConversion: true });
});
it("refuses invalid two-sitting input before any acceptance write", async () => {
  const { db, req, res } = setup(); req.body.serviceSittings[1] = { guestCount: 40, serviceTime: "" };
  await handler(req, res); expect(res.statusCode).toBe(400); expect(db.rpc).not.toHaveBeenCalled();
});
