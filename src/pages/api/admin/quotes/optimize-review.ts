import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { callTextJson, isTextAiConfigured } from "@/lib/ai/textLlm";
import { setAiUsageContext } from "@/lib/ai/usageLog";
import { loadQuoteOptimizationData } from "@/services/quoteOptimizationService";
import { buildOpportunities, optimizeQuotes, shiftPlanningDate } from "@/lib/quotes/quoteOptimization";
import { quoteReviewContext, quoteReviewRequestSchema, QUOTE_REVIEW_SYSTEM, reviewOpportunities, validateQuoteModelReview } from "@/lib/quotes/quoteOptimizationReview";
import { toLocalDateKey } from "@/lib/localDate";
import { buildQuotePipeline, pipelineDaySignature, summarizePipelineDay } from "@/lib/quotes/quotePipeline";

const ALLOWED_ROLES = new Set(["super_admin", "owner", "company_admin", "admin", "sales_admin", "region_admin"]);
// Small per-process burst guard; authentication and tenant-scoped RLS also apply.
const recent = new Map<string, number[]>();
export const config = { api: { bodyParser: { sizeLimit: "256kb" } }, maxDuration: 120 };

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const db = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: "Sign in to review a quote plan." });
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("role, active_role, company_id").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.company_id || !ALLOWED_ROLES.has(String(profile.active_role || profile.role))) {
      return res.status(403).json({ error: "Your role cannot review this company's quotes." });
    }
    const parsed = quoteReviewRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "The planning scenario is invalid. Refresh the plan and try again." });
    const request = parsed.data;
    const today = toLocalDateKey(new Date())!;
    const requestedEnd = request.horizon === 0 ? "all" : shiftPlanningDate(request.start, request.horizon - 1);
    if (toLocalDateKey(request.start) !== request.start || toLocalDateKey(request.date) !== request.date
      || request.start < shiftPlanningDate(today, -1) || request.start > shiftPlanningDate(today, 1)
      || request.date < request.start || (request.horizon !== 0 && request.date > requestedEnd)) {
      return res.status(400).json({ error: "Choose a date within the current planning window." });
    }
    if (!isTextAiConfigured()) return res.status(503).json({ error: "Model review is not configured on this server. The optimizer's decisions and explanations are still available." });
    const now = Date.now();
    for (const [key, calls] of recent) if (!calls.some((stamp) => stamp > now - 60000)) recent.delete(key);
    const key = `${profile.company_id}:${user.id}`;
    const calls = (recent.get(key) || []).filter((stamp) => stamp > now - 60000);
    if (calls.length >= 5) { res.setHeader("Retry-After", "60"); return res.status(429).json({ error: "Please wait a minute before requesting another model review." }); }
    recent.set(key, [...calls, now]);
    setAiUsageContext({ companyId: profile.company_id, userId: user.id });

    // Re-read authoritative data. Browser-supplied totals or recommendations
    // are never passed to the model. The session client enforces tenant RLS.
    const source = await loadQuoteOptimizationData(db, profile.company_id, request.start, requestedEnd);
    if (request.date > source.end) return res.status(400).json({ error: "Choose a date within the current planning window." });
    const { data: company, error: companyError } = await db.from("companies").select("currency")
      .eq("id", profile.company_id).maybeSingle();
    if (companyError || !company) return res.status(503).json({ error: "Company currency could not be verified. Refresh the plan." });
    const currency = String(company.currency || "ZAR").toUpperCase();
    const { opportunities: calculated } = buildOpportunities(source.quotes.filter((quote) => !request.regionId || quote.region_id === request.regionId),
      source.catalogueCosts, request.assumptions, currency, request.start);
    const opportunities = calculated.map((opportunity) => {
      const override = request.costOverrides[opportunity.id];
      if (override == null) return opportunity;
      const cost = override * (1 + request.assumptions.costShockPercent / 100);
      const profit = Math.round((opportunity.revenue - cost) * 100) / 100;
      return { ...opportunity, cost, profit, margin: profit / opportunity.revenue * 100 };
    });
    const input = { opportunities, commitments: source.commitments, capacity: source.capacity,
      assumptions: request.assumptions, mode: request.mode, pinned: new Set(request.pinnedIds), excluded: new Set(request.excludedIds) };
    const plan = optimizeQuotes(input);
    const pipeline = buildQuotePipeline({ leads: source.leads || [], quotes: source.relatedQuotes || source.quotes,
      orders: source.orders || [], commitments: source.commitments, opportunities, start: request.start, end: source.end,
      regionId: request.regionId, currency });
    const day = summarizePipelineDay(pipeline, request.date);
    const options = reviewOpportunities(input, plan, request.date);
    if (!day.entries.length) return res.status(400).json({ error: "There are no enquiries or bookings to explain on this date." });
    const response = await callTextJson({
      label: "quote_optimization_review", tier: "smart", system: QUOTE_REVIEW_SYSTEM,
      user: JSON.stringify(quoteReviewContext(input, plan, request.date, currency, day)),
      maxTokens: 3500, temperature: 0, timeoutMs: 18000,
      accept: (value) => validateQuoteModelReview(value, options, plan) !== null,
    });
    const review = validateQuoteModelReview(response.data, options, plan);
    if (!review) return res.status(502).json({ error: "The model review could not be verified. Please try again." });
    return res.status(200).json({ review, date: request.date, reviewedAt: source.loadedAt,
      totalOnDate: opportunities.filter((opportunity) => opportunity.date === request.date).length,
      pipelineSignature: pipelineDaySignature(day),
      portfolioContribution: plan.profit,
      facts: options.map((opportunity) => ({ id: opportunity.id, contribution: opportunity.profit, hours: opportunity.hours,
        guests: opportunity.guests, selected: plan.selectedIds.has(opportunity.id) })),
    });
  } catch {
    return res.status(502).json({ error: "Model review is temporarily unavailable. Your optimizer plan is still available; try the review again shortly." });
  }
}

export default withApiLogging(handler);
