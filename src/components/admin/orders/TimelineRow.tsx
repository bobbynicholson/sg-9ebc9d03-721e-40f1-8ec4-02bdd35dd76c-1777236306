/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar, Users, MapPin, ShoppingCart, Copy, Eye, ChevronRight,
  AlertCircle, Pause, FileText, MoreVertical,
} from "lucide-react";
import type { AppOrder } from "@/types/app";
import type { OrderTimeline } from "@/services/order/orderTimeline";
import type { OrderReadiness } from "@/services/order/orderReadiness";
import { STATUS_CONFIG } from "@/components/admin/orders/statusConfig";
import { TimelineTrack } from "@/components/admin/orders/TimelineTrack";
import { OrderReadinessChip } from "@/components/admin/orders/OrderReadinessChip";
import { OrderTimesStrip } from "@/components/admin/orders/OrderTimesStrip";
import { OutsourcedFulfilmentPanel } from "@/components/admin/orders/OutsourcedFulfilmentPanel";
import { AssignedShiftsPanel } from "@/components/admin/orders/AssignedShiftsPanel";
import { ClientLinkButton } from "@/components/admin/ClientLinkButton";
import { RegionBadge } from "@/components/admin/RegionBadge";
import { formatDate } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

interface Props {
  order: AppOrder;
  /** Set of order ids currently bulk-selected. */
  selectedIds: Set<string>;
  /** Pre-computed timeline per order (parent useMemo). */
  timelinesById: Map<string, OrderTimeline>;
  /** Pre-computed readiness per order (parent useMemo). */
  readinessById: Map<string, OrderReadiness>;
  /** Shifts assigned per order (parent state). */
  allShiftsByOrder: Map<string, any[]>;
  /** Staff profiles map for shift labels. */
  staffProfilesById: Map<string, any>;
  currencySymbol: string;
  companyId: string | null;
  loadOrders: () => Promise<void> | void;
  toggleSelected: (orderId: string) => void;
  setSelectedOrder: (o: AppOrder | null) => void;
  setIsModalOpen: (open: boolean) => void;
  withSlug: (href: string) => string;
}

/**
 * Single-row card on the /admin/orders timeline view. Renders the
 * order header + the TimelineTrack progress strip + readiness chip
 * + outsourced fulfilment panel + assigned shifts panel + bulk-
 * select checkbox.
 *
 * Extracted from inline in src/pages/admin/orders.tsx (P2-13
 * Phase D3 remnant).
 */
export function TimelineRow({
  order, selectedIds, timelinesById, readinessById, allShiftsByOrder,
  staffProfilesById, currencySymbol, companyId, loadOrders, toggleSelected,
  setSelectedOrder, setIsModalOpen, withSlug,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const C = currencySymbol;
  const eventDate = new Date(order.event_date);
  const isToday = eventDate.toDateString() === new Date().toDateString();
  const isPast = eventDate < new Date();
  // Wave 25: nextStage / getNextStage are no longer used here --
  // the new TimelineTrack surfaces the current + next stage inline
  // with full label + timestamp + click-through.
  const isSelected = selectedIds.has((order as any).id);
  // Wave 25.1 polish: row-level signal for blocked orders. The
  // operator scanning the list should spot a blocked card from
  // 6 ft away without having to read the timeline. A 4px red left
  // border + faint red wash on the card gives the unmistakable
  // "this needs attention" cue, mirroring the red dot inside the
  // timeline. Healthy orders keep their default styling.
  const tl = timelinesById.get((order as any).id);
  const isBlocked = !!tl?.blocked;
  // Wave 28.6: cancelled rows get a thicker red top strip + wash
  // so they're visually unmistakable in the timeline view too.
  const isCancelled = order.status === "cancelled";

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer ${
        isSelected ? "ring-2 ring-blue-400" : ""
      } ${
        isCancelled
          ? "border-t-4 border-t-rose-500 bg-rose-50/40"
          : isBlocked
            ? "border-l-4 border-l-red-500 bg-red-50/30"
            : ""
      }`}
      onClick={(e) => {
        // ODOC H.4: row click now opens the unified order doc -
        // the canonical operational source of truth. Modal stays
        // accessible via the kebab icon below for power users
        // who still want side-panel ergonomics.
        const target = e.target as HTMLElement;
        // Don't navigate if the click hit something interactive
        // that already handled it (buttons, links, checkboxes).
        if (target.closest("button, a, input, [role=button], [data-stop-row-nav=true]")) return;
        router.push(withSlug(`/order/${(order as any).id}?role=admin`));
      }}
    >
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Order Header */}
          <div className="flex items-start justify-between gap-3">
            {/* Phase 7 #6: bulk-select checkbox. Click stops
                propagation so we don't open the details modal. */}
            <div
              className="pt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelected((order as any).id)}
                aria-label={`Select order ${(order as any).order_number || order.client_name}`}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h4 className="font-semibold text-slate-900 text-lg">{order.client_name}</h4>
                {(order as any).order_number && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      // Phase 20 #10: row-level click-to-copy.
                      // Same UX as Phase 20 #8 in the drawer but
                      // without having to open the drawer first --
                      // useful when triaging a long list.
                      e.stopPropagation();
                      const num = String((order as any).order_number);
                      try {
                        await navigator.clipboard.writeText(num);
                        toast({ title: "Copied", description: `${num} on clipboard.` });
                      } catch {
                        toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-200 hover:text-slate-900 transition"
                    title="Copy order number"
                  >
                    <Copy className="w-3 h-3" />
                    {(order as any).order_number}
                  </button>
                )}
                <RegionBadge regionId={(order as any).region_id} />
                {isToday && (
                  <Badge className="bg-blue-500">Today</Badge>
                )}
                {isPast && order.status !== "completed" && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Overdue
                  </Badge>
                )}
                {/* Wave 54.5 - paused + cancelled visible at row
                    level. Pre-Wave-54 the operator could only learn
                    "this order is paused" by opening the modal,
                    meaning paused orders blended into the live
                    stream and operators chased deposits on orders
                    they paused themselves. Cancelled orders were
                    excluded from default views and unreachable
                    from this page entirely. */}
                {order.status === "paused" && (
                  <Badge className="bg-slate-400 text-white gap-1">
                    <Pause className="w-3 h-3" />
                    Paused
                  </Badge>
                )}
                {order.status === "cancelled" && (
                  <Badge variant="outline" className="text-slate-500 border-slate-300 gap-1">
                    Cancelled
                  </Badge>
                )}
                {(order as any).quote_id && (() => {
                  // Wave 27.1: routes to /q/{public_token} - the
                  // polished client view - instead of the admin
                  // editor screen.
                  const tok = (order as any).quote?.public_token;
                  const href = tok ? `/q/${tok}` : withSlug(`/admin/quotes/${(order as any).quote_id}`);
                  return (
                    <Link
                      href={href}
                      target={tok ? "_blank" : undefined}
                      rel={tok ? "noopener noreferrer" : undefined}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100"
                      title={tok ? "Open the polished client view of this quote" : "Open the quote this order was built from"}
                    >
                      <FileText className="w-3 h-3" />
                      from quote
                    </Link>
                  );
                })()}
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(eventDate)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span className="truncate max-w-xs">{order.venue_address}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{order.guest_count} guests</span>
                </div>
                {/* Wave 53 - drop the misleading dollar icon (was
                    rendering "$" in front of ZAR / GBP / EUR
                    amounts). Currency code lives in the C prefix
                    already. Force 2 dp so 9223.5 renders as
                    9 223.50, matching how every invoice line
                    reads. */}
                <div className="flex items-center gap-1 font-semibold text-slate-900">
                  <span>
                    {C}{Number(order.total_amount || 0).toLocaleString("en-ZA", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {/* Wave 70.9 - day-of-event times strip. Slots
                    into the previously-empty space to the right
                    of the price. Renders nothing when the order
                    has no timing data at all. */}
                <OrderTimesStrip
                  event_time={(order as any).event_time}
                  pickup_time={(order as any).pickup_time}
                  setup_time={(order as any).setup_time}
                  delivery_time={(order as any).delivery_time}
                  className="ml-auto"
                />
              </div>
            </div>
          </div>

          {/* Wave 25: replaces the legacy 7-dot WORKFLOW_STAGES row
              with the 22-stage / 5-cluster TimelineTrack derived
              from the batch-fetched related rows. Falls back to a
              compact loading placeholder when the timeline batch
              fetch hasn't returned yet for this order (rare - the
              batch fires immediately after the orders list loads).
              The legacy nextStage label above is no longer needed
              because the TimelineTrack surfaces the current stage
              inline with richer detail. */}
          {/* Wave 46 T2 - readiness chip ABOVE the timeline.
              Headline + subhead = the operator's TLDR; expand
              chevron drops the per-signal breakdown with deep
              links. The chip is the source of truth for "what's
              missing"; the timeline below remains the source of
              truth for "where we are in the pipeline". */}
          {(() => {
            const r = readinessById.get((order as any).id);
            if (!r) return null;
            return (
              <OrderReadinessChip
                readiness={r}
                orderId={(order as any).id}
                eventDate={(order as any).event_date || null}
                eventTime={(order as any).event_time || null}
                status={(order as any).status || null}
                canShowCloseOut={true}
                onActionComplete={() => { void loadOrders(); }}
                // Wave 70.93: list context - disable per-row auto-
                // heal POST. The order modal still renders this chip
                // WITHOUT the disable flag, so heal still fires when
                // the operator actually opens an order.
                disableAutoHeal
              />
            );
          })()}
          {(() => {
            const tl = timelinesById.get((order as any).id);
            if (!tl) {
              return (
                <div className="text-xs text-slate-400 italic">
                  Loading timeline...
                </div>
              );
            }
            return <TimelineTrack timeline={tl} hideOperatorBanner />;
          })()}

          {/* Wave 43 T1: surface every kitchen_shifts row linked
              to this order via order_id. Wave 41 Phase 4 added
              the column but nothing read it. Self-hides when no
              shifts are assigned. */}
          {((order as any).company_id) && (
            <AssignedShiftsPanel
              orderId={(order as any).id}
              companyId={(order as any).company_id}
              preloadedShifts={allShiftsByOrder.get((order as any).id) || []}
              preloadedProfiles={staffProfilesById}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
