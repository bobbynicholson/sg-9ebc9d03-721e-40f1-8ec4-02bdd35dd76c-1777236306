/**
 * How an order line converts into recipe batches. Mirrors the SQL in
 * public.order_ingredient_demand (migration 20260712130000) so the
 * shopping shortfall list, the chef's recipe dialog and the menu
 * editor's cost preview all agree.
 *
 * Two pricing models exist on menu_items:
 *  - per serving (default): quantity on the order line counts servings,
 *    so batches = quantity / base_servings ("12 desserts from a
 *    2-serving recipe = 6 batches").
 *  - sold_as_package: one order unit IS one full recipe batch ("1 x
 *    Lamb Spit (on-site) = 1 whole lamb + 1 sauce, whether 12 or 25
 *    guests eat from it"). Dividing by base_servings here produced the
 *    "need 0.04 unit" shortfall Callum reported (Pics 93/94).
 */
export function recipeBatchesForOrderLine(args: {
  orderQuantity: number;
  baseServings: number | null | undefined;
  soldAsPackage?: boolean | null;
}): number {
  const quantity = Number(args.orderQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (args.soldAsPackage) return quantity;
  const base = Number(args.baseServings);
  if (!Number.isFinite(base) || base <= 0) return quantity;
  return quantity / base;
}

/**
 * Cost basis for one sold unit of a menu item, given its recipe cost.
 * Per-serving items sell one serving per unit; package items sell the
 * whole batch per unit. Comparing base_price against the WRONG basis
 * made the recipe-preview margin disagree with the stored cost margin
 * (Callum Pics 95/96).
 */
export function recipeCostPerSoldUnit(args: {
  totalCost: number;
  costPerServing: number;
  soldAsPackage?: boolean | null;
}): number {
  return args.soldAsPackage ? args.totalCost : args.costPerServing;
}
