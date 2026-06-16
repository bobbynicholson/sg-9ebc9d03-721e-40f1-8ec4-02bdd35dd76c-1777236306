import { useState, useEffect, useMemo, useRef } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Calendar, Users, DollarSign, Download, Eye, Edit, ChevronRight, Clock, CheckCircle2, Package, MapPin, AlertCircle, LayoutGrid, List, ArrowRight, Trash2, Save, X, FileText, Receipt, Pause, Play, Copy, Star, RefreshCw, MoreHorizontal, Phone, MessageCircle, Mail } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { computeOrderTimeline, type OrderTimeline } from "@/services/order/orderTimeline";
import { computeOrderReadiness, type OrderReadiness } from "@/services/order/orderReadiness";
import { TimelineTrack } from "@/components/admin/orders/TimelineTrack";
import { AssignedShiftsPanel } from "@/components/admin/orders/AssignedShiftsPanel";
import { OrderReadinessChip } from "@/components/admin/orders/OrderReadinessChip";
import { OrderTimesStrip } from "@/components/admin/orders/OrderTimesStrip";
import { useTenantHref } from "@/lib/tenantUrl";
import { emitOrderUpdated, onOrderUpdated } from "@/lib/events/orderEvents";
import { BookingFacts } from "@/components/booking/BookingFacts";
import type { BookingFacts as BookingFactsType } from "@/services/booking/bookingFacts";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
import { RemoveOrderDialog } from "@/components/admin/orders/RemoveOrderDialog";
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
// P2-13 Phase A+B sibling files. The split plan lives at
// docs/audits/p2-13-orders-split-plan.md.
import type { OrderStats, SavedView } from "@/components/admin/orders/types";
import {
  STATUS_CONFIG,
  WORKFLOW_STAGES,
  getStageStatus,
  getNextStage,
} from "@/components/admin/orders/statusConfig";
import { DuplicateOrderDialog } from "@/components/admin/orders/DuplicateOrderDialog";
import { OrderKpiPills } from "@/components/admin/orders/OrderKpiPills";
import { OrderFiltersBar } from "@/components/admin/orders/OrderFiltersBar";
import { OrdersBulkActionsBar } from "@/components/admin/orders/OrdersBulkActionsBar";
import { OrdersListEmptyState } from "@/components/admin/orders/OrdersListEmptyState";
import { OrderHistoryTimeline } from "@/components/admin/orders/OrderHistoryTimeline";
import { OrderDetailsModal } from "@/components/admin/orders/OrderDetailsModal";
import { TimelineRow } from "@/components/admin/orders/TimelineRow";
import { KanbanColumn } from "@/components/admin/orders/KanbanBoard";
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
import { logPiiAccess } from "@/services/piiAccessLogService";
import { OrderNotesThread } from "@/components/admin/OrderNotesThread";
import { OutsourcedFulfilmentPanel } from "@/components/admin/orders/OutsourcedFulfilmentPanel";
import { downloadOrderIcs } from "@/lib/orderToIcs";
import { trackRecentlyViewed } from "@/components/admin/RecentlyViewedWidget";
import { getEquipmentAvailability } from "@/services/equipmentAvailabilityService";
import { toLocalISO } from "@/lib/localDate";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
// Wave 54 - centralised formatters. Replaces three bare
// toLocaleDateString() call sites that defaulted to OS locale (US
// machines showed 5/16/2026 on SA tenants).
import { formatDate } from "@/lib/formatters";

// OrderStats type + STATUS_CONFIG + WORKFLOW_STAGES + helpers
// extracted to sibling files in the P2-13 Phase B split. Imported
// just below.

function OrderProcessDashboard() {
  const { user } = useAuth();
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const router = useRouter();
  // Wave 26.1: tenant-slug wrapper for the toolbar Links + the
  // router.push("/admin/order-assignments") in the Cmd+N shortcut.
  // Without this, the operator on /spit-braai-delivery/admin/orders
  // who hits "New Order" or opens the delivery sheet drops out of
  // the tenant namespace into bare /admin/...
  const { withSlug } = useTenantHref();
  // Phase 8 #4: tenant currency symbol. Drops the hard-coded R
  // throughout the page so a tenant trading in USD / GBP / NGN
  // sees its real currency on every order card, modal subtotal
  // and edit-mode line. Defaults to R until the row resolves.
  const tenantCurrency = useTenantCurrency(user?.company_id);
  const C = tenantCurrency.symbol;
  const [orders, setOrders] = useState<AppOrder[]>([]);
  // Per-order summary of email_automation_log entries: count of sent
  // automations, latest event, and a "post-event review automation
  // already fired" flag. Surfaced on each OrderCard so the team sees
  // which automations have / haven't gone out.
  const [autoEmailMap, setAutoEmailMap] = useState<Map<string, OrderAutoEmailSummary>>(new Map());
  // Wave 25: per-order derived timeline. Computed once per loadOrders
  // pass from a batch-fetch of related rows (payments, equipment
  // bookings, hire orders, cleaning status, prep tasks, driver
  // assignments, invoices). Empty map until first load.
  const [timelinesById, setTimelinesById] = useState<Map<string, OrderTimeline>>(new Map());
  // Wave 59 - batched shifts + profiles for AssignedShiftsPanel
  // (closes the per-card N+1 fan-out).
  const [allShiftsByOrder, setAllShiftsByOrder] = useState<Map<string, any[]>>(new Map());
  const [staffProfilesById, setStaffProfilesById] = useState<Map<string, any>>(new Map());
  // Wave 46 T2 - per-order readiness chip (green/orange/red).
  // tenantTimezone is sourced from the existing state at line 245
  // (Phase 13 #9 already pulls companies.timezone), so we don't
  // duplicate the fetch.
  const [readinessById, setReadinessById] = useState<Map<string, OrderReadiness>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // Phase 26 #1: "/" or Cmd-F focuses the search box. Matches the
  // pattern already shipped on /admin/contacts and /admin/inventory.
  // Phase 29 #1: "n" jumps to the new-order surface so power users
  // can chain triage with creation without reaching for the mouse.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        // Wave 70.94 routed this to the quote builder because every
        // order is born from an accepted quote. TIGHTEN I.2 also
        // relabelled the button to "New Quote" so the n-shortcut
        // and the button now agree on both destination and intent.
        router.push(withSlug("/admin/quotes/new"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  // Custom-range pickers - only used when dateFilter === "custom".
  // Stored as YYYY-MM-DD so they round-trip through <input type="date" />.
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  // Wave 24: Timeline is the default. Most operators glance at the
  // page to see "what's next + what's stuck" - the kanban hides
  // sequencing, the timeline puts every order's progress band right
  // under the date so the daily briefing reads top-to-bottom. Saved-
  // view + ?view= URL param still override (the previous loadSaved
  // path below restores the user's last picked mode).
  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("timeline");
  // Phase 13 #8: 'My orders only' quick toggle. Restricts the
  // visible list to orders the current user is the chef or driver
  // on. Useful for kitchen leads + drivers who shouldn't be
  // distracted by other people's events.
  const [myOrdersOnly, setMyOrdersOnly] = useState(false);
  // Phase 13 #9: tenant timezone chip in header. Surfaces the
  // companies.timezone value so a multi-region tenant working
  // across branches doesn't second-guess which clock is driving
  // the date filters.
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  useEffect(() => {
    const cid = (user as any)?.company_id;
    if (!cid) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("timezone")
        .eq("id", cid)
        .maybeSingle();
      if (error) {
        console.error("[admin/orders] companies.timezone fetch failed:", error);
      }
      if (!cancelled) setTenantTimezone((data as any)?.timezone || null);
    })();
    return () => { cancelled = true; };
  }, [(user as any)?.company_id]);
  // Phase 8 #3: persist filter state across reloads. The dispatch
  // team usually has a steady working filter (e.g. "this week,
  // confirmed only, JHB region") and was losing it every time
  // they navigated away. We hydrate once on mount and persist on
  // every relevant change.
  // Phase 12 #8: URL query params take precedence over localStorage
  // so a deep-link like /admin/orders?dateFilter=custom&from=2026-
  // 04-01&to=2026-04-30 opens with that exact filter set. Makes
  // filtered views shareable via Slack / email and respects router-
  // driven navigation (e.g. dashboard 'this week' → orders).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      const qSearch = sp.get("q");
      const qStatus = sp.get("status");
      const qDate = sp.get("dateFilter");
      const qFrom = sp.get("from");
      const qTo = sp.get("to");
      const qView = sp.get("view");
      // Apply URL params first; fall back to localStorage for any
      // missing piece so half-deep-links still get a sane page.
      const raw = window.localStorage.getItem("cateringms.adminOrders.filters.v1");
      const saved = raw ? JSON.parse(raw) : {};
      if (qSearch != null) setSearchTerm(qSearch);
      else if (typeof saved.searchTerm === "string") setSearchTerm(saved.searchTerm);
      if (qStatus != null) setStatusFilter(qStatus);
      else if (typeof saved.statusFilter === "string") setStatusFilter(saved.statusFilter);
      if (qDate != null) setDateFilter(qDate);
      else if (typeof saved.dateFilter === "string") setDateFilter(saved.dateFilter);
      if (qFrom != null) setDateFrom(qFrom);
      else if (typeof saved.dateFrom === "string") setDateFrom(saved.dateFrom);
      if (qTo != null) setDateTo(qTo);
      else if (typeof saved.dateTo === "string") setDateTo(saved.dateTo);
      if (qView === "kanban" || qView === "timeline") setViewMode(qView);
      else if (saved.viewMode === "kanban" || saved.viewMode === "timeline") setViewMode(saved.viewMode);
    } catch {
      // Corrupt JSON or storage blocked - silently fall back to defaults.
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Phase 13 #5: saved-view chips. Operators with a steady set of
  // working filters (e.g. 'JHB next 7 days', 'overdue collections')
  // can save the current filter snapshot as a named chip and snap
  // back with one click. Stored in localStorage per browser.
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cateringms.adminOrders.savedViews.v1");
      if (raw) setSavedViews(JSON.parse(raw) as SavedView[]);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminOrders.savedViews.v1",
        JSON.stringify(savedViews),
      );
    } catch { /* storage blocked */ }
  }, [savedViews]);
  const saveCurrentView = () => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this view:", "");
    if (!name || !name.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setSavedViews((prev) => [
      ...prev.filter((v) => v.name.toLowerCase() !== name.trim().toLowerCase()),
      { id, name: name.trim(), searchTerm, statusFilter, dateFilter, dateFrom, dateTo },
    ]);
  };
  const applySavedView = (v: SavedView) => {
    setSearchTerm(v.searchTerm);
    setStatusFilter(v.statusFilter);
    setDateFilter(v.dateFilter);
    setDateFrom(v.dateFrom);
    setDateTo(v.dateTo);
  };
  const removeSavedView = (id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminOrders.filters.v1",
        JSON.stringify({ searchTerm, statusFilter, dateFilter, dateFrom, dateTo, viewMode }),
      );
    } catch {
      /* storage blocked, harmless */
    }
  }, [searchTerm, statusFilter, dateFilter, dateFrom, dateTo, viewMode]);
  // Phase 15 #7: render cap on the timeline view. The kanban
  // view chunks rows by status column so it tolerates large
  // sets gracefully, but the timeline rendered every order in
  // a single column - a tenant with 800+ confirmed-and-onwards
  // orders saw the page freeze. Cap at 200 by default with an
  // opt-in 'show all'.
  const TIMELINE_CAP = 200;
  const [timelineShowAll, setTimelineShowAll] = useState(false);
  // Reset 'show all' when filters change so a heavy view doesn't
  // re-explode after the operator narrows then widens again.
  useEffect(() => { setTimelineShowAll(false); }, [statusFilter, dateFilter, dateFrom, dateTo, searchTerm]);
  // Phase 11 #8: pending amendment + cancellation request counts.
  // Surfaces as inline badges in the page header so the dispatch
  // lead sees how much client-driven work is queued without
  // opening each order.
  //
  // TIGHTEN I.2 (2026-05-26): the badges also act as filter chips
  // that link to ?status=pending-amendments / pending-cancellations.
  // Pre-fix those URL params didn't match any real order status -
  // the chip emptied the timeline. We now project order_id off the
  // request tables and keep a Set per chip so the filter at
  // getFilteredOrders() can resolve the synthetic status against
  // the set of orders with an open request.
  const [pendingAmendmentCount, setPendingAmendmentCount] = useState(0);
  const [pendingCancellationCount, setPendingCancellationCount] = useState(0);
  const [pendingAmendmentOrderIds, setPendingAmendmentOrderIds] = useState<Set<string>>(new Set());
  const [pendingCancellationOrderIds, setPendingCancellationOrderIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const companyId = (user as any)?.company_id;
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [aRes, cRes] = await Promise.all([
          (supabase as any)
            .from("order_amendment_requests")
            .select("order_id")
            .eq("company_id", companyId)
            .eq("status", "pending"),
          (supabase as any)
            .from("cancellation_requests")
            .select("order_id")
            .eq("company_id", companyId)
            .eq("status", "pending"),
        ]);
        if (cancelled) return;
        const aRows = (aRes?.data || []) as Array<{ order_id: string | null }>;
        const cRows = (cRes?.data || []) as Array<{ order_id: string | null }>;
        const aIds = new Set(aRows.map((r) => r.order_id).filter((x): x is string => !!x));
        const cIds = new Set(cRows.map((r) => r.order_id).filter((x): x is string => !!x));
        setPendingAmendmentCount(aRows.length);
        setPendingCancellationCount(cRows.length);
        setPendingAmendmentOrderIds(aIds);
        setPendingCancellationOrderIds(cIds);
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
  }, [(user as any)?.company_id, orders.length]);
  // Phase 7 #6: bulk-select for the timeline view. Set of order ids
  // currently ticked. Toolbar appears when size > 0; Kanban view
  // ignores it (the cards are too dense to make checkboxes readable).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AppOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Phase 17 #8: record opened order in the recently-viewed list so
  // the dashboard widget can offer a quick jump back. Fires only
  // when the modal opens (selectedOrder + isModalOpen).
  useEffect(() => {
    if (!selectedOrder?.id || !isModalOpen) return;
    trackRecentlyViewed({
      id: selectedOrder.id,
      type: "order",
      label: `${(selectedOrder as any).order_number || ""} - ${selectedOrder.client_name || "Unknown"}`,
      href: `/admin/orders?orderId=${selectedOrder.id}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder?.id, isModalOpen]);

  // Wave 70.3 - POPIA logPiiAccess on order modal open. The order
  // modal exposes the client name, phone, email and (for buy-and-
  // sell) billing address every time it's opened. POPIA needs a
  // who/what/when trail of PII reads, so we fire a fire-and-forget
  // log when the modal goes from closed -> open with a selected
  // order. Fires once per modal-open; subsequent re-renders of the
  // same order don't re-log because the effect depends only on the
  // open-state transition and the order id.
  useEffect(() => {
    if (!selectedOrder?.id || !isModalOpen) return;
    const hasPhone = !!(selectedOrder as any).client_phone;
    const hasEmail = !!(selectedOrder as any).client_email;
    if (!hasPhone && !hasEmail) return; // nothing PII-sensitive surfaced
    const fields = [
      "client name",
      hasPhone && "client phone",
      hasEmail && "client email",
    ].filter(Boolean).join(", ");
    void logPiiAccess({
      entityType: "order",
      entityId: selectedOrder.id,
      category: "contact_details",
      fields: `opened order detail modal: ${fields}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder?.id, isModalOpen]);

  // Wave 70.34 - moved orderRating + ratingBusy + editMode into
  // the OrderDetailsModal's internal state. These were parent-level
  // useStates that were ONLY ever read from inside the modal, but
  // any update to them caused a parent re-render - which then
  // remounted the nested OrderDetailsModal component, wiping its
  // state and flashing the UI on every click of Edit / a rating
  // star. Hoisting them into modal-internal state keeps the parent
  // stable when the modal updates its own UI.
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pauseDialogOrderId, setPauseDialogOrderId] = useState<string | null>(null);
  // Wave 55 - duplicate-order dialog open-state + the operator's
  // pre-seed (today + 7d). The form's own date + busy state now
  // live inside DuplicateOrderDialog (P2-13 Phase A split); we just
  // hand it the seed so it can populate the date input on open.
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateDate7DayDefault, setDuplicateDate7DayDefault] = useState<string>("");
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
  // Client filter - when /admin/orders?clientId=<uuid> lands here from
  // Client Search, narrow the kanban / timeline to orders for that
  // client and surface a clearable pill so the operator sees what
  // they're filtered to. Lives alongside the existing review-drawer
  // params, doesn't replace them.
  const [clientFilterId, setClientFilterId] = useState<string | null>(null);
  const [clientFilterName, setClientFilterName] = useState<string | null>(null);
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

  // Phase 11 #5: realtime new-order toast. Subscribes to INSERT
  // events on the orders table scoped to the current tenant so the
  // dispatch team sees a chime + toast the moment a fresh order
  // lands (e.g. client portal submission, embed form, paid quote
  // conversion) without waiting for the next manual refresh.
  useEffect(() => {
    const companyId = (user as any)?.company_id;
    if (!companyId) return;
    // Wave 55 - channel key is stable per (companyId, mount) instead
    // of Math.random(). Avoids leaked subscriptions on Strict Mode
    // double-mount + cleaner HMR.
    const channelKey = `admin-orders-realtime:${companyId}`;
    const channel = (supabase as any)
      .channel(channelKey)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        (payload: any) => {
          const row = payload?.new || {};
          toast({
            title: `New order: ${row.order_number || "incoming"}`,
            description: row.client_name
              ? `${row.client_name}${row.event_date ? ` - ${new Date(row.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}`
              : "An order just landed. Pulling the latest list.",
          });
          loadOrders();
        },
      )
      // Wave 55 - subscribe to UPDATE so a payment captured in
      // another tab, a status flip, a venue edit all reflect on the
      // operator's screen without a manual refresh. Pre-Wave-55 the
      // INSERT-only channel lulled the operator into thinking
      // realtime was comprehensive - false confidence.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => {
          // Quiet refresh - no toast, just keep the list fresh. A
          // status change banner already fires elsewhere.
          loadOrders();
        },
      )
      // Wave 55 - DELETE so a hard-deleted order disappears from
      // the list without a refresh.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => {
          loadOrders();
        },
      )
      // ORD-A (orders audit, ORD-4): payments captured in another tab
      // change the paid balance + payment_status on the order. The
      // orders UPDATE channel only fires when orders rows mutate, not
      // when a payments row lands. Refetch quietly.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `company_id=eq.${companyId}` },
        () => {
          loadOrders();
        },
      )
      // Wave 70.94 - the OrderReadinessChip signals depend on rows
      // outside the orders + payments tables. Pre-Wave-70.94 an invoice
      // marked paid in /admin/invoices, a driver assigned in /admin/
      // order-assignments, a prep task ticked off in /kitchen, or a
      // delivery shift slotted in /admin/kitchen-schedule all required
      // a manual refresh before the chip + timeline reflected the
      // change. Subscribe to each so the list stays accurate without
      // operator effort.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `company_id=eq.${companyId}` },
        () => { loadOrders(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_assignments", filter: `company_id=eq.${companyId}` },
        () => { loadOrders(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_prep_tasks", filter: `company_id=eq.${companyId}` },
        () => { loadOrders(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_shifts", filter: `company_id=eq.${companyId}` },
        () => { loadOrders(); },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(user as any)?.company_id]);

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

  // Wave 28.8: when the URL carries a bare ?orderId=... (no amendment
  // / cancellation params), open the order detail drawer for that
  // order. Used by the timeline "Open" links in the row banner;
  // they navigate to ?orderId so a refresh / direct paste lands on
  // the same drawer state. Waits for the orders list to load before
  // it can match by id; otherwise the click would race the fetch.
  useEffect(() => {
    if (!router.isReady) return;
    const orderId =
      typeof router.query.orderId === "string" ? router.query.orderId : null;
    if (!orderId) return;
    // Skip when a review drawer is already adopting this orderId so
    // we don't double-open both surfaces on the same click.
    if (router.query.amendment || router.query.cancellation) return;
    if (orders.length === 0) return; // wait for fetch
    if (selectedOrder?.id === orderId && isModalOpen) return; // already open
    const found = orders.find((o) => o.id === orderId);
    if (found) {
      setSelectedOrder(found);
      setIsModalOpen(true);
    } else {
      // Wave 55 - deep-link silent failure. Pre-Wave-55 a paste of a
      // Slack link to ?orderId=X would silently land on an empty
      // Orders page if X wasn't in the loaded set (filtered out by
      // region scope, hidden by status filter, soft-deleted). Now
      // surface a toast naming the likely cause + offer a one-click
      // clear so the operator can find the order.
      toast({
        title: "Order not in your current view",
        description: "The link points to an order that's filtered out (cancelled, archived, or outside your region). Clear filters to find it.",
        variant: "destructive",
      });
      // Strip the orderId from URL so a refresh doesn't keep firing
      // the toast.
      const { orderId: _drop, ...rest } = router.query;
      router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true, scroll: false },
      );
    }
    // selectedOrder + isModalOpen intentionally omitted - including
    // them would re-fire on every drawer change and bounce the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    router.isReady,
    router.query.orderId,
    router.query.amendment,
    router.query.cancellation,
    orders,
  ]);

  // Adopt ?clientId from the URL as a filter. Kept separate from the
  // review-drawer effect so they don't fight each other when both
  // params are present. We resolve the client name from the loaded
  // orders so the pill can read "Filtered to <name>" rather than a uuid.
  useEffect(() => {
    if (!router.isReady) return;
    const clientId = typeof router.query.clientId === "string" ? router.query.clientId : null;
    setClientFilterId(clientId);
  }, [router.isReady, router.query.clientId]);

  useEffect(() => {
    if (!clientFilterId) {
      setClientFilterName(null);
      return;
    }
    const match = orders.find((o: any) => o.client_id === clientFilterId);
    if (match) {
      const nm = (match as any).client?.client_name
        || (match as any).client_name
        || null;
      setClientFilterName(nm);
    }
  }, [clientFilterId, orders]);

  const clearClientFilter = () => {
    setClientFilterId(null);
    setClientFilterName(null);
    if (router.isReady) {
      const { clientId: _drop, ...rest } = router.query;
      router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true },
      );
    }
  };

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

  // Stats follow the filters - revenue / counts always reflect what's
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
        // Non-fatal - the cards still render without automation
        // status, just without the extra chips.
        console.warn("[orders] email_automation_log fetch failed", err);
      }

      // Wave 25: batch-fetch the related rows that drive the new
      // 22-stage timeline (payments, equipment bookings, hire orders,
      // cleaning status, prep tasks, driver assignments, invoices).
      // Each query is filtered by .in("order_id", ...) so we only
      // pull rows for orders currently visible. Failures degrade
      // gracefully - the missing slice means stages that depend on
      // that table render as 'upcoming' (worst case) rather than
      // crashing the page.
      try {
        const orderIds = allOrders.map((o: any) => o.id).filter(Boolean);
        if (orderIds.length > 0) {
          // Wave 44 T2: also batch-fetch active cleaning_jobs
          // (filtered by the equipment_ids on this set of orders)
          // and delivery shifts (kitchen_shifts where order_id IS
          // NOT NULL). Both feed the new cross-system blocker
          // detection in computeOrderTimeline.
          // Wave 45 D3: dropped the equipment_cleaning_status query
          // - the table is being retired in favour of cleaning_jobs
          // (already pulled below as cleaningJobsActiveRows for the
          // cross-system blocker detection). The timeline still
          // accepts equipmentCleaningStatus for back-compat but we
          // pass [] now.
          // Wave 46 T3 - 3 new batch queries that feed the
          // computeOrderReadiness chip:
          //   - order_items: 'menu_items_present' signal
          //   - kitchen_shifts(kitchen+kitchen_and_cleaning) on each
          //     event_date: 'kitchen_shift_event_day' signal (separate
          //     from the existing delivery-only fetch)
          //   - vehicles: reserved for the Wave 47 service-due signal
          // Distinct event_dates pulled from the order set so the
          // shift query is ONE round-trip per page refresh, not per
          // order. RLS already company-scopes everything.
          const distinctEventDates = Array.from(
            new Set(
              (allOrders as any[])
                .map((o) => o.event_date as string | null | undefined)
                .filter((d): d is string => !!d),
            ),
          );
          const distinctVehicleIds = Array.from(
            new Set(
              (allOrders as any[])
                .map((o) => o.assigned_vehicle_id as string | null | undefined)
                .filter((v): v is string => !!v),
            ),
          );
          const [
            paymentsRes,
            bookingsRes,
            hireRes,
            prepRes,
            assignmentsRes,
            invoicesRes,
            emailLogRes,
            deliveryShiftsRes,
            outsourceRes,
            orderItemsRes,
            kitchenShiftsEventDayRes,
            vehiclesRes,
          ] = await Promise.all([
            supabase.from("payments").select("order_id, payment_type, status, processed_at, amount, payment_method, receipt_sent_at").in("order_id", orderIds),
            // Wave 47 fix - pre_event_cleaning_done_at column was
            // selected but never existed on the live DB. The whole
            // bookings batch was silently erroring (or returning
            // empty) for every page load. We derive pre-event
            // cleaning state from cleaning_jobs instead now.
            supabase.from("equipment_bookings").select("order_id, equipment_id, status, returned_quantity").in("order_id", orderIds),
            supabase.from("equipment_hire_orders").select("order_id, supplier_name, expected_pickup_date, actual_pickup_date, expected_return_date, actual_return_date, status, created_at").in("order_id", orderIds),
            supabase.from("kitchen_prep_tasks").select("order_id, status, started_at, completed_at").in("order_id", orderIds),
            supabase.from("driver_assignments").select("order_id, assignment_type, status, accepted_at, started_at, completed_at, created_at").in("order_id", orderIds),
            // Wave 67 Phase E - outsource assignments joined with
            // provider name so the timeline's outsource_pending blocker
            // can name who hasn't responded.
            (supabase as any)
              .from("outsource_assignments")
              .select("id, order_id, provider_id, status, quoted_cost, provider:provider_id(provider_name)")
              .in("order_id", orderIds)
              .is("deleted_at", null),
            // Wave 70.94 - include due_date in the batch. Without it the
            // OrderReadinessChip's balance_not_overdue signal couldn't
            // see the invoice-level due date and fell back to
            // orders.balance_due_date, which drifts apart from the
            // invoice (e.g. ORD-003831 shows orders.balance_due_date =
            // 2026-05-16 but invoices.due_date = 2026-05-30, producing
            // a phantom "was due 16 May" banner on a not-yet-due order).
            // TIGHTEN I.81: drop soft-deleted invoices from the batch
            // so OrderReadinessChip can't see a voided invoice as still
            // attached to its order.
            supabase.from("invoices").select("id, order_id, invoice_number, total_amount, sent_at, paid_at, status, balance_due, created_at, invoice_date, due_date").in("order_id", orderIds).is("deleted_at", null),
            supabase.from("email_automation_log").select("order_id, template_type, status, sent_at, created_at").in("order_id", orderIds),
            (supabase as any)
              .from("kitchen_shifts")
              .select("id, order_id, staff_id, planned_start, actual_start")
              .in("order_id", orderIds)
              .eq("shift_type", "delivery")
              .is("deleted_at", null),
            // Wave 46 T3 additions:
            (supabase as any)
              .from("order_items")
              .select("order_id, item_name, quantity")
              .in("order_id", orderIds),
            distinctEventDates.length > 0
              ? (supabase as any)
                  .from("kitchen_shifts")
                  .select("id, shift_date, staff_id, status, shift_type")
                  .in("shift_date", distinctEventDates)
                  .in("shift_type", ["kitchen", "kitchen_and_cleaning"])
                  .is("deleted_at", null)
              : Promise.resolve({ data: [] as any[] } as any),
            distinctVehicleIds.length > 0
              ? (supabase as any)
                  .from("vehicles")
                  .select("id, next_service_due, nickname, plate")
                  .in("id", distinctVehicleIds)
              : Promise.resolve({ data: [] as any[] } as any),
          ]);

          // Cross-system blocker T2: pull active cleaning_jobs
          // for any equipment booked on this batch of orders. Two
          // hops because cleaning_jobs is keyed by equipment_id,
          // not order_id.
          const equipmentIdsThisBatch = Array.from(
            new Set(
              ((bookingsRes.data || []) as Array<{ equipment_id?: string | null }>)
                .map((b) => b.equipment_id)
                .filter((x): x is string => typeof x === "string"),
            ),
          );
          let cleaningJobsActiveRows: Array<{ equipment_id: string; equipment_name?: string | null; status?: string }> = [];
          if (equipmentIdsThisBatch.length > 0) {
            const { data: cjRaw, error: cjErr } = await (supabase as any)
              .from("cleaning_jobs")
              .select("equipment_id, status")
              .in("equipment_id", equipmentIdsThisBatch)
              .in("status", ["queued", "in_progress"])
              .is("deleted_at", null);
            if (cjErr) console.error("[orders] cleaning_jobs batch failed:", cjErr);
            const eqIdsInJobs = Array.from(
              new Set(((cjRaw || []) as Array<{ equipment_id: string }>).map((r) => r.equipment_id)),
            );
            const eqNameMap = new Map<string, string>();
            if (eqIdsInJobs.length > 0) {
              const { data: eqRaw } = await (supabase as any)
                .from("equipment")
                .select("id, name")
                .in("id", eqIdsInJobs);
              for (const e of (eqRaw || []) as Array<{ id: string; name: string | null }>) {
                if (e.name) eqNameMap.set(e.id, e.name);
              }
            }
            cleaningJobsActiveRows = ((cjRaw || []) as Array<{ equipment_id: string; status: string }>).map((r) => ({
              equipment_id: r.equipment_id,
              equipment_name: eqNameMap.get(r.equipment_id) || null,
              status: r.status,
            }));
          }

          // Bucket each row-set by order_id once, then compute
          // timeline per order with O(1) lookup. Avoids N filter
          // passes through the same array.
          const bucket = <T extends { order_id?: string | null }>(rows: T[] | null) => {
            const m = new Map<string, T[]>();
            for (const r of rows || []) {
              const key = String(r.order_id || "");
              if (!key) continue;
              const arr = m.get(key);
              if (arr) arr.push(r); else m.set(key, [r]);
            }
            return m;
          };
          const paymentsByOrder = bucket(paymentsRes.data as any[] | null);
          const bookingsByOrder = bucket(bookingsRes.data as any[] | null);
          const hireByOrder = bucket(hireRes.data as any[] | null);
          const prepByOrder = bucket(prepRes.data as any[] | null);
          const assignmentsByOrder = bucket(assignmentsRes.data as any[] | null);
          const invoicesByOrder = bucket(invoicesRes.data as any[] | null);
          const emailLogByOrder = bucket(emailLogRes.data as any[] | null);
          const deliveryShiftsByOrder = bucket(deliveryShiftsRes.data as any[] | null);
          // Wave 67 Phase E - outsource assignments bucketed by order_id
          // with provider_name flattened for the timeline blocker chip.
          const outsourceByOrder = (() => {
            const m = new Map<string, any[]>();
            for (const row of ((outsourceRes as any).data || []) as any[]) {
              const flat = {
                id: row.id,
                provider_id: row.provider_id,
                status: row.status,
                quoted_cost: row.quoted_cost,
                provider_name: row.provider?.provider_name || null,
              };
              const arr = m.get(row.order_id);
              if (arr) arr.push(flat); else m.set(row.order_id, [flat]);
            }
            return m;
          })();

          // For cleaningJobsActive: scope per-order by intersecting
          // its equipment_bookings.equipment_id set with the active
          // cleaning_jobs rows. computeOrderTimeline does the final
          // filter, but pre-bucketing trims the payload size.

          // Wave 46 T3 - bucket the new fetches.
          const orderItemsByOrder = bucket(orderItemsRes.data as any[] | null);
          const kitchenShiftsEventDayRows = (kitchenShiftsEventDayRes.data as any[] | null) || [];
          const vehicleRowsRaw = (vehiclesRes.data as any[] | null) || [];
          const vehicleById = new Map<string, any>();
          for (const v of vehicleRowsRaw) vehicleById.set(String(v.id), v);

          // Wave 59 - batched shifts + profiles for AssignedShiftsPanel.
          // Pre-Wave-59 each rendered AssignedShiftsPanel fired its own
          // kitchen_shifts query AND its own profiles query per order
          // - 200 visible orders = up to 400 round-trips, wedging the
          // Supabase pool. Now: one query for all shifts on these
          // order_ids, one query for all distinct staff_ids found in
          // the shifts. Per-card panel reads from the preloaded maps.
          let allShiftsByOrder = new Map<string, any[]>();
          const staffProfilesById = new Map<string, any>();
          try {
            const { data: allShiftRows } = await (supabase as any)
              .from("kitchen_shifts")
              .select("id, order_id, staff_id, shift_type, shift_date, planned_start, planned_end, actual_start, actual_end, status")
              .in("order_id", orderIds)
              .is("deleted_at", null);
            allShiftsByOrder = bucket(allShiftRows as any[] | null);
            const distinctStaffIds = Array.from(new Set(
              ((allShiftRows || []) as Array<{ staff_id: string | null }>)
                .map((r) => r.staff_id)
                .filter((v): v is string => !!v),
            ));
            if (distinctStaffIds.length > 0) {
              const { data: profileRows } = await (supabase as any)
                .from("profiles")
                .select("id, full_name, email")
                .in("id", distinctStaffIds);
              for (const p of (profileRows || []) as any[]) {
                staffProfilesById.set(p.id, p);
              }
            }
          } catch (shiftBatchErr) {
            console.warn("[orders] Wave 59 shift batch failed - AssignedShiftsPanel will fall back to per-card fetch", shiftBatchErr);
          }
          // Push into state so the per-row AssignedShiftsPanel reads it.
          setAllShiftsByOrder(allShiftsByOrder);
          setStaffProfilesById(staffProfilesById);

          const timelines = new Map<string, OrderTimeline>();
          const readinesses = new Map<string, OrderReadiness>();
          for (const o of allOrders as any[]) {
            // Wave 67.2 - attach outsource assignments to the order
            // row so the money summary inside the order modal can read
            // them without a second round-trip. The OutsourcedFulfilmentPanel
            // still does its own live fetch with the full nested provider
            // join; this is a lightweight rollup for COGS maths only.
            (o as any).__outsourceAssignments = outsourceByOrder.get(o.id) || [];
            const orderEqIds = new Set<string>(
              (bookingsByOrder.get(o.id) || [])
                .map((b: any) => b.equipment_id)
                .filter((x: any): x is string => typeof x === "string"),
            );
            const cleaningJobsActive = cleaningJobsActiveRows.filter((r) =>
              orderEqIds.has(r.equipment_id),
            );
            // Wave 46 T1 - pass tenant timezone so the urgency tier
            // buckets by calendar day in the operator's wall clock.
            const timelineInput: any = {
              order: o,
              payments: paymentsByOrder.get(o.id) || [],
              equipmentBookings: bookingsByOrder.get(o.id) || [],
              equipmentHireOrders: hireByOrder.get(o.id) || [],
              equipmentCleaningStatus: [],
              kitchenPrepTasks: prepByOrder.get(o.id) || [],
              driverAssignments: assignmentsByOrder.get(o.id) || [],
              invoices: invoicesByOrder.get(o.id) || [],
              emailLog: emailLogByOrder.get(o.id) || [],
              cleaningJobsActive,
              deliveryShifts: deliveryShiftsByOrder.get(o.id) || [],
              outsourceAssignments: outsourceByOrder.get(o.id) || [],
              tenantTimezone,
            };
            const tl = computeOrderTimeline(timelineInput);
            timelines.set(o.id, tl);

            // Wave 46 T2 - compute the readiness chip alongside.
            const eventDay = o.event_date as string | null | undefined;
            const kitchenShiftsForDay = eventDay
              ? kitchenShiftsEventDayRows.filter(
                  (r) => r.shift_date === eventDay,
                )
              : [];
            const readiness = computeOrderReadiness(
              {
                ...timelineInput,
                orderItems: orderItemsByOrder.get(o.id) || [],
                kitchenShiftsEventDay: kitchenShiftsForDay,
                vehicle: o.assigned_vehicle_id ? vehicleById.get(String(o.assigned_vehicle_id)) || null : null,
              },
              tl,
            );
            readinesses.set(o.id, readiness);
          }
          setTimelinesById(timelines);
          setReadinessById(readinesses);
        } else {
          setTimelinesById(new Map());
          setReadinessById(new Map());
          setAllShiftsByOrder(new Map());
          setStaffProfilesById(new Map());
        }
      } catch (err) {
        // Non-fatal - the timeline component handles a missing entry
        // by falling back to the legacy WORKFLOW_STAGES rendering.
        console.warn("[orders] timeline batch fetch failed", err);
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

    // Booked revenue counts every order whose lifecycle has advanced
    // past pending / draft. The earlier gate required deposit_paid OR
    // confirmed_at to be set, but the status column got pushed to
    // 'confirmed' by several code paths (quote accept, manual status
    // change) without those auxiliary columns being stamped,
    // resulting in an order that the UI shows as 'Confirmed' but the
    // revenue tile counted as zero. Status is the visible truth here,
    // so it's the gate. The auxiliary columns still flip independently
    // and are used elsewhere (deposit-paid signals, audit timestamps).
    const BOOKED_STATUSES = new Set([
      "confirmed", "preparing", "ready", "in_transit",
      "delivered", "completed", "paused",
    ]);
    const REALISED_STATUSES = new Set(["delivered", "completed"]);
    const isConfirmedOrder = (o: any) => BOOKED_STATUSES.has(String(o.status || "").toLowerCase());

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
      // Client filter - when the operator landed here via Client
      // Search ("View orders"), narrow to orders for that client only.
      if (clientFilterId && (order as any).client_id !== clientFilterId) {
        return false;
      }
      // Global region filter - when an operator scopes to one branch
      // in the top-bar dropdown, hide rows from other branches.
      // region_id IS NULL rows (legacy / company-wide) stay visible
      // so they can be triaged.
      if (regionFilterId && (order as any).region_id && (order as any).region_id !== regionFilterId) {
        return false;
      }
      // Phase 13 #8: 'my orders only' toggle. The kitchen lead /
      // driver wants to drop everyone else's events out of the
      // view; chef + driver assignments both qualify.
      if (myOrdersOnly && (user as any)?.id) {
        const me = (user as any).id;
        const isMine = (order as any).assigned_chef_id === me || (order as any).assigned_driver_id === me;
        if (!isMine) return false;
      }
      // TIGHTEN I.2: synthetic status filters used by the header
      // chips. Match against the per-order Set, not against
      // order.status (these values aren't real lifecycle statuses).
      if (statusFilter === "pending-amendments") {
        if (!pendingAmendmentOrderIds.has(order.id)) return false;
      } else if (statusFilter === "pending-cancellations") {
        if (!pendingCancellationOrderIds.has(order.id)) return false;
      }
      // Hide cancelled by default ("All Statuses" excludes them).
      // Only surface cancelled when the operator explicitly picks
      // "cancelled" in the status dropdown - otherwise they'd
      // clutter the kanban + timeline forever.
      if (statusFilter === "all" && order.status === "cancelled") return false;
      const matchesStatus =
        statusFilter === "all"
        || statusFilter === "pending-amendments"
        || statusFilter === "pending-cancellations"
        || order.status === statusFilter;

      // Date filter - preset windows on the order's event_date
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
          // Custom range picker. Either bound is optional - pick a
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
  }, [orders, statusFilter, dateFilter, dateFrom, dateTo, regionFilterId, clientFilterId, myOrdersOnly, pendingAmendmentOrderIds, pendingCancellationOrderIds, (user as any)?.id]);

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

  // Wave 43 T3 - urgency-first sort. When the operator hasn't typed
  // a search term, surface orders whose timeline is overdue/today/
  // soon at the top so the flashing chip lands above the fold.
  // When a search is active we trust the fuzzy ranking and skip the
  // urgency re-sort - the operator is hunting a specific order.
  // Wave 46 T1 - 'tomorrow' tier slotted between 'today' and 'soon'
  // so tomorrow's events float above the rest of the week.
  const URGENCY_RANK: Record<string, number> = { overdue: 0, today: 1, tomorrow: 2, soon: 3, normal: 4 };
  const getFilteredOrders = () => {
    if (searchTerm) return fuzzyOrders;
    const out = [...fuzzyOrders];
    out.sort((a, b) => {
      const ta = timelinesById.get((a as any).id);
      const tb = timelinesById.get((b as any).id);
      const ra = URGENCY_RANK[(ta as any)?.urgency || "normal"] ?? 3;
      const rb = URGENCY_RANK[(tb as any)?.urgency || "normal"] ?? 3;
      if (ra !== rb) return ra - rb;
      // Same urgency tier - earlier event first.
      const da = new Date((a as any).event_date || 0).getTime();
      const db = new Date((b as any).event_date || 0).getTime();
      return da - db;
    });
    return out;
  };

  // Phase 7 #6: bulk-select helpers + bulk-status mutator.
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = () => {
    const ids = fuzzyOrders.map((o: any) => o.id as string);
    setSelectedIds(new Set(ids));
  };
  const bulkUpdateStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      // Route each order through the canonical workflow instead of a raw
      // `orders.update({status})`. The raw bulk update silently skipped
      // every side effect updateOrderStatus owns - transition validation,
      // kitchen-prep re-plan + auto-invoice on confirm, after-sales on
      // completion, the POD check on delivered, status emails, dispatch
      // broadcast, and the order_status_history audit row. A bookkeeper
      // bulk-confirming 10 orders got NO invoices and NO prep lists.
      const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const r: any = await updateOrderStatus(id, newStatus, user?.id);
            return { id, ok: !(r && r.success === false), error: r?.error as string | undefined };
          } catch (e: any) {
            return { id, ok: false, error: e?.message as string | undefined };
          }
        }),
      );
      const succeeded = results.filter((r) => r.ok).map((r) => r.id);
      const failed = results.filter((r) => !r.ok);

      if (succeeded.length > 0) {
        // Optimistic local update for the rows that actually moved.
        setOrders((prev) =>
          prev.map((o) => (succeeded.includes((o as any).id) ? ({ ...o, status: newStatus } as AppOrder) : o)),
        );
        // ORD-A: emit cateringms:order-updated so dispatch / kitchen /
        // calendar / contacts pick up the change without manual refresh.
        for (const id of succeeded) {
          emitOrderUpdated(id, "admin/orders:bulk-status", ["status"]);
        }
      }

      if (failed.length === 0) {
        toast({
          title: "Bulk update",
          description: `${succeeded.length} order${succeeded.length === 1 ? "" : "s"} moved to ${newStatus}.`,
        });
      } else if (succeeded.length === 0) {
        toast({
          title: "Bulk update failed",
          description: failed[0].error
            || `None of the ${failed.length} order${failed.length === 1 ? "" : "s"} could move to ${newStatus} - that transition isn't allowed from their current status.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Partly done",
          description: `${succeeded.length} moved to ${newStatus}; ${failed.length} skipped (transition not allowed from their current status).`,
          variant: "destructive",
        });
      }
      // Refetch so cascade side-effects (invoices, prep) and any rejected
      // rows reflect their true persisted state.
      loadOrders();
      clearSelection();
    } catch (e: any) {
      toast({
        title: "Bulk update failed",
        description: e?.message || "Could not update the selected orders.",
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  // CSV export of the currently-filtered list. Shared by the overflow
  // menu item and the filters-bar Export button (the latter was a dead
  // button with no handler).
  const exportFilteredCsv = () => {
    const rows = fuzzyOrders as any[];
    if (rows.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Adjust filters until you see at least one order.",
      });
      return;
    }
    const headers = [
      "Order number", "Status", "Client", "Email", "Phone",
      "Event date", "Event time", "Guests", "Venue",
      "Total", "Currency", "Payment status",
      "Created", "Confirmed",
    ];
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(",")];
    for (const o of rows) {
      lines.push([
        esc(o.order_number), esc(o.status), esc(o.client_name), esc(o.client_email), esc(o.client_phone),
        esc(o.event_date), esc(o.event_time), esc(o.guest_count), esc(o.venue_address),
        esc(o.total_amount), esc(o.currency || "ZAR"), esc(o.payment_status),
        esc(o.created_at), esc(o.confirmed_at),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${toLocalISO(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pre-group filtered orders by status once per filter-state change.
  // The kanban view calls getOrdersByStatus once per column (10+
  // columns); without this every render did a fresh O(n) filter per
  // column = O(n*columns) per render. Memoised lookup turns it into
  // O(n) once + O(1) per column [P2-12].
  const ordersByStatus = useMemo(() => {
    const groups: Record<string, AppOrder[]> = {};
    for (const order of fuzzyOrders) {
      const key = (order as AppOrder).status as string;
      if (!groups[key]) groups[key] = [];
      groups[key].push(order as AppOrder);
    }
    return groups;
  }, [fuzzyOrders]);

  const getOrdersByStatus = (status: string) => {
    return ordersByStatus[status] || [];
  };






  // Wave 64.2 - deeplink flicker fix. When a sibling page (e.g. the
  // invoices list "Open order" link) lands here as
  // /admin/orders?orderId=X, the page used to render the full kanban
  // / timeline for ~1s while the orders fetch resolved, then pop the
  // modal on top. Operators read that flash as "glitchy". Now we mask
  // the dashboard with a focused loading overlay while the deeplink
  // is still resolving - the overlay drops the instant the modal
  // opens or the not-found toast fires (which strips ?orderId from
  // the URL).
  const isDeeplinkPending =
    router.isReady &&
    typeof router.query.orderId === "string" &&
    !router.query.amendment &&
    !router.query.cancellation &&
    !isModalOpen &&
    (loading || orders.length === 0);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Orders - CateringMS</title>
      </Head>

      <AdminNav />

      {isDeeplinkPending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="flex flex-col items-center gap-3 text-slate-600">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm">Opening order...</p>
          </div>
        </div>
      )}

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <div className="space-y-6">
            <PortalHeader
              title="Orders"
              icon={ShoppingCart}
              subtitle={
                <>
                  Confirmed events. Every booked job from accepted quote through to delivery, with kitchen prep, dispatch, and post-event status all in one place.
                  {/* Phase 13 #9: tenant timezone hint chip. The
                      date filters interpret event_date in the
                      company's configured timezone, but multi-
                      region tenants couldn't see which clock was
                      driving the math. Self-hides when no tz is
                      set on companies.timezone. */}
                  {tenantTimezone && (
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 align-middle">
                      <Clock className="w-3 h-3" />
                      Times shown in <span className="font-medium text-slate-700">{tenantTimezone}</span>
                    </span>
                  )}
                  {/* Phase 11 #8: pending amendment + cancellation
                      request badges. Hidden when both counts are
                      zero so a quiet day stays clean. Each badge
                      deep-links to the relevant URL filter that
                      opens the AmendmentReviewDrawer pre-scoped. */}
                  {(pendingAmendmentCount > 0 || pendingCancellationCount > 0) && (
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      {pendingAmendmentCount > 0 && (
                        <Link
                          href={withSlug("/admin/orders?status=pending-amendments")}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-0.5"
                          title="Client-requested order amendments awaiting review"
                        >
                          <AlertCircle className="w-3 h-3" />
                          {pendingAmendmentCount} pending amendment{pendingAmendmentCount === 1 ? "" : "s"}
                        </Link>
                      )}
                      {pendingCancellationCount > 0 && (
                        <Link
                          href={withSlug("/admin/orders?status=pending-cancellations")}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-800 bg-rose-100 border border-rose-200 rounded-full px-2.5 py-0.5"
                          title="Client-requested cancellations awaiting decision"
                        >
                          <AlertCircle className="w-3 h-3" />
                          {pendingCancellationCount} pending cancellation{pendingCancellationCount === 1 ? "" : "s"}
                        </Link>
                      )}
                    </span>
                  )}
                </>
              }
              actions={
              /* TIGHTEN I.51 (2026-06-01): toolbar redesign.
                  Previous version had a heavy dark "Kanban / Timeline"
                  pill pair that overpowered the actual primary CTA,
                  plus inconsistent button heights that wrapped onto
                  two rows at common viewport widths - dumping
                  "New Quote" below where nobody looked for it.
                  New layout: macOS-style segmented control for the
                  view toggle (subtle slate background, white card +
                  shadow for active state), an icon-button group for
                  refresh / overflow, then the primary CTA. All
                  buttons land at the same h-9 height so the row
                  reads as one unit. flex-nowrap + ml-auto pushes the
                  whole cluster to the right edge without wrapping at
                  the awkward in-between widths. */
              <>
                {/* Segmented view toggle - subtle "inactive on a card
                    background" pattern so the active state reads as
                    a single elevated chip, not a dark button. */}
                <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("kanban")}
                    aria-pressed={viewMode === "kanban"}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-all ${
                      viewMode === "kanban"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Kanban
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("timeline")}
                    aria-pressed={viewMode === "timeline"}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-all ${
                      viewMode === "timeline"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    Timeline
                  </button>
                </div>
                {/* Icon-action group - refresh + overflow grouped
                    visually so they read as a single secondary
                    cluster, not as orphan buttons drifting between
                    the toggle and the primary CTA. */}
                <div className="inline-flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadOrders}
                    disabled={loading}
                    title="Refresh orders"
                    aria-label="Refresh orders"
                    className="h-9 w-9 p-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" title="More actions" aria-label="More actions" className="h-9 w-9 p-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {/* Phase 13 #1: print-friendly today-only delivery
                        sheet, target=_blank so it opens in its own
                        tab and auto-prints. */}
                    <DropdownMenuItem asChild>
                      <Link
                        href={withSlug("/admin/orders/delivery-sheet")}
                        target="_blank"
                        className="flex items-center cursor-pointer"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Delivery sheet
                      </Link>
                    </DropdownMenuItem>
                    {/* Phase 7 #3: CSV export of the filtered list. */}
                    <DropdownMenuItem
                      onClick={exportFilteredCsv}
                      className="cursor-pointer"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
                {/* TIGHTEN I.51: primary CTA matches the new h-9
                    toolbar baseline, gap-2 over mr-2 so the icon
                    and label align consistently with the other
                    icon-and-label patterns on the page. Bumped
                    shadow + active scale for tactile feedback. */}
                <Link href={withSlug("/admin/quotes/new")}>
                  <Button
                    size="sm"
                    className="h-9 gap-2 bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90 shadow-md hover:shadow-lg active:scale-[0.98] transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    New Quote
                  </Button>
                </Link>
              </>
              }
            />

            <OrderKpiPills stats={stats} />

            {/* TIGHTEN I.2: synthetic-status filter pill. When the
                operator lands here via the header chips with
                ?status=pending-amendments / pending-cancellations,
                the OrderFiltersBar dropdown shows the placeholder
                (no matching SelectItem), so the operator has no
                obvious way to escape the filtered view. The pill
                makes the filter visible and clearable. */}
            {(statusFilter === "pending-amendments" || statusFilter === "pending-cancellations") && (
              <div className="mb-4 flex items-center gap-2">
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 gap-1.5 py-1.5 px-3 text-sm">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {statusFilter === "pending-amendments"
                    ? `Showing ${pendingAmendmentCount} order${pendingAmendmentCount === 1 ? "" : "s"} with a pending amendment`
                    : `Showing ${pendingCancellationCount} order${pendingCancellationCount === 1 ? "" : "s"} with a pending cancellation`}
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className="ml-1 rounded-full hover:bg-amber-200 p-0.5"
                    aria-label="Clear pending-request filter"
                    title="Clear filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </Badge>
              </div>
            )}

            {/* Client filter pill - shows when /admin/orders was opened
                with ?clientId. Click X to clear back to the unfiltered
                view (also strips the param from the URL). */}
            {clientFilterId && (
              <div className="mb-4 flex items-center gap-2">
                <Badge className="bg-purple-100 text-purple-800 border border-purple-200 gap-1.5 py-1.5 px-3 text-sm">
                  <Users className="w-3.5 h-3.5" />
                  Filtered to {clientFilterName || "selected client"}
                  <button
                    type="button"
                    onClick={clearClientFilter}
                    className="ml-1 rounded-full hover:bg-purple-200 p-0.5"
                    aria-label="Clear client filter"
                    title="Clear client filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </Badge>
              </div>
            )}

            <OrderFiltersBar
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              searchRef={searchRef}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              dateFilter={dateFilter}
              onDateFilterChange={setDateFilter}
              dateFrom={dateFrom}
              onDateFromChange={setDateFrom}
              dateTo={dateTo}
              onDateToChange={setDateTo}
              myOrdersOnly={myOrdersOnly}
              onMyOrdersOnlyChange={setMyOrdersOnly}
              savedViews={savedViews}
              onApplySavedView={applySavedView}
              onRemoveSavedView={removeSavedView}
              onSaveCurrentView={saveCurrentView}
              onExport={exportFilteredCsv}
            />

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
                  <KanbanColumn
                    status="pending"
                    title="Pending"
                    getOrdersByStatus={getOrdersByStatus}
                    autoEmailMap={autoEmailMap}
                    currencySymbol={C}
                    setSelectedOrder={setSelectedOrder}
                    setIsModalOpen={setIsModalOpen}
                  />
                  <KanbanColumn
                    status="confirmed"
                    title="Confirmed"
                    getOrdersByStatus={getOrdersByStatus}
                    autoEmailMap={autoEmailMap}
                    currencySymbol={C}
                    setSelectedOrder={setSelectedOrder}
                    setIsModalOpen={setIsModalOpen}
                  />
                  <KanbanColumn
                    status="preparing"
                    title="In Prep"
                    getOrdersByStatus={getOrdersByStatus}
                    autoEmailMap={autoEmailMap}
                    currencySymbol={C}
                    setSelectedOrder={setSelectedOrder}
                    setIsModalOpen={setIsModalOpen}
                  />
                  <KanbanColumn
                    status="ready"
                    title="Ready"
                    getOrdersByStatus={getOrdersByStatus}
                    autoEmailMap={autoEmailMap}
                    currencySymbol={C}
                    setSelectedOrder={setSelectedOrder}
                    setIsModalOpen={setIsModalOpen}
                  />
                  <KanbanColumn
                    status="in_transit"
                    title="In Transit"
                    getOrdersByStatus={getOrdersByStatus}
                    autoEmailMap={autoEmailMap}
                    currencySymbol={C}
                    setSelectedOrder={setSelectedOrder}
                    setIsModalOpen={setIsModalOpen}
                  />
                  <KanbanColumn
                    status="delivered"
                    title="Delivered"
                    getOrdersByStatus={getOrdersByStatus}
                    autoEmailMap={autoEmailMap}
                    currencySymbol={C}
                    setSelectedOrder={setSelectedOrder}
                    setIsModalOpen={setIsModalOpen}
                  />
                  <KanbanColumn
                    status="completed"
                    title="Completed"
                    getOrdersByStatus={getOrdersByStatus}
                    autoEmailMap={autoEmailMap}
                    currencySymbol={C}
                    setSelectedOrder={setSelectedOrder}
                    setIsModalOpen={setIsModalOpen}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <OrdersBulkActionsBar
                  selectedCount={selectedIds.size}
                  busy={bulkBusy}
                  onBulkUpdateStatus={bulkUpdateStatus}
                  onSelectAllVisible={selectAllVisible}
                  onClearSelection={clearSelection}
                />
                {getFilteredOrders().length === 0 ? (
                  <OrdersListEmptyState
                    searchTerm={searchTerm}
                    statusFilter={statusFilter}
                    dateFilter={dateFilter}
                    myOrdersOnly={myOrdersOnly}
                    onClearAll={() => {
                      setSearchTerm("");
                      setStatusFilter("all");
                      setDateFilter("all");
                      setMyOrdersOnly(false);
                    }}
                  />
                ) : (() => {
                  const sorted = getFilteredOrders()
                    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
                  const cappedToRender = timelineShowAll ? sorted : sorted.slice(0, TIMELINE_CAP);
                  const hidden = sorted.length - cappedToRender.length;
                  return (
                    <>
                      {hidden > 0 && (
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                          <span className="text-amber-900">
                            Showing the first <strong className="tabular-nums">{cappedToRender.length}</strong> of <strong className="tabular-nums">{sorted.length}</strong> orders. Use a status or date filter to narrow it - or load them all.
                          </span>
                          <button
                            type="button"
                            onClick={() => setTimelineShowAll(true)}
                            className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline"
                          >
                            Show all {sorted.length}
                          </button>
                        </div>
                      )}
                      {cappedToRender.map((order) => <TimelineRow
                          key={order.id}
                          order={order}
                          selectedIds={selectedIds}
                          timelinesById={timelinesById}
                          readinessById={readinessById}
                          allShiftsByOrder={allShiftsByOrder}
                          staffProfilesById={staffProfilesById}
                          currencySymbol={C}
                          companyId={user?.company_id || null}
                          loadOrders={loadOrders}
                          toggleSelected={toggleSelected}
                          setSelectedOrder={setSelectedOrder}
                          setIsModalOpen={setIsModalOpen}
                          withSlug={withSlug}
                        />)}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Order Details Modal */}
            <OrderDetailsModal
              selectedOrder={selectedOrder}
              isModalOpen={isModalOpen}
              orders={orders}
              user={user}
              loadOrders={loadOrders}
              setSelectedOrder={setSelectedOrder}
              setIsModalOpen={setIsModalOpen}
              setCancelDialogOpen={setCancelDialogOpen}
              setDuplicateDialogOpen={setDuplicateDialogOpen}
              setDuplicateDate7DayDefault={setDuplicateDate7DayDefault}
              setPauseDialogOrderId={setPauseDialogOrderId}
              withSlug={withSlug}
            />

            {/* TIGHTEN I.121: unified cancel-or-purge dialog. Step 1
                lets the operator pick "cancel" (real cancellation,
                refund per policy, optional notify) or "purge"
                (test data / mistake, irreversible, no email). Step 2
                shows the mode-specific form. */}
            <RemoveOrderDialog
              open={cancelDialogOpen}
              onOpenChange={setCancelDialogOpen}
              orderId={selectedOrder?.id || null}
              orderNumber={(selectedOrder as any)?.order_number || null}
              canPurge={(() => {
                const r = ((user as any)?.active_role || (user as any)?.role || "").toString();
                return r === "super_admin" || r === "company_admin" || r === "owner";
              })()}
              onResolved={() => {
                setIsModalOpen(false);
                loadOrders();
                // Wave 70.40 - cancel cascades (status flip + refund
                // payments row + equipment release + comms stop) and
                // purge wipes the row outright. Every listener that
                // shows this order needs to refetch.
                if (selectedOrder?.id) {
                  emitOrderUpdated(selectedOrder.id, "admin/orders:remove", ["status", "payments"]);
                }
              }}
            />

            {/* Wave 55 - replaces window.prompt() for Duplicate.
                Native prompt was a visual frame regression - no
                calendar widget, no in-app frame. */}
            <DuplicateOrderDialog
              open={duplicateDialogOpen}
              onOpenChange={setDuplicateDialogOpen}
              sourceOrderId={selectedOrder?.id || null}
              defaultDate={duplicateDate7DayDefault}
              onDuplicated={() => {
                setIsModalOpen(false);
                loadOrders();
              }}
            />

            {/* Pause dialog - captures reason + expected resume date,
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
                // ORD-A (ORD-5): pause cascade is a status transition
                // that calendar / dispatch / kitchen all care about.
                if (pauseDialogOrderId) {
                  emitOrderUpdated(pauseDialogOrderId, "admin/orders:pause", ["status"]);
                }
              }}
            />

            {/* Amendment review drawer - opens when a notification
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
        </PortalShell>

        <Footer />

        <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
      </div>
    </>
  );
}

export default function AdminOrders() {
  return (
    // ORD-A (ORD-6): admit sales_admin + region_admin. sales_admin
    // needs to see their lead -> order conversions; region_admin sees
    // their region's orders via RLS narrowing.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <OrderProcessDashboard />
    </ProtectedRoute>
  );
}
