/** @jest-environment node */
import handler from "@/pages/api/public/quotes/[token]/change-request";
import { getRequestSupabase } from "@/lib/supabase/service";
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({ getRequestSupabase: jest.fn() }));
jest.mock("@/services/emailService", () => ({ emailService: { sendEmail: jest.fn(async () => true) } }));
jest.mock("@/lib/embedFormApi", () => ({ applyCorsHeaders: jest.fn(), checkAndIncrementRateLimit: jest.fn(async () => ({ allowed: true })), getClientIp: () => "test-ip", hashIp: () => "hash", isUuid: () => true }));

const plan = [{ guestCount: 60, serviceTime: "12:00" }, { guestCount: 40, serviceTime: "18:00" }];
function setup(changes: any = { service_sittings: plan }, quoteOverrides = {}) {
  const quote = { id: "q1", company_id: "c1", status: "sent", guest_count: 100, event_date: "2099-12-31", ...quoteOverrides };
  const writes: Array<{ table: string; value: any }> = [];
  const db: any = { from: jest.fn((table: string) => {
    let inserting = false;
    const query: any = {};
    for (const name of ["select", "eq", "is", "in", "order", "limit"]) query[name] = () => query;
    query.insert = (value: any) => { inserting = true; writes.push({ table, value }); return query; };
    query.update = (value: any) => { writes.push({ table, value }); return query; };
    query.maybeSingle = async () => ({ data: table === "quotes" ? quote : null, error: null });
    query.single = async () => ({ data: inserting ? { id: "request1" } : null, error: null });
    query.then = (resolve: any) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    return query;
  }) };
  (getRequestSupabase as jest.Mock).mockResolvedValue(db);
  const req: any = { method: "POST", query: { token: "token" }, headers: {}, body: { message: "Please change the serving plan.", requestedChanges: changes } };
  const res: any = { setHeader: jest.fn(), status: jest.fn(function (this: any, code) { this.statusCode = code; return this; }), json: jest.fn(function (this: any, body) { this.body = body; return this; }) };
  return { req, res, writes };
}
beforeEach(() => { jest.clearAllMocks(); });

it("keeps old client timing submissions as notes for staff review", async () => {
  const { req, res, writes } = setup(); await handler(req, res);
  expect(res.statusCode).toBe(200);
  expect(writes).toEqual([{ table: "quote_change_requests", value: [expect.objectContaining({ company_id: "c1", quote_id: "q1", requested_changes: null, message: expect.stringContaining("Sitting 1: 60 guests at 12:00; Sitting 2: 40 guests at 18:00") })] }]);
});
it("preserves a legacy guest-count request without an executable sitting plan", async () => {
  const { req, res, writes } = setup({ guest_count: 120, service_sittings: [{ guestCount: 60, serviceTime: "12:00" }, { guestCount: 60, serviceTime: "18:00" }] });
  await handler(req, res); expect(res.statusCode).toBe(200);
  expect(writes[0].value[0].requested_changes.guest_count).toBe(120);
});
it.each([
  [], [{ guestCount: 100, serviceTime: "" }], [{ guestCount: 100, serviceTime: "25:00" }],
  [{ guestCount: 99, serviceTime: "12:00" }], [{ guestCount: 99.5, serviceTime: "12:00" }],
].map(invalid => [invalid]))("does not turn obsolete timing input into an executable plan: %j", async (invalid) => {
  const { req, res, writes } = setup({ service_sittings: invalid }); await handler(req, res);
  expect(res.statusCode).toBe(200); expect(writes[0].value[0].requested_changes?.service_sittings).toBeUndefined();
});
it("preserves legacy change requests without a serving plan", async () => {
  const { req, res, writes } = setup({ service_sittings: null }); await handler(req, res);
  expect(res.statusCode).toBe(200); expect(writes[0].value[0].requested_changes).toBeNull();
});
it("accepts a note about an existing booking without replacing its operational plan", async () => {
  const { req, res, writes } = setup(undefined, { converted_to_order_id: "order1" }); await handler(req, res);
  expect(res.statusCode).toBe(200); expect(writes[0].value[0].requested_changes?.service_sittings).toBeUndefined();
});
