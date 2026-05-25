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
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { captureException } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Printer, ArrowLeft, RefreshCw,
  FileText, Activity, ChefHat, ShoppingCart, Truck, Sparkles, Droplets, Wallet, History,
} from "lucide-react";
import { OrderHeaderSection } from "./sections/OrderHeaderSection";
import { OrderAlertBanners } from "./OrderAlertBanners";
import { OrderTimelineSection } from "./sections/OrderTimelineSection";
import { KitchenSection } from "./sections/KitchenSection";
import { ShoppingSection } from "./sections/ShoppingSection";
import { DriverSection } from "./sections/DriverSection";
import { WaiterSection } from "./sections/WaiterSection";
import { CleaningSection } from "./sections/CleaningSection";
import { FinanceSection } from "./sections/FinanceSection";
import { HistorySection } from "./sections/HistorySection";

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
  if (all.has(UserRole.KITCHEN_STAFF)) return "kitchen";
  if (all.has(UserRole.SHOPPING_STAFF)) return "shopping";
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
  payment_status: string | null;
  deposit_paid: boolean | null;
  balance_paid: boolean | null;
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
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const primary = useMemo(
    () => forceSection ?? resolvePrimarySection(user?.role as any, userRoles as any),
    [user?.role, userRoles, forceSection],
  );
  const role = user?.role as UserRole | undefined;
  // ODOC: finance gate. Client mode + staff roles never see Finance,
  // ever, regardless of toggle state. Data isn't even fetched.
  const canSeeFinance = mode !== "client" && canSeeOtherStaffPay(role);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, company_id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, status, client_id, client_name, client_email, client_phone, special_instructions, kitchen_instructions, assigned_chef_id, assigned_driver_id, collection_time, confirmed_at, prep_started_at, ready_at, picked_up_at, arrived_at_venue_at, pod_captured_at, pod_photo_url, pod_signature_url, delivered_at, setup_started_at, service_started_at, departed_venue_at, completed_at, cancelled_at, postponed_at, requires_waiter, waiter_service_required, equipment_return_method, created_at, event_end_date, internal_notes, dietary_requirements, requires_refrigeration, requires_two_drivers, final_order_change_date, comms_paused_until, region_id, quote_id, package_id, paused_reason, paused_expected_resume_date, paused_from_status, cancellation_reason, lead_source, payment_status, deposit_paid, balance_paid",
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

  // ODOC: scroll to a section by id, accounting for the sticky nav
  // strip (about 56px high). Used by both auto-scroll on mount and the
  // anchor menu taps.
  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  // ODOC: scroll to primary section on first render.
  useEffect(() => {
    if (loading || !order || mode === "print") return;
    const t = setTimeout(() => scrollToSection(`section-${primary}`), 300);
    return () => clearTimeout(t);
  }, [loading, order, primary, mode, scrollToSection]);

  // ODOC: anchor nav strip - one chip per section. Tap to scroll.
  // The viewer's primary section is visually marked. Order matches
  // the document's render order so the strip reads top-to-bottom.
  const navItems = useMemo(() => {
    const items: Array<{ id: string; label: string; icon: any; key: ViewerSection | "header" | "timeline" | "admin" | "history" }> = [
      { id: "section-header", label: "Order", icon: FileText, key: "header" },
      { id: "section-timeline", label: "Status", icon: Activity, key: "timeline" },
      { id: "section-kitchen", label: "Kitchen", icon: ChefHat, key: "kitchen" },
      { id: "section-shopping", label: "Shopping", icon: ShoppingCart, key: "shopping" },
      { id: "section-driver", label: "Driver", icon: Truck, key: "driver" },
      { id: "section-waiter", label: "Service", icon: Sparkles, key: "waiter" },
      { id: "section-cleaning", label: "Cleaning", icon: Droplets, key: "cleaning" },
    ];
    if (canSeeFinance) items.push({ id: "section-admin", label: "Finance", icon: Wallet, key: "admin" });
    items.push({ id: "section-history", label: "History", icon: History, key: "history" });
    return items;
  }, [canSeeFinance]);

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
    <div className={mode === "print" ? "max-w-5xl mx-auto px-4 py-8 print:px-0 print:py-0" : "max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6"}>
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
          <div className="flex items-center gap-1.5">
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
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 " +
                    (isPrimary
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                  }
                  title={`Jump to ${item.label}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

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
        {/* ODOC: Kitchen section is the canonical menu + equipment +
            prep view for every role. Default open across the board
            so the menu isn't hidden behind a tap. Kitchen role still
            gets the highlight ring. */}
        <KitchenSection
          orderId={order.id}
          companyId={order.company_id}
          collectionTime={order.collection_time}
          eventDate={order.event_date}
          eventTime={order.event_time}
          forceOpen={forceAll}
          defaultOpen={true}
          highlight={primary === "kitchen"}
        />
        <ShoppingSection
          orderId={order.id}
          companyId={order.company_id}
          forceOpen={forceAll}
          defaultOpen={primary === "shopping"}
          highlight={primary === "shopping"}
        />
        <DriverSection
          order={order}
          forceOpen={forceAll}
          defaultOpen={primary === "driver"}
          highlight={primary === "driver"}
        />
        <WaiterSection
          orderId={order.id}
          companyId={order.company_id}
          forceOpen={forceAll}
          defaultOpen={primary === "waiter"}
          highlight={primary === "waiter"}
        />
        <CleaningSection
          orderId={order.id}
          companyId={order.company_id}
          forceOpen={forceAll}
          defaultOpen={primary === "cleaning"}
          highlight={primary === "cleaning"}
        />
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
        <HistorySection
          orderId={order.id}
          companyId={order.company_id}
          forceOpen={forceAll}
          defaultOpen={false}
        />
      </div>
    </div>
  );
}
