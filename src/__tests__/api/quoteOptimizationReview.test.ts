jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
jest.mock("@/lib/ai/textLlm", () => ({ isTextAiConfigured: jest.fn(), callTextJson: jest.fn() }));
jest.mock("@/lib/ai/usageLog", () => ({ setAiUsageContext: jest.fn() }));
jest.mock("@/services/quoteOptimizationService", () => ({ loadQuoteOptimizationData: jest.fn() }));

import { handler } from "@/pages/api/admin/quotes/optimize-review";
import { createPagesServerClient } from "@/lib/supabase/server";
import { callTextJson, isTextAiConfigured } from "@/lib/ai/textLlm";
import { loadQuoteOptimizationData } from "@/services/quoteOptimizationService";
import { DEFAULT_PLANNING_ASSUMPTIONS } from "@/lib/quotes/quoteOptimization";
import { toDateKey } from "@/lib/quoteDiarySignal";
import { shiftPlanningDate } from "@/lib/quotes/quoteOptimization";

const id = "11111111-1111-4111-8111-111111111111";
let role: string;
let authenticated: boolean;
let userCounter = 0;
const response = () => {
  const res: any = { statusCode: 200, payload: null, setHeader: jest.fn() };
  res.status = jest.fn((value) => { res.statusCode = value; return res; });
  res.json = jest.fn((value) => { res.payload = value; return res; });
  return res;
};
beforeEach(() => {
  jest.clearAllMocks(); role = "sales_admin"; authenticated = true; userCounter++;
  const db: any = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: `user-${userCounter}` } : null }, error: null }) },
    from: (table: string) => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({
      data: table === "profiles" ? { role, active_role: role, company_id: "session-company" } : { currency: "ZAR" }, error: null,
    }) }),
  };
  (createPagesServerClient as jest.Mock).mockReturnValue(db);
  (isTextAiConfigured as jest.Mock).mockReturnValue(true);
  (loadQuoteOptimizationData as jest.Mock).mockImplementation(async (_db, companyId, start, end) => ({
    companyId, start, end, catalogueCosts: new Map(), loadedAt: new Date().toISOString(), commitments: [],
    capacity: { maxConcurrentEvents: 5, maxKitchenLoadPerDay: 500, maxGuestsPerEvent: 500 },
    quotes: [{ id, quote_number: "Q-001", company_id: "session-company", client_name: "Client", client_email: "PRIVATE@example.test",
      notes: "PRIVATE CUSTOMER NOTES", event_date: start, guest_count: 10, subtotal: 1000, currency: "ZAR", status: "sent" }],
  }));
  (callTextJson as jest.Mock).mockResolvedValue({ data: { summary: "Pursue the available contribution within your workload budget.", risks: ["Confirm estimated ingredient costs before committing."], decisions: [
    { quoteId: id, decision: "pursue", reason: "Fits the available capacity with a positive modeled contribution.", nextStep: "review_costs" },
  ] } });
});
const request = (changes = {}) => ({ method: "POST", body: {
  start: toDateKey(new Date()), date: toDateKey(new Date()), horizon: 30, mode: "balanced",
  assumptions: DEFAULT_PLANNING_ASSUMPTIONS, pinnedIds: [], excludedIds: [], costOverrides: {}, companyId: "ATTACKER-COMPANY", ...changes,
} }) as any;

test("rejects unsupported methods, unauthenticated requests and unrelated staff roles", async () => {
  let res = response(); await handler({ method: "GET" } as any, res); expect(res.statusCode).toBe(405);
  authenticated = false; res = response(); await handler(request(), res); expect(res.statusCode).toBe(401);
  authenticated = true; role = "driver"; res = response(); await handler(request(), res); expect(res.statusCode).toBe(403);
  expect(callTextJson).not.toHaveBeenCalled();
});
test("recomputes the plan in the session company and passes compact facts without contact details to the model", async () => {
  const res = response(); await handler(request(), res);
  expect(res.statusCode).toBe(200);
  expect(loadQuoteOptimizationData).toHaveBeenCalledWith(expect.anything(), "session-company", expect.any(String), expect.any(String));
  const payload = (callTextJson as jest.Mock).mock.calls[0][0];
  expect(payload.tier).toBe("smart"); expect(payload.user).not.toContain("PRIVATE");
  expect(JSON.parse(payload.user).quotes[0].decision).toBe("pursue");
  expect(res.payload.facts[0]).toMatchObject({ id, selected: true });
});
test("returns a clear unavailable response without pretending model reasoning ran", async () => {
  (isTextAiConfigured as jest.Mock).mockReturnValue(false);
  const res = response(); await handler(request(), res);
  expect(res.statusCode).toBe(503); expect(res.payload.error).toContain("not configured");
  expect(callTextJson).not.toHaveBeenCalled();
});
test("rejects malformed and out-of-window scenarios", async () => {
  let res = response(); await handler(request({ horizon: 365 }), res); expect(res.statusCode).toBe(400);
  res = response(); await handler(request({ date: "2020-01-01" }), res); expect(res.statusCode).toBe(400);
  expect(loadQuoteOptimizationData).not.toHaveBeenCalled();
});
test("refuses model output that changes the calculated choice", async () => {
  (callTextJson as jest.Mock).mockResolvedValue({ data: { summary: "Decline all these available orders.", risks: [], decisions: [
    { quoteId: id, decision: "hold", reason: "Incorrectly overrides the verified model inputs.", nextStep: "keep_open" },
  ] } });
  const res = response(); await handler(request(), res); expect(res.statusCode).toBe(502);
});
test("provider failures preserve an actionable retry error", async () => {
  (callTextJson as jest.Mock).mockRejectedValue(new Error("provider secret detail"));
  const res = response(); await handler(request(), res);
  expect(res.statusCode).toBe(502); expect(res.payload.error).not.toContain("secret");
});

test("model review includes unquoted enquiries and duplicate warnings without treating budgets as revenue", async () => {
  const today = toDateKey(new Date())!;
  (loadQuoteOptimizationData as jest.Mock).mockResolvedValue({ companyId: "session-company", start: today, end: shiftPlanningDate(today, 29),
    quotes: [], relatedQuotes: [], orders: [], catalogueCosts: new Map(), commitments: [], loadedAt: new Date().toISOString(),
    capacity: { maxConcurrentEvents: 5, maxKitchenLoadPerDay: 500, maxGuestsPerEvent: 500 },
    leads: ["a", "b"].map((id) => ({ id, client_email: "PRIVATE@example.test", client_name: "PRIVATE CUSTOMER", event_date: today, status: "new", budget: 999999 })),
  });
  (callTextJson as jest.Mock).mockResolvedValue({ data: { summary: "Verify the possible duplicate submissions and prepare a priced quote before choosing orders.", risks: ["The enquiries have no verified pricing."], decisions: [] } });
  const res = response(); await handler(request(), res);
  expect(res.statusCode).toBe(200); expect(res.payload.facts).toEqual([]); expect(res.payload.pipelineSignature).toBeTruthy();
  const payload = JSON.parse((callTextJson as jest.Mock).mock.calls[0][0].user);
  expect(payload.enquiryPipeline).toMatchObject({ accepted: 0, awaitingDecision: 2, needReview: 2, possibleDuplicateGroups: 1 });
  expect(JSON.stringify(payload)).not.toContain("PRIVATE"); expect(JSON.stringify(payload)).not.toContain("999999");
});

test("All upcoming model review accepts dates beyond the ninety-day window", async () => {
  const today = toDateKey(new Date())!; const future = shiftPlanningDate(today, 180);
  (loadQuoteOptimizationData as jest.Mock).mockResolvedValue({ companyId: "session-company", start: today, end: future,
    quotes: [], relatedQuotes: [], orders: [], catalogueCosts: new Map(), commitments: [], loadedAt: new Date().toISOString(),
    capacity: { maxConcurrentEvents: 5, maxKitchenLoadPerDay: null, maxGuestsPerEvent: null },
    leads: [{ id, client_name: "Future enquiry", event_date: future, status: "new" }],
  });
  (callTextJson as jest.Mock).mockResolvedValue({ data: { summary: "Prepare a priced quote and confirm the event requirements.", risks: [], decisions: [] } });
  const res = response(); await handler(request({ horizon: 0, date: future }), res);
  expect(res.statusCode).toBe(200);
  expect(loadQuoteOptimizationData).toHaveBeenCalledWith(expect.anything(), "session-company", today, "all");
});
