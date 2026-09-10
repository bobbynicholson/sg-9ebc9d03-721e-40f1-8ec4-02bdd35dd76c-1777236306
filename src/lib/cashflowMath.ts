// Canonical Net-30 maths. Pre-CASH-C the three cashflow surfaces
// (financial-dashboard Current Cash Flow tile, financial-dashboard
// Financial Summary "Net Cash Flow (30d)" row, cashflow-dashboard
// summary) each ran their own slightly different subtraction. The
// tile included inventory, the summary row didn't, the cashflow page
// didn't have inventory at all. Operators flicking between pages
// saw three different "net" numbers for the same window.
//
// This helper is the single source of truth for the "current
// position after known 30-day obligations" snapshot. Inventory is
// included because the operator already sees it on the
// financial-dashboard tile and asked for the full cost picture - if
// a surface genuinely doesn't know inventory (e.g. cashflow page,
// which doesn't fetch 90d COGS), pass null and the helper ignores
// it without zeroing it.
//
// The CashflowForecastCard chart stays on its own formula because
// it's answering a different question: forward projection from the
// bank balance (cash_on_hand), not the receivables-minus-payables
// position. The two are deliberately not unified.

export interface CurrentCashPositionInputs {
  /** Cash already received against orders (sum of amount_paid on non-cancelled orders). */
  cashReceived: number;
  /** Wages owed for unpaid clock-in sessions. */
  wages: number;
  /** Recurring fixed costs (rent / software / vehicles) expanded across the next 30 days. */
  fixedCostsNext30: number;
  /** Unpaid supplier invoices due in the next 30 days. */
  supplierPayablesNext30: number;
  /**
   * 90-day inventory COGS, or null if the caller doesn't fetch it
   * (e.g. cashflow-dashboard). NOT zero - zero would falsely claim
   * "no inventory cost" instead of "we don't know".
   */
  inventoryCosts: number | null;
}

export interface CurrentCashPosition extends CurrentCashPositionInputs {
  /**
   * Received minus every known outflow. Inventory subtracted only
   * when present (null = unknown, not zero).
   */
  net: number;
  /** True when every input is zero / null - lets the UI render an empty-state instead of a wall of R0. */
  noActivity: boolean;
}

export function computeCurrentCashPosition(
  inputs: CurrentCashPositionInputs,
): CurrentCashPosition {
  const { cashReceived, wages, fixedCostsNext30, supplierPayablesNext30, inventoryCosts } = inputs;
  const inventory = inventoryCosts ?? 0;
  const net = cashReceived - wages - fixedCostsNext30 - supplierPayablesNext30 - inventory;
  const noActivity =
    cashReceived === 0 &&
    wages === 0 &&
    fixedCostsNext30 === 0 &&
    supplierPayablesNext30 === 0 &&
    (inventoryCosts ?? 0) === 0;
  return { ...inputs, net, noActivity };
}
