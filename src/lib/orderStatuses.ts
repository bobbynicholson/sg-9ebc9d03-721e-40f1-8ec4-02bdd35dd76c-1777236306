/**
 * Order status constants + query helpers - Wave 70.48
 *
 * Why this exists: prior to this wave, every dashboard widget,
 * intelligence calc, and revenue helper declared its OWN inline
 * `.in("status", ["pending","confirmed",...])` array. One forgotten
 * widget → revenue overstated by every cancelled order. The "R0 UNPAID"
 * bug (Wave 70.41b) was an instance of this exact category: bespoke
 * status filters drifting out of sync.
 *
 * Single source of truth, applied everywhere. New status values land
 * here first; widgets pick them up automatically.
 *
 * Naming convention - ALL_CAPS_SNAKE for sets, camelCase for helpers.
 */

/**
 * Every status that represents a "live" order - something the operator
 * still has work in flight on. Excludes both terminal states and
 * cancellation. This is what every revenue/forecast/dashboard widget
 * should use to count "current pipeline" or "active work".
 */
export const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "in_transit",
  "delivered",
] as const;

/**
 * Statuses that mean the order is closed permanently - no more work,
 * no more refunds, no more status flips. Excludes cancelled (which is
 * also terminal but a separate semantic category - cancelled means
 * "didn't happen", terminal means "happened and done").
 */
export const COMPLETED_ORDER_STATUSES = ["delivered", "completed"] as const;

/**
 * Statuses that mean the order is over for any reason - delivered,
 * completed, cancelled, refunded. Use when you want "not active"
 * regardless of why.
 */
export const TERMINAL_ORDER_STATUSES = [
  "delivered",
  "completed",
  "cancelled",
  "refunded",
] as const;

/**
 * Statuses that count as "didn't happen" - excluded from realised
 * revenue, lifetime spend, conversion-rate "won" counts.
 */
export const CANCELLED_LIKE_STATUSES = ["cancelled", "refunded"] as const;

/**
 * Source statuses cancelOrder() accepts. Mirrors the existing
 * ALLOWED_CANCEL_FROM in orderWorkflow.ts; exported here so it can be
 * referenced from API layers without importing the whole workflow file.
 */
export const ALLOWED_CANCEL_FROM_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "in_transit",
  "paused",
] as const;

/**
 * Apply the "exclude cancelled / terminal-cancel-like" filter to a
 * Supabase query builder. Returns the chained query so callers can
 * keep building.
 *
 * Usage:
 *   const q = sb.from("orders").select("*").eq("company_id", id);
 *   const filtered = excludeCancelled(q);
 *
 * Why a helper not a constant: Supabase's `.not("status", "in", [...])`
 * syntax is verbose and easy to get wrong (the parenthesised list
 * matters). One helper, every caller right.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function excludeCancelled<T extends { not: (...args: any[]) => T }>(query: T): T {
  return query.not(
    "status",
    "in",
    `(${CANCELLED_LIKE_STATUSES.join(",")})`,
  );
}

/**
 * Restrict a query to only the active set. Mirror of excludeCancelled
 * but inclusive: use when you specifically want pipeline work, not
 * "anything that isn't cancelled" (which would include completed
 * orders too).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onlyActive<T extends { in: (...args: any[]) => T }>(query: T): T {
  return query.in("status", ACTIVE_ORDER_STATUSES as readonly string[] as string[]);
}

/**
 * Type-safe check: is this status terminal-cancel-like?
 * Used in TS code that's already loaded the order row.
 */
export function isCancelledLike(status: string | null | undefined): boolean {
  if (!status) return false;
  return (CANCELLED_LIKE_STATUSES as readonly string[]).includes(status.toLowerCase());
}

/**
 * Type-safe check: is this status terminal (any reason)?
 */
export function isTerminal(status: string | null | undefined): boolean {
  if (!status) return false;
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status.toLowerCase());
}

/**
 * Type-safe check: is this status active (live pipeline work)?
 */
export function isActive(status: string | null | undefined): boolean {
  if (!status) return false;
  return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status.toLowerCase());
}
