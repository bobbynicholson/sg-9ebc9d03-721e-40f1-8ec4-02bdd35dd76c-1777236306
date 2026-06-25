/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave B: order header - title block + intel chips.
 *
 * Three layers:
 *   1. Title band: event_name (sanitised), client name + status pill
 *      + order number. The status pill is the headline signal -
 *      operator scanning the page wants this in their first eye-sweep.
 *   2. Event + Client detail grid (mostly unchanged).
 *   3. Intel chips: region branch, repeat-customer, linked quote,
 *      linked package, lead source, allergen rollup.
 *   4. Notes block: special_instructions, kitchen_instructions,
 *      dietary_requirements, internal_notes (admin only).
 *
 * Linked-entity + repeat-customer + allergen lookups happen here
 * once and render as chips. Each is best-effort (failures swallowed
 * to the chip just not rendering).
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import {
  Calendar as CalendarIcon, Clock, MapPin, Users, User, Mail, Phone, FileText,
  Building2, History as HistoryIcon, FileSignature, Package as PackageIcon, Sparkles, AlertTriangle, Repeat,
} from "lucide-react";

interface Props {
  order: {
    id: string;
    company_id: string;
    order_number: string | null;
    event_name: string | null;
    event_date: string;
    event_end_date: string | null;
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
    internal_notes: string | null;
    dietary_requirements: string | null;
    region_id: string | null;
    quote_id: string | null;
    package_id: string | null;
    lead_source: string | null;
  };
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

const STATUS_TONES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  preparing: "bg-orange-100 text-orange-800 border-orange-300",
  ready: "bg-amber-100 text-amber-800 border-amber-300",
  in_transit: "bg-purple-100 text-purple-800 border-purple-300",
  delivered: "bg-brand-primary/15 text-brand-primary border-brand-primary/30",
  completed: "bg-brand-primary/15 text-brand-primary border-brand-primary/30",
  cancelled: "bg-rose-100 text-rose-700 border-rose-300",
  paused: "bg-amber-50 text-amber-700 border-amber-300",
};

// Words that, if they end up as the order's event_name, are
// meaningless as a doc title. Fall back to client name instead.
const JUNK_EVENT_NAMES = new Set(["quote", "order", "event", "untitled", "new event", "tbd", "tba", ""]);

interface ClientHistory {
  order_count: number;
  total_spent: number;
  last_event_date: string | null;
}

interface QuoteLink {
  id: string;
  quote_number: string | null;
}

interface PackageLink {
  id: string;
  name: string | null;
}

interface RegionLink {
  name: string | null;
}

export function OrderHeaderSection({ order, defaultOpen, forceOpen }: Props) {
  const { user } = useAuth();
  const canSeeFinance = canSeeOtherStaffPay(user?.role as UserRole | undefined);
  const isAdminTier = canSeeFinance; // proxy - admins see internal_notes

  const [history, setHistory] = useState<ClientHistory | null>(null);
  const [quote, setQuote] = useState<QuoteLink | null>(null);
  const [pkg, setPkg] = useState<PackageLink | null>(null);
  const [region, setRegion] = useState<RegionLink | null>(null);
  const [allergens, setAllergens] = useState<string[]>([]);

  // Best-effort intel fetch - failures just drop the chip. Run once
  // per order id change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Region name
        if (order.region_id) {
          const { data: r } = await (supabase as any)
            .from("regions")
            .select("name")
            .eq("id", order.region_id)
            .maybeSingle();
          if (!cancelled && r) setRegion(r as RegionLink);
        }
        // Linked quote
        if (order.quote_id) {
          const { data: q } = await (supabase as any)
            .from("quotes")
            .select("id, quote_number")
            .eq("id", order.quote_id)
            .maybeSingle();
          if (!cancelled && q) setQuote(q as QuoteLink);
        }
        // Linked package. ODOC H.13: fix silent SELECT failure -
        // the real table is `booking_packages` (Wave 70.45). The
        // old `packages` literal compiled because of the
        // `(supabase as any)` cast and silently returned nothing,
        // so the "from package" chip never lit up on any order.
        if (order.package_id) {
          const { data: p } = await (supabase as any)
            .from("booking_packages")
            .select("id, name")
            .eq("id", order.package_id)
            .maybeSingle();
          if (!cancelled && p) setPkg(p as PackageLink);
        }
        // Client history (repeat customer chip). Keyed by email.
        if (order.client_email) {
          const { data: h } = await (supabase as any)
            .from("orders_per_email_rollup")
            .select("order_count, total_spent, last_event_date")
            .eq("company_id", order.company_id)
            .eq("email_key", order.client_email.toLowerCase().trim())
            .maybeSingle();
          if (!cancelled && h) setHistory(h as ClientHistory);
        }
        // Allergen rollup - union of allergen_codes across this
        // order's menu items.
        const { data: items } = await (supabase as any)
          .from("order_items")
          .select("menu_item:menu_item_id(allergen_codes)")
          .eq("order_id", order.id);
        if (!cancelled) {
          const set = new Set<string>();
          for (const row of (items || []) as any[]) {
            const codes = row?.menu_item?.allergen_codes || [];
            for (const c of codes) set.add(c);
          }
          setAllergens(Array.from(set).sort());
        }
      } catch {
        // swallow - chips just don't render
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.company_id, order.region_id, order.quote_id, order.package_id, order.client_email]);

  const tone = STATUS_TONES[order.status?.toLowerCase()] || STATUS_TONES.confirmed;
  const eventDateLong = new Date(order.event_date).toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  // Multi-day event - show date range if event_end_date diverges.
  const isMultiDay = !!order.event_end_date && order.event_end_date !== order.event_date;
  const dateRangeShort = isMultiDay
    ? `${new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} - ${new Date(order.event_end_date!).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`
    : new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

  // ODOC Wave B fix: drop junk event_name values. The screenshot
  // showed "Quote" as the page title because user typed "Quote" as
  // event_name - filter those and fall back to client name.
  const rawEventName = (order.event_name || "").trim();
  const isJunkEventName = JUNK_EVENT_NAMES.has(rawEventName.toLowerCase());
  const meaningfulEventName = !isJunkEventName ? rawEventName : "";
  const titleLine = meaningfulEventName || order.client_name || `Order ${order.order_number || ""}`.trim() || "Order";
  const subtitleLine = meaningfulEventName
    ? `${order.client_name || "Client"} · ${dateRangeShort}${order.event_time ? ` · ${order.event_time.slice(0, 5)}` : ""}`
    : `${dateRangeShort}${order.event_time ? ` · ${order.event_time.slice(0, 5)}` : ""}`;
  const summary = `${order.client_name || "Client"} · ${dateRangeShort}${order.event_time ? ` ${order.event_time.slice(0, 5)}` : ""}`;

  return (
    <CollapsibleSection
      id="section-header"
      title={titleLine}
      summary={summary}
      icon={FileText}
      accent="slate"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      {/* Title band: prominent status pill + order number subtitle */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 mt-0.5">{subtitleLine}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="outline" className={`${tone} capitalize text-sm font-semibold px-3 py-1`}>
            {order.status?.replace(/_/g, " ")}
          </Badge>
          {order.order_number && (
            <span className="text-xs text-slate-500 tabular-nums font-mono">#{order.order_number}</span>
          )}
        </div>
      </div>

      {/* Intel chip strip - region, repeat customer, linked quote,
          linked package, lead source, allergens. Each chip only
          renders if the data exists. */}
      {(region || history || quote || pkg || order.lead_source || allergens.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-3 border-b border-slate-200">
          {region?.name && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-50 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5">
              <Building2 className="w-3 h-3" />
              {region.name}
            </span>
          )}
          {history && history.order_count > 1 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-full px-2 py-0.5"
              title={history.last_event_date ? `Last event: ${new Date(history.last_event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}` : undefined}
            >
              <Repeat className="w-3 h-3" />
              Repeat ({history.order_count} orders)
            </span>
          )}
          {quote && (
            <a
              href={`/admin/quotes/${quote.id}`}
              className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5 hover:bg-blue-100"
              title="Open source quote"
            >
              <FileSignature className="w-3 h-3" />
              Quote {quote.quote_number || quote.id.slice(0, 6)}
            </a>
          )}
          {pkg?.name && (
            <span
              className="inline-flex items-center gap-1 text-[11px] bg-purple-50 text-purple-800 border border-purple-200 rounded-full px-2 py-0.5"
              title="Source package"
            >
              <PackageIcon className="w-3 h-3" />
              {pkg.name}
            </span>
          )}
          {order.lead_source && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-50 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" />
              {order.lead_source}
            </span>
          )}
          {allergens.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-900 border border-amber-300 rounded-full px-2 py-0.5"
              title="Union of allergen codes across all menu items on this order"
            >
              <AlertTriangle className="w-3 h-3" />
              Allergens: {allergens.join(", ")}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Event</p>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <CalendarIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>
              {eventDateLong}
              {isMultiDay && (
                <span className="text-slate-500"> - {new Date(order.event_end_date!).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "long" })}</span>
              )}
            </span>
          </div>
          {order.event_time && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>{order.event_time.slice(0, 5)}</span>
            </div>
          )}
          {order.guest_count != null && order.guest_count > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>{order.guest_count} guest{order.guest_count === 1 ? "" : "s"}</span>
            </div>
          )}
          {(order.venue_name || order.venue_address) && (
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                {order.venue_name && <p className="font-medium">{order.venue_name}</p>}
                {order.venue_address && <p className="text-xs text-slate-500">{order.venue_address}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Client</p>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>{order.client_name || "-"}</span>
          </div>
          {order.client_email && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a href={`mailto:${order.client_email}`} className="hover:underline truncate">{order.client_email}</a>
            </div>
          )}
          {order.client_phone && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a href={`tel:${order.client_phone}`} className="hover:underline">{order.client_phone}</a>
            </div>
          )}
          {history && history.order_count > 1 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <HistoryIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span>
                {history.order_count} orders ever
                {history.last_event_date && <span> · last {new Date(history.last_event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>}
              </span>
            </div>
          )}
        </div>
      </div>

      {(order.dietary_requirements || order.special_instructions || order.kitchen_instructions || (isAdminTier && order.internal_notes)) && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 text-sm">
          {order.dietary_requirements && (
            <div>
              <p className="text-xs text-amber-800 uppercase tracking-wider mb-1 font-semibold">Dietary requirements</p>
              <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 whitespace-pre-wrap">{order.dietary_requirements}</p>
            </div>
          )}
          {order.special_instructions && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Special instructions</p>
              <p className="text-slate-700 whitespace-pre-wrap">{order.special_instructions}</p>
            </div>
          )}
          {order.kitchen_instructions && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Kitchen notes</p>
              <p className="text-slate-700 whitespace-pre-wrap">{order.kitchen_instructions}</p>
            </div>
          )}
          {isAdminTier && order.internal_notes && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 inline-flex items-center gap-1">
                Internal notes <span className="text-[10px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">admin only</span>
              </p>
              <p className="text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-2">{order.internal_notes}</p>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
