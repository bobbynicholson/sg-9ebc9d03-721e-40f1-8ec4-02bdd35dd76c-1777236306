import { ImportReadinessBanner } from "@/components/admin/ImportReadinessBanner";
import { ServiceSittingsOperations } from "./ServiceSittingsOperations";
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
import { formatClock } from "@/lib/portalTime";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { canSeeOrderFinance } from "@/lib/authGuards";
import { useTenantHref } from "@/lib/tenantUrl";
import { buildCompanyTermsPath } from "@/lib/companyLegal";
import { configuredPaymentTerms } from "@/lib/paymentTerms";
import { captureException } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Printer, ArrowLeft, RefreshCw,
  FileText, Activity, ChefHat, ShoppingCart, Truck, Droplets, Wallet, History, Star,
  MessageSquare, MessageCircle, Paperclip, Utensils, CalendarDays, MapPin, Users,
  MoreHorizontal, ChevronDown, List, type LucideIcon,
} from "lucide-react";
import { OrderHeaderSection } from "./sections/OrderHeaderSection";
import { OrderAlertBanners } from "./OrderAlertBanners";
import { OrderSuggestedAction } from "./OrderSuggestedAction";
import { OrderPresence } from "./OrderPresence";
import { OrderAmendmentBanner } from "./OrderAmendmentBanner";
import { OrderCODBanner } from "./OrderCODBanner";
import { OrderEditNotice } from "./OrderEditNotice";
import { OrderQuickActions } from "./OrderQuickActions";
import { CollapsibleSection } from "./sections/CollapsibleSection";
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
import { EquipmentReturnCard } from "@/components/order/EquipmentReturnCard";
import { BankTransferDetailsCard } from "@/components/documents/BankTransferDetailsCard";
import { resolveCompanyEftDetails } from "@/lib/companyEftDetails";
import styles from "./OrderDocument.module.css";

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
  service_sittings?: Array<{id:string}>;
  id: string;
  company_id: string;
  payment_terms_text: string;
  company_name?: string | null;
  company_email?: string | null;
  bank_transfer_details?: ReturnType<typeof resolveCompanyEftDetails> | null;
  order_number: string | null;
  event_name: string | null;
  event_date: string;
  event_time: string | null;
  setup_time: string | null;
  delivery_time: string | null;
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
  collection_next_day?: boolean | null;
  created_at: string | null;
  // ODOC Wave B: header intel.
  event_end_date: string | null;
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

type OrderSectionGroup = "Order" | "Operations" | "Records";
type OrderJump = { id: string; label: string; icon: LucideIcon; group: OrderSectionGroup };
const ORDER_SECTION_GROUPS: OrderSectionGroup[] = ["Order", "Operations", "Records"];

function cleanStatus(status: string | null | undefined): string {
  return String(status || "unknown").replace(/_/g, " ");
}

function fmtEventWhen(order: OrderHead): string {
  const date = new Date(order.event_date).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return order.event_time ? `${date} at ${formatClock(order.event_time)}` : date;
}

const GENERIC_EVENT_NAMES = new Set(["quote", "order", "event", "untitled", "new event", "tbd", "tba"]);

function orderTitle(order: OrderHead) {
  const eventName = order.event_name?.trim();
  return eventName && !GENERIC_EVENT_NAMES.has(eventName.toLowerCase())
    ? eventName
    : order.client_name || "Order details";
}

function OrderOverview({ order }: { order: OrderHead }) {
  const title = orderTitle(order);
  const status = String(order.status || "").toLowerCase();
  const tone = ["completed", "delivered"].includes(status)
    ? "bg-emerald-100 text-emerald-900"
    : status === "cancelled"
      ? "bg-rose-100 text-rose-900"
      : ["postponed", "paused"].includes(status)
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-800";
  const venue = order.venue_name || order.venue_address;
  const facts = [
    { label: "Event", value: fmtEventWhen(order), icon: CalendarDays },
    { label: "Guests", value: order.guest_count == null ? null : order.guest_count.toLocaleString("en-ZA"), icon: Users },
    { label: "Venue", value: venue, icon: MapPin },
  ].filter((fact) => fact.value != null);

  return (
    <header className={`${styles.overview} min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          {order.order_number && <p className="text-sm font-medium tabular-nums text-slate-600">#{order.order_number}</p>}
          <h1 className="mt-1 break-words text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          {order.client_name && title !== order.client_name && (
            <p className="mt-1.5 break-words text-base text-slate-700">{order.client_name}</p>
          )}
        </div>
        <span className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${tone}`}>
          <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
          {cleanStatus(order.status)}
        </span>
      </div>
      <dl className={`${styles.facts} mt-4 gap-x-6 gap-y-3 border-t border-slate-200 pt-4 sm:mt-5`}>
        {facts.map(({ label, value, icon: Icon }) => (
          <div key={label} className={`flex min-w-0 items-start gap-2.5 ${label === "Venue" ? styles.venueFact : ""}`}>
            <Icon className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">{label}</dt>
              <dd className="mt-0.5 break-words text-base font-medium leading-snug text-slate-900">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </header>
  );
}

/**
 * A printable order is an operational document, not a screenshot of the
 * interactive workspace.  Give the paper version a concise cover so the
 * order can still be identified when its later pages are separated.
 */
function OrderPrintCover({ order }: { order: OrderHead }) {
  const eventDate = new Date(order.event_date).toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const title = orderTitle(order);
  const eventTime = order.event_time ? formatClock(order.event_time) : null;
  const venue = [order.venue_name, order.venue_address].filter(Boolean).join(" - ");

  return (
    <section className="order-print-cover mb-4 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="h-1 bg-brand-primary" aria-hidden="true" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">Order document</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-slate-950">{title}</h1>
            {order.order_number ? <p className="mt-1 font-mono text-sm font-semibold text-slate-600">#{order.order_number}</p> : null}
          </div>
          <span className="shrink-0 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
            {cleanStatus(order.status)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-200 pt-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Event</p>
            <p className="mt-0.5 font-medium text-slate-900">{eventDate}{eventTime ? ` at ${eventTime}` : ""}</p>
          </div>
          {order.guest_count ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Guests</p>
              <p className="mt-0.5 font-medium text-slate-900">{order.guest_count}</p>
            </div>
          ) : null}
          {venue ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Venue</p>
              <p className="mt-0.5 text-slate-900">{venue}</p>
            </div>
          ) : null}
          {order.client_name || order.client_email || order.client_phone ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Client</p>
              <p className="mt-0.5 font-medium text-slate-900">{order.client_name || "-"}</p>
              {order.client_email ? <p className="text-xs text-slate-600">{order.client_email}</p> : null}
              {order.client_phone ? <p className="text-xs text-slate-600">{order.client_phone}</p> : null}
            </div>
          ) : null}
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
  const { withSlug } = useTenantHref();
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
  const backHref = isClient
    ? withSlug("/client-portal/dashboard")
    : primary === "admin"
      ? role === UserRole.SUPER_ADMIN ? "/admin/platform/dashboard" : withSlug("/admin/orders")
      : withSlug(primary === "kitchen" ? "/team-portal/kitchen/today"
        : primary === "driver" ? "/team-portal/driver/dashboard"
          : primary === "waiter" ? "/team-portal/waiter/dashboard"
            : primary === "shopping" ? "/team-portal/shopping/dashboard"
              : "/team-portal/cleaning/dashboard");
  // A user's primary section is a presentation choice (for example, a
  // multi-role admin may land on the driver or kitchen section). It must
  // not remove admin permissions from order management controls.
  const canManageServicePlan = canSeeFinance && !isClient && primary !== "client";
  const chatSenderRole: OrderChatRole = isClient
    ? "client"
    : role === UserRole.DRIVER
      ? "driver"
      : role === UserRole.KITCHEN_MANAGER || role === UserRole.KITCHEN_STAFF
        ? "kitchen"
        : "admin";
  const chatLabel = isClient ? "Message catering team" : "Message client";
  const [chatOpen, setChatOpen] = useState(false);
  const [orderActionsOpen, setOrderActionsOpen] = useState(false);

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

  // A live update must refresh the order in place. Showing the loader removed
  // every section, closing what was open and losing the scroll position.
  const orderShownRef = useRef(false);
  const load = useCallback(async () => {
    if (!orderId) return;
    if (!orderShownRef.current) setLoading(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "service_sittings(id), id, company_id, order_number, event_name, event_date, event_time, setup_time, delivery_time, venue_name, venue_address, guest_count, status, client_id, client_name, client_email, client_phone, special_instructions, kitchen_instructions, assigned_chef_id, assigned_driver_id, collection_time, confirmed_at, prep_started_at, ready_at, picked_up_at, arrived_at_venue_at, pod_captured_at, pod_photo_url, pod_signature_url, delivered_at, setup_started_at, service_started_at, departed_venue_at, completed_at, cancelled_at, postponed_at, requires_waiter, waiter_service_required, equipment_return_method, collection_next_day, created_at, event_end_date, dietary_requirements, requires_refrigeration, requires_two_drivers, final_order_change_date, comms_paused_until, region_id, quote_id, package_id, paused_reason, paused_expected_resume_date, paused_from_status, cancellation_reason, lead_source, deposit_amount, amount_paid, balance_amount, balance_due_date, deposit_paid_at, balance_paid_at, payment_status, deposit_paid, balance_paid, delivery_distance_km, delivery_duration_minutes, driver_acknowledged_at, driver_acknowledged_via, venue_contact_person, venue_contact_phone, assigned_vehicle_id, secondary_driver_id, secondary_vehicle_id, pickup_time",
        )
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) { orderShownRef.current = false; setNotFound(true); setOrder(null); }
      else {
        let paymentTermsText = configuredPaymentTerms(null);
        let companySettings: any = null;
        try {
          const { data: settings, error: settingsError } = await (supabase as any).from("companies")
            .select("company_name, email, dispatch_settings, bank_name, bank_account_holder, bank_account_number, bank_branch_code, bank_account_type, eft_instructions")
            .eq("id", (data as any).company_id)
            .maybeSingle();
          if (settingsError) throw settingsError;
          companySettings = settings;
          paymentTermsText = configuredPaymentTerms(companySettings?.dispatch_settings);
        } catch (settingsError) {
          console.warn("[order-document] company payment details could not be loaded:", settingsError);
        }
        setOrder({
          ...(data as any),
          payment_terms_text: paymentTermsText,
          company_name: companySettings?.company_name || null,
          company_email: companySettings?.email || null,
          bank_transfer_details: companySettings ? resolveCompanyEftDetails(companySettings) : null,
        } as unknown as OrderHead);
        orderShownRef.current = true;
      }
      setLastLoadedAt(new Date());
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE_TAG, step: "loadOrderHead", orderId } });
      // A failed background refresh keeps the order that is already showing.
      if (!orderShownRef.current) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    orderShownRef.current = false;
    load();
  }, [load]);

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
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const doScroll = () => el.scrollIntoView({ behavior, block: "start" });
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => requestAnimationFrame(doScroll));
    } else {
      setTimeout(doScroll, 50);
    }
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(window.history.state, "", `#${sectionId}`);
    }
  }, []);

  // Open the linked section once per order so a live refresh does not
  // interrupt someone reading the service record.
  const loadedOrderId = order?.id;
  useEffect(() => {
    if (loading || !loadedOrderId || mode === "print") return;
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const target = hash.startsWith("section-")
      ? hash
      : primary === "admin" || primary === "client" ? null : ACTIVE_ROLE_SECTION[primary];
    if (!target) return;
    const t = setTimeout(() => scrollToSection(target), 300);
    return () => clearTimeout(t);
  }, [loading, loadedOrderId, primary, mode, scrollToSection]);

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

  const showSittings = !isClient && (canManageServicePlan || (order?.service_sittings?.length ?? 0) > 1);
  const showDriver = !isClient && showFor("driver") && (order?.service_sittings?.length ?? 0) < 2;
  const showFeedback = showFor("feedback") && !!order &&
    (order.status === "delivered" || order.status === "completed" || !!order.delivered_at);
  const navItems = useMemo(() => {
    const items: OrderJump[] = [
      { id: "section-timeline", label: "Status timeline", icon: Activity, group: "Order" },
      { id: "section-header", label: "Event & client details", icon: FileText, group: "Order" },
    ];
    if (showSittings) items.push({ id: "section-sittings", label: "Service sittings & trips", icon: CalendarDays, group: "Operations" });
    if (isClient) items.push({ id: "section-delivery", label: "Delivery", icon: Truck, group: "Operations" });
    if (showFor("kitchen")) items.push({ id: "section-kitchen", label: isClient ? "Menu" : "Kitchen", icon: isClient ? Utensils : ChefHat, group: "Operations" });
    if (!isClient && showFor("shopping")) items.push({ id: "section-shopping", label: "Shopping", icon: ShoppingCart, group: "Operations" });
    if (showDriver) items.push({ id: "section-driver", label: "Driver", icon: Truck, group: "Operations" });
    if (!isClient && showFor("waiter")) items.push({ id: "section-waiter", label: "Service team", icon: Users, group: "Operations" });
    if (!isClient && showFor("cleaning")) items.push({ id: "section-cleaning", label: "Cleaning", icon: Droplets, group: "Operations" });
    if (canSeeFinance) items.push(
      { id: "section-staffing", label: "Staffing & time", icon: Users, group: "Records" },
      { id: "section-admin", label: "Finance", icon: Wallet, group: "Records" },
      { id: "section-comms", label: "Communications", icon: MessageSquare, group: "Records" },
    );
    if (showFeedback) items.push({ id: "section-feedback", label: "Customer feedback", icon: Star, group: "Records" });
    if (!isClient && showFor("attachments")) items.push({ id: "section-attachments", label: "Attachments", icon: Paperclip, group: "Records" });
    if (!isClient && showFor("history")) items.push({ id: "section-history", label: "Order history", icon: History, group: "Records" });
    return items;
  }, [canSeeFinance, isClient, showDriver, showFeedback, showFor, showSittings]);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const sectionNavRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (loading || !loadedOrderId || mode === "print") return;
    let frame = 0;
    const syncVisibleSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const offset = (sectionNavRef.current?.getBoundingClientRect().bottom ?? 0) + 12;
        const visible = navItems.flatMap(({ id }) => {
          const bounds = document.getElementById(id)?.getBoundingClientRect();
          return bounds && bounds.bottom > offset && bounds.top < window.innerHeight ? [{ id, top: bounds.top }] : [];
        });
        // With both desktop columns in view, follow the heading nearest the picker.
        const closest = visible.sort((a, b) => Math.abs(a.top - offset) - Math.abs(b.top - offset))[0];
        setActiveSectionId(closest?.id ?? null);
      });
    };
    syncVisibleSection();
    window.addEventListener("scroll", syncVisibleSection, { passive: true });
    window.addEventListener("resize", syncVisibleSection);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncVisibleSection);
      window.removeEventListener("resize", syncVisibleSection);
    };
  }, [loadedOrderId, loading, mode, navItems]);

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
        <Button asChild variant="outline" className="mt-4">
          <Link href={backHref}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Link>
        </Button>
      </div>
    );
  }

  const forceAll = mode === "print";
  const activeNavLabel = navItems.find((item) => item.id === activeSectionId)?.label;

  return (
    <div className={forceAll ? "order-print-document order-document-surface mx-auto w-full min-w-0 max-w-5xl px-4 py-8 print:px-0 print:py-0" : `order-document-surface ${styles.document} mx-auto w-full min-w-0 max-w-[90rem] py-3 sm:py-5 lg:py-6`}>
      {!isClient && mode !== "print" && <ImportReadinessBanner orderId={order.id} />}
      {mode === "print" && (
        <div className="order-print-toolbar no-print print:hidden sticky top-0 z-30 -mx-4 mb-4 flex min-w-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <Link
            href={{ pathname: router.pathname, query: { ...router.query, print: undefined } }}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to order</span>
          </Link>
          <div className="hidden min-w-0 flex-1 text-center sm:block">
            <p className="truncate text-sm font-semibold text-slate-900">Print-ready order</p>
            {order.order_number && <p className="truncate text-xs text-slate-500">{order.order_number}</p>}
          </div>
          <Button
            type="button"
            onClick={() => window.print()}
            className="min-h-10 shrink-0 gap-2 bg-brand-primary px-3 text-white hover:bg-brand-primary/90"
            aria-label="Print order"
            title="Open print options"
          >
            <Printer className="h-4 w-4" />
            <span>Print order</span>
          </Button>
        </div>
      )}
      {!forceAll && (
        <>
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <Button asChild variant="ghost" className={`${styles.control} -ml-2 px-2`}>
              <Link href={backHref}>
                <ArrowLeft className="size-4" /> Back
              </Link>
            </Button>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <OrderPresence orderId={order.id} />
              {user?.id && (
                <Button type="button" onClick={() => setChatOpen(true)} className={`${styles.control} whitespace-normal text-left`}>
                  <MessageCircle className="size-4" /> {chatLabel}
                </Button>
              )}
              <DropdownMenu modal={false} open={orderActionsOpen} onOpenChange={setOrderActionsOpen}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className={styles.control} aria-label="More order actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[80] w-48">
                  <DropdownMenuItem onSelect={() => void load()} className={styles.menuItem}>
                    <RefreshCw className="mr-2 size-4" /> Refresh order
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className={styles.menuItem}>
                    <Link href={{ pathname: router.pathname, query: { ...router.query, print: "1" } }} target="_blank">
                      <Printer className="mr-2 size-4" /> Print order
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <OrderOverview order={order} />
          {!isClient && <OrderQuickActions order={order} onJumpToService={() => scrollToSection("section-waiter")} />}

          <nav ref={sectionNavRef} aria-label="Order sections" className={`${styles.sectionNav} mb-4 mt-4 border-y border-slate-200 bg-slate-50 py-2 print:hidden`}>
            <div className={`${styles.sectionNavBody} flex min-w-0 items-center gap-2`}>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className={`${styles.control} w-full min-w-0 justify-start gap-2 sm:w-auto sm:max-w-full`}>
                    <List className="size-4 shrink-0 text-slate-600" />
                    <span className="shrink-0 font-semibold">Sections</span>
                    {activeNavLabel && <span className="min-w-0 truncate border-l border-slate-200 pl-2 text-slate-600">{activeNavLabel}</span>}
                    <ChevronDown className="ml-auto size-4 shrink-0 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[min(62dvh,32rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-1.5">
                  {ORDER_SECTION_GROUPS.map((group) => {
                    const items = navItems.filter((item) => item.group === group);
                    if (!items.length) return null;
                    return (
                      <DropdownMenuGroup key={group} className="mb-1 last:mb-0">
                        <DropdownMenuLabel className="text-xs text-slate-600">{group}</DropdownMenuLabel>
                        {items.map(({ id, label, icon: Icon }) => (
                          <DropdownMenuItem
                            key={id}
                            onSelect={() => scrollToSection(id)}
                            aria-current={activeSectionId === id ? "location" : undefined}
                            className={`${styles.menuItem} ${activeSectionId === id ? "bg-slate-100 font-semibold text-slate-950" : ""}`}
                          >
                            <Icon className="mr-2 size-4 shrink-0 text-slate-600" /> {label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="ml-auto hidden min-w-0 items-center gap-2 md:flex">
                <Button type="button" variant="ghost" onClick={() => scrollToSection("section-timeline")} className={styles.control}>Status</Button>
                <Button type="button" variant="ghost" onClick={() => scrollToSection("section-header")} className={styles.control}>Event details</Button>
                {lastLoadedAt && (
                  <span className="hidden text-sm tabular-nums text-slate-600 xl:inline" title={lastLoadedAt.toLocaleString("en-ZA")}>
                    Updated {lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          </nav>
        </>
      )}

      {forceAll && <OrderPrintCover order={order} />}

      <div className={forceAll ? "space-y-4" : styles.workspace}>
        <div className={styles.sectionStack} aria-label="Order progress and operations">
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

            <OrderTimelineSection
              order={order}
              forceOpen={forceAll}
              defaultOpen
              onChanged={load}
            />
            {showSittings && (
              <CollapsibleSection
                id="section-sittings"
                title="Service sittings & trips"
                summary="Service times, drivers and equipment returns"
                icon={CalendarDays}
                forceOpen={forceAll}
                keepMounted
              >
                <ServiceSittingsOperations orderId={order.id} companyId={order.company_id} canEdit={canManageServicePlan} onSaved={load} embedded />
              </CollapsibleSection>
            )}
            {(order.service_sittings?.length || 0) < 2 && (!canManageServicePlan || !!order.delivered_at || ["delivered", "completed"].includes(order.status)) && (
              <EquipmentReturnCard order={order} canEdit={canSeeFinance} onChanged={load} />
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
            {/* Kitchen staff open directly to their prep view. */}
            {!isClient && showFor("kitchen") && (
              <KitchenSection
                orderId={order.id}
                companyId={order.company_id}
                orderNumber={order.order_number}
                pickupTime={order.pickup_time}
                eventDate={order.event_date}
                eventTime={order.event_time}
                forceOpen={forceAll}
                defaultOpen={primary === "kitchen"}
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
                {showDriver && (
                  <DriverSection
                    order={order}
                    forceOpen={forceAll}
                    defaultOpen={primary === "driver"}
                    highlight={primary === "driver"}
                  />
                )}
                {showFor("waiter") && (
                  <WaiterSection
                    key={order.id}
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
            {canSeeFinance && (
              <CollapsibleSection
                id="section-staffing"
                title="Order staffing & time"
                summary="Team assignments and tracked time"
                icon={Users}
                forceOpen={forceAll}
                keepMounted
              >
                <OrderStaffingPanel orderId={order.id} companyId={order.company_id} order={order} embedded />
              </CollapsibleSection>
            )}
            {/* ODOC Wave E: customer feedback - only mounts post-delivery.
                Section returns null when not delivered so the doc stays
                tight for pre-event orders. */}
            {showFeedback && (
              <FeedbackSection
                orderId={order.id}
                companyId={order.company_id}
                delivered
                canSendReviewRequest={canSeeFinance && !isClient}
                forceOpen={forceAll}
                defaultOpen={false}
              />
            )}

            {(isClient || mode === "print") && order.payment_terms_text && (
              <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 print-keep">
                <h2 className="text-xs font-semibold uppercase text-slate-500">Payment terms</h2>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{order.payment_terms_text}</p>
              </section>
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
            {!isClient && showFor("history") && (
              <HistorySection
                orderId={order.id}
                companyId={order.company_id}
                forceOpen={forceAll}
                defaultOpen={false}
              />
            )}
        </div>

        <aside className={styles.sectionStack} aria-label="Order reference">
          <OrderHeaderSection
            order={order}
            forceOpen={forceAll}
            defaultOpen={false}
            underDocumentHeader
            inSidePanel={mode !== "print"}
          />
          {(isClient || mode === "print") && (
            <BankTransferDetailsCard
              details={order.bank_transfer_details}
              companyName={order.company_name || "the catering team"}
              companyEmail={order.company_email}
              title="Pay by bank transfer (EFT)"
              referenceHint={`Use booking ${order.order_number || order.id} as the transfer reference.`}
              paidInFull={Boolean(order.balance_paid) || String(order.payment_status || "").toLowerCase() === "paid"}
            />
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
                inSidePanel={mode !== "print"}
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
        </aside>
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
