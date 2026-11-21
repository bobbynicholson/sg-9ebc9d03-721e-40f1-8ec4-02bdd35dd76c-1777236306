import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";
import { orderNetCollected } from "@/lib/orderRevenueMath";
import { useTenantHref } from "@/lib/tenantUrl";

type MissingCostOrder = {
  id: string;
  order_number?: string | null;
  client_name?: string | null;
  event_date?: string | null;
  missingLineCount: number;
};

type Props = {
  orders: any[];
  missingCostOrders: MissingCostOrder[];
  fromDate: string;
  toDate: string;
  costAuditAvailable: boolean;
};

/** Explains why in-range orders are excluded from the gross-margin sample and links to each order. */
export function ProfitabilityOrderReview({
  orders,
  missingCostOrders,
  fromDate,
  toDate,
  costAuditAvailable,
}: Props) {
  const { withSlug } = useTenantHref();
  const missingCostById = new Map(missingCostOrders.map((order) => [order.id, order]));
  const grouped = new Map<string, { label: string; orders: Array<{ order: any; detail: string }> }>();

  for (const order of orders || []) {
    const eventDate = String(order?.event_date || "").slice(0, 10);
    if (!eventDate || eventDate < fromDate || eventDate > toDate) continue;

    let reason: string | null = null;
    let detail = "";
    if (isAutomatedTestOrder(order)) {
      reason = "Automated test orders";
      detail = "Test data is excluded from business metrics.";
    } else if (String(order?.status || "").toLowerCase() === "cancelled" || order?.cancelled_at) {
      reason = "Cancelled orders";
      detail = "Cancelled orders are excluded from realized gross margin.";
    } else {
      const status = String(order?.status || "").toLowerCase();
      if (status !== "delivered" && status !== "completed") {
        reason = "Not delivered or completed";
        detail = `Current status: ${status || "not set"}.`;
      } else if (orderNetCollected(order) <= 0) {
        reason = "No net payment held";
        detail = "No net payment remains recorded for this order.";
      } else {
        const missing = missingCostById.get(String(order.id));
        if (missing) {
          reason = "Missing menu cost snapshots";
          detail = missing.missingLineCount > 0
            ? `${missing.missingLineCount} menu line${missing.missingLineCount === 1 ? "" : "s"} need a saved cost.`
            : "No complete menu cost snapshot was found.";
        } else if (!costAuditAvailable) {
          reason = "Cost data could not be checked";
          detail = "Retry the dashboard load before relying on this order's margin status.";
        }
      }
    }

    if (!reason) continue;
    const bucket = grouped.get(reason) || { label: reason, orders: [] };
    bucket.orders.push({ order, detail });
    grouped.set(reason, bucket);
  }

  const totalExcluded = Array.from(grouped.values()).reduce((sum, group) => sum + group.orders.length, 0);
  if (totalExcluded === 0) return null;

  return (
    <details id="financial-excluded-orders" data-chat-section="admin.financial-dashboard.excluded-orders" data-chat-section-label="Orders excluded from gross margin" className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          Review excluded orders
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs tabular-nums">{totalExcluded}</span>
        </span>
        <span className="text-xs font-medium text-amber-800">Show reasons and orders</span>
      </summary>
      <p className="mt-2 text-xs text-amber-900">
        These orders fall inside the selected event-date range but are left out of gross margin for the reason shown.
      </p>
      <div className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
        {Array.from(grouped.values()).map((group) => (
          <section key={group.label} className="rounded-lg border border-amber-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {group.label} <span className="font-normal text-slate-500">({group.orders.length})</span>
            </h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {group.orders.map(({ order, detail }) => (
                <li key={order.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {order.order_number || "Order"} · {order.client_name || order.event_name || "Unnamed client"}
                    </p>
                    <p className="text-xs text-slate-500">{String(order.event_date || "").slice(0, 10)} · {detail}</p>
                  </div>
                  <Link
                    href={withSlug(`/admin/orders?orderId=${encodeURIComponent(order.id)}`)}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-brand-primary hover:bg-slate-50"
                  >
                    Open order <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
