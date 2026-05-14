/**
 * Wave 28.1 -- pure rules engine for client-initiated cancellations.
 *
 * Mirrors the SQL function get_refund_for_order so the client wizard
 * can render the same numbers the server will commit, with no DB
 * roundtrip per step. The server still re-runs the SQL function as
 * source of truth before any side effects -- this is advisory.
 *
 * Adds three things on top of the SQL output:
 *   1. creditAmount + creditPct (goodwill bonus to nudge cashflow).
 *   2. committedCostNote (what the team has already spent).
 *   3. freedSlotNote (what re-opens for the catering company).
 *
 * Bobby's brief: "every action needs a note before the action".
 * computeCancellationTerms is the source of those notes.
 */

import type {
  CancellationInput,
  CancellationPolicy,
  CancellationTerms,
  RefundTierLabel,
} from "./types";

const DEFAULT_POSTPONE_NOTICE_DAYS = 14;
const DEFAULT_LATE_OVERRIDE_DAYS = 3;
const DEFAULT_LEGACY_CANCEL_FEE_PCT = 25;
const DEFAULT_CREDIT_BONUS_PCT = 10;
const DEFAULT_REFUND_PROCESS_DAYS = 5;

/** Round to 2 decimals, banker's-style not required for currency display. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

const labelForPct = (pct: number): RefundTierLabel => {
  if (pct === 0) return "forfeit";
  if (pct < 50) return "partial";
  if (pct < 100) return "most";
  return "full";
};

const daysBetween = (eventISO: string, now: Date): number => {
  // Match SQL: GREATEST(0, (event_date - CURRENT_DATE)).
  // Use UTC midnight on both sides to avoid TZ skew.
  const event = new Date(`${eventISO.slice(0, 10)}T00:00:00Z`);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const ms = event.getTime() - today.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

const formatEventDateLabel = (iso: string): string => {
  // "14 May" style -- no year unless next year, no day-of-week.
  try {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    const nowYear = new Date().getUTCFullYear();
    const opts: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    };
    if (d.getUTCFullYear() !== nowYear) {
      opts.year = "numeric";
    }
    return d.toLocaleDateString("en-ZA", opts);
  } catch {
    return iso;
  }
};

/**
 * Walk the policy tiers (highest min_days first), pick the first one
 * the order still satisfies. Falls back to legacy cancellation_fee_percent
 * when no tiers configured -- matches SQL exactly.
 */
const pickRefundPctFromPolicy = (
  policy: CancellationPolicy,
  daysToEvent: number,
  legacyCancelFeePct: number,
  reasoning: string[],
): { refundPct: number; tierMatched: boolean; matchedLabel?: string } => {
  const tiers = Array.isArray(policy.deposit_refund_tiers)
    ? [...policy.deposit_refund_tiers]
    : [];

  if (tiers.length === 0) {
    const pct = Math.max(0, 100 - legacyCancelFeePct);
    reasoning.push(
      `No refund tiers configured -- falling back to legacy cancel-fee of ${legacyCancelFeePct}% (refund ${pct}%).`,
    );
    return { refundPct: pct, tierMatched: false };
  }

  // Sort descending by min_days_before_event so we match the most
  // generous tier the order still qualifies for.
  tiers.sort(
    (a, b) =>
      (b.min_days_before_event || 0) - (a.min_days_before_event || 0),
  );

  for (const tier of tiers) {
    const min = Number(tier.min_days_before_event ?? 0);
    if (daysToEvent >= min) {
      const pct = Number(tier.refund_pct ?? 0);
      reasoning.push(
        `Matched tier "${tier.label || `${min}+ days`}" -- refund ${pct}%.`,
      );
      return { refundPct: pct, tierMatched: true, matchedLabel: tier.label };
    }
  }

  reasoning.push(
    `Inside the tightest tier window -- forfeit (refund 0%).`,
  );
  return { refundPct: 0, tierMatched: true };
};

const buildWindowLabel = (
  daysToEvent: number,
  matchedLabel: string | undefined,
): string => {
  if (matchedLabel) return matchedLabel;
  if (daysToEvent === 0) return "Cancelling on the day of the event";
  if (daysToEvent === 1) return "Cancelling 1 day out";
  if (daysToEvent < 7) return `Less than a week out (${daysToEvent} days)`;
  if (daysToEvent < 14) return `Less than 2 weeks out (${daysToEvent} days)`;
  if (daysToEvent < 30) return `Less than a month out (${daysToEvent} days)`;
  return `More than a month out (${daysToEvent} days)`;
};

const buildCommittedCostNote = (input: CancellationInput): string | null => {
  const parts: string[] = [];
  if (input.shoppingDone) {
    parts.push("the team has already shopped for ingredients");
  }
  if (input.kitchenPrepStarted) {
    parts.push("kitchen prep has started");
  }
  if (parts.length === 0) return null;
  const joined =
    parts.length === 1 ? parts[0] : `${parts[0]} and ${parts[1]}`;
  return `Heads-up -- ${joined}. That spend is committed and won't be recovered, but the catering company will be notified so they can redistribute what's salvageable.`;
};

/**
 * Detect whether the order is too far down the supply chain to unwind
 * via self-service. Post-dispatch the wizard MUST block.
 */
const detectBlock = (
  input: CancellationInput,
): CancellationTerms["blocked"] => {
  const status = (input.status || "").toLowerCase();
  if (
    input.dispatched ||
    status === "out_for_delivery" ||
    status === "delivered" ||
    status === "in_transit"
  ) {
    return {
      reason:
        "This order is already on its way to the venue. Self-service cancellation isn't safe at this point -- please call the catering company directly.",
    };
  }
  if (status === "completed") {
    return {
      reason:
        "This order is already marked complete. There's nothing left to cancel.",
    };
  }
  if (status === "cancelled") {
    return {
      reason: "This order is already cancelled.",
    };
  }
  return null;
};

export function computeCancellationTerms(
  input: CancellationInput,
): CancellationTerms {
  const reasoning: string[] = [];
  const now = input.now ?? new Date();

  const policy = input.policy || {};
  const legacyCancelFeePct =
    typeof input.legacyCancelFeePct === "number"
      ? input.legacyCancelFeePct
      : DEFAULT_LEGACY_CANCEL_FEE_PCT;

  const postponeNotice =
    Number(policy.postponement_notice_days ?? DEFAULT_POSTPONE_NOTICE_DAYS);
  const lateOverrideDays = Number(
    policy.late_cancel_requires_owner_override_days ??
      DEFAULT_LATE_OVERRIDE_DAYS,
  );
  const creditBonusPct = Math.min(
    100,
    Math.max(
      0,
      Number(policy.credit_bonus_pct ?? DEFAULT_CREDIT_BONUS_PCT),
    ),
  );

  const daysToEvent = daysBetween(input.eventDate, now);
  reasoning.push(
    `${daysToEvent} day(s) until the event on ${formatEventDateLabel(input.eventDate)}.`,
  );

  const blocked = detectBlock(input);
  if (blocked) {
    reasoning.push(`Blocked: ${blocked.reason}`);
  }

  const { refundPct, matchedLabel } = pickRefundPctFromPolicy(
    policy,
    daysToEvent,
    legacyCancelFeePct,
    reasoning,
  );

  const creditPct = Math.min(100, refundPct + creditBonusPct);
  if (creditBonusPct > 0 && refundPct < 100) {
    reasoning.push(
      `Credit option includes a ${creditBonusPct}pp goodwill bonus -- ${creditPct}% as store credit vs ${refundPct}% as refund.`,
    );
  }

  // Match SQL: take the larger of deposit-paid or amount-paid as the
  // base. Protects against orders where amount_paid drifted from the
  // deposit row (e.g. balance also paid).
  const depositPaidAmount =
    input.depositPaid && input.depositAmount > 0 ? input.depositAmount : 0;
  const base = Math.max(depositPaidAmount, input.amountPaid || 0);

  const refundAmount = round2(base * (refundPct / 100));
  const creditAmount = round2(base * (creditPct / 100));
  const chargeAmount = round2(Math.max(0, base - refundAmount));

  if (base === 0) {
    reasoning.push(
      "Nothing has been paid yet -- no money is moving either way.",
    );
  }

  const committedCostNote = buildCommittedCostNote(input);
  if (committedCostNote) reasoning.push(committedCostNote);

  const freedSlotNote = `Cancelling will free the ${formatEventDateLabel(input.eventDate)} slot so the catering team can re-offer it.`;
  reasoning.push(freedSlotNote);

  const requiresOwnerOverride = daysToEvent < lateOverrideDays;
  const canPostpone = daysToEvent >= postponeNotice;

  if (requiresOwnerOverride) {
    reasoning.push(
      `Inside the ${lateOverrideDays}-day owner-override window -- this cancellation will be queued for review by the catering team rather than auto-processed.`,
    );
  }
  if (!canPostpone) {
    reasoning.push(
      `Less than ${postponeNotice} days notice -- postponement isn't available, only cancellation.`,
    );
  }

  return {
    windowLabel: buildWindowLabel(daysToEvent, matchedLabel),
    daysToEvent,
    refundPct,
    creditPct,
    refundAmount,
    creditAmount,
    chargeAmount,
    committedCostNote,
    freedSlotNote,
    blocked,
    reasoning,
    tierLabel: labelForPct(refundPct),
    requiresOwnerOverride,
    canPostpone,
  };
}
