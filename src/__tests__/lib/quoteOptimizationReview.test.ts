import { quoteReviewRequestSchema, validateQuoteModelReview } from "@/lib/quotes/quoteOptimizationReview";
import type { Opportunity, OptimizationPlan } from "@/lib/quotes/quoteOptimization";

const options = [{ id: "a" }, { id: "b" }] as Opportunity[];
const plan = { selectedIds: new Set(["a"]) } as OptimizationPlan;
const review = () => ({ summary: "Pursue the stronger contribution while preserving weekly capacity.", risks: ["Some ingredient costs are estimated."], decisions: [
  { quoteId: "a", decision: "pursue", reason: "Fits available kitchen capacity and contributes more in this portfolio.", nextStep: "follow_up" },
  { quoteId: "b", decision: "hold", reason: "Competes for the same limited prep capacity.", nextStep: "keep_open" },
] });

test("accepts explanations attached to verified quote decisions", () => {
  expect(validateQuoteModelReview(review(), options, plan)).toEqual(review());
});
test("rejects a model that reverses an optimizer decision", () => {
  const value = review(); value.decisions[0].decision = "hold";
  expect(validateQuoteModelReview(value, options, plan)).toBeNull();
});
test("rejects invented quote ids, duplicate decisions and missing decisions", () => {
  const unknown = review(); unknown.decisions[0].quoteId = "foreign-tenant";
  const duplicate = review(); duplicate.decisions[1] = duplicate.decisions[0];
  const missing = review(); missing.decisions.pop();
  for (const value of [unknown, duplicate, missing]) expect(validateQuoteModelReview(value, options, plan)).toBeNull();
});
test("rejects generated numeric claims so amounts come from verified facts", () => {
  const value = review(); value.summary = "This plan will make 999999 in profit.";
  expect(validateQuoteModelReview(value, options, plan)).toBeNull();
});
test("rejects malformed or unsupported next actions", () => {
  const value = review(); value.decisions[0].nextStep = "accept_and_charge_client";
  expect(validateQuoteModelReview(value, options, plan)).toBeNull();
});
test("validates user assumptions, dates, quote identities and request bounds", () => {
  expect(quoteReviewRequestSchema.safeParse({ start: "2026-11-10", horizon: 365, date: "2026-11-14", mode: "profit",
    assumptions: { weeklyHours: -2 }, pinnedIds: ["made-up-id"], excludedIds: [], costOverrides: {} }).success).toBe(false);
});
