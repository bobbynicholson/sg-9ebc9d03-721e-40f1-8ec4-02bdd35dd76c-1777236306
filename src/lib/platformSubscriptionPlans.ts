import { getPlanById } from "@/lib/payfastService";
import type { SubscriptionPlan } from "@/types/payments";
import {
  calculateAnnualSavings,
  type LivePlan,
} from "@/lib/pricingCalculator";

type PlatformPlanRow = LivePlan & { is_active?: boolean };

export function normalizeSubscriptionPlanId(planId: string): string {
  return planId.toLowerCase() === "pro" ? "professional" : planId.toLowerCase();
}

export function getPlatformPlanSlug(planId: string): string {
  return normalizeSubscriptionPlanId(planId) === "professional"
    ? "pro"
    : normalizeSubscriptionPlanId(planId);
}

export function applyPlatformPricingToPlan(
  planId: string,
  livePlans: PlatformPlanRow[] | null | undefined,
): SubscriptionPlan | undefined {
  const plan = getPlanById(normalizeSubscriptionPlanId(planId));
  if (!plan) return undefined;

  const slug = getPlatformPlanSlug(planId);
  const live = livePlans?.find((item) => item.slug.toLowerCase() === slug);
  if (!live) return plan;

  const monthlyPrice = Number(live.zar_price);
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return undefined;

  return {
    ...plan,
    name: live.name || plan.name,
    monthlyPrice,
    annualPrice: calculateAnnualSavings(monthlyPrice).annualPrice,
    features: Array.isArray(live.features) && live.features.length
      ? live.features
      : plan.features,
  };
}

/**
 * Resolve the plan used by PayFast from the same live pricing rows shown
 * on /pricing. If the table is absent in an older environment, use the
 * in-code fallback; on other database errors fail closed so checkout can
 * never quietly charge a stale amount.
 */
export async function loadPlatformSubscriptionPlan(
  db: any,
  planId: string,
  options: { requireActive?: boolean } = {},
): Promise<SubscriptionPlan | null> {
  const normalizedId = normalizeSubscriptionPlanId(planId);
  const fallback = getPlanById(normalizedId);
  if (!fallback) return null;

  const { data, error } = await db
    .from("platform_pricing_plans")
    .select("slug, name, zar_price, features, is_active")
    .eq("slug", getPlatformPlanSlug(normalizedId))
    .maybeSingle();

  if (error) {
    if (["42P01", "PGRST205"].includes(String(error.code || ""))) {
      console.warn("[platformSubscriptionPlans] live pricing table unavailable; using code fallback");
      return fallback;
    }
    throw new Error(`Could not load current plan pricing: ${error.message || "database error"}`);
  }

  if (!data) return options.requireActive ? null : fallback;
  if (options.requireActive && data.is_active !== true) return null;

  const resolved = applyPlatformPricingToPlan(normalizedId, [data as PlatformPlanRow]);
  if (!resolved) throw new Error(`Platform plan ${normalizedId} has an invalid monthly price`);
  return resolved;
}
