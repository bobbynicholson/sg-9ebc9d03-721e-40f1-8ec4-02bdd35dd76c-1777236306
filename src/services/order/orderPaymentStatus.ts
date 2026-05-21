/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase as browserSupabase } from "@/integrations/supabase/client";

/**
 * Single chokepoint for writes to `orders.payment_status`.
 *
 * Phase 2 audit (docs/money-flow.md) found two classes of bug:
 *   1. `updateOrderPaymentStatus` in orderFinancials.ts wrote the
 *      literal "unpaid" which is NOT a member of the `payment_status`
 *      enum. PostgreSQL would silently reject those writes via the
 *      enum cast and the order's payment_status would stay stuck at
 *      its previous value.
 *   2. `runAutoCancel.ts` wrote "refunded" / "partially_refunded"
 *      directly via `.from("orders").update(...)` without any guard,
 *      meaning a credit issued on a completely unpaid order would
 *      still flip payment_status to "refunded".
 *
 * This module is the single sanctioned writer. It validates the new
 * value against the canonical enum and enforces a transition
 * allowlist. Idempotent: writing the current value returns success
 * without touching the row.
 *
 * The function intentionally does NOT recompute totals - that's the
 * job of the caller (e.g. orderFinancials.recomputePaymentStatus).
 * This module is the gate; the caller picks the destination state.
 */

// Canonical members of the Postgres `payment_status` enum that we
// allow on `orders.payment_status`. The enum has more values (e.g.
// 'processing' is used on the `payments` table for in-flight gateway
// calls) but they make no sense on an order's overall payment state.
// If you need to support a new state, add it here AND to the
// allowed-transitions map below.
export const CANONICAL_ORDER_PAYMENT_STATUSES = new Set<string>([
  "pending",
  "partial",
  "paid",
  "refunded",
  "partially_refunded",
  "failed",
  "disputed",
]);

// Allowed forward transitions per source state. Empty array = terminal
// (only idempotent re-write back to itself is accepted). Bias toward
// permissive forward motion (any pending -> any active state) and
// strict backward motion (paid does NOT go back to pending without
// going via failed or refunded).
const ALLOWED_PAYMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:            ["partial", "paid", "failed", "refunded"],
  partial:            ["paid", "partial", "refunded", "partially_refunded", "failed", "disputed", "pending"],
  paid:               ["refunded", "partially_refunded", "disputed"],
  failed:             ["pending", "partial", "paid", "refunded"],
  refunded:           [],
  partially_refunded: ["refunded"],
  disputed:           ["paid", "refunded"],
};

export interface SetPaymentStatusOpts {
  /**
   * Free-text reason logged to audit_logs. Optional but strongly
   * encouraged on transitions to terminal states (refunded /
   * partially_refunded / disputed).
   */
  reason?: string;
  /**
   * Override the supabase client. Defaults to the browser anon
   * client; server callers should pass `getServiceSupabase()`.
   */
  client?: any;
  /**
   * User id to attribute the change to (audit_logs.user_id).
   */
  actorUserId?: string | null;
}

export interface SetPaymentStatusResult {
  success: boolean;
  /** True when the write was skipped because the row was already in newStatus. */
  idempotent?: boolean;
  /** When success=false, a human-readable reason. */
  error?: string;
}

export async function setOrderPaymentStatus(
  orderId: string,
  newStatus: string,
  opts: SetPaymentStatusOpts = {},
): Promise<SetPaymentStatusResult> {
  if (!orderId) return { success: false, error: "orderId required" };
  if (!CANONICAL_ORDER_PAYMENT_STATUSES.has(newStatus)) {
    return {
      success: false,
      error: `Invalid orders.payment_status value '${newStatus}'. Allowed: ${[...CANONICAL_ORDER_PAYMENT_STATUSES].join(", ")}.`,
    };
  }

  const client: any = opts.client || browserSupabase;

  const { data: current, error: readErr } = await client
    .from("orders")
    .select("id, company_id, payment_status, order_number")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readErr) {
    return { success: false, error: `Lookup failed: ${readErr.message}` };
  }
  if (!current) {
    return { success: false, error: "order_not_found" };
  }

  const currentStatus = String((current as any).payment_status || "pending");

  if (currentStatus === newStatus) {
    return { success: true, idempotent: true };
  }

  const allowed = ALLOWED_PAYMENT_STATUS_TRANSITIONS[currentStatus];
  if (allowed && !allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Invalid payment_status transition ${currentStatus} -> ${newStatus}. Allowed next steps: ${allowed.length ? allowed.join(", ") : "(terminal state)"}.`,
    };
  }

  const { error: updErr } = await client
    .from("orders")
    .update({ payment_status: newStatus as any, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (updErr) {
    return { success: false, error: updErr.message };
  }

  // Best-effort audit row. Never blocks the status change.
  try {
    await client.from("audit_logs").insert({
      company_id: (current as any).company_id || null,
      user_id: opts.actorUserId ?? null,
      action: `order_payment_status_${newStatus}`,
      entity_type: "order",
      entity_id: orderId,
      details: {
        order_number: (current as any).order_number || null,
        from_status: currentStatus,
        to_status: newStatus,
        reason: opts.reason || null,
      },
    });
  } catch (auditErr) {
    console.warn("[setOrderPaymentStatus] audit insert failed (non-blocking):", auditErr);
  }

  return { success: true };
}

/**
 * Map the loosely-computed paid-fraction labels used by the legacy
 * `updateOrderPaymentStatus` helper to canonical enum values.
 *
 * Wave 28.X audit: the old code wrote the literal "unpaid" which is
 * not in the enum - PostgreSQL silently rejected the cast and the
 * order's payment_status never advanced. The right canonical value
 * for "money expected but none received" is `pending` (the default
 * value on the column).
 */
export function deriveOrderPaymentStatus(
  totalPaid: number,
  totalAmount: number,
): "pending" | "partial" | "paid" {
  if (totalAmount > 0 && totalPaid >= totalAmount) return "paid";
  if (totalPaid > 0) return "partial";
  return "pending";
}
