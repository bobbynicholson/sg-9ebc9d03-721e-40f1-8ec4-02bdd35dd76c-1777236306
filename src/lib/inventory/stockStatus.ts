/**
 * One rule for "does this stock line need buying?" across the shopping
 * dashboard, buy list and sidebar.
 *
 * The minimum stock level is a reorder point: an item AT its minimum
 * needs buying, not only one below it. The inventory_demand_outlook view
 * marks below_minimum only when stock is strictly under the minimum, so
 * rows it reports as "ok" but that sit at the minimum are promoted here.
 */
export type OutlookStatus = "shortfall" | "below_minimum" | "low" | "ok";

export function isAtOrBelowMinimum(current: unknown, minimum: unknown): boolean {
  const min = Number(minimum || 0);
  return min > 0 && Number(current || 0) <= min;
}

/** Status to show for a demand-outlook row, applying the reorder-point rule. */
export function effectiveOutlookStatus(row: {
  status: OutlookStatus | string | null | undefined;
  current_stock?: unknown;
  minimum_stock?: unknown;
}): OutlookStatus {
  const status = (row.status || "ok") as OutlookStatus;
  if (status === "ok" && isAtOrBelowMinimum(row.current_stock, row.minimum_stock)) return "below_minimum";
  return status;
}
