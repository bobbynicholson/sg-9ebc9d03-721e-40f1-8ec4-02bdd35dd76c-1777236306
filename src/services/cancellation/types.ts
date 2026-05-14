/**
 * Wave 28.1 -- shared types for the cancellation flow.
 *
 * The PL/pgSQL function get_refund_for_order is the server-side source
 * of truth for refund maths. These types mirror its inputs/outputs so a
 * pure TS helper (computeCancellationTerms) can render the same numbers
 * client-side without a database roundtrip per wizard step.
 *
 * NEVER widen these types without also updating the SQL function in
 * supabase/migrations/20260514130000_get_refund_for_order_checkin.sql.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RefundTierLabel = "forfeit" | "partial" | "most" | "full";

/**
 * Stored on companies.cancellation_policy (jsonb). Editable through
 * Settings -> Cancellation policy. Falls back to companies.cancellation_fee_percent
 * when no tiers are configured -- matches the SQL fallback exactly.
 */
export interface CancellationPolicy {
  deposit_refund_tiers?: Array<{
    /** Inclusive lower bound: the tier matches when daysToEvent >= this value. */
    min_days_before_event: number;
    /** 0..100 */
    refund_pct: number;
    /** Optional human label, e.g. "Two weeks or more" */
    label?: string;
  }>;
  /** Days notice required to postpone (defaults to 14). */
  postponement_notice_days?: number;
  /**
   * Cancellations inside this window need owner override -- the wizard
   * does NOT auto-process them; they queue as cancellation_requests for
   * admin review. Defaults to 3.
   */
  late_cancel_requires_owner_override_days?: number;
  /** When true, force majeure cancellations can only postpone, never refund. */
  force_majeure_postponement_only?: boolean;
  /**
   * Goodwill bonus added on top of refund_pct when the client picks
   * store credit instead of refund. Defaults to 10 (so a 30% refund
   * tier becomes 40% credit). Capped at 100.
   */
  credit_bonus_pct?: number;
  /** Business days the refund takes to settle -- shown in copy. */
  refund_process_days?: number;
}

export interface CancellationInput {
  /** Sum of non-refund payments collected from the client. */
  amountPaid: number;
  /** orders.deposit_amount */
  depositAmount: number;
  /** orders.deposit_paid */
  depositPaid: boolean;
  /** ISO date or YYYY-MM-DD */
  eventDate: string;
  /** Current order/quote status (used to detect blocked dispatch path). */
  status: string;
  /** True when any kitchen_prep_tasks for the order is past 'pending'. */
  kitchenPrepStarted?: boolean;
  /** True when any inventory_transactions of type='usage' exist for the order. */
  shoppingDone?: boolean;
  /** True when order status is 'out_for_delivery' or 'delivered'. */
  dispatched?: boolean;
  /** Per-tenant policy. Use {} to fall back to defaults entirely. */
  policy: CancellationPolicy;
  /** Legacy companies.cancellation_fee_percent fallback (defaults to 25). */
  legacyCancelFeePct?: number;
  /** Override for testing. Defaults to new Date(). */
  now?: Date;
}

export interface CancellationTerms {
  /** Plain-English window the cancellation falls into, e.g. "Less than 7 days out". */
  windowLabel: string;
  daysToEvent: number;

  /** Refund percentage matched from policy tiers. */
  refundPct: number;
  /** Credit percentage = refundPct + credit_bonus_pct, capped at 100. */
  creditPct: number;

  /** Currency amount the client gets refunded if they pick refund. */
  refundAmount: number;
  /** Currency amount issued as credit if they pick credit (always >= refundAmount). */
  creditAmount: number;
  /** Currency amount the catering company keeps regardless of payout choice. */
  chargeAmount: number;

  /** Plain-English line if the team has already spent on this order. Null when none. */
  committedCostNote: string | null;
  /** Plain-English line for the freed slot, e.g. "Cancelling frees your 14 May lunch slot." */
  freedSlotNote: string;

  /**
   * When non-null, the wizard MUST block confirmation and direct the
   * client to call. Used for post-dispatch orders.
   */
  blocked: { reason: string } | null;

  /** Audit trail -- list of decisions made and why, in order. */
  reasoning: string[];

  tierLabel: RefundTierLabel;
  requiresOwnerOverride: boolean;
  canPostpone: boolean;
}
