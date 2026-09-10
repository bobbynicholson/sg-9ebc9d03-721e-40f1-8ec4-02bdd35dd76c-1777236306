import { ShoppingCart, Calendar, Package, Clock, Truck } from "lucide-react";
import type { OrderStats } from "./types";

interface Props {
  stats: OrderStats;
}

/**
 * Compact pill strip at the top of /admin/orders showing total /
 * upcoming / in-progress counts (always visible) plus the two
 * action-signal counts (pending in amber, in-transit in blue) that
 * only render when non-zero.
 *
 * Wave 56 design-system collapse: this replaces the original six
 * gradient stat tiles that consumed the top third of the viewport.
 * Booked revenue + realised tiles were removed entirely per the
 * Skylight finance-visibility rule (staff don't see invoiced
 * amounts; that lives in director-only Cashflow / DashDog surfaces).
 *
 * Extracted from inline in src/pages/admin/orders.tsx (P2-13
 * orders Phase D1 split).
 */
export function OrderKpiPills({ stats }: Props) {
  const pending = stats.byStatus.pending || 0;
  const inTransit = stats.byStatus.in_transit || 0;

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
        <ShoppingCart className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        <span className="font-semibold text-slate-900">{stats.total}</span>
        <span className="text-slate-500">{stats.total === 1 ? "order" : "orders"}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
        <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        <span className="font-semibold text-slate-900">{stats.upcoming}</span>
        <span className="text-slate-500">upcoming</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
        <Package className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        <span className="font-semibold text-slate-900">{stats.inProgress}</span>
        <span className="text-slate-500">in progress</span>
      </span>
      {pending > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
          <Clock className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
          <span className="font-semibold">{pending}</span>
          <span>pending</span>
        </span>
      )}
      {inTransit > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">
          <Truck className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
          <span className="font-semibold">{inTransit}</span>
          <span>in transit</span>
        </span>
      )}
    </div>
  );
}
