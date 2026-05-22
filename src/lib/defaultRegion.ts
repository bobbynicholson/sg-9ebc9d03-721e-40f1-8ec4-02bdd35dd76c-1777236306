/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Default-region resolver.
 *
 * Migration 20260521110000 made `region_id` NOT NULL on orders,
 * quotes, clients, and leads. Phase 5 onboarding auto-creates a
 * "Main" region for every new tenant. But several insert paths
 * around the codebase never had region_id wired into their payload
 * (admin/contacts client insert, client-portal/RebookDialog lead
 * insert, leads/new.tsx when no kitchen-from-region is picked).
 * Those inserts now fail with:
 *   null value in column "region_id" of relation "<table>"
 *   violates not-null constraint
 *
 * This helper resolves a sensible region_id at insert time:
 * the company's first active region ordered by created_at ASC.
 * That matches the strategy the backfill migration used, so new
 * rows land in the same bucket as historic ones.
 *
 * Returns null if the company has no regions at all (which
 * shouldn't happen post-onboarding but does on legacy tenants
 * that never completed the flow). Callers should treat null as
 * "no default available - prompt the user to pick one explicitly".
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Look up the company's default region id. Picks the oldest active
 * region (mirrors the backfill migration's DISTINCT ON ordering).
 * Single round trip, no joins.
 */
export async function resolveDefaultRegionId(companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return null;
  const { data, error } = await (supabase as any)
    .from("regions")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[resolveDefaultRegionId] lookup failed:", error.message);
    return null;
  }
  return ((data as { id?: string } | null)?.id) ?? null;
}
