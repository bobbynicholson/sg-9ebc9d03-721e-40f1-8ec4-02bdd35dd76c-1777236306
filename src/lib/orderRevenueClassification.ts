/**
 * TIGHTEN I.70 (2026-06-01): canonical order revenue classification.
 *
 * The audit pass found 6 different "Revenue" answers across the
 * platform - admin dashboard headline tile, BI revenue trend, YoY
 * card, region performance, top clients, cashflow projection - each
 * using its own filter. The same tenant could see "Booked Revenue
 * R280k" on the dashboard tile and "Revenue Trend R450k" on the BI
 * chart for the same window because pending and unconfirmed orders
 * counted differently.
 *
 * This module is the single source of truth. Every widget that
 * displays a revenue number should call classifyOrderRevenue or one
 * of the predicate helpers to decide whether each row counts. New
 * widgets MUST NOT inline their own status check.
 *
 * State machine:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ pipeline   pending order (no deposit, no confirmed_at)     │
 *   │            Forward-looking forecast. Counts in pipeline    │
 *   │            KPIs but NOT in booked revenue.                 │
 *   │                                                            │
 *   │ booked     confirmed/preparing/ready/in_transit + AT LEAST │
 *   │            ONE of: deposit_paid, confirmed_at, payment     │
 *   │            paid/partial. This is the deal-locked-in state. │
 *   │            Counts in booked revenue.                       │
 *   │                                                            │
 *   │ realised   delivered or completed. The event happened or   │
 *   │            the food was handed over. Counts in everything  │
 *   │            (booked, realised, pipeline-was).               │
 *   │                                                            │
 *   │ churned    cancelled OR cancelled_at non-null. Lost gross. │
 *   │            Surfaces in cancellation-rate and won-then-     │
 *   │            cancelled metrics. NEVER in revenue.            │
 *   │                                                            │
 *   │ excluded   status missing, deleted, or otherwise undefined.│
 *   │            Defensive bucket. Not counted anywhere.         │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Decision rules every widget agrees on:
 *
 *   "Booked Revenue"     = booked + realised
 *                          (deals where the deposit / confirmation
 *                          locked the deal in)
 *
 *   "Realised Revenue"   = realised only
 *                          (the food was handed over)
 *
 *   "Pipeline Revenue"   = pipeline + booked + realised
 *                          (forward-looking, includes everything
 *                          that wasn't cancelled)
 *
 *   "Churned Revenue"    = churned
 *                          (lost gross from cancellations)
 *
 * Code policy: widgets call isBookedRevenue / isRealisedRevenue /
 * isPipelineRevenue / isChurnedRevenue as the filter predicate.
 * Custom one-off rules need a comment + a TIGHTEN issue number
 * explaining why the deviation is intentional.
 */

export type OrderRevenueState =
  | "pipeline"
  | "booked"
  | "realised"
  | "churned"
  | "excluded";

/** Minimum shape this module needs. Real rows carry more. */
export interface OrderForRevenue {
  status?: string | null;
  cancelled_at?: string | null;
  deposit_paid?: boolean | null;
  confirmed_at?: string | null;
  payment_status?: string | null;
}

const ACTIVE_STATUSES = new Set([
  "confirmed", "preparing", "ready", "in_transit",
]);

const REALISED_STATUSES = new Set([
  "delivered", "completed",
]);

export function classifyOrderRevenue(order: OrderForRevenue | null | undefined): OrderRevenueState {
  if (!order) return "excluded";
  const status = String(order.status || "").toLowerCase();
  const isCancelled = status === "cancelled" || !!order.cancelled_at;
  if (isCancelled) return "churned";
  if (REALISED_STATUSES.has(status)) return "realised";
  if (status === "pending") return "pipeline";
  if (ACTIVE_STATUSES.has(status)) {
    const lockedIn =
      !!order.deposit_paid
      || !!order.confirmed_at
      || order.payment_status === "paid"
      || order.payment_status === "partial";
    return lockedIn ? "booked" : "pipeline";
  }
  return "excluded";
}

/** Booked Revenue: deposit / confirmation has locked the deal in,
 *  through the event happening. The headline dashboard KPI. */
export function isBookedRevenue(order: OrderForRevenue): boolean {
  const s = classifyOrderRevenue(order);
  return s === "booked" || s === "realised";
}

/** Realised Revenue: the food has actually been handed over. The
 *  strictest "money in the bank" definition. */
export function isRealisedRevenue(order: OrderForRevenue): boolean {
  return classifyOrderRevenue(order) === "realised";
}

/** Pipeline Revenue: forward-looking, includes pending orders and
 *  unconfirmed deposits. Used for cashflow projections. */
export function isPipelineRevenue(order: OrderForRevenue): boolean {
  const s = classifyOrderRevenue(order);
  return s === "pipeline" || s === "booked" || s === "realised";
}

/** Churned Revenue: order was cancelled. The won-then-cancelled
 *  signal at the order level. */
export function isChurnedRevenue(order: OrderForRevenue): boolean {
  return classifyOrderRevenue(order) === "churned";
}

/** True when the order should be counted in a denominator that
 *  isn't specifically "lost". Most aggregators want this filter. */
export function isCountableOrder(order: OrderForRevenue): boolean {
  const s = classifyOrderRevenue(order);
  return s !== "churned" && s !== "excluded";
}

/**
 * TIGHTEN I.77 (2026-06-02): canonical operational status sets.
 *
 * Widgets that ask "what's happening operationally?" (not "what's
 * counted as revenue?") inlined three different status arrays that
 * disagreed with each other:
 *   - TodaysPulse.todayEvents missed "completed", so an event wrapped
 *     by 14:00 dropped off the strip silently
 *   - WeeklyOrdersChart used the full 6-status set
 *   - DispatchGapWidget + TomorrowsEventsWidget used the 3-status
 *     pre-dispatch subset (driver not yet rolling)
 *
 * These named constants replace the ad-hoc inline arrays.
 */

/** Orders currently in the active operational flow - kitchen,
 *  prep, dispatch, on the road. Pending is excluded (not booked
 *  yet); delivered + completed are excluded (operationally done). */
export const ACTIVE_OPERATIONAL_STATUSES = [
  "confirmed", "preparing", "ready", "in_transit",
] as const;

/** Orders still upstream of dispatch - need driver coordination,
 *  kitchen plan, etc. but the truck hasn't rolled yet. */
export const PRE_DISPATCH_STATUSES = [
  "confirmed", "preparing", "ready",
] as const;

/** Every status that should appear in "all activity today / this
 *  week" widgets. Active operational set + the realised terminal
 *  states. The 6-status superset for charts that need the full
 *  fulfilment story. */
export const ALL_ACTIVE_AND_REALISED_STATUSES = [
  ...ACTIVE_OPERATIONAL_STATUSES, "delivered", "completed",
] as const;
