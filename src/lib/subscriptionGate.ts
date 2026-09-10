/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Subscription -> feature gating scaffold.
 *
 * Phase 5 follow-up: the audit found that pricing-tier UI exists but
 * no code path enforces the tier. Every feature is unlocked regardless
 * of `companies.subscription_status`. The right time to wire gates is
 * "now, for new feature paths" - retrofitting gates onto existing
 * surfaces without a real pricing model causes more confusion than
 * it solves.
 *
 * This module is the single place gates are defined. As features ship
 * with tier limits, they call `requireSubscriptionFeature()` at the
 * mutation entry point. The helper consults the canonical source of
 * truth (companies.subscription_status; see
 * src/services/subscriptionService.ts file header for the cache vs
 * ledger discussion) and either allows the action or returns a clean
 * "upgrade your plan" error the UI can surface.
 *
 * See docs/tenant-lifecycle.md section 5 for the broader gating story
 * and the Stripe/PayFast webhook follow-up.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The subscription_status enum values, mirrored from the Postgres
 * type. Kept in sync manually; if the DB enum gains a value, add it
 * here and decide which gates it satisfies.
 */
export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "cancelled"
  | "suspended";

/**
 * Set of subscription statuses that grant access to paid features.
 * `trial` is included because Bobby's product brief treats trial as
 * "fully featured for X days". `past_due` is allowed for a configurable
 * grace period - we don't want to lock out a paying customer because
 * their card bounced once. `cancelled` and `suspended` are read-only.
 */
const ACCESS_GRANTING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "trial",
  "active",
  "past_due",
]);

/**
 * Feature keys. Each gate is named once here so a feature surface
 * references the same key as the docs / the future tier-mapping
 * config. Add new keys as features ship - do not invent keys ad-hoc
 * at the call site.
 */
export type FeatureKey =
  | "create_order"
  | "create_quote"
  | "create_invoice"
  | "create_driver"
  | "send_whatsapp"
  | "send_sms"
  | "export_data"
  | "advanced_analytics";

export interface GateResult {
  allowed: boolean;
  /** Status read from companies.subscription_status. */
  status: SubscriptionStatus | null;
  /** When allowed=false, a human-readable reason the UI can surface. */
  reason?: string;
}

/**
 * Check whether the company's current subscription tier grants
 * access to a feature.
 *
 * Wave 80 (Phase 5 follow-up): the function is intentionally
 * permissive by default - if the company row can't be read, the gate
 * opens. This keeps the codebase shippable while pricing is still
 * being designed. As tier-feature mappings get defined, the
 * `allowed` short-circuit at the top will be replaced with the real
 * matrix.
 */
export async function requireSubscriptionFeature(
  client: SupabaseClient | any,
  companyId: string,
  _feature: FeatureKey,
): Promise<GateResult> {
  if (!companyId) {
    // Pre-onboarding callers (e.g. signup) have no company yet.
    // Treat as allowed; the calling path will fail downstream when it
    // tries to act on a non-existent company.
    return { allowed: true, status: null };
  }

  try {
    const { data, error } = await client
      .from("companies")
      .select("subscription_status")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) {
      console.warn("[requireSubscriptionFeature] company read failed (opening gate):", error);
      return { allowed: true, status: null };
    }
    const status = String((data as any).subscription_status || "trial") as SubscriptionStatus;
    if (!ACCESS_GRANTING_STATUSES.has(status)) {
      return {
        allowed: false,
        status,
        reason: status === "cancelled"
          ? "This account has been cancelled. Reactivate your subscription to continue."
          : status === "suspended"
            ? "This account is suspended. Contact support."
            : `Your subscription status (${status}) does not grant access to this feature.`,
      };
    }
    // Future: tier matrix check by feature key. Today every
    // access-granting status unlocks every feature.
    return { allowed: true, status };
  } catch (e: any) {
    console.warn("[requireSubscriptionFeature] crashed (opening gate):", e);
    return { allowed: true, status: null };
  }
}
