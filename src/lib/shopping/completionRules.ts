export const SHOPPING_VARIANCE_THRESHOLD = 0.15;

export interface ShoppingCostVariance {
  estimated: number;
  actual: number;
  difference: number;
  percent: number;
  absPercent: number;
  direction: "over" | "under";
  shouldFlag: boolean;
}

export function parseMoneyInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getShoppingCostVariance(
  estimatedTotal: number | null | undefined,
  actualTotal: number | null | undefined,
): ShoppingCostVariance | null {
  const estimated = Number(estimatedTotal);
  const actual = Number(actualTotal);
  if (!Number.isFinite(estimated) || estimated <= 0) return null;
  if (!Number.isFinite(actual) || actual < 0) return null;

  const difference = actual - estimated;
  const percent = difference / estimated;
  const absPercent = Math.abs(percent);
  return {
    estimated,
    actual,
    difference,
    percent,
    absPercent,
    direction: difference >= 0 ? "over" : "under",
    shouldFlag: absPercent > SHOPPING_VARIANCE_THRESHOLD,
  };
}

export function formatShoppingVariance(variance: ShoppingCostVariance): string {
  return `${Math.round(variance.absPercent * 100)}% ${variance.direction}`;
}
