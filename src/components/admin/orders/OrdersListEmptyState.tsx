import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

interface Props {
  searchTerm: string;
  statusFilter: string;
  dateFilter: string;
  myOrdersOnly: boolean;
  onClearAll: () => void;
}

/**
 * Empty-state card shown on /admin/orders when the active filter
 * set returns zero rows. Names the filters that are currently
 * narrowing the view + offers a one-click clear so the operator
 * stops guessing which filter is hiding the rows (Wave 55).
 *
 * Pure - reads filter state via props, fires a single onClearAll
 * callback. No closure dependency on the parent.
 *
 * Extracted from inline in src/pages/admin/orders.tsx (P2-13
 * orders Phase D3 partial split).
 */
export function OrdersListEmptyState({
  searchTerm,
  statusFilter,
  dateFilter,
  myOrdersOnly,
  onClearAll,
}: Props) {
  const active: string[] = [];
  if (searchTerm) active.push(`search "${searchTerm}"`);
  if (statusFilter !== "all") active.push(`status: ${statusFilter.replace(/_/g, " ")}`);
  if (dateFilter !== "all") active.push(`date: ${dateFilter.replace(/_/g, " ")}`);
  if (myOrdersOnly) active.push("mine only");

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="py-24">
        <div className="text-center text-slate-400">
          <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium text-slate-500">No orders match these filters</p>
          {active.length === 0 ? (
            <p className="text-sm mt-1">No orders in this view yet.</p>
          ) : (
            <>
              <p className="text-sm mt-1 text-slate-600">
                Filtered by {active.join(", ")}.
              </p>
              <button
                type="button"
                onClick={onClearAll}
                className="mt-3 text-xs font-semibold text-blue-700 hover:text-blue-900 underline"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
