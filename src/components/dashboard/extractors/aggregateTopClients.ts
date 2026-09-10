/**
 * Tier 3 chart 1 - Top 10 clients by lifetime value.
 *
 * Walks the orders array and sums per client_id. Joins to the clients
 * lookup for names + outstanding_balance so the bar can split into
 * "paid so far" vs "still owed" segments. Returns the top 10.
 *
 * Pure function: takes orders + clients, returns the chart shape.
 */
import type { RevenueByMonthInput } from "./aggregateRevenueByMonth";
import { getOrderPaymentSummary } from "@/lib/paymentStatus";

export interface ClientLookupRow {
  id: string;
  client_name: string | null;
  email: string | null;
  outstanding_balance: number | null;
  created_at: string | null;
}

export interface OrderForClientLTV extends RevenueByMonthInput {
  client_id: string | null;
}

export interface TopClientRow {
  clientId: string;
  name: string;
  email: string | null;
  /** Sum of total_amount on all non-cancelled orders for this client. */
  lifetimeRevenue: number;
  /** Estimated paid so far - amount_paid sum, with deposit/balance/payment_status fall-through. */
  paid: number;
  /** Outstanding (lifetimeRevenue - paid), floored at 0. */
  outstanding: number;
  /** Number of orders contributing. */
  orderCount: number;
  /** Most recent event_date across this client's orders. */
  lastEventDate: string | null;
}

const collectedFromOrder = (o: OrderForClientLTV): number => {
  return getOrderPaymentSummary({
    totalAmount: o.total_amount,
    amountPaid: o.amount_paid,
    balanceAmount: o.balance_amount,
    depositAmount: o.deposit_amount,
    depositPaid: o.deposit_paid,
    paymentStatus: o.payment_status,
  }).amountPaid;
};

export function aggregateTopClients(
  orders: OrderForClientLTV[],
  clients: ClientLookupRow[],
  limit: number = 10,
): TopClientRow[] {
  // Build lookup by id for O(1) joins.
  const clientById = new Map<string, ClientLookupRow>();
  for (const c of clients) clientById.set(c.id, c);

  // Aggregate by client_id.
  const aggByClient = new Map<string, {
    revenue: number;
    paid: number;
    orderCount: number;
    lastEventDate: string | null;
  }>();

  for (const o of orders) {
    if (!o.client_id) continue;
    if (o.status === "cancelled") continue;
    const existing = aggByClient.get(o.client_id) ?? { revenue: 0, paid: 0, orderCount: 0, lastEventDate: null };
    existing.revenue += Number(o.total_amount || 0);
    existing.paid += collectedFromOrder(o);
    existing.orderCount += 1;
    if (o.event_date && (!existing.lastEventDate || o.event_date > existing.lastEventDate)) {
      existing.lastEventDate = o.event_date;
    }
    aggByClient.set(o.client_id, existing);
  }

  // Sort + slice.
  const rows: TopClientRow[] = [];
  for (const [clientId, agg] of aggByClient) {
    const lookup = clientById.get(clientId);
    rows.push({
      clientId,
      name: lookup?.client_name || "Unknown client",
      email: lookup?.email ?? null,
      lifetimeRevenue: agg.revenue,
      paid: Math.min(agg.paid, agg.revenue),
      outstanding: Math.max(0, agg.revenue - agg.paid),
      orderCount: agg.orderCount,
      lastEventDate: agg.lastEventDate,
    });
  }
  rows.sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue);
  return rows.slice(0, limit);
}
