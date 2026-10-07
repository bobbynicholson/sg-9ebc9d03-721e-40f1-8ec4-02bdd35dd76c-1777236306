/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Live technology-cost data for /admin/platform/tech-costs and the
 * assistant's platform_technology_costs answer.
 *
 * Everything is read from current records: onboarded companies, active
 * plan revenue, the stored USD/ZAR rate, emails / assistant questions /
 * receipt scans / EFT proofs in the last 30 days, and this month's AI
 * calls from ai_usage_events. The model in src/lib/techCosts/model.ts
 * turns those into vendor costs. Call with a service-role client.
 */
import {
  computeTechCosts,
  DEFAULT_USD_TO_ZAR,
  type TechCostInputs,
  type TechCostResult,
} from "@/lib/techCosts/model";

export interface AiUsageBreakdownRow {
  key: string;
  calls: number;
  failed: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export interface AiUsageSummary {
  /** False until supabase/migrations/20261007090000_ai_usage_events.sql has run. */
  available: boolean;
  month_start: string;
  calls: number;
  failed: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  today_cost_usd: number;
  byFeature: AiUsageBreakdownRow[];
  byModel: AiUsageBreakdownRow[];
  recent: Array<{
    created_at: string;
    feature: string;
    provider: string;
    model: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    success: boolean;
    company: string | null;
  }>;
}

export interface LiveTechCostData {
  inputs: TechCostInputs;
  companiesTotal: number;
  activeCompanies: number;
  trialCompanies: number;
  fxRateUsdToZar: number | null;
  fxDate: string | null;
  usdToZar: number;
  costs: TechCostResult;
  ai: AiUsageSummary;
  as_of: string;
}

const EMPTY_AI = (monthStart: string): AiUsageSummary => ({
  available: false, month_start: monthStart, calls: 0, failed: 0, tokens_in: 0, tokens_out: 0,
  cost_usd: 0, today_cost_usd: 0, byFeature: [], byModel: [], recent: [],
});

function group(rows: any[], keyOf: (r: any) => string): AiUsageBreakdownRow[] {
  const map = new Map<string, AiUsageBreakdownRow>();
  for (const r of rows) {
    const key = keyOf(r);
    const g = map.get(key) ?? { key, calls: 0, failed: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 };
    g.calls += 1;
    if (!r.success) g.failed += 1;
    g.tokens_in += Number(r.tokens_in) || 0;
    g.tokens_out += Number(r.tokens_out) || 0;
    g.cost_usd += Number(r.cost_usd) || 0;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd || b.calls - a.calls);
}

async function count(q: any): Promise<number> {
  try {
    const r = await q;
    return r?.error ? 0 : Number(r?.count) || 0;
  } catch {
    return 0;
  }
}

export async function getAiUsageSummary(db: any, companyNames: Map<string, string> = new Map()): Promise<AiUsageSummary> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  try {
    const res = await db
      .from("ai_usage_events")
      .select("created_at, company_id, feature, provider, model, tokens_in, tokens_out, cost_usd, success")
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (res.error) return EMPTY_AI(monthStart);
    const rows: any[] = Array.isArray(res.data) ? res.data : [];
    const sum = (f: (r: any) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
    return {
      available: true,
      month_start: monthStart,
      calls: rows.length,
      failed: rows.filter((r) => !r.success).length,
      tokens_in: sum((r) => Number(r.tokens_in)),
      tokens_out: sum((r) => Number(r.tokens_out)),
      cost_usd: sum((r) => Number(r.cost_usd)),
      today_cost_usd: rows.filter((r) => String(r.created_at) >= dayStart).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0),
      byFeature: group(rows, (r) => String(r.feature || "other")),
      byModel: group(rows, (r) => `${r.model} · ${r.provider}`),
      recent: rows.slice(0, 25).map((r) => ({
        created_at: r.created_at,
        feature: r.feature,
        provider: r.provider,
        model: r.model,
        tokens_in: Number(r.tokens_in) || 0,
        tokens_out: Number(r.tokens_out) || 0,
        cost_usd: Number(r.cost_usd) || 0,
        success: !!r.success,
        company: r.company_id ? companyNames.get(String(r.company_id)) ?? null : null,
      })),
    };
  } catch {
    return EMPTY_AI(monthStart);
  }
}

export async function getLiveTechCostData(db: any): Promise<LiveTechCostData | null> {
  try {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [companiesResult, plansResult, rateResult, users, emails, chatMessages, eftProofs, receiptJobs] = await Promise.all([
      db.from("companies").select("id, company_name, onboarding_completed_at, subscription_status, subscription_plan, subscription_tier").is("deleted_at", null).limit(5000),
      db.from("platform_pricing_plans").select("slug, name, zar_price").eq("is_active", true),
      db.from("exchange_rates").select("usd_to_zar_rate, date").order("date", { ascending: false }).limit(1).maybeSingle(),
      count(db.from("profiles").select("id", { count: "exact", head: true })),
      count(db.from("outgoing_email_queue").select("id", { count: "exact", head: true }).gte("created_at", since)),
      count(db.from("chat_messages").select("id", { count: "exact", head: true }).gte("created_at", since).eq("role", "user")),
      count(db.from("payments").select("id", { count: "exact", head: true }).gte("created_at", since).not("payment_proof_path", "is", null)),
      db.from("import_jobs").select("id").eq("kind", "receipts").gte("created_at", since).limit(5000),
    ]);
    if (companiesResult.error) return null;

    const all: any[] = Array.isArray(companiesResult.data) ? companiesResult.data : [];
    const onboarded = all.filter((c) => c.onboarding_completed_at);
    const status = (c: any) => String(c.subscription_status || "").toLowerCase();
    const active = onboarded.filter((c) => status(c) === "active");
    const trial = onboarded.filter((c) => status(c) === "trial");
    const planPrices = new Map<string, number>(
      (Array.isArray(plansResult?.data) ? plansResult.data : []).map((p: any) => [String(p.slug || p.name || "").toLowerCase(), Number(p.zar_price) || 0] as [string, number]),
    );
    const priceOf = (c: any) => planPrices.get(String(c.subscription_plan || c.subscription_tier || "").toLowerCase()) || 0;
    const paying = active.filter((c) => priceOf(c) > 0);
    const revenue = paying.reduce((s, c) => s + priceOf(c), 0);

    const jobIds = (Array.isArray(receiptJobs?.data) ? receiptJobs.data : []).map((j: any) => j.id);
    const receiptScans = jobIds.length ? await count(db.from("import_rows").select("id", { count: "exact", head: true }).in("job_id", jobIds)) : 0;

    const fx = Number(rateResult?.data?.usd_to_zar_rate);
    const fxRateUsdToZar = Number.isFinite(fx) && fx > 0 ? fx : null;
    const usdToZar = fxRateUsdToZar ?? DEFAULT_USD_TO_ZAR;

    const companyNames = new Map<string, string>(all.map((c) => [String(c.id), String(c.company_name || "Company")]));
    const ai = await getAiUsageSummary(db, companyNames);

    const inputs: TechCostInputs = {
      companies: onboarded.length,
      paying_companies: paying.length,
      revenue_zar: revenue,
      users,
      emails,
      chat_messages: chatMessages,
      receipt_scans: receiptScans,
      eft_proofs: eftProofs,
      ai_actual_usd: ai.available ? ai.cost_usd : null,
      ai_actual_calls: ai.calls,
    };
    return {
      inputs,
      companiesTotal: all.length,
      activeCompanies: active.length,
      trialCompanies: trial.length,
      fxRateUsdToZar,
      fxDate: rateResult?.data?.date ?? null,
      usdToZar,
      costs: computeTechCosts(inputs, usdToZar),
      ai,
      as_of: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Shape the assistant's live tool returns (see src/server/chatbot/liveTools.ts). */
export interface TechnologyCostSummary {
  status: "ready" | "partial";
  basis: "platform records and live AI usage";
  tenantCount: number;
  activeTenantCount: number;
  trialTenantCount: number;
  monthlyCostUsd: number;
  monthlyCostZar: number | null;
  averageCostPerTenantZar: number | null;
  subscriptionRevenueZar: number | null;
  marginZar: number | null;
  marginPercent: number | null;
  fxRateUsdToZar: number | null;
  aiSpendThisMonthUsd: number | null;
  costByService: Array<{ service: string; monthlyUsd: number; monthlyZar: number | null }>;
  rankingAvailable: false;
  trendAvailable: false;
  limitations: string[];
  as_of: string;
}

export async function getPlatformTechnologyCostSummary(db: any): Promise<TechnologyCostSummary | null> {
  const live = await getLiveTechCostData(db);
  if (!live) return null;
  const { inputs, costs, fxRateUsdToZar } = live;
  const monthlyCostUsd = costs.total_usd;
  const monthlyCostZar = fxRateUsdToZar == null ? null : monthlyCostUsd * fxRateUsdToZar;
  const revenue = inputs.revenue_zar;
  const marginZar = monthlyCostZar == null || !revenue ? null : revenue - monthlyCostZar;
  return {
    status: fxRateUsdToZar == null ? "partial" : "ready",
    basis: "platform records and live AI usage",
    tenantCount: inputs.companies,
    activeTenantCount: live.activeCompanies,
    trialTenantCount: live.trialCompanies,
    monthlyCostUsd,
    monthlyCostZar,
    averageCostPerTenantZar: monthlyCostZar == null || inputs.companies === 0 ? null : monthlyCostZar / inputs.companies,
    subscriptionRevenueZar: revenue || null,
    marginZar,
    marginPercent: marginZar == null || revenue <= 0 ? null : (marginZar / revenue) * 100,
    fxRateUsdToZar,
    aiSpendThisMonthUsd: inputs.ai_actual_usd,
    costByService: costs.categories.map((c) => ({ service: c.category, monthlyUsd: c.subtotal_usd, monthlyZar: fxRateUsdToZar == null ? null : c.subtotal_usd * fxRateUsdToZar })),
    rankingAvailable: false,
    trendAvailable: false,
    limitations: [
      "Vendor bills are not connected; hosting, database, email, maps and card fees are priced from platform records and each vendor's published rates.",
      inputs.ai_actual_usd == null ? "AI spend is an estimate until the ai_usage_events table exists." : "AI spend is tracked per call this month.",
      "Company-specific infrastructure spend is not recorded, so companies cannot be ranked by cost.",
    ],
    as_of: live.as_of,
  };
}
