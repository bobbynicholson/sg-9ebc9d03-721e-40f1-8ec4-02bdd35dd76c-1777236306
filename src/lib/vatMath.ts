/**
 * VAT helpers + per-tenant pricing convention.
 *
 * Two conventions a catering tenant can pick from:
 *
 *   ex-VAT mode (companies.pricing_includes_vat = false):
 *     Prices entered into menu items, equipment, inventory cost are
 *     stored as NET. Quote subtotal = sum of line totals = ex-VAT.
 *     VAT is added on top. Quote total = subtotal + VAT.
 *
 *   inc-VAT mode (companies.pricing_includes_vat = true):
 *     Prices entered are what the customer pays. Quote line totals
 *     sum to the GROSS total. VAT is derived by dividing back.
 *     Quote subtotal (ex-VAT) = gross / (1 + rate). VAT = gross - net.
 *
 * Why a per-tenant flag rather than picking one globally:
 *   - SA caterers overwhelmingly think inc-VAT (the customer-facing
 *     price). Defaulting to inc-VAT for new tenants is the right UX.
 *   - But flipping the convention on an existing tenant retroactively
 *     would change historical quote / invoice totals, which is an
 *     accounting integrity problem.
 *   - The flag default stays false (ex-VAT) so existing tenants are
 *     untouched. Tenants who flip it forward-only get inc-VAT math
 *     from that point.
 *
 * The flag is the single source of truth. Never branch on tenant
 * name, region, plan, etc. Always read it via getVatMode().
 */

export interface VatBreakdown {
  /** What the customer pays in total. */
  gross: number;
  /** Pre-VAT subtotal. */
  net: number;
  /** VAT amount. */
  vat: number;
  /** Effective VAT rate as a decimal (e.g. 0.15 for 15%). */
  rate: number;
  /** Tenant's pricing convention at compute time. */
  mode: "inc" | "ex";
}

/**
 * Compute VAT breakdown from a sum of line totals.
 *
 * In inc-VAT mode the lineSum IS the gross. In ex-VAT mode the
 * lineSum is the net and VAT is added on top.
 *
 * Always rounds to 2dp using banker-friendly (toFixed) rounding so
 * persisted numbers match the on-screen display. The three numbers
 * are guaranteed to satisfy net + vat === gross within 1 cent.
 */
export function breakdownFromLineSum(
  lineSum: number,
  rate: number,
  mode: "inc" | "ex",
): VatBreakdown {
  const safeSum = Number.isFinite(lineSum) ? lineSum : 0;
  const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;

  if (mode === "inc") {
    // Line totals already include VAT. Derive net by dividing.
    const gross = Number(safeSum.toFixed(2));
    const net = Number((gross / (1 + safeRate)).toFixed(2));
    const vat = Number((gross - net).toFixed(2));
    return { gross, net, vat, rate: safeRate, mode };
  }

  // ex-VAT mode: lineSum is the net, VAT goes on top.
  const net = Number(safeSum.toFixed(2));
  const vat = Number((net * safeRate).toFixed(2));
  const gross = Number((net + vat).toFixed(2));
  return { gross, net, vat, rate: safeRate, mode };
}

/**
 * Convert a single inc-VAT price to ex-VAT.
 * Used by the receipt scanner and by tenant migrations.
 */
export function toExVat(incPrice: number, rate: number): number {
  if (!incPrice || rate <= 0) return Number((incPrice || 0).toFixed(2));
  return Number((incPrice / (1 + rate)).toFixed(2));
}

/**
 * Convert a single ex-VAT price to inc-VAT.
 */
export function toIncVat(exPrice: number, rate: number): number {
  if (!exPrice || rate <= 0) return Number((exPrice || 0).toFixed(2));
  return Number((exPrice * (1 + rate)).toFixed(2));
}

/**
 * Label fragment for forms: "(inc VAT)" or "(ex VAT)". Pass to any
 * price input so the user knows what convention they're entering in.
 */
export function vatLabel(mode: "inc" | "ex"): string {
  return mode === "inc" ? "(inc VAT)" : "(ex VAT)";
}

/**
 * Compute the OPPOSITE-mode preview for a price input.
 * Use to display "R150.00 ex VAT = R172.50 inc VAT" below the field.
 */
export function previewOpposite(
  value: number,
  rate: number,
  mode: "inc" | "ex",
): { label: string; value: number } {
  if (mode === "inc") {
    return { label: "ex VAT", value: toExVat(value, rate) };
  }
  return { label: "inc VAT", value: toIncVat(value, rate) };
}
