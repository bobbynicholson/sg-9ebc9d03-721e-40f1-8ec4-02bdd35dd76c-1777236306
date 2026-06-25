/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, Calendar, Users, MapPin, ArrowRight, Eye, ChevronRight, MoreVertical,
} from "lucide-react";
import { deriveOrderIntelligence } from "@/lib/orderIntelligence";
import type { OrderAutoEmailSummary } from "@/lib/orderIntelligence";
import type { AppOrder } from "@/types/app";
import { STATUS_CONFIG } from "@/components/admin/orders/statusConfig";
import { formatDate } from "@/lib/formatters";
import { RegionBadge } from "@/components/admin/RegionBadge";
import { ClientLinkButton } from "@/components/admin/ClientLinkButton";
import { useTenantHref } from "@/lib/tenantUrl";

interface OrderCardProps {
  order: AppOrder;
  autoEmailMap: Map<string, OrderAutoEmailSummary>;
  currencySymbol: string;
  setSelectedOrder: (o: AppOrder | null) => void;
  setIsModalOpen: (open: boolean) => void;
}

function OrderCard({ order, autoEmailMap, currencySymbol, setSelectedOrder, setIsModalOpen }: OrderCardProps) {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const C = currencySymbol;
  const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  const eventDate = new Date(order.event_date);
  const isToday = eventDate.toDateString() === new Date().toDateString();
  const isPast = eventDate < new Date();

  // Derived intelligence + automation summary - the card surfaces
  // both so the catering team sees, at a glance, what's at risk.
  const intel = deriveOrderIntelligence(order);
  const auto = autoEmailMap.get((order as any).id) || { sent: 0, latest: null, postEventSent: false } as OrderAutoEmailSummary;
  // Wave 28.6: cancelled orders get a thicker red top strip + faint
  // wash so they're unmissable in the kanban / list. The left
  // border alone wasn't enough - a cancelled card sat among
  // confirmed ones and read as just another tone of red.
  const isCancelled = order.status === "cancelled";
  const ringClass = isCancelled
    ? "ring-2 ring-rose-400 bg-rose-50/40"
    : intel.tone === "urgent"
      ? "ring-2 ring-rose-300"
      : intel.bucket === "today"
        ? "ring-2 ring-blue-200"
        : "";

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer ${
        isCancelled ? "border-t-4 border-t-rose-500" : "border-l-4"
      } ${ringClass}`}
      style={
        isCancelled
          ? undefined
          : { borderLeftColor: config.dotColor.replace('bg-', '#') }
      }
      onClick={(e) => {
        // ODOC H.4: card click opens the unified order doc. The
        // kebab "Quick actions" button below still opens the modal
        // for power users who want side-panel ergonomics.
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, [role=button], [data-stop-row-nav=true]")) return;
        router.push(withSlug(`/order/${(order as any).id}?role=admin`));
      }}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 min-w-0">
                <h4 className="font-semibold text-slate-900 truncate">{order.client_name}</h4>
                <RegionBadge regionId={(order as any).region_id} />
              </div>
              <p className="text-sm text-slate-600 truncate" title={order.venue_address}>
                {order.venue_address}
              </p>
              {/* Quote backlink - Wave 27.1: routes to the polished
                  public /q/{public_token} client view (the same
                  branded surface the client sees) instead of the
                  bare /admin/quotes/{id} editor screen. Operator
                  gets a one-click window into "what does the client
                  actually see for this order". Falls back to the
                  admin editor when the linked quote has no
                  public_token (legacy quotes pre-token migration).
                  Opens in a new tab so the operator doesn't lose
                  their place in /admin/orders. */}
              {/* Wave 56 - "from quote" pill removed from kanban
                  OrderCard. Pre-Wave-56 it appeared on this card +
                  on the TimelineRow + in the modal - triplicate.
                  Kanban is a secondary view; the modal still
                  surfaces the cross-reference on click, and the
                  TimelineRow keeps its pill for default-view
                  scannability. Net: 3x -> 2x per order. */}
            </div>
            <Badge
              variant="outline"
              className={`${config.color} border flex-shrink-0 whitespace-nowrap`}
            >
              {config.label}
            </Badge>
          </div>

          {/* Suggested action, the headline intelligence row */}
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              intel.tone === "urgent"
                ? "text-rose-600"
                : intel.tone === "warm"
                  ? "text-amber-600"
                  : "text-slate-500"
            }`}
            title={intel.reason}
          >
            <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{intel.label}</span>
          </div>

          {/* Event Details */}
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span className={isToday ? "font-semibold text-blue-600" : ""}>
                {formatDate(eventDate)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{order.guest_count} guests</span>
            </div>
          </div>

          {/* Automation status strip, only renders when there is
              something to say. */}
          {(auto.sent > 0 || (intel.bucket === "done" && !auto.postEventSent)) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {auto.sent > 0 && (
                <span className="inline-flex items-center gap-1 text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded px-1.5 py-0.5">
                  {auto.sent} auto email{auto.sent === 1 ? "" : "s"} sent
                </span>
              )}
              {auto.postEventSent && (
                <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                  Review email sent
                </span>
              )}
              {intel.bucket === "done" && !auto.postEventSent && (
                <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  Review email pending
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="font-semibold text-slate-900">
              {C}{Number(order.total_amount || 0).toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <ClientLinkButton orderId={order.id} companyId={(order as any).company_id} compact />
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={(e) => {
                  // ODOC H.4: primary "View" now opens the unified
                  // order doc - canonical source of truth across
                  // every role. Modal moves to the kebab beside it.
                  e.stopPropagation();
                  router.push(withSlug(`/order/${(order as any).id}?role=admin`));
                }}
              >
                <Eye className="w-3 h-3" />
                View
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                title="Quick actions (side panel)"
                aria-label="Quick actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedOrder(order);
                  setIsModalOpen(true);
                }}
              >
                <MoreVertical className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface KanbanColumnProps {
  status: string;
  title: string;
  getOrdersByStatus: (status: string) => AppOrder[];
  autoEmailMap: Map<string, OrderAutoEmailSummary>;
  currencySymbol: string;
  setSelectedOrder: (o: AppOrder | null) => void;
  setIsModalOpen: (open: boolean) => void;
}

/**
 * Kanban-style column rendering all orders matching a status. The
 * OrderCard sibling (private to this file) is the single-order
 * tile rendered inside the column. Both extracted from inline in
 * src/pages/admin/orders.tsx (P2-13 Phase D3 remnant).
 */
export function KanbanColumn({
  status, title, getOrdersByStatus, autoEmailMap, currencySymbol,
  setSelectedOrder, setIsModalOpen,
}: KanbanColumnProps) {
  const C = currencySymbol;
  const ordersInStatus = getOrdersByStatus(status);
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  // Phase 17 #5: per-column revenue sum. Lets the operator see
  // both 'how many' and 'how much' in the column header without
  // opening each card.
  const columnRevenue = ordersInStatus.reduce(
    (acc, o) => acc + Number((o as any).total_amount || 0), 0,
  );

  return (
    <div className="flex flex-col w-[88vw] sm:w-[320px] sm:min-w-[320px] sm:max-w-[320px] flex-shrink-0">
      <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-3 h-3 rounded-full shrink-0 ${config.dotColor}`} />
          <h3 className="font-semibold text-slate-900 truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {columnRevenue > 0 && (
            <span className="text-[11px] tabular-nums font-semibold text-slate-600">
              {C}{(columnRevenue / 1000).toFixed(columnRevenue >= 100_000 ? 0 : 1)}k
            </span>
          )}
          <Badge variant="secondary" className="font-semibold">
            {ordersInStatus.length}
          </Badge>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-2">
        {ordersInStatus.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No orders</p>
          </div>
        ) : (
          ordersInStatus.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              autoEmailMap={autoEmailMap}
              currencySymbol={currencySymbol}
              setSelectedOrder={setSelectedOrder}
              setIsModalOpen={setIsModalOpen}
            />
          ))
        )}
      </div>
    </div>
  );
}
