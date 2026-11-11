import type { Quote } from "@/types";
import {
  buildOpportunities, DEFAULT_PLANNING_ASSUMPTIONS, explainOpportunity, optimizeQuotes,
  planningWeek, shiftPlanningDate, type Opportunity, type OptimizationInput,
} from "@/lib/quotes/quoteOptimization";

const today = "2026-11-10";
const date = "2026-11-14";
const assumptions = { ...DEFAULT_PLANNING_ASSUMPTIONS, setupHours: 0, weeklyHours: 1000, minimumMargin: 0, operatingPercent: 10 };
const quote = (id: string, changes: Partial<Quote> = {}): Quote => ({
  id, quote_number: `Q-${id}`, client_name: `Client ${id}`, client_email: `${id}@example.test`,
  company_id: "tenant", event_date: date, status: "sent", guest_count: 100,
  subtotal: 1000, currency: "ZAR", menu_items: [{ menu_item_id: "menu", quantity: 100, unit_price: 10, line_total: 1000 }],
  ...changes,
} as Quote);
const opportunity = (id: string, guests: number, profit: number, changes: Partial<Opportunity> = {}): Opportunity => ({
  ...buildOpportunities([quote(id, { guest_count: guests })], new Map(), assumptions, "ZAR", today).opportunities[0],
  profit, margin: profit / 1000 * 100, hours: guests / 10, ...changes,
});
const input = (opportunities: Opportunity[], changes: Partial<OptimizationInput> = {}): OptimizationInput => ({
  opportunities, assumptions, commitments: [], mode: "profit",
  capacity: { maxConcurrentEvents: 2, maxKitchenLoadPerDay: 100, maxGuestsPerEvent: 100 }, ...changes,
});

test("uses ex-tax revenue, catalogue food costs and an explicit operating allowance", () => {
  const [result] = buildOpportunities([quote("a", { total_amount: 1150, tax_amount: 150 })], new Map([["menu", 4]]), assumptions, "ZAR", today).opportunities;
  expect(result).toMatchObject({ revenue: 1000, knownCost: 400, estimatedCost: 0, operatingCost: 100, cost: 500, profit: 500, margin: 50 });
});

test("missing cost is estimated rather than treated as zero, and cost stress applies to all costs", () => {
  const [result] = buildOpportunities([quote("a")], new Map(), { ...assumptions, costShockPercent: 20 }, "ZAR", today).opportunities;
  expect(result).toMatchObject({ knownCost: 0, estimatedCost: 400, operatingCost: 100, cost: 600, profit: 400 });
  expect(result.warnings).toHaveLength(1);
});

test("snapshot costs take precedence; zero is a known cost; service revenue keeps an allowance", () => {
  const [result] = buildOpportunities([quote("a", { delivery_fee: 200, subtotal: 1200,
    menu_items: [{ menu_item_id: "menu", unit_cost: 0, quantity: 100, line_total: 1000 }] })],
  new Map([["menu", 99]]), assumptions, "ZAR", today).opportunities;
  expect(result.knownCost).toBe(0);
  expect(result.estimatedCost).toBeCloseTo(80);
});

test("counts only the saved hire-in split as known equipment cost", () => {
  const [result] = buildOpportunities([quote("a", { equipment_items: [
    { from_hire_qty: 5, hire_in_cost_per_unit: 10 }, { from_hire_qty: 0, hire_in_cost_per_unit: 200 },
  ] })], new Map(), assumptions, "ZAR", today).opportunities;
  expect(result.knownCost).toBe(50);
});

test("omits expired, invalid, foreign-currency and terminal opportunities", () => {
  const result = buildOpportunities([
    quote("ok"), quote("expired", { valid_until: "2026-11-09" }), quote("past", { event_date: "2026-11-01" }),
    quote("guests", { guest_count: null }), quote("fx", { currency: "USD" }), quote("accepted", { status: "accepted" }),
    quote("converted", { converted_to_order_id: "order" }), quote("deleted", { deleted_at: today }),
  ], new Map(), assumptions, "ZAR", today);
  expect(result.opportunities.map((o) => o.id)).toEqual(["ok"]);
  expect(result.omitted).toBe(4);
});

test("selects two smaller quotes when together they outperform the largest one", () => {
  const plan = optimizeQuotes(input([opportunity("large", 100, 100), opportunity("a", 60, 70), opportunity("b", 40, 60)]));
  expect([...plan.selectedIds].sort()).toEqual(["a", "b"]);
  expect(plan.profit).toBe(130);
});

test("cannot pick two options for the same client and date", () => {
  const a = opportunity("a", 40, 70);
  const b = opportunity("b", 40, 60, { group: a.group });
  expect(optimizeQuotes(input([a, b])).selectedIds).toEqual(new Set(["a"]));
});

test("duplicate customer records with the same email do not inflate the optimized portfolio", () => {
  const result = buildOpportunities([quote("a", { client_id: "client-a", client_email: "same@example.test" }),
    quote("b", { client_id: "duplicate-client", client_email: "SAME@example.test" })], new Map(), assumptions, "ZAR", today);
  expect(result.opportunities[0].group).toBe(result.opportunities[1].group);
  expect(optimizeQuotes(input(result.opportunities, { capacity: { maxConcurrentEvents: 5, maxKitchenLoadPerDay: 1000, maxGuestsPerEvent: 500 } })).selected).toHaveLength(1);
});

test("confirmed work consumes daily capacity and is deduplicated", () => {
  const commitment = { kind: "order" as const, date, label: "Booked", guests: 60, sourceId: "order-1" };
  const plan = optimizeQuotes(input([opportunity("a", 60, 70), opportunity("b", 40, 60)], { commitments: [commitment, commitment] }));
  expect(plan.selectedIds).toEqual(new Set(["b"]));
  expect(plan.days.get(date)?.bookedEvents).toBe(1);
});

test("weekly prep includes confirmed commitments on other days in the same week", () => {
  const plan = optimizeQuotes(input([opportunity("a", 60, 70)], {
    assumptions: { ...assumptions, weeklyHours: 10 },
    commitments: [{ kind: "order", date: "2026-11-09", label: "Booked", guests: 50 }],
  }));
  expect(plan.selected).toHaveLength(0);
});

test("per-event limits and breathing room reserve remain hard constraints", () => {
  expect(optimizeQuotes(input([opportunity("a", 90, 100)], { mode: "space" })).selected).toHaveLength(0);
  expect(optimizeQuotes(input([opportunity("a", 110, 100)])).selected).toHaveLength(0);
});

test("forcing a quote reveals the contribution lost by displacing better combinations", () => {
  const options = [opportunity("large", 100, 100), opportunity("a", 60, 70), opportunity("b", 40, 60)];
  const original = optimizeQuotes(input(options));
  const forced = optimizeQuotes(input(options, { pinned: new Set(["large"]) }));
  expect(forced.selectedIds).toEqual(new Set(["large"]));
  expect(forced.profit - original.profit).toBe(-30);
});

test("conflicting pins produce no apparently feasible plan", () => {
  const plan = optimizeQuotes(input([opportunity("a", 70, 70), opportunity("b", 70, 60)], { pinned: new Set(["a", "b"]) }));
  expect(plan.conflicts).toHaveLength(1);
  expect(plan.selected).toHaveLength(0);
});

test("pinned quotes can override a margin preference; exclusions are respected", () => {
  const a = opportunity("a", 40, 1);
  const b = opportunity("b", 40, 100);
  const plan = optimizeQuotes(input([a, b], { assumptions: { ...assumptions, minimumMargin: 20 }, pinned: new Set(["a"]), excluded: new Set(["b"]) }));
  expect(plan.selectedIds).toEqual(new Set(["a"]));
});

test("a booking with missing guests blocks its week rather than assuming no workload", () => {
  const options = [opportunity("a", 40, 70)];
  const args = input(options, { commitments: [{ kind: "order", date: "2026-11-09", label: "Booked", guests: null }] });
  const plan = optimizeQuotes(args);
  expect(plan.selected).toHaveLength(0);
  expect(explainOpportunity(options[0], plan, args)).toContain("missing its guest count");
});

test("another open option for an already-booked client is held for review", () => {
  const a = opportunity("a", 40, 70);
  const args = input([a], { commitments: [{ kind: "order", date, label: "CLIENT A", guests: 20 }] });
  const plan = optimizeQuotes(args);
  expect(plan.selected).toHaveLength(0);
  expect(explainOpportunity(a, plan, args)).toContain("already has a commitment");
});

test("search matches exhaustive enumeration on a small competing portfolio", () => {
  const options = [
    opportunity("a", 60, 71), opportunity("b", 40, 58), opportunity("c", 20, 31), opportunity("d", 80, 92),
    opportunity("e", 50, 65), opportunity("f", 30, 39), opportunity("g", 70, 83), opportunity("h", 10, 12),
  ];
  let best = 0;
  for (let mask = 0; mask < 2 ** options.length; mask++) {
    const subset = options.filter((_, index) => mask & 2 ** index);
    if (subset.length <= 2 && subset.reduce((sum, o) => sum + o.guests, 0) <= 100) best = Math.max(best, subset.reduce((sum, o) => sum + o.profit, 0));
  }
  expect(optimizeQuotes(input(options)).profit).toBe(best);
});

test("date arithmetic preserves calendar days and Monday week boundaries", () => {
  expect(planningWeek("2026-11-15")).toBe("2026-11-09");
  expect(shiftPlanningDate("2026-12-31", 1)).toBe("2027-01-01");
});
