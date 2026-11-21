import { getOrderPaymentSummary } from "@/lib/paymentStatus";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";
import { isBookedRevenue, isPipelineRevenue } from "@/lib/orderRevenueClassification";

/** Common gross order value used by finance reports (order total, VAT as priced). */
export function orderGrossValue(order: any): number {
  const value = Number(order?.total_amount);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Order revenue after the recorded tax amount (tax is collected for remittance, not sales income). */
export function orderRevenueExcludingTax(order: any): number {
  const gross = orderGrossValue(order);
  const taxValue = Number(order?.tax_amount);
  const tax = Number.isFinite(taxValue) ? Math.max(0, taxValue) : 0;
  return Math.max(0, gross - tax);
}

/** Net cash still attributed to this order after completed refunds. */
export function orderNetCollected(order: any): number {
  return getOrderPaymentSummary({
    totalAmount: order?.total_amount,
    amountPaid: order?.amount_paid,
    balanceAmount: order?.balance_amount,
    depositAmount: order?.deposit_amount,
    depositPaid: order?.deposit_paid,
    paymentStatus: order?.payment_status,
  }).amountPaid;
}

/** Returns menu COGS only when every positive-quantity item has a saved positive unit-cost snapshot. */
export function completeOrderMenuCogs(items: any[]): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  let total = 0;
  let hasLine = false;
  for (const item of items) {
    const quantity = Number(item?.quantity) || 0;
    if (quantity <= 0) continue;
    hasLine = true;
    const unitCost = Number(item?.unit_cost);
    if (!Number.isFinite(unitCost) || unitCost <= 0) return null;
    total += quantity * unitCost;
  }
  return hasLine ? total : null;
}

export function isReportableOrder(order: any): boolean {
  return !isAutomatedTestOrder(order);
}

/** Booked revenue = committed + realised order totals; excludes pipeline and cancelled orders. */
export function sumBookedRevenue(orders: any[]): number {
  return roundCents(orders.reduce(
    (sum, order) => sum + (isReportableOrder(order) && isBookedRevenue(order) ? orderGrossValue(order) : 0),
    0,
  ));
}

/** Cash held against the listed orders, including cancelled orders until their refund completes. */
export function sumNetCollected(orders: any[]): number {
  return roundCents(orders.reduce(
    (sum, order) => sum + (isReportableOrder(order) ? orderNetCollected(order) : 0),
    0,
  ));
}

/** Receivable against committed orders only; avoid using cash from another/cancelled order to offset it. */
export function sumBookedOutstanding(orders: any[]): number {
  return roundCents(orders.reduce((sum, order) => {
    if (!isReportableOrder(order) || !isBookedRevenue(order)) return sum;
    return sum + Math.max(0, orderGrossValue(order) - orderNetCollected(order));
  }, 0));
}

/** Future order value can include both the sales pipeline and booked work. */
export function sumPipelineOrderValue(orders: any[]): number {
  return roundCents(orders.reduce(
    (sum, order) => sum + (isReportableOrder(order) && isPipelineRevenue(order) ? orderGrossValue(order) : 0),
    0,
  ));
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
