/**
 * Shared types for /admin/orders and its sub-components.
 * Extracted from src/pages/admin/orders.tsx in the P2-13 split
 * (Phase B). See docs/audits/p2-13-orders-split-plan.md.
 */

export interface OrderStats {
  total: number;
  byStatus: Record<string, number>;
  revenue: {
    /** Firm bookings: confirmed onwards. Excludes pending + cancelled. */
    booked: number;
    /** Already-delivered slice of the above - "money in the till". */
    realised: number;
    pending: number;
    paid: number;
  };
  upcoming: number;
  inProgress: number;
}
