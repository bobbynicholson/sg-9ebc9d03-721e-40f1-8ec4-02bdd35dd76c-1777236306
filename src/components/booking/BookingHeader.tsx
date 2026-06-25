/**
 * BookingHeader - Wave 70.41
 *
 * Canonical event-document header band. The same booking renders on
 * 10+ surfaces today (admin orders modal, quote editor, client quote
 * view, client order tracking, kitchen ticket, driver run sheet,
 * cleaning handover, etc.) - each with a bespoke header that has
 * drifted over time. This component is the SHARED header all those
 * surfaces should adopt.
 *
 * Role variants control what gets surfaced + how it's framed:
 *
 *   admin    - full visibility: order number, status, dates, client,
 *               venue, guest count, totals. The conductor's view.
 *               (Bobby's note: admin sees EVERYTHING - this header
 *                doesn't change that, but the body components below
 *                will surface kitchen / driver / cleaning / shopping
 *                cross-role panels for the admin variant only.)
 *   client   - their event from their perspective. No order_number
 *               (internal ref); shows event name + date + venue +
 *               guests + total (it's their money).
 *   kitchen  - when food needs to be ready, by when, for how many.
 *               No money fields. No client contact details.
 *   driver   - where to go, when, who to ask for. Venue + contact.
 *               No money. No menu detail.
 *   cleaning - when the event happens, what's coming back. Equipment
 *               summary, no money, no menu.
 *   shopping - ingredient demand window. Event date + guest count
 *               (drives portion math). No money beyond ingredient cost.
 *
 * Branding: reads useBrandingRow() so the gradient + logo are the
 * tenant's, never CateringMS defaults. Mirrors the AdminNav brand-
 * tile pattern.
 *
 * Layout: a horizontal band at the top of any event-document view.
 * Mobile: stacks. Print: simplified, no gradients.
 */
import { Calendar as CalendarIcon, Clock, MapPin, Users, Hash, ChefHat, Truck, Sparkles, ShoppingBag, User } from "lucide-react";
import { useBrandingRow } from "@/lib/branding/useBranding";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { cn } from "@/lib/utils";

export type BookingHeaderVariant = "admin" | "client" | "kitchen" | "driver" | "cleaning" | "shopping";

export interface BookingHeaderBooking {
  id: string;
  order_number?: string | null;
  event_name?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  guest_count?: number | null;
  status?: string | null;
  client_name?: string | null;
  venue_address?: string | null;
  /** Money is in the booking but only RENDERED for admin / client
   *  variants - the staff variants ignore this field entirely.
   *  When wave 70.42 lands the data-layer omission, staff payloads
   *  won't even have these fields. */
  total_amount?: number | null;
}

interface BookingHeaderProps {
  booking: BookingHeaderBooking;
  variant: BookingHeaderVariant;
  /** When supplied, overrides the tenant currency for the total
   *  display. Useful for the rare cross-currency render (e.g.
   *  super-admin platform views). Most callers omit this. */
  currencyCode?: string;
  /** Optional right-side slot for variant-specific actions (e.g.
   *  Edit button on admin, Sign-off on cleaning). The header stays
   *  declarative; actions are owned by the host page. */
  rightSlot?: React.ReactNode;
  /** Optional tighter footprint for embedded contexts (cards inside
   *  lists). Defaults to false (the full hero band). */
  compact?: boolean;
}

const STATUS_TONE: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-purple-100 text-purple-800 border-purple-200",
  ready:      "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered:  "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  completed:  "bg-slate-100 text-slate-800 border-slate-200",
  cancelled:  "bg-rose-100 text-rose-700 border-rose-200",
  paused:     "bg-blue-100 text-blue-800 border-blue-300 border-dashed",
};

// Variant-specific accent icon shown next to the brand logo so each
// surface signals at a glance what KIND of document it is. Kitchen
// ticket = ChefHat. Driver run sheet = Truck. Etc.
const VARIANT_ICON: Record<BookingHeaderVariant, { Icon: React.ComponentType<{ className?: string }>; label: string }> = {
  admin:    { Icon: User,        label: "Admin view" },
  client:   { Icon: User,        label: "Your booking" },
  kitchen:  { Icon: ChefHat,     label: "Kitchen ticket" },
  driver:   { Icon: Truck,       label: "Driver run sheet" },
  cleaning: { Icon: Sparkles,    label: "Cleaning handover" },
  shopping: { Icon: ShoppingBag, label: "Shopping pull" },
};

function formatEventTime(t: string | null | undefined): string | null {
  if (!t) return null;
  // Accepts HH:MM or HH:MM:SS; trims to HH:MM for display.
  return t.slice(0, 5);
}

function formatEventDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function BookingHeader({
  booking,
  variant,
  currencyCode,
  rightSlot,
  compact = false,
}: BookingHeaderProps) {
  const branding = useBrandingRow();
  const tenantCurrency = useTenantCurrency(null); // null -> default currency
  const variantMeta = VARIANT_ICON[variant];
  const VariantIcon = variantMeta.Icon;

  const primary = branding?.primaryColor || "#9333ea";
  const secondary = branding?.secondaryColor || "#ec4899";
  const logoUrl = branding?.logoUrl || null;
  const companyName = branding?.companyName || null;

  const eventDateLabel = formatEventDate(booking.event_date);
  const eventTimeLabel = formatEventTime(booking.event_time);
  const statusKey = (booking.status || "").toLowerCase();
  const statusTone = STATUS_TONE[statusKey] || STATUS_TONE.confirmed;

  // Money visibility - admin + client see totals; staff variants
  // do not. Wave 70.42 will additionally strip these from the data
  // payload server-side; today we honour the rule at render time.
  const showMoney = variant === "admin" || variant === "client";
  const moneyFormat = currencyCode
    ? (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(n)
    : (n: number) => tenantCurrency.format(n, 0);

  return (
    <div
      className={cn(
        // Wave 70.44 - print-clean by default. shadow-sm is dropped
        // on print (browsers ignore box-shadow anyway, but explicit
        // for clarity) and the rounded corners flatten to sharp on
        // paper for a cleaner header band on PDFs.
        "relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white print:rounded-none print:shadow-none print:border-slate-400",
        compact ? "" : "",
      )}
    >
      {/* Branded gradient bar - the only place the tenant's primary
          + secondary colours surface in this header. Slim on compact,
          full hero on default.
          Wave 70.44 - on print, the gradient flattens to the brand
          primary as a solid colour (browsers render gradients
          inconsistently in print contexts; a flat colour is reliable
          and still tenant-branded). */}
      <div
        className={cn("w-full", compact ? "h-1.5" : "h-2")}
        style={{ background: `linear-gradient(90deg, ${primary} 0%, ${secondary} 100%)` }}
        aria-hidden
      />

      <div className={cn("px-4 sm:px-5", compact ? "py-3" : "py-4")}>
        <div className="flex items-start gap-3">
          {/* Brand tile - tenant logo or initials. */}
          <div
            className={cn(
              "rounded-lg flex items-center justify-center shadow-sm flex-shrink-0",
              compact ? "w-9 h-9" : "w-11 h-11",
            )}
            style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
            title={companyName || "Brand"}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={companyName || "Logo"} className="w-full h-full rounded-lg object-cover" />
            ) : (
              <VariantIcon className={cn("text-white", compact ? "w-4 h-4" : "w-5 h-5")} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Variant + order_number ribbon - thin, slate text, sits
                above the headline. Order number hidden on the client
                variant (internal reference, the client cares about
                their event, not our admin sequence number). */}
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 mb-0.5">
              <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider">
                <VariantIcon className="w-3 h-3" />
                {variantMeta.label}
              </span>
              {variant !== "client" && booking.order_number && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Hash className="w-3 h-3" />
                    {booking.order_number}
                  </span>
                </>
              )}
              {booking.status && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize", statusTone)}>
                    {booking.status.replace(/_/g, " ")}
                  </span>
                </>
              )}
            </div>

            {/* Headline - event name (preferred) or client name fallback.
                Kitchen / driver / cleaning use the client-facing event
                name so they know which event they're working on, not
                some internal label. */}
            <h2 className={cn(
              "font-bold text-slate-900 truncate",
              compact ? "text-base" : "text-lg sm:text-xl",
            )}>
              {booking.event_name || booking.client_name || "Event"}
            </h2>

            {/* Facts row - date / time / guests / venue. Each fact is
                a small inline chip. Money pill rendered last and only
                for admin + client variants. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-700">
              {eventDateLabel && (
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                  {eventDateLabel}
                </span>
              )}
              {eventTimeLabel && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {eventTimeLabel}
                </span>
              )}
              {booking.guest_count != null && booking.guest_count > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {booking.guest_count} {variant === "kitchen" ? "to feed" : variant === "driver" ? "pax" : "guests"}
                </span>
              )}
              {/* Client name shown for admin / kitchen / cleaning (operational
                  context: "who is this for"). Hidden for driver (driver
                  cares about the contact person at the venue, not the
                  billing client name). Hidden for client (it's THEM). */}
              {(variant === "admin" || variant === "kitchen" || variant === "cleaning" || variant === "shopping")
                && booking.client_name && booking.event_name && booking.client_name !== booking.event_name && (
                <span className="inline-flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {booking.client_name}
                </span>
              )}
              {booking.venue_address && variant !== "shopping" && (
                <span className="inline-flex items-center gap-1 max-w-md truncate">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{booking.venue_address}</span>
                </span>
              )}
              {showMoney && booking.total_amount != null && booking.total_amount > 0 && (
                <span className="inline-flex items-center gap-1 font-semibold text-slate-900 tabular-nums ml-auto">
                  {moneyFormat(Number(booking.total_amount))}
                </span>
              )}
            </div>
          </div>

          {rightSlot && (
            <div className="flex-shrink-0 ml-2">
              {rightSlot}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
