/**
 * Tier 1 chart 1 - Monthly revenue trend (12-month rolling).
 *
 * Shape: 12 monthly buckets ending at the most recent full month
 * containing event_dates in the input. Each bucket has:
 *   - booked: sum of total_amount on orders that classify as
 *     booked or realised per orderRevenueClassification
 *   - collected: sum of paid amount (amount_paid OR fall-through to
 *     deposit_amount + balance_amount when paid flags set)
 *   - orderCount: confirmed bookings
 *
 * Pure function: no side effects, no DB access. Easy to unit-test.
 */
import { isBookedRevenue } from "@/lib/orderRevenueClassification";

export interface RevenueByMonthInput {
  id: string;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  deposit_paid: boolean | null;
  deposit_amount: number | null;
  balance_paid: boolean | null;
  balance_amount: number | null;
  event_date: string | null;
  /** TIGHTEN I.70: needed by isBookedRevenue to decide pipeline vs
   *  booked for an active-status order. */
  confirmed_at?: string | null;
  cancelled_at?: string | null;
}

export interface RevenueByMonthBucket {
  /** "2026-05" - safe sortable key */
  monthKey: string;
  /** "May 26" - short label for chart x-axis */
  label: string;
  booked: number;
  collected: number;
  orderCount: number;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const collectedFromOrder = (o: RevenueByMonthInput): number => {
  // Direct amount_paid is the most accurate signal - the cashflow ledger
  // sums payments here. Fall through to the deposit/balance flag pair
  // only when amount_paid is null (legacy orders pre-payment-ledger).
  if (typeof o.amount_paid === "number" && o.amount_paid > 0) {
    return o.amount_paid;
  }
  let sum = 0;
  if (o.deposit_paid && typeof o.deposit_amount === "number") sum += o.deposit_amount;
  if (o.balance_paid && typeof o.balance_amount === "number") sum += o.balance_amount;
  if (sum > 0) return sum;
  // Fully-paid status with no breakdown - treat total as collected.
  if (o.payment_status === "paid" && typeof o.total_amount === "number") {
    return o.total_amount;
  }
  return 0;
};

export function aggregateRevenueByMonth(
  orders: RevenueByMonthInput[],
  /** Anchor month - defaults to today. The 12 buckets end here. */
  endAt: Date = new Date(),
): RevenueByMonthBucket[] {
  // Pre-build the 12 month skeleton ending at endAt's month, oldest first.
  const buckets: Map<string, RevenueByMonthBucket> = new Map();
  const cursor = new Date(endAt.getFullYear(), endAt.getMonth(), 1);
  cursor.setMonth(cursor.getMonth() - 11);
  for (let i = 0; i < 12; i++) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = `${SHORT_MONTHS[m]} ${String(y).slice(-2)}`;
    buckets.set(monthKey, { monthKey, label, booked: 0, collected: 0, orderCount: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const o of orders) {
    if (!o.event_date) continue;
    // TIGHTEN I.70 (2026-06-01): use the canonical booked predicate.
    // Previously this widget counted "not cancelled" which silently
    // included pending orders - so the BI chart showed a bigger
    // number than the dashboard "Booked Revenue" tile for the same
    // window. Now both use isBookedRevenue.
    if (!isBookedRevenue(o)) continue;
    const monthKey = String(o.event_date).slice(0, 7);
    const bucket = buckets.get(monthKey);
    if (!bucket) continue;
    bucket.booked += Number(o.total_amount || 0);
    bucket.collected += collectedFromOrder(o);
    bucket.orderCount += 1;
  }

  return Array.from(buckets.values());
}
