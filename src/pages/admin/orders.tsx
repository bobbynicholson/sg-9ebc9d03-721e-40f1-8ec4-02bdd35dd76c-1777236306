import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ShoppingCart,
  Calendar,
  TrendingUp,
  Users,
  DollarSign,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  ChevronRight,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  MapPin,
  AlertCircle,
  LayoutGrid,
  List,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  X,
  FileText,
  Receipt,
  Pause,
  Play,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { CancelOrderDialog } from "@/components/admin/orders/CancelOrderDialog";
import { PauseOrderDialog } from "@/components/admin/orders/PauseOrderDialog";
import { AmendmentReviewDrawer, CancellationReviewDrawer } from "@/components/admin/orders/AmendmentReviewDrawer";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import { orderService } from "@/services/orderService";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveOrderIntelligence,
  summariseAutoEmailsByOrder,
  type OrderAutoEmailSummary,
} from "@/lib/orderIntelligence";
import type { AppOrder, MenuItem, EquipmentItem } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { RegionBadge } from "@/components/admin/RegionBadge";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { ClientLinkButton } from "@/components/admin/ClientLinkButton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AmendmentsTab } from "@/components/admin/AmendmentsTab";
import { CancellationRequestsTab } from "@/components/admin/CancellationRequestsTab";
import { EquipmentTypeahead, type EquipmentPick } from "@/components/admin/EquipmentTypeahead";
import { MenuItemTypeahead, type MenuItemPick } from "@/components/admin/MenuItemTypeahead";
import { syncOrderArtifacts } from "@/services/order/orderSyncService";

interface OrderStats {
  total: number;
  byStatus: Record<string, number>;
  revenue: {
    /** Firm bookings: confirmed onwards. Excludes pending + cancelled. */
    booked: number;
    /** Already-delivered slice of the above -- "money in the till". */
    realised: number;
    pending: number;
    paid: number;
  };
  upcoming: number;
  inProgress: number;
}

const STATUS_CONFIG = {
  pending: { 
    label: "Pending", 
    icon: Clock, 
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    dotColor: "bg-yellow-500"
  },
  confirmed: { 
    label: "Confirmed", 
    icon: CheckCircle2, 
    color: "bg-blue-100 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500"
  },
  preparing: { 
    label: "In Prep", 
    icon: Package, 
    color: "bg-purple-100 text-purple-800 border-purple-200",
    dotColor: "bg-purple-500"
  },
  ready: { 
    label: "Ready", 
    icon: CheckCircle2, 
    color: "bg-green-100 text-green-800 border-green-200",
    dotColor: "bg-green-500"
  },
  in_transit: { 
    label: "In Transit", 
    icon: Truck, 
    color: "bg-indigo-100 text-indigo-800 border-indigo-200",
    dotColor: "bg-indigo-500"
  },
  delivered: { 
    label: "Delivered", 
    icon: MapPin, 
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dotColor: "bg-emerald-500"
  },
  completed: { 
    label: "Completed", 
    icon: CheckCircle2, 
    color: "bg-slate-100 text-slate-800 border-slate-200",
    dotColor: "bg-slate-500"
  },
  cancelled: { 
    label: "Cancelled", 
    icon: AlertCircle, 
    color: "bg-red-100 text-red-800 border-red-200",
    dotColor: "bg-red-500"
  },
};

// Workflow stages for timeline view
const WORKFLOW_STAGES = [
  { key: "pending", label: "Pending", order: 0 },
  { key: "confirmed", label: "Confirmed", order: 1 },
  { key: "preparing", label: "In Prep", order: 2 },
  { key: "ready", label: "Ready", order: 3 },
  { key: "in_transit", label: "In Transit", order: 4 },
  { key: "delivered", label: "Delivered", order: 5 },
  { key: "completed", label: "Completed", order: 6 },
];

// Get stage status (completed, current, critical, upcoming)
const getStageStatus = (order: AppOrder, stageKey: string): "completed" | "current" | "critical" | "upcoming" => {
  const currentStageOrder = WORKFLOW_STAGES.find(s => s.key === order.status)?.order ?? 0;
  const thisStageOrder = WORKFLOW_STAGES.find(s => s.key === stageKey)?.order ?? 0;
  
  if (thisStageOrder < currentStageOrder) {
    return "completed";
  } else if (thisStageOrder === currentStageOrder) {
    // Check if critical (event date is today or past and not completed)
    const eventDate = new Date(order.event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (eventDate <= today && order.status !== "completed" && order.status !== "cancelled") {
      return "critical";
    }
    return "current";
  }
  return "upcoming";
};

// Get next stage
const getNextStage = (order: AppOrder): string | null => {
  const currentStageOrder = WORKFLOW_STAGES.find(s => s.key === order.status)?.order ?? 0;
  const nextStage = WORKFLOW_STAGES.find(s => s.order === currentStageOrder + 1);
  return nextStage ? nextStage.label : null;
};

function OrderProcessDashboard() {
  const { user } = useAuth();
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  // Per-order summary of email_automation_log entries: count of sent
  // automations, latest event, and a "post-event review automation
  // already fired" flag. Surfaced on each OrderCard so the team sees
  // which automations have / haven't gone out.
  const [autoEmailMap, setAutoEmailMap] = useState<Map<string, OrderAutoEmailSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  // Custom-range pickers -- only used when dateFilter === "custom".
  // Stored as YYYY-MM-DD so they round-trip through <input type="date" />.
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("kanban");
  const [selectedOrder, setSelectedOrder] = useState<AppOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pauseDialogOrderId, setPauseDialogOrderId] = useState<string | null>(null);
  // Amendment / cancellation review drawer state. Driven entirely off
  // the URL: when /admin/orders is loaded with ?amendment=... (or
  // ?cancellation=...) plus an ?orderId=..., the matching drawer opens
  // and stays in sync with the query string. Closing the drawer strips
  // both params so a refresh doesn't re-open it.
  const [reviewDrawer, setReviewDrawer] = useState<{
    kind: "amendment" | "cancellation" | null;
    requestId: string | null;
    orderId: string | null;
  }>({ kind: null, requestId: null, orderId: null });
  const [stats, setStats] = useState<OrderStats>({
    total: 0,
    byStatus: {},
    revenue: { booked: 0, realised: 0, pending: 0, paid: 0 },
    upcoming: 0,
    inProgress: 0,
  });

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  // Sync drawer state with the URL query params. Notification links
  // land here as /admin/orders?orderId=...&amendment=... (or
  // &cancellation=...) so the operator sees the request inline rather
  // than a generic kanban with no context.
  useEffect(() => {
    if (!router.isReady) return;
    const orderId = typeof router.query.orderId === "string" ? router.query.orderId : null;
    const amendment = typeof router.query.amendment === "string" ? router.query.amendment : null;
    const cancellation = typeof router.query.cancellation === "string" ? router.query.cancellation : null;
    if (amendment) {
      setReviewDrawer({ kind: "amendment", requestId: amendment, orderId });
    } else if (cancellation) {
      setReviewDrawer({ kind: "cancellation", requestId: cancellation, orderId });
    } else {
      setReviewDrawer({ kind: null, requestId: null, orderId: null });
    }
  }, [router.isReady, router.query.orderId, router.query.amendment, router.query.cancellation]);

  const closeReviewDrawer = () => {
    setReviewDrawer({ kind: null, requestId: null, orderId: null });
    // Strip the review params from the URL so a refresh doesn't
    // re-open the drawer, but keep any unrelated params intact.
    if (router.isReady) {
      const { orderId: _o, amendment: _a, cancellation: _c, ...rest } = router.query;
      router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true },
      );
    }
  };

  const openOrderDetail = (orderId: string) => {
    const found = orders.find((o) => o.id === orderId);
    if (found) {
      setSelectedOrder(found);
      setIsModalOpen(true);
      closeReviewDrawer();
    } else {
      toast({
        title: "Order not in current view",
        description: "Adjust your filters and try again.",
      });
    }
  };

  // Stats follow the filters -- revenue / counts always reflect what's
  // visible on the page so "This Month" actually means this month.
  useEffect(() => {
    calculateStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, dateFilter, dateFrom, dateTo, statusFilter, searchTerm]);

  const loadOrders = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const allOrders = await orderService.getAllOrders(user.company_id);
      setOrders(allOrders as unknown as AppOrder[]);

      // Pull email_automation_log rows for these orders so the cards
      // can surface "post-event review sent / queued / not yet"
      // without a per-card extra round trip.
      try {
        const orderIds = allOrders.map((o: any) => o.id);
        if (orderIds.length > 0) {
          const { data: logs } = await supabase
            .from("email_automation_log")
            .select("order_id, template_type, status, sent_at")
            .in("order_id", orderIds);
          setAutoEmailMap(summariseAutoEmailsByOrder(logs || []));
        } else {
          setAutoEmailMap(new Map());
        }
      } catch (err) {
        // Non-fatal -- the cards still render without automation
        // status, just without the extra chips.
        console.warn("[orders] email_automation_log fetch failed", err);
      }
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const byStatus: Record<string, number> = {};
    let bookedRevenue = 0;
    let realisedRevenue = 0;
    let pendingRevenue = 0;
    let paidRevenue = 0;
    let upcoming = 0;
    let inProgress = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Booked revenue is gated on actual confirmation, not on status
    // advancing past pending. An order counts as booked when either:
    //   * deposit_paid = true   (client paid the deposit), OR
    //   * confirmed_at != null  (admin manually marked it confirmed)
    // Cancelled orders are always excluded.
    //
    // Status-based filtering would over-count in messy data (an admin
    // could push status to 'preparing' without recording a deposit).
    // The explicit columns are the source of truth for "client has
    // committed to this booking".
    const REALISED_STATUSES = new Set(["delivered", "completed"]);
    const isConfirmedOrder = (o: any) =>
      o.status !== "cancelled" &&
      (o.deposit_paid === true || !!o.confirmed_at);

    const visible = getFilteredOrders();

    visible.forEach((order) => {
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;

      const orderTotal = Number(order.total_amount) || 0;

      if (isConfirmedOrder(order)) {
        bookedRevenue += orderTotal;
        if (REALISED_STATUSES.has(order.status)) {
          realisedRevenue += orderTotal;
        }
        if (order.payment_status === "paid") paidRevenue += orderTotal;
        else pendingRevenue += orderTotal;
      }

      const eventDate = new Date(order.event_date);
      if (eventDate >= today && !["completed", "cancelled"].includes(order.status)) {
        upcoming++;
      }
      if (["confirmed", "preparing", "ready", "in_transit", "delivered"].includes(order.status)) {
        inProgress++;
      }
    });

    setStats({
      total: visible.length,
      byStatus,
      revenue: {
        booked: bookedRevenue,
        realised: realisedRevenue,
        pending: pendingRevenue,
        paid: paidRevenue,
      },
      upcoming,
      inProgress,
    });
  };

  // Apply non-search filters (status + date window) first so the fuzzy
  // matcher only ranks the orders the user has narrowed to. Memoised so the
  // fuzzy hook doesn't get a fresh array on every render.
  const statusDateFilteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Global region filter -- when an operator scopes to one branch
      // in the top-bar dropdown, hide rows from other branches.
      // region_id IS NULL rows (legacy / company-wide) stay visible
      // so they can be triaged.
      if (regionFilterId && (order as any).region_id && (order as any).region_id !== regionFilterId) {
        return false;
      }
      // Hide cancelled by default ("All Statuses" excludes them).
      // Only surface cancelled when the operator explicitly picks
      // "cancelled" in the status dropdown -- otherwise they'd
      // clutter the kanban + timeline forever.
      if (statusFilter === "all" && order.status === "cancelled") return false;
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      // Date filter -- preset windows on the order's event_date
      let matchesDate = true;
      if (dateFilter !== "all") {
        const eventDate = new Date(order.event_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === "today") {
          matchesDate = eventDate.toDateString() === today.toDateString();
        } else if (dateFilter === "week") {
          // This calendar week (Mon-Sun)
          const day = today.getDay() === 0 ? 7 : today.getDay();
          const monday = new Date(today);
          monday.setDate(today.getDate() - (day - 1));
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);
          matchesDate = eventDate >= monday && eventDate <= sunday;
        } else if (dateFilter === "month") {
          // This calendar month (1st through last)
          const first = new Date(today.getFullYear(), today.getMonth(), 1);
          const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          last.setHours(23, 59, 59, 999);
          matchesDate = eventDate >= first && eventDate <= last;
        } else if (dateFilter === "next30") {
          const thirty = new Date(today);
          thirty.setDate(today.getDate() + 30);
          matchesDate = eventDate >= today && eventDate <= thirty;
        } else if (dateFilter === "past") {
          matchesDate = eventDate < today;
        } else if (dateFilter === "custom") {
          // Custom range picker. Either bound is optional -- pick a
          // single date by setting just one. event_date is a date col
          // so we compare in local-day terms (no UTC drift).
          let withinFrom = true;
          let withinTo = true;
          if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            withinFrom = eventDate >= from;
          }
          if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            withinTo = eventDate <= to;
          }
          matchesDate = withinFrom && withinTo;
        }
      }

      return matchesStatus && matchesDate;
    });
  }, [orders, statusFilter, dateFilter, dateFrom, dateTo, regionFilterId]);

  // Smart fuzzy search across client name, order id, venue and event name.
  // client name is weighted highest because that's what staff almost always
  // type to find an order.
  const fuzzyOrders = useFuzzyItems(
    statusDateFilteredOrders,
    searchTerm,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "id" as any, weight: 2 },
      { key: "venue_address" as any, weight: 1 },
      { key: "event_name" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const getFilteredOrders = () => fuzzyOrders;

  const getOrdersByStatus = (status: string) => {
    return getFilteredOrders().filter((order) => order.status === status);
  };

  const OrderCard = ({ order }: { order: AppOrder }) => {
    const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    const eventDate = new Date(order.event_date);
    const isToday = eventDate.toDateString() === new Date().toDateString();
    const isPast = eventDate < new Date();

    // Derived intelligence + automation summary -- the card surfaces
    // both so the catering team sees, at a glance, what's at risk.
    const intel = deriveOrderIntelligence(order);
    const auto = autoEmailMap.get((order as any).id) || { sent: 0, latest: null, postEventSent: false } as OrderAutoEmailSummary;
    const ringClass =
      intel.tone === "urgent"
        ? "ring-2 ring-rose-300"
        : intel.bucket === "today"
          ? "ring-2 ring-blue-200"
          : "";

    return (
      <Card
        className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${ringClass}`}
        style={{ borderLeftColor: config.dotColor.replace('bg-', '#') }}
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
                {/* Quote backlink -- so the team can jump back to the
                    accepted quote that spawned this order. Only renders
                    when the order has a quote_id (orders converted from
                    a quote, not the rare manually-created ones). */}
                {(order as any).quote_id && (
                  <Link
                    href={`/admin/quotes/${(order as any).quote_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100"
                    title="Open the quote this order was built from"
                  >
                    <FileText className="w-3 h-3" />
                    from quote
                  </Link>
                )}
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
                  {eventDate.toLocaleDateString()}
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
                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                    {auto.sent} auto email{auto.sent === 1 ? "" : "s"} sent
                  </span>
                )}
                {auto.postEventSent && (
                  <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                    Review email sent
                  </span>
                )}
                {intel.bucket === "done" && !auto.postEventSent && (
                  <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                    Review email pending
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="font-semibold text-slate-900">
                R{Number(order.total_amount || 0).toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <ClientLinkButton orderId={order.id} companyId={(order as any).company_id} compact />
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setSelectedOrder(order);
                    setIsModalOpen(true);
                  }}
                >
                  <Eye className="w-3 h-3" />
                  View
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const TimelineRow = ({ order }: { order: AppOrder }) => {
    const eventDate = new Date(order.event_date);
    const isToday = eventDate.toDateString() === new Date().toDateString();
    const isPast = eventDate < new Date();
    const nextStage = getNextStage(order);

    return (
      <Card 
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => {
          setSelectedOrder(order);
          setIsModalOpen(true);
        }}
      >
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Order Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h4 className="font-semibold text-slate-900 text-lg">{order.client_name}</h4>
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
                  {(order as any).quote_id && (
                    <Link
                      href={`/admin/quotes/${(order as any).quote_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100"
                      title="Open the quote this order was built from"
                    >
                      <FileText className="w-3 h-3" />
                      from quote
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{eventDate.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span className="truncate max-w-xs">{order.venue_address}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{order.guest_count} guests</span>
                  </div>
                  <div className="flex items-center gap-1 font-semibold text-slate-900">
                    <DollarSign className="w-4 h-4" />
                    <span>R{Number(order.total_amount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Progress</span>
                {nextStage && (
                  <div className="flex items-center gap-1 text-orange-600 font-medium">
                    <ArrowRight className="w-3 h-3" />
                    Next: {nextStage}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {WORKFLOW_STAGES.map((stage, index) => {
                  const status = getStageStatus(order, stage.key);
                  const isLast = index === WORKFLOW_STAGES.length - 1;

                  return (
                    <div key={stage.key} className="flex items-center flex-1">
                      {/* Stage Dot */}
                      <div className="relative group">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            status === "completed"
                              ? "bg-green-500 text-white scale-100"
                              : status === "current"
                              ? "bg-orange-500 text-white scale-110 ring-4 ring-orange-100 animate-pulse"
                              : status === "critical"
                              ? "bg-red-500 text-white scale-110 ring-4 ring-red-100 animate-pulse"
                              : "bg-slate-200 text-slate-400 scale-90"
                          }`}
                        >
                          {status === "completed" && <CheckCircle2 className="w-4 h-4" />}
                          {status === "current" && <Clock className="w-4 h-4" />}
                          {status === "critical" && <AlertCircle className="w-4 h-4" />}
                          {status === "upcoming" && <div className="w-2 h-2 rounded-full bg-slate-400" />}
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                          {stage.label}
                        </div>
                      </div>

                      {/* Connector Line */}
                      {!isLast && (
                        <div className="flex-1 h-1 mx-1">
                          <div
                            className={`h-full rounded transition-all ${
                              status === "completed"
                                ? "bg-green-500"
                                : status === "current"
                                ? "bg-gradient-to-r from-orange-500 to-slate-200"
                                : status === "critical"
                                ? "bg-gradient-to-r from-red-500 to-slate-200"
                                : "bg-slate-200"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stage Labels */}
              <div className="flex items-center gap-2 text-[10px]">
                {WORKFLOW_STAGES.map((stage) => (
                  <div key={stage.key} className="flex-1 text-center text-slate-500 truncate">
                    {stage.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const OrderHistoryTimeline = ({ orderId }: { orderId: string }) => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const fetchHistory = async () => {
        setLoading(true);
        const result = await orderService.getOrderStatusHistory(orderId);
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          setHistory(result.data);
        } else {
          // Fallback timeline: build a synthetic history from the order's
          // own lifecycle timestamps. The order_status_history table is
          // empty for tenants who haven't wired up the trigger yet, but
          // we still have a perfectly good timeline on the order row.
          const o = orders.find((x) => x.id === orderId) as any;
          if (!o) {
            setHistory([]);
          } else {
            const events = [
              { ts: o.created_at,       status: "pending",    note: "Order created" },
              { ts: o.confirmed_at,     status: "confirmed",  note: "Client confirmed" },
              { ts: o.prep_started_at,  status: "preparing",  note: "Kitchen started prep" },
              { ts: o.ready_at,         status: "ready",      note: "Ready for collection" },
              { ts: o.picked_up_at,     status: "in_transit", note: "Picked up by driver" },
              { ts: o.delivered_at,     status: "delivered",  note: "Delivered to venue" },
              { ts: o.completed_at,     status: "completed",  note: "Order closed out" },
              { ts: o.cancelled_at,     status: "cancelled",  note: o.cancellation_reason || "Order cancelled" },
            ]
              .filter((e) => !!e.ts)
              .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
              .map((e, i) => ({
                id: `synthetic-${orderId}-${i}`,
                status: e.status,
                created_at: e.ts,
                notes: e.note,
                changed_by_profile: null,
              }));
            setHistory(events);
          }
        }
        setLoading(false);
      };

      fetchHistory();
    }, [orderId]);

    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      );
    }

    if (history.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400">
          <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No status changes recorded yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

          {/* History Items */}
          <div className="space-y-6">
            {history.map((item, index) => {
              const config = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
              const Icon = config.icon;
              const timestamp = new Date(item.created_at);
              const isFirst = index === 0;

              return (
                <div key={item.id} className="relative flex gap-4">
                  {/* Timeline Dot */}
                  <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isFirst ? config.dotColor : "bg-slate-300"
                  } ${isFirst ? "ring-4 ring-offset-2 " + config.dotColor.replace('bg-', 'ring-').replace('-500', '-300') : ""}`}>
                    <Icon className={`w-4 h-4 ${isFirst ? "text-white" : "text-slate-500"}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <Card className={`border-l-4 ${isFirst ? "shadow-md" : ""}`} style={{ borderLeftColor: config.dotColor.replace('bg-', '#') }}>
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <Badge variant="outline" className={`${config.color} border mb-2`}>
                                {config.label}
                              </Badge>
                              <p className="text-sm font-medium text-slate-900">
                                Status changed to {config.label}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-500">
                                {timestamp.toLocaleDateString()}
                              </p>
                              <p className="text-xs text-slate-400">
                                {timestamp.toLocaleTimeString()}
                              </p>
                            </div>
                          </div>

                          {item.notes && (
                            <p className="text-sm text-slate-600 bg-slate-50 rounded p-2 mt-2">
                              {item.notes}
                            </p>
                          )}

                          {item.changed_by_profile && (
                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                                {item.changed_by_profile.full_name?.charAt(0) || item.changed_by_profile.email?.charAt(0) || "?"}
                              </div>
                              <div className="text-xs text-slate-600">
                                <span className="font-medium">{item.changed_by_profile.full_name || "User"}</span>
                                {item.changed_by_profile.email && (
                                  <span className="text-slate-400"> • {item.changed_by_profile.email}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const OrderDetailsModal = () => {
    const [editedOrder, setEditedOrder] = useState<AppOrder | null>(null);
    const [saving, setSaving] = useState(false);
    // "Hey, the price won't scale automatically" confirmation when
    // guest_count is being changed in edit mode.
    const [priceAdjustOpen, setPriceAdjustOpen] = useState(false);
    // Joined data the dashboard's getAllOrders fetch returns alongside
    // the order row but the type doesn't expose. We also fetch
    // order_items directly when the modal opens as a belt-and-braces
    // fallback -- the parent join can come back empty in some race
    // conditions or when the row was loaded via a different code path.
    const [fetchedItems, setFetchedItems] = useState<any[] | null>(null);
    const orderItemsRaw: any[] = useMemo(() => {
      if (!selectedOrder) return [];
      // Prefer fresh fetched items when present, fall back to whatever
      // the parent join returned.
      if (Array.isArray(fetchedItems) && fetchedItems.length > 0) return fetchedItems;
      const a = (selectedOrder as any).order_items;
      return Array.isArray(a) ? a : [];
    }, [selectedOrder, fetchedItems]);
    // Equipment bookings + status history aren't joined in getAllOrders --
    // fetch them on demand when the modal opens.
    const [equipmentBookings, setEquipmentBookings] = useState<any[]>([]);
    const [equipmentLoading, setEquipmentLoading] = useState(false);
    // Inline "add equipment" form state for edit mode.
    const [eqSearch, setEqSearch] = useState("");
    const [eqPick, setEqPick] = useState<EquipmentPick | null>(null);
    const [eqQty, setEqQty] = useState<string>("1");
    const [eqAdding, setEqAdding] = useState(false);
    const [eqRemoving, setEqRemoving] = useState<string | null>(null);

    const reloadEquipment = async () => {
      if (!selectedOrder?.id) return;
      const { data } = await supabase
        .from("equipment_bookings")
        .select("id, equipment_id, quantity, status, booked_from, booked_until, returned_quantity, equipment:equipment(name, daily_rate)")
        .eq("order_id", selectedOrder.id);
      setEquipmentBookings(data || []);
    };

    const handleAddEquipment = async () => {
      if (!selectedOrder?.id || !eqPick) return;
      const qty = Math.max(1, parseInt(eqQty, 10) || 1);
      // Default booking window to event_date - 1 day through event_date + 1 day
      // (typical pickup-then-return overnight). Operator can refine later.
      const eventDate = (selectedOrder as any).event_date;
      let bookedFrom: string | null = null;
      let bookedUntil: string | null = null;
      if (eventDate) {
        const d = new Date(eventDate);
        const from = new Date(d); from.setDate(from.getDate() - 1);
        const until = new Date(d); until.setDate(until.getDate() + 1);
        bookedFrom = from.toISOString().slice(0, 10);
        bookedUntil = until.toISOString().slice(0, 10);
      }
      setEqAdding(true);
      try {
        const { error } = await supabase.from("equipment_bookings").insert({
          order_id: selectedOrder.id,
          company_id: (selectedOrder as any).company_id,
          equipment_id: eqPick.id,
          quantity: qty,
          status: "booked",
          booked_from: bookedFrom,
          booked_until: bookedUntil,
        } as any);
        if (error) throw error;
        toast({ title: "Equipment added", description: `${qty} x ${eqPick.name} booked.` });
        setEqSearch(""); setEqPick(null); setEqQty("1");
        await reloadEquipment();
        await syncAndRefresh();
      } catch (e: any) {
        toast({ title: "Could not add equipment", description: e?.message || "Try again", variant: "destructive" });
      } finally {
        setEqAdding(false);
      }
    };

    const handleRemoveEquipment = async (bookingId: string) => {
      setEqRemoving(bookingId);
      try {
        const { error } = await supabase.from("equipment_bookings").delete().eq("id", bookingId);
        if (error) throw error;
        toast({ title: "Equipment removed" });
        await reloadEquipment();
        await syncAndRefresh();
      } catch (e: any) {
        toast({ title: "Could not remove equipment", description: e?.message || "Try again", variant: "destructive" });
      } finally {
        setEqRemoving(null);
      }
    };

    // Recompute totals + push to quote + invoice + reflect in modal
    // header. Called after every inline item / equipment add or remove.
    const syncAndRefresh = async () => {
      if (!selectedOrder?.id) return;
      const sync = await syncOrderArtifacts(selectedOrder.id);
      if (!sync.ok) return;
      const merged: any = {
        ...selectedOrder,
        subtotal: sync.subtotal,
        tax_amount: sync.tax_amount,
        total_amount: sync.total_amount,
      };
      setSelectedOrder(merged);
      setEditedOrder({ ...editedOrder, ...merged } as any);
    };

    // Inline "add menu item" form state (mirrors the equipment one).
    // Item-level price comes from the catalog's pricePerPerson field;
    // operator can override quantity + price-per-line on add.
    const [miSearch, setMiSearch] = useState("");
    const [miPick, setMiPick] = useState<MenuItemPick | null>(null);
    const [miQty, setMiQty] = useState<string>("1");
    const [miUnitPrice, setMiUnitPrice] = useState<string>("");
    const [miAdding, setMiAdding] = useState(false);
    const [miRemoving, setMiRemoving] = useState<string | null>(null);

    const reloadOrderItems = async () => {
      if (!selectedOrder?.id) return;
      const { data } = await supabase
        .from("order_items")
        .select("id, item_name, description, quantity, unit_price, line_total, special_instructions, created_at")
        .eq("order_id", selectedOrder.id)
        .order("created_at", { ascending: true });
      setFetchedItems(data || []);
    };

    const handleAddMenuItem = async () => {
      if (!selectedOrder?.id || !miPick) return;
      const qty = Math.max(1, parseInt(miQty, 10) || 1);
      const unit = Number(miUnitPrice) > 0 ? Number(miUnitPrice) : Number(miPick.pricePerPerson) || 0;
      setMiAdding(true);
      try {
        const { error } = await supabase.from("order_items").insert({
          order_id: selectedOrder.id,
          menu_item_id: miPick.id,
          item_name: miPick.name,
          description: miPick.description || null,
          quantity: qty,
          unit_price: unit,
          line_total: qty * unit,
        } as any);
        if (error) throw error;
        toast({ title: "Item added", description: `${qty} x ${miPick.name} added.` });
        setMiSearch(""); setMiPick(null); setMiQty("1"); setMiUnitPrice("");
        await reloadOrderItems();
        await syncAndRefresh();
      } catch (e: any) {
        toast({ title: "Could not add item", description: e?.message || "Try again", variant: "destructive" });
      } finally {
        setMiAdding(false);
      }
    };

    const handleRemoveMenuItem = async (itemId: string) => {
      setMiRemoving(itemId);
      try {
        const { error } = await supabase.from("order_items").delete().eq("id", itemId);
        if (error) throw error;
        toast({ title: "Item removed" });
        await reloadOrderItems();
        await syncAndRefresh();
      } catch (e: any) {
        toast({ title: "Could not remove item", description: e?.message || "Try again", variant: "destructive" });
      } finally {
        setMiRemoving(null);
      }
    };

    // Direct fetch of order_items so the modal never shows the empty
    // state when items actually exist for this order in the db.
    useEffect(() => {
      if (!selectedOrder?.id) { setFetchedItems(null); return; }
      let cancelled = false;
      (async () => {
        try {
          const { data } = await supabase
            .from("order_items")
            .select("id, item_name, description, quantity, unit_price, line_total, special_instructions, created_at")
            .eq("order_id", selectedOrder.id)
            .order("created_at", { ascending: true });
          if (!cancelled) setFetchedItems(data || []);
        } catch (err) {
          console.warn("[orders] order_items fetch failed", err);
          if (!cancelled) setFetchedItems([]);
        }
      })();
      return () => { cancelled = true; };
    }, [selectedOrder?.id]);

    useEffect(() => {
      if (selectedOrder) {
        setEditedOrder(selectedOrder);
      }
    }, [selectedOrder]);

    useEffect(() => {
      if (!selectedOrder?.id) return;
      let cancelled = false;
      (async () => {
        setEquipmentLoading(true);
        try {
          const { data } = await supabase
            .from("equipment_bookings")
            .select("id, equipment_id, quantity, status, booked_from, booked_until, returned_quantity, equipment:equipment(name, daily_rate)")
            .eq("order_id", selectedOrder.id);
          if (!cancelled) setEquipmentBookings(data || []);
        } catch (err) {
          console.warn("[orders] equipment bookings fetch failed", err);
        } finally {
          if (!cancelled) setEquipmentLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [selectedOrder?.id]);

    if (!selectedOrder || !editedOrder) return null;

    // Amendments are usually small (venue change, time tweak, +/- a
    // few guests). When guest_count is changing we pop a quick info
    // dialog that says "the total stays the same, fix the price on
    // the quote if it needs changing". Stops the operator quietly
    // expecting the price to scale.
    const oldGuestCount = Number((selectedOrder as any).guest_count || 0);
    const newGuestCount = Number((editedOrder as any).guest_count || 0);
    const oldTotal = Number((selectedOrder as any).total_amount || 0);

    const handleSave = async () => {
      if (
        oldGuestCount > 0 &&
        newGuestCount > 0 &&
        oldGuestCount !== newGuestCount &&
        oldTotal > 0
      ) {
        setPriceAdjustOpen(true);
        return;
      }
      await persistSave();
    };

    // Ratio + projected scaled total used by the dialog and the save
    // path. When items exist, scale each item.quantity by the ratio
    // and let the sync service recompute the total from the new
    // line totals (preserves the operator's per-unit prices). When
    // no items exist, scale the order's total_amount directly.
    const guestRatio =
      oldGuestCount > 0 && newGuestCount > 0 ? newGuestCount / oldGuestCount : 1;
    const projectedTotal = Number((oldTotal * guestRatio).toFixed(2));
    // Threshold for "this is a big change, go fix it on the quote"
    // vs "small amendment, scale inline". 20% is the soft line --
    // a 5% move (200 -> 190) is fine here, a 50% move (200 -> 100)
    // gets routed to the quote where prices can also be re-thought.
    const guestDeltaPct =
      oldGuestCount > 0 ? Math.abs(newGuestCount - oldGuestCount) / oldGuestCount : 0;
    const isBigGuestChange = guestDeltaPct > 0.20;

    const persistSave = async () => {
      setSaving(true);
      try {
        const guestChanged = oldGuestCount !== newGuestCount && oldGuestCount > 0 && newGuestCount > 0;

        // Scale path A: items exist, multiply each item.quantity by
        // the ratio (round to integer, recompute line_total). Sync
        // will pick up the new line_totals and write a new subtotal.
        if (guestChanged && orderItemsRaw.length > 0) {
          await Promise.all(orderItemsRaw.map((it: any) => {
            const newQty = Math.max(1, Math.round(Number(it.quantity || 0) * guestRatio));
            const unit = Number(it.unit_price || 0);
            return supabase.from("order_items").update({
              quantity: newQty,
              line_total: Number((newQty * unit).toFixed(2)),
            } as any).eq("id", it.id);
          }));
        }

        // Scale path B: flat-price order, scale total_amount directly.
        // Written before the syncOrderArtifacts call so the sync's
        // preserve-existing branch picks it up.
        if (guestChanged && orderItemsRaw.length === 0 && projectedTotal > 0) {
          await supabase.from("orders").update({
            subtotal: projectedTotal,
            total_amount: projectedTotal,
            tax_amount: 0,
          } as any).eq("id", editedOrder.id);
        }

        const result: any = await orderService.updateOrder(editedOrder.id, {
          client_name: editedOrder.client_name,
          venue_address: editedOrder.venue_address,
          guest_count: editedOrder.guest_count,
          event_date: editedOrder.event_date,
          status: editedOrder.status,
          internal_notes: (editedOrder as any).internal_notes,
        });
        if (result && result.success === false) {
          throw new Error(result.error || "Update failed");
        }

        // Quote + invoice mirror so all three artifacts stay in sync.
        const sync = await syncOrderArtifacts(editedOrder.id);

        toast({
          title: "Order Updated",
          description: sync.ok
            ? `Saved. Quote${sync.quote_id ? "" : " (none)"} and invoice${sync.invoice_id ? "" : " (none)"} synced.`
            : "Saved, but the quote/invoice sync hit an issue. Check the totals.",
        });

        const merged: any = {
          ...selectedOrder,
          ...editedOrder,
          ...(result?.data || {}),
          subtotal: sync.subtotal,
          tax_amount: sync.tax_amount,
          total_amount: sync.total_amount,
        };
        setSelectedOrder(merged);
        setEditedOrder(merged);
        setEditMode(false);
        setPriceAdjustOpen(false);
        loadOrders();
      } catch (error: any) {
        toast({
          title: "Error",
          description: error?.message || "Failed to update order. Please try again.",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    };

    return (
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl">Order Details</DialogTitle>
                <DialogDescription className="mt-1">
                  {editMode ? "Edit order information" : "View order details"}
                </DialogDescription>
                {/* Quick links: source quote, client-facing order view,
                    invoice. The "View as client sees it" link opens the
                    public-ish customer order view in a new tab so the
                    operator can sanity-check that everything they just
                    edited (items, totals, venue, date) propagated
                    through. */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {(selectedOrder as any).quote_id && (
                    <Link
                      href={`/admin/quotes/${(selectedOrder as any).quote_id}`}
                      onClick={() => setIsModalOpen(false)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 hover:bg-blue-100"
                    >
                      <FileText className="w-3 h-3" />
                      Source quote
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      // The /c/order/[id] page expects a client access
                      // token in the URL. Mint a fresh one for the
                      // admin via the preview endpoint, then open the
                      // tokenised URL in a new tab.
                      try {
                        const r = await fetch(`/api/orders/${(selectedOrder as any).id}/preview-as-client`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        });
                        const j = await r.json();
                        if (!r.ok) throw new Error(j.error || "Could not generate preview link");
                        window.open(j.url, "_blank", "noopener,noreferrer");
                      } catch (e: any) {
                        toast({
                          title: "Couldn't open preview",
                          description: e?.message || "Try again",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 hover:bg-emerald-100"
                  >
                    <ChevronRight className="w-3 h-3" />
                    View as client sees it
                  </button>
                  <Link
                    href={`/admin/invoices`}
                    onClick={() => setIsModalOpen(false)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100"
                  >
                    <Receipt className="w-3 h-3" />
                    Open invoice
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
              {!editMode ? (
                <div className="flex gap-2">
                  {selectedOrder && (selectedOrder as any).status !== "cancelled" && (
                    <Button
                      onClick={() => {
                        // Close the Order Details modal first so the
                        // Cancel dialog isn't stacked behind it. The
                        // selectedOrder state stays so the cancel
                        // dialog still has the order id to work with.
                        setIsModalOpen(false);
                        setCancelDialogOpen(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="text-rose-700 border-rose-200 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Cancel order
                    </Button>
                  )}
                  <Button onClick={() => setEditMode(true)} variant="outline" size="sm">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {/* In edit mode, "Cancel order" stays accessible so
                      the operator doesn't have to discard their edit
                      first to get to it. The edit-discard button is
                      relabelled "Discard" so it's clearly distinct
                      from cancelling the order itself. */}
                  {selectedOrder && (selectedOrder as any).status !== "cancelled" && (
                    <Button
                      onClick={() => {
                        setEditedOrder(selectedOrder);
                        setEditMode(false);
                        setIsModalOpen(false);
                        setCancelDialogOpen(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="text-rose-700 border-rose-200 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Cancel order
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setEditedOrder(selectedOrder);
                      setEditMode(false);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Discard
                  </Button>
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <Tabs defaultValue="details" className="mt-6">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="menu">Menu Items</TabsTrigger>
              <TabsTrigger value="equipment">Equipment</TabsTrigger>
              <TabsTrigger value="amendments">Amendments</TabsTrigger>
              <TabsTrigger value="cancellations">Cancellations</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input
                    value={editedOrder.client_name}
                    onChange={(e) => setEditedOrder({ ...editedOrder, client_name: e.target.value })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editedOrder.status}
                    onValueChange={(value) => setEditedOrder({ ...editedOrder, status: value as any })}
                    disabled={!editMode || editedOrder.status === "paused"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="preparing">In Prep</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Pause / Resume routed through dedicated handlers
                      so the cascades (email queue suspend, prep tasks
                      hide, audit log) actually fire. The dropdown
                      itself doesn't carry 'paused' to keep operators
                      out of the silent-bypass trap. */}
                  <div className="flex gap-2 pt-1">
                    {editedOrder.status === "paused" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!confirm("Resume this order? Pre-event reminders + kitchen prep tasks will be restored.")) return;
                          try {
                            const res = await fetch(`/api/orders/${editedOrder.id}/resume`, { method: "POST" });
                            const json = await res.json().catch(() => ({}));
                            if (!res.ok) { toast({ title: "Resume failed", description: json?.error, variant: "destructive" }); return; }
                            toast({ title: "Order resumed", description: `Back to ${json.order?.status}. Reminders + prep restored.` });
                            await loadOrders();
                            setSelectedOrder(json.order);
                            setEditedOrder(json.order);
                          } catch (e: any) {
                            toast({ title: "Resume failed", description: e?.message, variant: "destructive" });
                          }
                        }}
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" /> Resume order
                      </Button>
                    ) : (
                      ["confirmed", "preparing", "ready"].includes(String(editedOrder.status)) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPauseDialogOrderId(editedOrder.id)}
                          className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"
                          title="Client called to hold? Pauses reminders + prep without losing them."
                        >
                          <Pause className="w-3.5 h-3.5" /> Pause order
                        </Button>
                      )
                    )}
                  </div>
                  {editedOrder.status === "paused" && (
                    <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mt-1">
                      Paused{(editedOrder as any).paused_reason_category ? ` -- ${String((editedOrder as any).paused_reason_category).replace(/_/g, " ")}` : ""}
                      {(editedOrder as any).paused_reason ? `: ${(editedOrder as any).paused_reason}` : ""}
                      {(editedOrder as any).paused_expected_resume_date ? ` (expected resume: ${(editedOrder as any).paused_expected_resume_date})` : ""}
                    </p>
                  )}
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Venue Address</Label>
                  <Input
                    value={editedOrder.venue_address || ""}
                    onChange={(e) => setEditedOrder({ ...editedOrder, venue_address: e.target.value })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Event Date</Label>
                  <Input
                    type="date"
                    value={editedOrder.event_date}
                    onChange={(e) => setEditedOrder({ ...editedOrder, event_date: e.target.value })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Guest Count</Label>
                  <Input
                    type="number"
                    value={editedOrder.guest_count}
                    onChange={(e) => setEditedOrder({ ...editedOrder, guest_count: parseInt(e.target.value) || 0 })}
                    disabled={!editMode}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Internal notes (admin only)</Label>
                  <Textarea
                    value={(editedOrder as any).internal_notes || ""}
                    onChange={(e) => setEditedOrder({ ...editedOrder, internal_notes: e.target.value } as any)}
                    disabled={!editMode}
                    rows={3}
                    placeholder="Internal notes for the team. Not shown to the client."
                  />
                </div>

                {(selectedOrder as any).special_instructions && (
                  <div className="space-y-2 col-span-2">
                    <Label>Client special instructions</Label>
                    <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
                      {(selectedOrder as any).special_instructions}
                    </p>
                  </div>
                )}

                {/* Money summary -- read-only at-a-glance for the team. */}
                <div className="col-span-2 grid grid-cols-3 gap-3 mt-2 pt-3 border-t border-slate-200">
                  <div>
                    <Label className="text-xs">Subtotal</Label>
                    <p className="text-sm font-semibold text-slate-900 mt-1 tabular-nums">
                      R{Number((selectedOrder as any).subtotal || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Tax</Label>
                    <p className="text-sm font-semibold text-slate-900 mt-1 tabular-nums">
                      R{Number((selectedOrder as any).tax_amount || (selectedOrder as any).tax || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Total</Label>
                    <p className="text-base font-bold text-emerald-600 mt-1 tabular-nums">
                      R{Number((selectedOrder as any).total_amount || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Dispatch summary -- vehicle + 2-driver flag. Internal
                    only, never goes near the client portal. The vehicle
                    is auto-booked when a driver is assigned and can be
                    overridden from the Dispatch Queue. */}
                <div className="col-span-2 mt-2 pt-3 border-t border-slate-200">
                  <Label className="text-xs flex items-center gap-1.5">
                    Dispatch
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">internal</span>
                  </Label>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                        Vehicle
                      </p>
                      {(selectedOrder as any).assigned_vehicle ? (() => {
                        const v = (selectedOrder as any).assigned_vehicle;
                        return (
                          <>
                            <p className="font-semibold text-slate-900">
                              {v.nickname ? `${v.nickname} ` : ""}
                              <span className="font-mono text-slate-500">{v.plate}</span>
                            </p>
                            <p className="text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                              {v.refrigerated && <span className="inline-flex items-center gap-0.5 text-blue-700"><MapPin className="w-3 h-3" />Refrigerated</span>}
                              {v.has_warmer && <span className="inline-flex items-center gap-0.5 text-orange-700"><Package className="w-3 h-3" />Warmer</span>}
                              {v.max_pax_served != null && <span>Rated {v.max_pax_served} guests</span>}
                              {v.capacity_kg != null && <span>{v.capacity_kg}kg</span>}
                              {v.owner_kind === "driver" && <span className="inline-flex items-center gap-0.5 text-amber-700">Driver-owned</span>}
                            </p>
                          </>
                        );
                      })() : (
                        <p className="text-slate-500 italic">
                          No vehicle booked yet. Assigning a driver will auto-book the best fit.
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                        Crew
                      </p>
                      <p className="font-semibold text-slate-900">
                        {(selectedOrder as any).requires_two_drivers ? "Two drivers needed" : "One driver"}
                      </p>
                      <p className="text-slate-600 mt-0.5">
                        {(selectedOrder as any).requires_two_drivers
                          ? "Vehicle, guest count or waiter service flagged this run for a co-driver."
                          : "Solo run, no co-driver required."}
                      </p>
                      {(selectedOrder as any).secondary_driver_id && (
                        <p className="mt-1 text-emerald-700">Secondary driver assigned.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="menu" className="space-y-4 mt-4">
              {/* Menu lines come from the order_items joined table.
                  Inline add / remove in edit mode mirrors the Equipment
                  tab. Heads up: the order's total_amount column is set
                  at quote-acceptance time and isn't auto-recalculated
                  when you tweak items here. If you change the value
                  significantly, also bump it via Edit > Details so the
                  invoice + dashboard stay in sync. */}
              <div className="space-y-3">
                {/* Inline add form (edit mode only) */}
                {editMode && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <Label className="text-xs font-semibold text-blue-900">Add menu item to this order</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                      <MenuItemTypeahead
                        companyId={(selectedOrder as any)?.company_id}
                        value={miSearch}
                        onChange={setMiSearch}
                        onPick={(p) => {
                          setMiPick(p);
                          setMiSearch(p.name);
                          setMiUnitPrice(p.pricePerPerson ? String(p.pricePerPerson) : "");
                        }}
                      />
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Qty</Label>
                        <Input
                          type="number"
                          min={1}
                          className="w-20 bg-white"
                          value={miQty}
                          onChange={(e) => setMiQty(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Unit price (R)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          className="w-28 bg-white"
                          placeholder={miPick?.pricePerPerson ? String(miPick.pricePerPerson) : "0"}
                          value={miUnitPrice}
                          onChange={(e) => setMiUnitPrice(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddMenuItem}
                        disabled={miAdding || !miPick}
                        className="self-end"
                      >
                        {miAdding ? "Adding..." : "Add"}
                      </Button>
                    </div>
                    {miPick && (
                      <p className="text-xs text-slate-600">
                        Selected: <strong>{miPick.name}</strong> ({miPick.category})
                        {miPick.pricePerPerson ? ` -- R${Number(miPick.pricePerPerson).toLocaleString("en-ZA")} / person` : ""}
                      </p>
                    )}
                  </div>
                )}

                {orderItemsRaw.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No menu items on this order yet.</p>
                    <p className="text-xs mt-1">
                      {editMode
                        ? "Use the search above to add items."
                        : "Click Edit on this order to add items."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2">Item</th>
                          <th className="text-right px-3 py-2 w-16">Qty</th>
                          <th className="text-right px-3 py-2 w-28">Unit price</th>
                          <th className="text-right px-3 py-2 w-28">Line total</th>
                          {editMode && <th className="px-3 py-2 w-12" />}
                        </tr>
                      </thead>
                      <tbody>
                        {orderItemsRaw.map((it: any) => (
                          <tr key={it.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900">{it.item_name || "(unnamed)"}</div>
                              {it.description && (
                                <div className="text-xs text-slate-500 mt-0.5">{it.description}</div>
                              )}
                              {it.special_instructions && (
                                <div className="text-xs text-amber-700 mt-0.5">Note: {it.special_instructions}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{it.quantity ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              R{Number(it.unit_price || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              R{Number(it.line_total || (Number(it.quantity || 0) * Number(it.unit_price || 0))).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                            </td>
                            {editMode && (
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 h-7 w-7 p-0"
                                  onClick={() => handleRemoveMenuItem(it.id)}
                                  disabled={miRemoving === it.id}
                                  title="Remove from order"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!editMode && orderItemsRaw.length > 0 && (
                  <div className="text-xs text-slate-500 pt-1">
                    Originating quote owns the totals. Tweak items here for last-minute adjustments and update Details &gt; Total to keep the invoice in sync.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="equipment" className="space-y-4 mt-4">
              {/* Equipment is tracked as bookings against the order_id, not
                  as JSON on the order row. We fetch on modal open and let
                  the operator add / remove inline when the modal is in
                  edit mode. Booking window defaults to event_date +/- 1
                  day; tweak via the Equipment page if you need exact
                  pickup / return times. */}
              <div className="space-y-3">
                {/* Inline add form (edit mode only) */}
                {editMode && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <Label className="text-xs font-semibold text-blue-900">Add equipment to this order</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                      <EquipmentTypeahead
                        companyId={(selectedOrder as any)?.company_id}
                        value={eqSearch}
                        onChange={setEqSearch}
                        onPick={(p) => { setEqPick(p); setEqSearch(p.name); }}
                      />
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Qty</Label>
                        <Input
                          type="number"
                          min={1}
                          className="w-20 bg-white"
                          value={eqQty}
                          onChange={(e) => setEqQty(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddEquipment}
                        disabled={eqAdding || !eqPick}
                        className="self-end"
                      >
                        {eqAdding ? "Adding..." : "Add"}
                      </Button>
                    </div>
                    {eqPick && (
                      <p className="text-xs text-slate-600">
                        Selected: <strong>{eqPick.name}</strong>
                        {eqPick.availableQuantity !== null ? ` -- ${eqPick.availableQuantity} available` : ""}
                        {eqPick.rentalPrice ? ` -- R${Number(eqPick.rentalPrice).toLocaleString("en-ZA")} / day` : ""}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      Booking window auto-defaults to the day before through the day after the event. Refine on the Equipment page if needed.
                    </p>
                  </div>
                )}

                {equipmentLoading ? (
                  <div className="text-center py-8 text-slate-400">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2" />
                    <p className="text-sm">Loading equipment...</p>
                  </div>
                ) : equipmentBookings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No equipment booked for this order.</p>
                    <p className="text-xs mt-1">
                      {editMode
                        ? "Use the search above to add items."
                        : "Click Edit on this order to add equipment."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2">Equipment</th>
                          <th className="text-right px-3 py-2 w-16">Qty</th>
                          <th className="text-left px-3 py-2 w-32">Status</th>
                          <th className="text-left px-3 py-2 w-44">Booked window</th>
                          {editMode && <th className="px-3 py-2 w-12" />}
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentBookings.map((b: any) => {
                          const eqName = (b.equipment && (Array.isArray(b.equipment) ? b.equipment[0]?.name : b.equipment.name)) || "(equipment)";
                          const window = b.booked_from && b.booked_until
                            ? `${new Date(b.booked_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} → ${new Date(b.booked_until).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`
                            : "—";
                          return (
                            <tr key={b.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-900">{eqName}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{b.quantity ?? "—"}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="capitalize">{b.status || "booked"}</Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">{window}</td>
                              {editMode && (
                                <td className="px-3 py-2 text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 h-7 w-7 p-0"
                                    onClick={() => handleRemoveEquipment(b.id)}
                                    disabled={eqRemoving === b.id}
                                    title="Remove from order"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer link out -- for the rare case where the operator
                    needs the full equipment management surface (catalog
                    edits, exact times, returns workflow, damage reports). */}
                {!editMode && equipmentBookings.length > 0 && (
                  <div className="text-xs text-slate-500 pt-1">
                    Need to manage availability, returns or damages? Go to{" "}
                    <Link
                      href="/admin/equipment"
                      onClick={() => setIsModalOpen(false)}
                      className="text-blue-700 hover:underline"
                    >
                      Equipment
                    </Link>
                    .
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="amendments" className="space-y-4 mt-4">
              <AmendmentsTab
                orderId={editedOrder.id}
                currentOrder={editedOrder as any}
                onActioned={() => {
                  // Re-pull the order after an approval since the diff
                  // is now applied -- the modal's currentOrder is stale.
                  setSelectedOrder({ ...selectedOrder } as any);
                }}
              />
            </TabsContent>

            <TabsContent value="cancellations" className="space-y-4 mt-4">
              <CancellationRequestsTab
                orderId={editedOrder.id}
                onActioned={() => {
                  setIsModalOpen(false);
                  loadOrders();
                }}
              />
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-4">
              <OrderHistoryTimeline orderId={editedOrder.id} />
            </TabsContent>
          </Tabs>
        </DialogContent>

        {/* Price-doesn't-scale confirmation. Pops when guest_count
            changes on Save -- nudges the operator that price changes
            are a quote-level edit, not an order-level amendment. */}
        <Dialog open={priceAdjustOpen} onOpenChange={setPriceAdjustOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className={`w-5 h-5 ${isBigGuestChange ? "text-rose-600" : "text-amber-600"}`} />
                {isBigGuestChange ? "Big change -- update the quote" : "Confirm guest count change"}
              </DialogTitle>
              <DialogDescription>
                Guest count: <strong>{oldGuestCount}</strong> → <strong>{newGuestCount}</strong>
                {guestRatio !== 1 ? ` (${guestRatio < 1 ? "−" : "+"}${Math.round(guestDeltaPct * 100)}%)` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              {isBigGuestChange ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
                  <p className="text-rose-900">
                    A change of this size usually needs a re-think on price too (volume discount, menu mix, equipment, delivery fee). The cleanest path is to amend the <strong>quote / invoice</strong> directly so all the client-facing copy and totals stay aligned.
                  </p>
                  <p className="text-rose-900/80 text-xs">
                    Inline order amendments are designed for small tweaks only.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                  <p className="text-emerald-900">
                    Items + total will scale to the new guest count using the <strong>current per-unit prices</strong>.
                  </p>
                  <div className="flex items-center justify-between text-xs text-emerald-900/80 pt-1 border-t border-emerald-200">
                    <span>Current total</span>
                    <span className="tabular-nums">R{Number(oldTotal).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-900 font-semibold">
                    <span>New total</span>
                    <span className="tabular-nums">R{Number(projectedTotal).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</span>
                  </div>
                  <p className="text-emerald-900/80 text-xs pt-1">
                    To change the per-unit prices (e.g., volume discount, menu upgrade), update the source quote.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-end mt-4">
              <Button
                variant="outline"
                onClick={() => setPriceAdjustOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              {/* On big changes, the quote link is the recommended
                  path so it gets the primary styling. The "scale
                  anyway" stays available for the rare case the
                  operator knows what they're doing. */}
              {isBigGuestChange ? (
                <>
                  <Button
                    variant="outline"
                    onClick={persistSave}
                    disabled={saving}
                    className="text-slate-700"
                  >
                    {saving ? "Scaling..." : "Scale inline anyway"}
                  </Button>
                  {(selectedOrder as any)?.quote_id && (
                    <Button
                      onClick={() => {
                        setPriceAdjustOpen(false);
                        setIsModalOpen(false);
                        window.location.href = `/admin/quotes/${(selectedOrder as any).quote_id}`;
                      }}
                      disabled={saving}
                    >
                      Update quote / invoice
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {(selectedOrder as any)?.quote_id && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPriceAdjustOpen(false);
                        setIsModalOpen(false);
                        window.location.href = `/admin/quotes/${(selectedOrder as any).quote_id}`;
                      }}
                      disabled={saving}
                    >
                      Update quote/invoice instead
                    </Button>
                  )}
                  <Button onClick={persistSave} disabled={saving}>
                    {saving ? "Saving..." : `Save + scale to R${Number(projectedTotal).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </Dialog>
    );
  };

  const KanbanColumn = ({ status, title }: { status: string; title: string }) => {
    const ordersInStatus = getOrdersByStatus(status);
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];

    return (
      <div className="flex flex-col w-[88vw] sm:w-[320px] sm:min-w-[320px] sm:max-w-[320px] flex-shrink-0">
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-slate-200">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${config.dotColor}`} />
            <h3 className="font-semibold text-slate-900">{title}</h3>
          </div>
          <Badge variant="secondary" className="font-semibold">
            {ordersInStatus.length}
          </Badge>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-2">
          {ordersInStatus.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No orders</p>
            </div>
          ) : (
            ordersInStatus.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Order Process Dashboard - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-12 max-w-full">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <ShoppingCart className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Order Process Dashboard
                  </h1>
                  <p className="text-slate-600 mt-1">Track all orders through your workflow</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    variant={viewMode === "kanban" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("kanban")}
                    className="rounded-none"
                  >
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    Kanban
                  </Button>
                  <Button
                    variant={viewMode === "timeline" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("timeline")}
                    className="rounded-none"
                  >
                    <List className="w-4 h-4 mr-2" />
                    Timeline
                  </Button>
                </div>
                <Link href="/admin/order-assignments">
                  <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    New Order
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 mb-1 flex items-center gap-1.5">Total Orders <InfoTooltip content={"Number of orders that match your current search, status and date filters."} /></p>
                      <p className="text-3xl font-bold text-blue-900">{stats.total}</p>
                    </div>
                    <ShoppingCart className="w-8 h-8 text-blue-600 opacity-30" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-green-700 mb-1 flex items-center gap-1.5">
                        Booked revenue
                        <InfoTooltip content={"Total value of orders the client has confirmed, either by paying a deposit or by being manually marked as confirmed by your team.\n\nPending, draft, and cancelled orders are excluded.\n\nRealised below is the slice already delivered or completed, 'money in the till'."} />
                      </p>
                      <p className="text-2xl font-bold text-green-900">
                        R{(stats.revenue.booked / 1000).toFixed(0)}k
                      </p>
                      <p className="text-[11px] text-green-700/80 mt-0.5">
                        Realised: R{(stats.revenue.realised / 1000).toFixed(0)}k
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-green-600 opacity-30 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-purple-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-700 mb-1 flex items-center gap-1.5">In Progress <InfoTooltip content={"Orders the team is actively working on, anywhere from confirmed through to delivered."} /></p>
                      <p className="text-3xl font-bold text-purple-900">{stats.inProgress}</p>
                    </div>
                    <Package className="w-8 h-8 text-purple-600 opacity-30" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-50 to-orange-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-orange-700 mb-1 flex items-center gap-1.5">Upcoming <InfoTooltip content={"Orders in the current view dated today or later that are still open."} /></p>
                      <p className="text-3xl font-bold text-orange-900">{stats.upcoming}</p>
                    </div>
                    <Calendar className="w-8 h-8 text-orange-600 opacity-30" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-yellow-50 to-yellow-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-yellow-700 mb-1 flex items-center gap-1.5">Pending <InfoTooltip content={"Orders waiting for you to confirm them."} /></p>
                      <p className="text-3xl font-bold text-yellow-900">{stats.byStatus.pending || 0}</p>
                    </div>
                    <Clock className="w-8 h-8 text-yellow-600 opacity-30" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-indigo-700 mb-1 flex items-center gap-1.5">In Transit <InfoTooltip content={"Orders that are out on the road being delivered right now."} /></p>
                      <p className="text-3xl font-bold text-indigo-900">{stats.byStatus.in_transit || 0}</p>
                    </div>
                    <Truck className="w-8 h-8 text-indigo-600 opacity-30" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      placeholder="Search by client, order ID, venue or event..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full md:w-[200px]">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="preparing">In Prep</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-full md:w-[200px]">
                      <SelectValue placeholder="All Dates" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Dates</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="next30">Next 30 days</SelectItem>
                      <SelectItem value="past">Past events</SelectItem>
                      <SelectItem value="custom">Custom range...</SelectItem>
                    </SelectContent>
                  </Select>
                  {dateFilter === "custom" && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-[150px]"
                        title="From"
                      />
                      <span className="text-slate-400 text-xs">to</span>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-[150px]"
                        title="To"
                      />
                      {(dateFrom || dateTo) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-2"
                          onClick={() => { setDateFrom(""); setDateTo(""); }}
                          title="Clear range"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                  <Button variant="outline" className="gap-2">
                    <Download className="w-4 h-4" />
                    Export
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Kanban Board / Timeline View */}
            {loading ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-24">
                  <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-slate-600">Loading orders...</p>
                  </div>
                </CardContent>
              </Card>
            ) : viewMode === "kanban" ? (
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-6 min-w-max px-1">
                  <KanbanColumn status="pending" title="Pending" />
                  <KanbanColumn status="confirmed" title="Confirmed" />
                  <KanbanColumn status="preparing" title="In Prep" />
                  <KanbanColumn status="ready" title="Ready" />
                  <KanbanColumn status="in_transit" title="In Transit" />
                  <KanbanColumn status="delivered" title="Delivered" />
                  <KanbanColumn status="completed" title="Completed" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {getFilteredOrders().length === 0 ? (
                  <Card className="border-0 shadow-lg">
                    <CardContent className="py-24">
                      <div className="text-center text-slate-400">
                        <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium">No orders found</p>
                        <p className="text-sm mt-1">Try adjusting your filters</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  getFilteredOrders()
                    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
                    .map((order) => <TimelineRow key={order.id} order={order} />)
                )}
              </div>
            )}

            {/* Order Details Modal */}
            <OrderDetailsModal />

            {/* Cancel order dialog with refund preview, fed by the
                get_refund_for_order RPC. Refund flow lands a payments
                row + cancellation_requests audit + status cascade. */}
            <CancelOrderDialog
              open={cancelDialogOpen}
              onOpenChange={setCancelDialogOpen}
              orderId={selectedOrder?.id || null}
              orderNumber={(selectedOrder as any)?.order_number || null}
              onCancelled={() => {
                setIsModalOpen(false);
                loadOrders();
              }}
            />

            {/* Pause dialog -- captures reason + expected resume date,
                runs the pauseOrder cascade (status -> 'paused', email
                queue suspend, prep tasks soft-delete, audit log). */}
            <PauseOrderDialog
              open={!!pauseDialogOrderId}
              onOpenChange={(o) => { if (!o) setPauseDialogOrderId(null); }}
              orderId={pauseDialogOrderId}
              orderNumber={(selectedOrder as any)?.order_number || null}
              clientName={(selectedOrder as any)?.client_name || null}
              onPaused={() => {
                setIsModalOpen(false);
                loadOrders();
              }}
            />

            {/* Amendment review drawer -- opens when a notification
                link routes here with ?amendment=...&orderId=...
                Stays in sync with the URL so the operator can refresh
                without losing context. */}
            <AmendmentReviewDrawer
              open={reviewDrawer.kind === "amendment"}
              amendmentId={reviewDrawer.kind === "amendment" ? reviewDrawer.requestId : null}
              orderId={reviewDrawer.kind === "amendment" ? reviewDrawer.orderId : null}
              onClose={closeReviewDrawer}
              onActioned={() => loadOrders()}
              onEditOrder={openOrderDetail}
            />

            {/* Cancellation / postpone review drawer. */}
            <CancellationReviewDrawer
              open={reviewDrawer.kind === "cancellation"}
              cancellationId={reviewDrawer.kind === "cancellation" ? reviewDrawer.requestId : null}
              orderId={reviewDrawer.kind === "cancellation" ? reviewDrawer.orderId : null}
              onClose={closeReviewDrawer}
              onActioned={() => loadOrders()}
              onEditOrder={openOrderDetail}
            />
          </div>
        </div>

        <Footer />

        <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
      </div>
    </>
  );
}

export default function AdminOrders() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <OrderProcessDashboard />
    </ProtectedRoute>
  );
}