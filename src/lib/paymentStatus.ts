/**
 * Canonical order-payment presentation helpers.
 *
 * Payment labels must be derived from money, not from the legacy
 * deposit_paid flag or a possibly stale payment_status projection:
 *   - paid >= order total => Paid in Full
 *   - paid > 0 and less than order total => Deposit Paid
 *   - no money received => Awaiting Payment
 *
 * All comparisons are made in cents so a floating-point remainder cannot
 * make a fully settled order appear partially paid.
 */

export type OrderPaymentState = "pending" | "partial" | "paid";

export interface OrderPaymentSummaryInput {
  totalAmount: number | string | null | undefined;
  amountPaid?: number | string | null;
  balanceAmount?: number | string | null;
  depositAmount?: number | string | null;
  depositPaid?: boolean | null;
  paymentStatus?: string | null;
}

function finiteMoney(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

export function deriveOrderPaymentState(
  totalAmount: number | string | null | undefined,
  amountPaid: number | string | null | undefined,
): OrderPaymentState {
  const total = finiteMoney(totalAmount) ?? 0;
  const paid = Math.max(0, finiteMoney(amountPaid) ?? 0);
  const totalCents = cents(total);
  const paidCents = cents(paid);

  if (totalCents > 0 && paidCents >= totalCents) return "paid";
  if (paidCents > 0) return "partial";
  return "pending";
}

/** Resolve a legacy row's paid amount without allowing a stale status to
 * override an explicit monetary value. */
export function resolveOrderAmountPaid(input: OrderPaymentSummaryInput): number {
  const total = Math.max(0, finiteMoney(input.totalAmount) ?? 0);
  const amountPaid = finiteMoney(input.amountPaid);
  if (amountPaid != null) return Math.max(0, amountPaid);

  const balance = finiteMoney(input.balanceAmount);
  if (balance != null) return Math.max(0, total - Math.max(0, balance));

  const deposit = finiteMoney(input.depositAmount);
  if (input.depositPaid && deposit != null && deposit > 0) return deposit;

  return 0;
}

export function getOrderPaymentSummary(input: OrderPaymentSummaryInput): {
  state: OrderPaymentState;
  amountPaid: number;
  balanceDue: number;
  label: "Awaiting Payment" | "Deposit Paid" | "Paid in Full";
} {
  const total = Math.max(0, finiteMoney(input.totalAmount) ?? 0);
  const amountPaid = resolveOrderAmountPaid(input);
  const state = deriveOrderPaymentState(total, amountPaid);
  const balanceDue = Math.max(0, total - amountPaid);

  return {
    state,
    amountPaid,
    balanceDue,
    label:
      state === "paid"
        ? "Paid in Full"
        : state === "partial"
          ? "Deposit Paid"
          : "Awaiting Payment",
  };
}
