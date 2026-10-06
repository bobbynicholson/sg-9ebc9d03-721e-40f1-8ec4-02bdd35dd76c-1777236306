/**
 * Shared, read-only unit-economics model for the platform technology-cost
 * page and assistant. It is an estimate, not a vendor billing integration.
 * Tenant count, active plan revenue, and FX are read from current records.
 */
import { computeTechCosts, DEFAULT_ASSUMPTIONS, DEFAULT_USD_TO_ZAR } from "@/lib/techCosts/model";

export interface TechnologyCostSummary {
  status: "ready" | "partial";
  basis: "estimated platform operating model";
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
  costByService: Array<{ service: string; monthlyUsd: number; monthlyZar: number | null }>;
  rankingAvailable: false;
  trendAvailable: false;
  limitations: string[];
  as_of: string;
}


export async function getPlatformTechnologyCostSummary(db: any): Promise<TechnologyCostSummary | null> {
  try {
    const [companiesResult, plansResult, rateResult] = await Promise.all([
      db.from("companies").select("id, company_name, subscription_status, subscription_plan, subscription_tier").is("deleted_at", null).not("onboarding_completed_at", "is", null).limit(5000),
      db.from("platform_pricing_plans").select("slug, name, zar_price").eq("is_active", true),
      db.from("exchange_rates").select("usd_to_zar_rate, date").order("date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (companiesResult.error) return null;
    const companies = Array.isArray(companiesResult.data) ? companiesResult.data : [];
    const active = companies.filter((c: any) => String(c.subscription_status || "").toLowerCase() === "active");
    const trial = companies.filter((c: any) => String(c.subscription_status || "").toLowerCase() === "trial");
    const tenantCount = companies.length;
    const fx = Number(rateResult?.data?.usd_to_zar_rate);
    const fxRateUsdToZar = Number.isFinite(fx) && fx > 0 ? fx : null;
    const planPrices = new Map<string, number>((Array.isArray(plansResult?.data) ? plansResult.data : []).map((p: any) => [String(p.slug || p.name || "").toLowerCase(), Number(p.zar_price) || 0] as [string, number]));
    const revenue = active.reduce((sum: number, c: any) => sum + (planPrices.get(String(c.subscription_plan || c.subscription_tier || "").toLowerCase()) || 0), 0);
    // Same model as /admin/platform/tech-costs (src/lib/techCosts/model.ts),
    // fed with the real company count and average paid subscription.
    const averageSubscriptionZar = active.length > 0 ? revenue / active.length : 0;
    const model = computeTechCosts(
      {
        ...DEFAULT_ASSUMPTIONS,
        tenants: tenantCount,
        subscription_zar_per_tenant: averageSubscriptionZar,
        card_paying_share: tenantCount > 0 ? active.length / tenantCount : 0,
      },
      fxRateUsdToZar ?? DEFAULT_USD_TO_ZAR,
    );
    const monthlyCostUsd = model.total_usd;
    const monthlyCostZar = fxRateUsdToZar == null ? null : monthlyCostUsd * fxRateUsdToZar;
    const averageCostPerTenantZar = monthlyCostZar == null || tenantCount === 0 ? null : monthlyCostZar / tenantCount;
    const marginZar = monthlyCostZar == null || !revenue ? null : revenue - monthlyCostZar;
    const marginPercent = marginZar == null || revenue <= 0 ? null : (marginZar / revenue) * 100;
    const services = model.categories.map((c) => [c.category, c.subtotal_usd] as const);
    return {
      status: fxRateUsdToZar == null ? "partial" : "ready", basis: "estimated platform operating model",
      tenantCount, activeTenantCount: active.length, trialTenantCount: trial.length,
      monthlyCostUsd, monthlyCostZar, averageCostPerTenantZar, subscriptionRevenueZar: revenue || null,
      marginZar, marginPercent, fxRateUsdToZar,
      costByService: services.map(([service, monthlyUsd]) => ({ service, monthlyUsd, monthlyZar: fxRateUsdToZar == null ? null : monthlyUsd * fxRateUsdToZar })),
      rankingAvailable: false, trendAvailable: false,
      limitations: ["Vendor billing statements are not connected; costs are modeled from platform usage assumptions.", "Company-specific usage is not stored, so companies cannot be ranked by actual infrastructure spend.", "No historical technology-cost ledger is stored, so a month-over-month trend cannot be calculated."],
      as_of: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
