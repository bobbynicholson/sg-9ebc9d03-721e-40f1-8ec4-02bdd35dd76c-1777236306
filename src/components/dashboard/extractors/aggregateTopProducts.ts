/**
 * Tier 5 chart 3 - Top products by revenue.
 *
 * Aggregates order_items into a top-N (default 10) ranking by line
 * total. Groups by menu_item_id where present so menu rename history
 * doesn't fragment the bar; falls back to item_name otherwise.
 *
 * Pure function. Wrapper hands in the order_items rows already filtered
 * to in-window orders. Items belonging to cancelled orders are excluded
 * (they don't represent realised revenue).
 */

export interface OrderItemForProducts {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string | null;
  quantity: number | string | null;
  line_total: number | string | null;
}

export interface TopProductRow {
  /** Stable ID across renders - menu_item_id when available. */
  key: string;
  label: string;
  totalRevenue: number;
  totalQuantity: number;
  /** How many distinct orders included this product. */
  orderCount: number;
  /** Share of the chart's total revenue (0..1). */
  share: number;
}

export interface TopProductsResult {
  rows: TopProductRow[];
  /** Sum of revenue across the top-N + the "Other" wedge. */
  totalRevenue: number;
  /** Total revenue across ALL eligible items (includes long tail beyond top-N). */
  grandTotal: number;
  totalDistinctItems: number;
}

const TOP_N = 10;

export function aggregateTopProducts(
  items: OrderItemForProducts[],
  excludedOrderIds: Set<string> = new Set(),
): TopProductsResult {
  const byKey = new Map<string, { label: string; rev: number; qty: number; orders: Set<string> }>();
  let grandTotal = 0;

  for (const it of items) {
    if (excludedOrderIds.has(it.order_id)) continue;
    const rev = Number(it.line_total) || 0;
    const qty = Number(it.quantity) || 0;
    if (rev <= 0 && qty <= 0) continue;

    const key = it.menu_item_id || `name:${(it.item_name || "Unnamed").trim().toLowerCase()}`;
    const label = (it.item_name || "Unnamed item").trim() || "Unnamed item";

    grandTotal += rev;

    const existing = byKey.get(key);
    if (existing) {
      existing.rev += rev;
      existing.qty += qty;
      existing.orders.add(it.order_id);
    } else {
      byKey.set(key, { label, rev, qty, orders: new Set([it.order_id]) });
    }
  }

  const ranked = Array.from(byKey.entries())
    .map(([key, v]) => ({ key, label: v.label, rev: v.rev, qty: v.qty, orders: v.orders.size }))
    .sort((a, b) => b.rev - a.rev);

  const totalDistinctItems = ranked.length;
  const top = ranked.slice(0, TOP_N);
  const tail = ranked.slice(TOP_N);

  // Total used for share-of-chart: top-N + "Other" if any.
  let totalRevenue = top.reduce((s, r) => s + r.rev, 0);
  if (tail.length > 0) {
    const otherRev = tail.reduce((s, r) => s + r.rev, 0);
    totalRevenue += otherRev;
  }

  const rows: TopProductRow[] = top.map((r) => ({
    key: r.key,
    label: r.label,
    totalRevenue: r.rev,
    totalQuantity: r.qty,
    orderCount: r.orders,
    share: totalRevenue > 0 ? r.rev / totalRevenue : 0,
  }));

  if (tail.length > 0) {
    const otherRev = tail.reduce((s, r) => s + r.rev, 0);
    const otherQty = tail.reduce((s, r) => s + r.qty, 0);
    const otherOrders = tail.reduce((s, r) => s + r.orders, 0);
    rows.push({
      key: "_other",
      label: `Other items (${tail.length})`,
      totalRevenue: otherRev,
      totalQuantity: otherQty,
      orderCount: otherOrders,
      share: totalRevenue > 0 ? otherRev / totalRevenue : 0,
    });
  }

  return { rows, totalRevenue, grandTotal, totalDistinctItems };
}
