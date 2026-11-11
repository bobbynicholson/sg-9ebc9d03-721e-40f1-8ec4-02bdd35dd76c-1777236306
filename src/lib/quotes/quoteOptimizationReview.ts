import { z } from "zod";
import { explainOpportunity, type Opportunity, type OptimizationInput, type OptimizationPlan } from "@/lib/quotes/quoteOptimization";
import type { PipelineDay } from "@/lib/quotes/quotePipeline";

export const quoteReviewRequestSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horizon: z.union([z.literal(0), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["profit", "balanced", "space"]),
  regionId: z.string().uuid().nullable().optional(),
  assumptions: z.object({
    weeklyHours: z.number().finite().min(1).max(10000), minutesPerGuest: z.number().finite().min(0.1).max(120),
    setupHours: z.number().finite().min(0).max(48), unknownCostPercent: z.number().finite().min(0).max(100),
    operatingPercent: z.number().finite().min(0).max(100), minimumMargin: z.number().finite().min(0).max(100),
    costShockPercent: z.number().finite().min(0).max(50),
  }),
  pinnedIds: z.array(z.string().uuid()).max(2000), excludedIds: z.array(z.string().uuid()).max(2000),
  costOverrides: z.record(z.string().uuid(), z.number().finite().min(0).max(1e12))
    .refine((value) => Object.keys(value).length <= 2000),
});

export const REVIEW_NEXT_STEPS = {
  review_quote: "Review the quote", review_costs: "Confirm missing costs", follow_up: "Follow up with the client",
  review_capacity: "Review operational capacity", keep_open: "Keep this option open", resolve_conflict: "Resolve included quotes",
} as const;

const prose = z.string().trim().min(5).max(500).refine((value) => !/\d/.test(value), "Numbers belong to verified fact fields.");
const reviewSchema = z.object({
  summary: prose,
  risks: z.array(prose).max(5),
  decisions: z.array(z.object({
    quoteId: z.string(), decision: z.enum(["pursue", "hold"]), reason: prose,
    nextStep: z.enum(["review_quote", "review_costs", "follow_up", "review_capacity", "keep_open", "resolve_conflict"]),
  })).max(20),
});
export type QuoteModelReview = z.infer<typeof reviewSchema>;

/** Model prose is attached to verified decisions; it cannot alter the portfolio,
 * introduce quote ids, or invent numerical forecasts. */
export function validateQuoteModelReview(value: unknown, options: Opportunity[], plan: OptimizationPlan): QuoteModelReview | null {
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success || parsed.data.decisions.length !== options.length) return null;
  const expected = new Set(options.map((opportunity) => opportunity.id));
  const seen = new Set<string>();
  for (const decision of parsed.data.decisions) {
    if (!expected.has(decision.quoteId) || seen.has(decision.quoteId)
      || (decision.decision === "pursue") !== plan.selectedIds.has(decision.quoteId)) return null;
    seen.add(decision.quoteId);
  }
  return parsed.data;
}

export function reviewOpportunities(input: OptimizationInput, plan: OptimizationPlan, date: string): Opportunity[] {
  return input.opportunities.filter((opportunity) => opportunity.date === date)
    .sort((a, b) => Number(plan.selectedIds.has(b.id)) - Number(plan.selectedIds.has(a.id)) || b.profit - a.profit).slice(0, 20);
}

export function quoteReviewContext(input: OptimizationInput, plan: OptimizationPlan, date: string, currency: string, day?: PipelineDay) {
  const options = reviewOpportunities(input, plan, date);
  return {
    task: "Explain this date's verified quote decisions and suggest a practical next step for each.",
    date, currency, mode: input.mode, assumptions: input.assumptions, companyCapacity: input.capacity,
    constraints: { remainingDailyEvents: Math.max(0, input.capacity.maxConcurrentEvents - (plan.days.get(date)?.bookedEvents || 0)),
      bookedGuests: plan.days.get(date)?.bookedGuests || 0, bookedPrepHoursThisWeek: plan.weeklyBookedHours.get(options[0]?.week) || 0 },
    portfolio: { contribution: plan.profit, revenue: plan.revenue, prepHours: plan.hours,
      selectedCount: plan.selected.length, conflicts: plan.conflicts.length, boundedSearch: plan.approximate },
    enquiryPipeline: day ? { accepted: day.accepted, awaitingDecision: day.awaitingDecision, needReview: day.review, closed: day.closed,
      possibleDuplicateGroups: new Set(day.entries.map((entry) => entry.duplicateGroup).filter(Boolean)).size,
      reviewItems: day.entries.filter((entry) => entry.state === "review" || entry.duplicateGroup).slice(0, 20)
        .map((entry) => ({ id: entry.order?.id || entry.quotes[0]?.id || entry.leads[0]?.id, state: entry.state, hasQuote: entry.quotes.length > 0,
          guestsKnown: entry.guests != null, reasons: entry.reasons, possibleDuplicate: !!entry.duplicateGroup })),
    } : undefined,
    quotes: options.map((opportunity) => ({
      id: opportunity.id, status: opportunity.quote.status, guests: opportunity.guests,
      exTaxRevenue: opportunity.revenue, modeledCost: opportunity.cost, estimatedContribution: opportunity.profit,
      marginPercent: opportunity.margin, prepHours: opportunity.hours, hasCostEstimates: opportunity.estimatedCost > 0,
      decision: plan.selectedIds.has(opportunity.id) ? "pursue" : "hold",
      constraintExplanation: explainOpportunity(opportunity, plan, input),
      pinned: input.pinned?.has(opportunity.id) || false, excluded: input.excluded?.has(opportunity.id) || false,
    })),
  };
}

export const QUOTE_REVIEW_SYSTEM = `You advise a catering operator deciding which quotes to pursue on a date.
Use the supplied server-verified portfolio and constraints. Examine profitability, scarce capacity, weekly workload, margin, and incomplete costing together.
The optimizer's pursue/hold decisions are authoritative. Explain them; never override them or claim a quote is accepted. A pinned low-margin quote is the operator's preference.
The enquiry pipeline also includes unquoted submissions, incomplete quotes, accepted bookings and closed records. Explain which need verification or pricing. Never infer profit from an enquiry budget or count a pending order as accepted. Flag possible duplicate groups for comparison; do not merge or dismiss separately accepted orders. When there are no priced quotes, return an empty decisions array and a useful summary of the enquiry review work.
Ground every explanation in the supplied evidence. Do not invent client history, conversion likelihood, staff rosters, inventory, equipment or delivery availability. Mention any such unknowns as checks, not facts.
Contribution is estimated, before fixed overhead and tax. The bounded search is not a guarantee of a global optimum.
Do not repeat numbers, amounts, dates, IDs or quote references inside prose. The interface displays verified numeric facts beside your explanation. Prose must contain no digits.
Return concise decision summaries, not private chain-of-thought. Use plain practical language and a specific next step.
Return only JSON with this shape:
{"summary":"Concise overall advice for this date","risks":["Evidence-based uncertainty or operational check"],"decisions":[{"quoteId":"exact supplied id","decision":"pursue or hold exactly as supplied","reason":"Why this choice makes sense in this portfolio","nextStep":"review_quote|review_costs|follow_up|review_capacity|keep_open|resolve_conflict"}]}
Return exactly one decision for each supplied quote, no others. If the portfolio has conflicts, flag that they must be resolved before recommendations are actionable.`;
