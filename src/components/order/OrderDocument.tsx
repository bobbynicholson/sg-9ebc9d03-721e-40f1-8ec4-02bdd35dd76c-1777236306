/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: unified order document.
 *
 * One React tree renders the entire order from every angle. Each role
 * sees the same document - their section auto-expands and scrolls
 * into view on mount, the others render as one-line summaries the
 * viewer can tap to expand.
 *
 * Phase 1 (this commit): read-only. Each section pulls its own data
 * via Supabase, sub realtime updates per section. Action affordances
 * (mark prep done, POD captured, service phase taps) are Phase 2.
 *
 * Three render modes:
 *   - interactive (default): tap to expand, mobile collapses non-own
 *   - print (?print=1): all sections forced open, print-friendly CSS
 *   - client (magic-link path): finance section gone at data layer
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { canSeeOrderFinance } from "@/lib/authGuards";
import { buildCompanyTermsPath } from "@/lib/companyLegal";
import { captureException } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Printer, ArrowLeft, RefreshCw,
  FileText, Activity, ChefHat, ShoppingCart, Truck, Sparkles, Droplets, Wallet, History, Star,
  MessageSquare, MessageCircle, Paperclip, ArrowRight, Utensils,
} from "lucide-react";
import { TimelineTrack } from "@/components/admin/orders/TimelineTrack";
import { computeOrderTimeline, type OrderTimelineStage } from "@/services/order/orderTimeline";
import { OrderHeaderSection } from "./sections/OrderHeaderSection";
import { OrderAlertBanners } from "./OrderAlertBanners";
import { OrderSuggestedAction } from "./OrderSuggestedAction";
import { OrderPresence } from "./OrderPresence";
import { OrderAmendmentBanner } from "./OrderAmendmentBanner";
import { OrderCODBanner } from "./OrderCODBanner";
import { OrderEditNotice } from "./OrderEditNotice";
import { OrderQuickActions } from "./OrderQuickActions";
import { OrderTimelineSection } from "./sections/OrderTimelineSection";
import { KitchenSection } from "./sections/KitchenSection";
import { ShoppingSection } from "./sections/ShoppingSection";
import { DriverSection } from "./sections/DriverSection";
import { ClientDeliverySection } from "./sections/ClientDeliverySection";
import { ClientMenuSection } from "./sections/ClientMenuSection";
import { WaiterSection } from "./sections/WaiterSection";
import { OrderStaffingPanel } from "@/components/admin/orders/OrderStaffingPanel";
import { CleaningSection } from "./sections/CleaningSection";
import { FinanceSection } from "./sections/FinanceSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { CommsLogSection } from "./sections/CommsLogSection";
import { AttachmentsSection } from "./sections/AttachmentsSection";
import { HistorySection } from "./sections/HistorySection";
import { OrderClientChatPanel } from "@/components/chat/OrderClientChatPanel";
import type { OrderChatRole } from "@/services/orderChatService";

const ROUTE_TAG = "/order/[id]";

// ODOC: derive a single "primary role" for the viewer that drives
// the auto-expand behaviour. A user with multiple roles gets the
// most-specific one (waiter > driver > kitchen > shopping > cleaning
// > admin > client). Admin roles see Finance auto-expanded by default.
type ViewerSection = "kitchen" | "driver" | "waiter" | "shopping" | "cleaning" | "admin" | "client";

function resolvePrimarySection(
  role: UserRole | string | undefined,
  userRoles: UserRole[] | undefined,
): ViewerSection {
  const all = new Set<string>();
  if (role) all.add(String(role));
  (userRoles || []).forEach((r) => all.add(String(r)));
  if (all.has(UserRole.WAITER)) return "waiter";
  if (all.has(UserRole.DRIVER)) return "driver";
  if (all.has(UserRole.KITCHEN_MANAGER)) return "kitchen";
  if (all.has(UserRole.KITCHEN_STAFF)) return "kitchen";
  if (all.has(UserRole.SHOPPING_STAFF)) return "shopping";
  if (all.has(UserRole.CLEANING_MANAGER)) return "cleaning";
  if (all.has(UserRole.CLEANING_STAFF)) return "cleaning";
  if (all.has(UserRole.CLIENT)) return "client";
  return "admin";
}

interface OrderHead {
  id: string;
  company_id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string;
  event_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  guest_count: number | null;
  status: string;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  special_instructions: string | null;
  kitchen_instructions: string | null;
  assigned_chef_id: string | null;
  assigned_driver_id: string | null;
  collection_time: string | null;
  // ODOC: full lifecycle timestamp spine. Denormalised on orders by
  // various RPCs/triggers when the corresponding event fires. The
  // timeline section reads these straight off the head row to avoid
  // N+1 joins.
  confirmed_at: string | null;
  prep_started_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  arrived_at_venue_at: string | null;
  pod_captured_at: string | null;
  pod_photo_url: string | null;
  pod_signature_url: string | null;
  delivered_at: string | null;
  setup_started_at: string | null;
  service_started_at: string | null;
  departed_venue_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  postponed_at: string | null;
  requires_waiter: boolean | null;
  waiter_service_required: boolean | null;
  equipment_return_method: string | null;
  created_at: string | null;
  // ODOC Wave B: header intel.
  event_end_date: string | null;
  internal_notes: string | null;
  dietary_requirements: string | null;
  requires_refrigeration: boolean | null;
  requires_two_drivers: boolean | null;
  final_order_change_date: string | null;
  comms_paused_until: string | null;
  region_id: string | null;
  quote_id: string | null;
  package_id: string | null;
  paused_reason: string | null;
  paused_expected_resume_date: string | null;
  paused_from_status: string | null;
  cancellation_reason: string | null;
  lead_source: string | null;
  deposit_amount: number | null;
  amount_paid: number | null;
  balance_amount: number | null;
  balance_due_date: string | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  payment_status: string | null;
  deposit_paid: boolean | null;
  balance_paid: boolean | null;
  // ODOC Wave C: driver intel.
  delivery_distance_km: number | null;
  delivery_duration_minutes: number | null;
  driver_acknowledged_at: string | null;
  driver_acknowledged_via: string | null;
  venue_contact_person: string | null;
  venue_contact_phone: string | null;
  assigned_vehicle_id: string | null;
  secondary_driver_id: string | null;
  secondary_vehicle_id: string | null;
  pickup_time: string | null;
}

const ACTIVE_ROLE_SECTION: Record<ViewerSection, string> = {
  kitchen: "section-kitchen",
  driver: "section-driver",
  waiter: "section-waiter",
  shopping: "section-shopping",
  cleaning: "section-cleaning",
  admin: "section-admin",
  client: "section-timeline",
};

function cleanStatus(status: string | null | undefined): string {
  return String(status || "unknown").replace(/_/g, " ");
}

function fmtOrderStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtEventWhen(order: OrderHead): string {
  const date = new Date(order.event_date).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return order.event_time ? `${date} at ${order.event_time.slice(0, 5)}` : date;
}

function latestStamp(order: OrderHead): string | null {
  return [
    order.completed_at,
    order.departed_venue_at,
    order.delivered_at,
    order.pod_captured_at,
    order.arrived_at_venue_at,
    order.picked_up_at,
    order.ready_at,
    order.prep_started_at,
    order.confirmed_at,
    order.created_at,
  ].filter((s): s is string => !!s).sort().pop() || null;
}

function stageSectionId(stage: OrderTimelineStage | null | undefined, isClient: boolean): string {
  if (!stage || isClient) return "section-timeline";
  switch (stage.key) {
    case "pre_event_shopping":
      return "section-shopping";
    case "kitchen_prep_in_progress":
    case "ready_for_dispatch":
      return "section-kitchen";
    case "driver_assigned_delivery":
    case "in_transit":
    case "delivered":
    case "departed_venue":
    case "collection_scheduled":
    case "collection_done":
      return "section-driver";
    case "setup_started":
    case "service_started":
    case "service_ended":
    case "event_complete":
      return "section-waiter";
    case "pre_event_cleaning":
    case "post_event_cleaning":
      return "section-cleaning";
    case "deposit_invoice_issued":
    case "deposit_paid":
    case "final_invoice_issued":
    case "final_invoice_sent":
    case "balance_paid":
    case "receipt_issued":
      return "section-admin";
    case "completed":
    case "thank_you_sent":
      return "section-history";
    default:
      return "section-header";
  }
}

function stageOwner(stage: OrderTimelineStage | null | undefined, isClient: boolean): string {
  if (!stage) return isClient ? "Catering team" : "Team";
  if (isClient) {
    switch (stage.group) {
      case "dispatch":
        return "Delivery team";
      case "on_site":
        return "Event team";
      default:
        return "Catering team";
    }
  }
  switch (stage.key) {
    case "pre_event_shopping":
      return "Shopping";
    case "kitchen_prep_in_progress":
    case "ready_for_dispatch":
      return "Kitchen";
    case "driver_assigned_delivery":
    case "in_transit":
    case "delivered":
    case "departed_venue":
    case "collection_scheduled":
    case "collection_done":
      return "Driver";
    case "setup_started":
    case "service_started":
    case "service_ended":
    case "event_complete":
      return "Service";
    case "pre_event_cleaning":
    case "post_event_cleaning":
      return "Cleaning";
    case "deposit_invoice_issued":
    case "deposit_paid":
    case "final_invoice_issued":
    case "final_invoice_sent":
    case "balance_paid":
    case "receipt_issued":
    case "completed":
    case "thank_you_sent":
      return "Admin";
    default:
      return "Admin";
  }
}

function OrderTrackingOverview({
  order,
  primary,
  isClient,
  lastLoadedAt,
  scrollToSection,
}: {
  order: OrderHead;
  primary: ViewerSection;
  isClient: boolean;
  lastLoadedAt: Date | null;
  scrollToSection: (sectionId: string) => void;
}) {
  const timeline = useMemo(() => computeOrderTimeline({
    order,
    hasOnSiteService: !!(
      order.requires_waiter ||
      order.waiter_service_required ||
      order.setup_started_at ||
      order.service_started_at ||
      order.departed_venue_at
    ),
  }), [order]);
  const status = String(order.status || "").toLowerCase();
  const cancelled = status === "cancelled" || !!order.cancelled_at;
  const postponed = status === "postponed" || !!order.postponed_at;
  const applicableStages = timeline.stages.filter((s) => s.status !== "not_applicable" && s.status !== "skipped");
  const currentTimelineStage = timeline.stages.find((s) => s.status === "current" || s.status === "blocked")
    || [...applicableStages].reverse().find((s) => s.status === "completed")
    || applicableStages[0]
    || null;
  const currentStageIndex = currentTimelineStage
    ? timeline.stages.findIndex((s) => s.key === currentTimelineStage.key)
    : -1;
  const nextStage = !cancelled && !postponed && currentStageIndex >= 0
    ? timeline.stages.slice(currentStageIndex + 1).find((s) => s.status === "upcoming")
    : null;
  const eventLabel = fmtEventWhen(order);
  const displayLabel = cancelled
    ? "Cancelled"
    : postponed
      ? "Postponed"
      : currentTimelineStage?.label || "Order received";
  const currentSectionId = cancelled || postponed
    ? "section-timeline"
    : stageSectionId(currentTimelineStage, isClient);
  const lastStamp = fmtOrderStamp(
    (cancelled ? order.cancelled_at : postponed ? order.postponed_at : null)
      || currentTimelineStage?.completedAt
      || currentTimelineStage?.startedAt
      || latestStamp(order),
  );
  const ownerLabel = cancelled || postponed ? "Admin" : stageOwner(currentTimelineStage, isClient);
  const mySectionId = ACTIVE_ROLE_SECTION[primary];
  const canJumpToMySection = !isClient && mySectionId && mySectionId !== currentSectionId;
  const statusTone = cancelled
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : postponed
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <section className="mb-3 sm:mb-4 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:border-slate-300">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Order tracking</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-slate-950 leading-tight">
              {displayLabel}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {ownerLabel} owns the current step
              {lastStamp ? ` - last movement ${lastStamp}` : ""}.
            </p>
          </div>
          <Badge variant="outline" className={`${statusTone} capitalize px-3 py-1 text-xs font-semibold`}>
            {cleanStatus(order.status)}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Next</p>
            <p className="mt-0.5 text-sm font-medium text-slate-900">
              {nextStage ? `${nextStage.label} - ${stageOwner(nextStage, isClient)}` : "No open timeline step"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Event</p>
            <p className="mt-0.5 text-sm font-medium text-slate-900">{eventLabel}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Location</p>
            <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
              {order.venue_name || order.venue_address || "Venue not set"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 overflow-hidden">
          <TimelineTrack
            timeline={timeline}
            hideOperatorGlossary={isClient}
            disableSourceLinks
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap print:hidden">
          <p className="text-xs text-slate-500">
            {timeline.completedCount}/{timeline.applicableCount} timeline steps complete
            {lastLoadedAt ? ` - refreshed ${lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => scrollToSection(currentSectionId)} className="h-8 gap-1.5">
              Open current <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => scrollToSection("section-timeline")} className="h-8 gap-1.5">
              Full timeline <Activity className="w-3.5 h-3.5" />
            </Button>
            {canJumpToMySection && (
              <Button size="sm" variant="outline" onClick={() => scrollToSection(mySectionId)} className="h-8 gap-1.5">
                My section
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export interface OrderDocumentProps {
  orderId: string;
  /** "print" expands every section + hides toggles. "client" suppresses Finance entirely. */
  mode?: "interactive" | "print" | "client";
  /** Override the auto-detected primary section (e.g. when the route hints). */
  forceSection?: ViewerSection | null;
}

export function OrderDocument({ orderId, mode = "interactive", forceSection = null }: OrderDocumentProps) {
  const router = useRouter();
  const { user, userRoles } = useAuth();
  const [order, setOrder] = useState<OrderHead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Lifted from ShoppingSection so the suggested-action banner can rank
  // "shop first" ahead of prep/driver when ingredients are short.
  const [shoppingOutstanding, setShoppingOutstanding] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const primary = useMemo(
    () => forceSection ?? resolvePrimarySection(user?.role as any, userRoles as any),
    [user?.role, userRoles, forceSection],
  );
  const role = user?.role as UserRole | undefined;
  // ODOC: finance gate. Customer billing (total / paid / outstanding /
  // payments) is admin-tier order data, so every ADMIN_ROLES role -
  // including branch admin, region_admin, sales_admin - sees it. Client
  // mode + operational staff (kitchen / driver / etc.) never do, and the
  // data isn't even fetched for them. See canSeeOrderFinance: this used
  // to reuse canSeeOtherStaffPay (a payroll-privacy gate) which wrongly
  // hid paid/outstanding from branch admins running the order.
  const canSeeFinance = mode !== "client" && canSeeOrderFinance(role);
  // ODOC: client read-only view. A client opening their own order
  // (/order/[id]?role=client) should see a tight, read-only summary -
  // their event details, status timeline, the menu they ordered, and
  // post-event feedback - NOT the internal operational sections
  // (shopping list, driver dispatch, waiter staffing, cleaning, audit
  // history) which carry staff actions and internal noise. Those staff
  // sections already hide their action buttons for non-matching roles,
  // but a client shouldn't see the sections at all.
  const isClient = mode === "client" || role === UserRole.CLIENT;
  const chatSenderRole: OrderChatRole = isClient
    ? "client"
    : role === UserRole.DRIVER
      ? "driver"
      : role === UserRole.KITCHEN_MANAGER || role === UserRole.KITCHEN_STAFF
        ? "kitchen"
        : "admin";
  const chatLabel = isClient ? "Message catering team" : "Message client";
  const [chatOpen, setChatOpen] = useState(false);

  // ODOC role-relevance (driver feedback 2026-07-04, Pic 81): each
  // staff role sees only the sections that carry information they act
  // on - a driver doesn't need the shopping shortfall list or the
  // cleaning queue on their run sheet. Admin keeps the full document;
  // client keeps the existing tight summary (header / timeline / menu /
  // feedback) via the isClient gates. Header + status timeline are
  // universal and always render.
  const staffAllowed: ReadonlySet<string> | null = useMemo(() => {
    if (isClient || primary === "admin") return null;
    const STAFF_SECTIONS: Record<string, ReadonlySet<string>> = {
      // Driver: the run sheet (driver) + who's working the floor (waiter).
      driver: new Set(["driver", "waiter"]),
      // Waiter: their service panel + the menu they'll be serving.
      waiter: new Set(["waiter", "kitchen"]),
      // Kitchen: prep + what's short (shopping) + the driver handover,
      // plus attachments (dietary forms, briefs live there).
      kitchen: new Set(["kitchen", "shopping", "driver", "attachments"]),
      // Shopping: the list itself + the menu that drives it.
      shopping: new Set(["shopping", "kitchen"]),
      // Cleaning: their queue + the driver return trip that feeds it.
      cleaning: new Set(["cleaning", "driver"]),
    };
    return STAFF_SECTIONS[primary] ?? null;
  }, [isClient, primary]);
  const showFor = useCallback(
    (key: string) => !staffAllowed || staffAllowed.has(key),
    [staffAllowed],
  );

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, company_id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status, client_id, client_name, client_email, client_phone, special_instructions, kitchen_instructions, assigned_chef_id, assigned_driver_id, collection_time, confirmed_at, prep_started_at, ready_at, picked_up_at, arrived_at_venue_at, pod_captured_at, pod_photo_url, pod_signature_url, delivered_at, setup_started_at, service_started_at, departed_venue_at, completed_at, cancelled_at, postponed_at, requires_waiter, waiter_service_required, equipment_return_method, created_at, event_end_date, internal_notes, dietary_requirements, requires_refrigeration, requires_two_drivers, final_order_change_date, comms_paused_until, region_id, quote_id, package_id, paused_reason, paused_expected_resume_date, paused_from_status, cancellation_reason, lead_source, deposit_amount, amount_paid, balance_amount, balance_due_date, deposit_paid_at, balance_paid_at, payment_status, deposit_paid, balance_paid, delivery_distance_km, delivery_duration_minutes, driver_acknowledged_at, driver_acknowledged_via, venue_contact_person, venue_contact_phone, assigned_vehicle_id, secondary_driver_id, secondary_vehicle_id, pickup_time",
        )
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) { setNotFound(true); setOrder(null); }
      else { setOrder(data as OrderHead); }
      setLastLoadedAt(new Date());
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE_TAG, step: "loadOrderHead", orderId } });
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // ODOC: realtime on the order head. Section data is sub'd inside
  // each section component to keep the network footprint scoped.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-doc:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => {
          if (reloadTimer.current) clearTimeout(reloadTimer.current);
          reloadTimer.current = setTimeout(() => { load(); }, 400);
        },
      )
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [orderId, load]);

  // ODOC: scroll to a section by id. Sections set scroll-margin-top
  // via CollapsibleSection so the browser handles the offset for the
  // sticky nav without a magic number here.
  //
  // Also dispatches an 'odoc:expand-section' custom event so the
  // target accordion opens on tap (deliberate signal, separate from
  // the passive IntersectionObserver hash updates that fire on
  // ordinary scroll). Brief delay before the scroll lets the section
  // expand first so the offset lands on the open layout.
  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("odoc:expand-section", { detail: { id: sectionId } }));
    }
    // Two raf ticks - first paints the expanded body, second lets
    // layout settle before scrolling. Fallback to setTimeout for
    // older browsers.
    const doScroll = () => el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => requestAnimationFrame(doScroll));
    } else {
      setTimeout(doScroll, 50);
    }
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", `#${sectionId}`);
    }
  }, []);

  // ODOC Wave D: track which section is in view as the user scrolls
  // (IntersectionObserver). Drives the anchor nav chip highlight and
  // the URL hash. Cheap - 10 sections, root margin tuned so only one
  // entry is "active" at a time.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  useEffect(() => {
    if (loading || !order || mode === "print") return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const sectionIds = [
      "section-header", "section-timeline", "section-kitchen",
      "section-shopping", "section-driver", "section-waiter",
      "section-cleaning", "section-admin", "section-feedback",
      "section-comms", "section-attachments", "section-history",
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that's
        // intersecting. Falls back to last-known active otherwise.
        const visible = entries.filter((e) => e.isIntersecting).sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        );
        if (visible.length > 0) {
          const id = visible[0].target.id;
          setActiveSectionId(id);
          // Reflect in URL hash without scroll-jump
          if (window.history?.replaceState) {
            window.history.replaceState(null, "", `#${id}`);
          }
        }
      },
      { rootMargin: "-72px 0px -60% 0px", threshold: [0, 0.1, 0.5] },
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [loading, order, mode]);

  // ODOC: scroll to primary section on first render. Honours hash
  // if the URL already has one (deep-link from elsewhere).
  useEffect(() => {
    if (loading || !order || mode === "print") return;
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const target = hash && hash.startsWith("section-") ? hash : `section-${primary}`;
    const t = setTimeout(() => scrollToSection(target), 300);
    return () => clearTimeout(t);
  }, [loading, order, primary, mode, scrollToSection]);

  // Order-list chat CTAs use a deep link so the driver can open the same
  // conversation from calendar/earnings without duplicating modal state.
  useEffect(() => {
    if (!router.isReady || loading || !order || mode === "print" || router.query.chat !== "1") return;
    setChatOpen(true);
    const nextQuery = { ...router.query };
    delete nextQuery.chat;
    void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [loading, mode, order, router]);

  // ODOC Wave D: document title - "ORD-12345 · Smith Family · CateringMS"
  // so the browser tab strip is identifiable when many orders are open.
  useEffect(() => {
    if (typeof document === "undefined" || !order) return;
    const bits: string[] = [];
    if (order.order_number) bits.push(`#${order.order_number}`);
    if (order.client_name) bits.push(order.client_name);
    bits.push("CateringMS");
    document.title = bits.join(" · ");
  }, [order]);

  // ODOC: anchor nav strip - one chip per section. Tap to scroll.
  // The viewer's primary section is visually marked. Order matches
  // the document's render order so the strip reads top-to-bottom.
  const navItems = useMemo(() => {
    const items: Array<{ id: string; label: string; icon: any; key: ViewerSection | "header" | "timeline" | "admin" | "history" }> = [
      { id: "section-header", label: "Order", icon: FileText, key: "header" },
      { id: "section-timeline", label: "Status", icon: Activity, key: "timeline" },
      // History is admin-tier context; staff roles work off the status
      // timeline, so the audit chip is noise on their run sheets.
      ...(!isClient && showFor("history") ? [{ id: "section-history", label: "History", icon: History, key: "history" as const }] : []),
    ];
    // Chips mirror the role-relevance gates below so no chip ever
    // scrolls to a section that isn't mounted for this viewer.
    // Client-only Delivery chip -> the ClientDeliverySection.
    if (isClient) items.push({ id: "section-delivery", label: "Delivery", icon: Truck, key: "client" });
    if (showFor("kitchen")) items.push({ id: "section-kitchen", label: isClient ? "Menu" : "Kitchen", icon: isClient ? Utensils : ChefHat, key: "kitchen" });
    if (!isClient && showFor("shopping")) items.push({ id: "section-shopping", label: "Shopping", icon: ShoppingCart, key: "shopping" });
    if (!isClient && showFor("driver")) items.push({ id: "section-driver", label: "Driver", icon: Truck, key: "driver" });
    if (!isClient && showFor("waiter")) items.push({ id: "section-waiter", label: "Service", icon: Sparkles, key: "waiter" });
    if (!isClient && showFor("cleaning")) items.push({ id: "section-cleaning", label: "Cleaning", icon: Droplets, key: "cleaning" });
    if (canSeeFinance) items.push({ id: "section-admin", label: "Finance", icon: Wallet, key: "admin" });
    // Feedback chip only shows on delivered orders. The section
    // itself returns null otherwise so the chip would scroll to
    // nothing - safer to omit when not delivered.
    const isDelivered = !!order && (order.status === "delivered" || order.status === "completed" || !!order.delivered_at);
    if (isDelivered && showFor("feedback")) items.push({ id: "section-feedback", label: "Feedback", icon: Star, key: "history" as any });
    if (canSeeFinance) items.push({ id: "section-comms", label: "Comms", icon: MessageSquare, key: "history" as any });
    if (!isClient && showFor("attachments")) items.push({ id: "section-attachments", label: "Files", icon: Paperclip, key: "history" as any });
    return items;
  }, [canSeeFinance, isClient, order, showFor]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading order...
      </div>
    );
  }
  if (notFound || !order) {
    return (
      <div className="max-w-md mx-auto text-center py-20 px-4">
        <p className="text-lg font-semibold text-slate-900">Order not found</p>
        <p className="text-sm text-slate-500 mt-1">It may have been deleted or you don't have access.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back
        </Button>
      </div>
    );
  }

  const forceAll = mode === "print";

  return (
    <div className={mode === "print" ? "max-w-5xl mx-auto px-4 py-8 print:px-0 print:py-0" : "max-w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6"}>
      {/* Toolbar - hidden in print mode */}
      {mode !== "print" && (
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-8">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />Back
            </Button>
            {lastLoadedAt && (
              <span className="text-[11px] text-slate-500 tabular-nums hidden sm:inline" title={lastLoadedAt.toLocaleString("en-ZA")}>
                As of {lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {primary}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* ODOC Wave F: live presence pill - avatar stack of other
                staff currently viewing this order. */}
            <OrderPresence orderId={order.id} />
            {user?.id && (
              <Button
                size="sm"
                onClick={() => setChatOpen(true)}
                className="h-8 gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
                title={chatLabel}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{chatLabel}</span>
                <span className="sm:hidden">Chat</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => load()} className="h-8" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Link
              href={{ pathname: router.pathname, query: { ...router.query, print: "1" } }}
              target="_blank"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-slate-50"
              title="Open print view in a new tab"
            >
              <Printer className="w-3.5 h-3.5" />Print
            </Link>
          </div>
        </div>
      )}

      {/* ODOC: sticky anchor nav. One chip per section. Tap to scroll.
          The viewer's primary section gets an accent ring so they can
          see at a glance where "their" part of the doc lives. Hidden
          in print mode - print is one continuous document. */}
      {mode !== "print" && (
        <nav
          aria-label="Jump to section"
          className="sticky top-0 z-20 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-2 mb-3 sm:mb-4 bg-white/90 backdrop-blur border-b border-slate-200 print:hidden"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isPrimary = `section-${primary}` === item.id;
              const isActive = activeSectionId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 " +
                    (isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : isPrimary
                        ? "bg-white text-slate-900 ring-1 ring-slate-300"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                  }
                  title={`Jump to ${item.label}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
            {user?.id && (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                title={chatLabel}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Chat
              </button>
            )}
          </div>
        </nav>
      )}

      {/* Stage-strip overview: admin + client only. Staff roles have the
          Status timeline card for the same information - showing both was
          confusing on mobile, and the strip lagged behind the working
          timeline (driver feedback 2026-07-04, Pic 80). */}
      {!staffAllowed && (
        <OrderTrackingOverview
          order={order}
          primary={primary}
          isClient={isClient}
          lastLoadedAt={lastLoadedAt}
          scrollToSection={scrollToSection}
        />
      )}

      {/* ODOC H.4: admin quick-action chip strip. Mirrors what the
          old OrderDetailsModal toolbar carried so the row-click
          migration from modal to doc keeps the same affordances:
          Quote / Client view / Copy link / Invoice / Call / WhatsApp
          / Email. Hidden in print + for non-admin viewers. */}
      <OrderQuickActions
        order={{
          id: order.id,
          order_number: order.order_number,
          client_name: order.client_name,
          client_phone: order.client_phone,
          client_email: order.client_email,
          quote_id: order.quote_id,
          assigned_driver_id: order.assigned_driver_id,
          assigned_chef_id: order.assigned_chef_id,
        }}
      />

      {/* ODOC H.1: admin-tier 'edits live in the quote' notice.
          Tells admins explicitly that the order doc is read-only,
          edits route through the source quote. Staff don't see it. */}
      <OrderEditNotice
        orderId={order.id}
        quoteId={order.quote_id}
        status={order.status}
      />

      {/* ODOC Wave F: cash-on-delivery banner - shows amount owed
          to the assigned driver + admin tier when payment_method=cash
          and balance is outstanding. */}
      <OrderCODBanner
        orderId={order.id}
        status={order.status}
        assignedDriverId={order.assigned_driver_id}
        deliveredAt={order.delivered_at}
      />

      {/* ODOC Wave F: pending amendment banner - admin reviews
          client-requested changes inline with Approve / Decline. */}
      <OrderAmendmentBanner orderId={order.id} companyId={order.company_id} onApplied={load} />

      {/* ODOC Wave F: role-aware suggested next action. One-line
          rule-based nudge that picks the highest-value thing the
          viewer can do for this order right now. Dismissible. */}
      <OrderSuggestedAction order={order} shoppingOutstanding={shoppingOutstanding} />

      {/* ODOC Wave B: top-of-document alert banners - countdown +
          cancellation + postponement + comms-paused + cold-chain +
          two-driver + amendment cutoff. */}
      <OrderAlertBanners order={order} />

      <div className="space-y-3 sm:space-y-4">
        <OrderHeaderSection
          order={order}
          forceOpen={forceAll}
          defaultOpen={true /* header is always open - it's the title block */}
        />
        <OrderTimelineSection
          order={order}
          forceOpen={forceAll}
          defaultOpen={true /* timeline is universal context */}
        />
        {!isClient && showFor("history") && (
          <HistorySection
            orderId={order.id}
            companyId={order.company_id}
            forceOpen={forceAll}
            defaultOpen={true}
          />
        )}
        {/* ODOC: client-facing delivery + driver card. The staff
            DriverSection (dispatch run-sheet + POD + actions) stays hidden
            from clients; this is the read-only customer slice - who's
            driving, when, which vehicle, live-track link, delivery proof. */}
        {isClient && (
          <ClientDeliverySection
            order={order}
            forceOpen={forceAll}
            defaultOpen={true}
            highlight={primary === "client"}
          />
        )}
        {/* ODOC: client-facing menu card. Clients get a clean, read-only
            "your menu" slice (items + included crockery) - NOT the staff
            KitchenSection, which leaks prep-task schedules, a cleaning
            queue, recipe/equipment deep links and internal framing. */}
        {isClient && (
          <ClientMenuSection
            orderId={order.id}
            companyId={order.company_id}
            collectionTime={order.collection_time}
            eventDate={order.event_date}
            eventTime={order.event_time}
            forceOpen={forceAll}
            defaultOpen={true}
            highlight={primary === "client"}
          />
        )}
        {/* ODOC: Kitchen section is the canonical menu + equipment +
            prep view. Default open so the menu isn't hidden behind a
            tap. Role-gated: drivers get their own load list on the run
            sheet and cleaning works from their queue, so neither needs
            the prep view. Kitchen role still gets the highlight ring.
            Hidden from clients - they get ClientMenuSection above. */}
        {!isClient && showFor("kitchen") && (
          <KitchenSection
            orderId={order.id}
            companyId={order.company_id}
            orderNumber={order.order_number}
            orderStatus={order.status}
            collectionTime={order.collection_time}
            eventDate={order.event_date}
            eventTime={order.event_time}
            forceOpen={forceAll}
            defaultOpen={true}
            highlight={primary === "kitchen"}
          />
        )}
        {/* Internal operational sections - staff only, and only the
            roles that act on them (role-relevance map above). A client
            never sees the shopping list, driver dispatch, waiter
            staffing or cleaning handover (internal workflow + actions). */}
        {!isClient && (
          <>
            {showFor("shopping") && (
              <ShoppingSection
                orderId={order.id}
                companyId={order.company_id}
                forceOpen={forceAll}
                defaultOpen={primary === "shopping" || primary === "kitchen"}
                highlight={primary === "shopping" || primary === "kitchen"}
                onOutstandingChange={setShoppingOutstanding}
              />
            )}
            {showFor("driver") && (
              <DriverSection
                order={order}
                forceOpen={forceAll}
                defaultOpen={primary === "driver"}
                highlight={primary === "driver"}
              />
            )}
            {showFor("waiter") && (
              <WaiterSection
                orderId={order.id}
                companyId={order.company_id}
                serviceRequired={!!(order.requires_waiter || order.waiter_service_required)}
                forceOpen={forceAll}
                defaultOpen={primary === "waiter" || primary === "driver"}
                highlight={primary === "waiter"}
              />
            )}
            {showFor("cleaning") && (
              <CleaningSection
                orderId={order.id}
                companyId={order.company_id}
                forceOpen={forceAll}
                defaultOpen={primary === "cleaning"}
                highlight={primary === "cleaning"}
              />
            )}
          </>
        )}
        {/* ODOC: Finance section is permission-gated at render time.
            Staff roles + magic-link client mode never see it - data
            never fetched, component never mounted. */}
        {canSeeFinance && (
          <FinanceSection
            orderId={order.id}
            companyId={order.company_id}
            forceOpen={forceAll}
            defaultOpen={primary === "admin"}
            highlight={primary === "admin"}
          />
        )}
        {canSeeFinance && (
          <section id="section-staffing" className="mt-4">
            <OrderStaffingPanel orderId={order.id} companyId={order.company_id} order={order} />
          </section>
        )}
        {/* ODOC Wave E: customer feedback - only mounts post-delivery.
            Section returns null when not delivered so the doc stays
            tight for pre-event orders. */}
        {showFor("feedback") && (
          <FeedbackSection
            orderId={order.id}
            companyId={order.company_id}
            delivered={order.status === "delivered" || order.status === "completed" || !!order.delivered_at}
            forceOpen={forceAll}
            defaultOpen={false}
          />
        )}
        {/* ODOC Wave F: communications log - admin-only, unified
            feed of notifications + outgoing emails for this order. */}
        {canSeeFinance && (
          <CommsLogSection
            orderId={order.id}
            companyId={order.company_id}
            forceOpen={forceAll}
            defaultOpen={false}
          />
        )}
        {/* ODOC Wave F: file attachments - contracts, dietary forms,
            venue maps, etc. Visible to all staff (RLS handles scope). */}
        {!isClient && showFor("attachments") && (
          <AttachmentsSection
            orderId={order.id}
            companyId={order.company_id}
            forceOpen={forceAll}
            defaultOpen={false}
          />
        )}

        {/* POPIA/CPA: every client-facing document links the caterer's
            public T&Cs page. The company id is a valid /terms identifier
            so no extra fetch is needed for the slug. */}
        {isClient && order.company_id && (
          <p className="pt-4 text-center text-xs text-slate-500">
            <a
              href={buildCompanyTermsPath(order.company_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-700"
            >
              Terms &amp; Conditions
            </a>
          </p>
        )}
      </div>

      {user?.id && (
        <Dialog open={chatOpen} onOpenChange={setChatOpen}>
          <DialogContent className="max-w-2xl gap-3 p-3 sm:p-4">
            <DialogHeader className="pr-8">
              <DialogTitle className="flex items-center gap-2 text-left">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
                  <MessageCircle className="h-4 w-4" />
                </span>
                {chatLabel}
              </DialogTitle>
              <DialogDescription className="text-left">
                Live conversation for {order.order_number ? `order #${order.order_number}` : "this order"}. Messages stay linked to this delivery.
              </DialogDescription>
            </DialogHeader>
            <OrderClientChatPanel
              companyId={order.company_id}
              orderId={order.id}
              userId={user.id}
              senderRole={chatSenderRole}
              orderLabel={`${order.client_name || "Client"} · ${order.order_number || "Order"}`}
              maxHeight="min(56vh, 520px)"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
