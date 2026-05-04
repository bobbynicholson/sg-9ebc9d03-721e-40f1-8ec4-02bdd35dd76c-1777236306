/**
 * Tier 3 chart 3 -- New vs repeat revenue split (current period).
 *
 * Walks orders in the date range and classifies each contributing
 * client as either NEW (their first-ever order with this company falls
 * INSIDE the range) or REPEAT (they had at least one prior order).
 *
 * Returns total R + count + share for each bucket so the donut can
 * render in either revenue or order-count mode.
 *
 * Pure function: takes orders + range, returns the split.
 */
import type { OrderForClientLTV } from "./aggregateTopClients";

export interface NewVsRepeatBucket {
  revenue: number;
  orderCount: number;
  uniqueClients: number;
}

export interface NewVsRepeatResult {
  newClients: NewVsRepeatBucket;
  repeatClients: NewVsRepeatBucket;
  /** newClients.revenue / total -- for the donut percent label. NaN-safe. */
  newShare: number;
  totalRevenue: number;
  totalOrders: number;
}

export function aggregateNewVsRepeat(
  orders: OrderForClientLTV[],
  rangeStart: Date,
  rangeEnd: Date,
): NewVsRepeatResult {
  // Step 1: per-client first-ever order date (across all-time, not just
  // the range). This tells us whether a client is "new" within the
  // range or already had history before it.
  const firstOrderByClient = new Map<string, string>();
  for (const o of orders) {
    if (!o.client_id || !o.event_date) continue;
    if (o.status === "cancelled") continue;
    const existing = firstOrderByClient.get(o.client_id);
    if (!existing || o.event_date < existing) {
      firstOrderByClient.set(o.client_id, o.event_date);
    }
  }

  // Step 2: walk orders in the range, classify by their client's first
  // order. A new client is one whose first-ever order date is also
  // INSIDE this range.
  const inRange = (s: string): boolean => {
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return false;
    return dt >= rangeStart && dt <= rangeEnd;
  };

  const newBucket: NewVsRepeatBucket = { revenue: 0, orderCount: 0, uniqueClients: 0 };
  const repeatBucket: NewVsRepeatBucket = { revenue: 0, orderCount: 0, uniqueClients: 0 };
  const newClientIds = new Set<string>();
  const repeatClientIds = new Set<string>();

  for (const o of orders) {
    if (!o.client_id || !o.event_date) continue;
    if (o.status === "cancelled") continue;
    if (!inRange(o.event_date)) continue;
    const firstOrder = firstOrderByClient.get(o.client_id);
    if (!firstOrder) continue;
    const isNew = inRange(firstOrder);
    const v = Number(o.total_amount || 0);
    if (isNew) {
      newBucket.revenue += v;
      newBucket.orderCount += 1;
      newClientIds.add(o.client_id);
    } else {
      repeatBucket.revenue += v;
      repeatBucket.orderCount += 1;
      repeatClientIds.add(o.client_id);
    }
  }
  newBucket.uniqueClients = newClientIds.size;
  repeatBucket.uniqueClients = repeatClientIds.size;

  const totalRevenue = newBucket.revenue + repeatBucket.revenue;
  const totalOrders = newBucket.orderCount + repeatBucket.orderCount;
  const newShare = totalRevenue > 0 ? newBucket.revenue / totalRevenue : 0;

  return {
    newClients: newBucket,
    repeatClients: repeatBucket,
    newShare,
    totalRevenue,
    totalOrders,
  };
}
