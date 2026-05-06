/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kitchen capacity routing.
 *
 * When a multi-branch tenant is building a quote, the operator can be
 * blind to which branch is already overloaded for that event date.
 * This service answers "which branch has the least committed work on
 * <date>?" so the quote builder can surface a soft hint without
 * forcing the choice.
 *
 * Heuristic (intentionally simple — capacity at this depth is more
 * than just order count, but order count gets us 80% of the way):
 *   * Count confirmed/preparing/ready orders per branch with the
 *     same event_date.
 *   * Count open quotes (draft/sent/revised) per branch with the
 *     same event_date — these are not booked yet but they're live
 *     enquiries that could land.
 *   * Score = orders × 2 + quotes × 1 (orders weigh double because
 *     they're committed work).
 *   * Pick the branch with the lowest score.
 *
 * Suggestion is a hint, never a redirect. The operator stays in
 * control of the kitchen picker; this just surfaces a "CPT is busy
 * that day, JHB looks lighter" tip when relevant.
 */
import { supabase } from "@/integrations/supabase/client";

export interface BranchLoad {
  regionId: string;
  orderCount: number;
  openQuoteCount: number;
  /** Composite score, higher = busier. */
  score: number;
}

export interface CapacitySuggestion {
  /** All branches considered, sorted busiest-first. */
  loads: BranchLoad[];
  /** The branch with the lowest score. null when no branches scored. */
  leastLoadedRegionId: string | null;
  /** True when there's a meaningful gap between busiest and lightest. */
  meaningful: boolean;
}

/**
 * Resolve the least-loaded branch for an event date.
 *
 * Returns a no-op suggestion when:
 *   * eventDate is missing / empty
 *   * Only one branch is supplied (nothing to choose between)
 *   * All branches have identical load (no useful steer)
 *
 * Caller should treat `meaningful=false` as "don't bother showing the
 * hint" — surfacing "all kitchens equally busy" adds noise without
 * helping anyone.
 */
export async function suggestKitchenForDate(
  companyId: string,
  eventDate: string | null | undefined,
  candidateRegionIds: string[],
): Promise<CapacitySuggestion> {
  const empty: CapacitySuggestion = {
    loads: [],
    leastLoadedRegionId: null,
    meaningful: false,
  };
  if (!companyId || !eventDate || candidateRegionIds.length <= 1) {
    return empty;
  }

  // Two parallel reads. Group client-side because PostgREST doesn't
  // expose GROUP BY without an RPC and the row volume here is small
  // (orders for one date, quotes for one date). Status arrays are
  // inlined so TS narrows them to the enum unions on the generated
  // Database types -- extracting them to a const widens to string[]
  // and breaks the build.
  const [ordersRes, quotesRes] = await Promise.all([
    supabase
      .from("orders")
      .select("region_id")
      .eq("company_id", companyId)
      .eq("event_date", eventDate)
      .in("status", ["confirmed", "preparing", "ready", "in_transit"]),
    supabase
      .from("quotes")
      .select("region_id")
      .eq("company_id", companyId)
      .eq("event_date", eventDate)
      .in("status", ["draft", "sent"]),
  ]);

  const orderCounts = new Map<string, number>();
  for (const row of (ordersRes?.data || [])) {
    const rid = (row as any).region_id;
    if (!rid) continue;
    orderCounts.set(rid, (orderCounts.get(rid) || 0) + 1);
  }
  const quoteCounts = new Map<string, number>();
  for (const row of (quotesRes?.data || [])) {
    const rid = (row as any).region_id;
    if (!rid) continue;
    quoteCounts.set(rid, (quoteCounts.get(rid) || 0) + 1);
  }

  const loads: BranchLoad[] = candidateRegionIds.map((rid) => {
    const orderCount = orderCounts.get(rid) || 0;
    const openQuoteCount = quoteCounts.get(rid) || 0;
    return {
      regionId: rid,
      orderCount,
      openQuoteCount,
      score: orderCount * 2 + openQuoteCount,
    };
  });

  loads.sort((a, b) => b.score - a.score); // busiest first

  const lowest = loads[loads.length - 1];
  const highest = loads[0];

  // "Meaningful" = at least 2-point gap. One quote here vs there isn't
  // worth surfacing.
  const meaningful = loads.length > 1 && highest.score - lowest.score >= 2;

  return {
    loads,
    leastLoadedRegionId: lowest?.regionId ?? null,
    meaningful,
  };
}
