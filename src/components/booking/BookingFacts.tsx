/**
 * BookingFacts - Wave 70.42
 *
 * Body component beneath <BookingHeader>. Renders the role-relevant
 * facts about a booking. Pairs with loadBookingForRole() server-side
 * helper so the staff variants never receive money fields in the
 * first place (defense in depth - see bookingFacts.ts).
 *
 * This commit ships the admin variant - the "conductor view" Bobby
 * asked for. Each cross-role panel surfaces a flat summary so the
 * owner can scan kitchen / dispatch / staff / cleaning / shopping
 * status without leaving the booking. Deep links jump to the
 * dedicated dashboard for each role.
 *
 * Other variants (client / kitchen / driver / cleaning / shopping)
 * land in 70.42b - the data layer is already in place, the views
 * are next.
 */
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChefHat, Truck, Users, Sparkles, ShoppingBag, AlertCircle, CheckCircle2, Clock, MapPin, Phone, FileText, Package } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useAuth } from "@/contexts/AuthContext";
import type {
  BookingFacts as BookingFactsData,
  BookingFactsAdmin,
  BookingFactsClient,
  BookingFactsKitchen,
  BookingFactsDriver,
  BookingFactsCleaning,
  BookingFactsShopping,
} from "@/services/booking/bookingFacts";

interface BookingFactsProps {
  facts: BookingFactsData;
}

export function BookingFacts({ facts }: BookingFactsProps) {
  if (facts.role === "admin")    return <AdminFacts facts={facts} />;
  if (facts.role === "client")   return <ClientFacts facts={facts} />;
  if (facts.role === "kitchen")  return <KitchenFacts facts={facts} />;
  if (facts.role === "driver")   return <DriverFacts facts={facts} />;
  if (facts.role === "cleaning") return <CleaningFacts facts={facts} />;
  if (facts.role === "shopping") return <ShoppingFacts facts={facts} />;
  // Exhaustive fallback for an unknown role - should be unreachable.
  return null;
}

// ── Admin: conductor view ────────────────────────────────────────────────

function AdminFacts({ facts }: { facts: BookingFactsAdmin }) {
  const { withSlug } = useTenantHref();
  const { user } = useAuth();
  const tenantCurrency = useTenantCurrency((user as any)?.company_id ?? null);

  // Money summary - the admin always sees totals.
  // Wave 70.44 - print-mode: gradients flatten to white, shadows
  // drop, border becomes a thin slate-400 line for cleaner PDF
  // output. Same treatment applied to every Card in the admin
  // variant below.
  const moneyBlock = (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white print:bg-white print:shadow-none print:border print:border-slate-300">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Money</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Total</p>
            <p className="text-lg font-bold tabular-nums text-slate-900">
              {facts.total_amount != null ? tenantCurrency.format(Number(facts.total_amount)) : "--"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Subtotal</p>
            <p className="text-sm tabular-nums text-slate-700">
              {facts.subtotal != null ? tenantCurrency.format(Number(facts.subtotal)) : "--"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Balance due</p>
            <p className={`text-sm tabular-nums font-semibold ${Number(facts.balance_due || 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {facts.balance_due != null ? tenantCurrency.format(Number(facts.balance_due)) : "--"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Cross-role status panels. Each is a single card with the headline
  // signal + a deep link to the dedicated dashboard. The admin scans
  // these in 2 seconds and knows where to intervene.
  const k = facts.kitchen;
  const d = facts.dispatch;
  const c = facts.cleaning;
  const s = facts.shopping;

  const kitchenStatus =
    k.prepTaskCount === 0 ? { label: "No prep tasks", tone: "amber" as const, icon: AlertCircle } :
    k.prepPending > 0 ? { label: `${k.prepPending} pending`, tone: "blue" as const, icon: Clock } :
    { label: "All prep done", tone: "emerald" as const, icon: CheckCircle2 };

  const dispatchStatus = d.driverAssigned
    ? { label: d.driverName || "Driver assigned", tone: "emerald" as const, icon: CheckCircle2 }
    : { label: "No driver yet", tone: "rose" as const, icon: AlertCircle };

  const cleaningStatus = c.handoverExpectedAt
    ? { label: `${c.itemsToReturn} item${c.itemsToReturn === 1 ? "" : "s"} expected back`, tone: "blue" as const, icon: Clock }
    : { label: "No handover scheduled", tone: "slate" as const, icon: AlertCircle };

  const shoppingStatus = s.ingredientsShort > 0
    ? { label: `${s.ingredientsShort} ingredient${s.ingredientsShort === 1 ? "" : "s"} short`, tone: "rose" as const, icon: AlertCircle }
    : { label: "All ingredients covered", tone: "emerald" as const, icon: CheckCircle2 };

  const TONE: Record<string, { card: string; text: string; iconBg: string }> = {
    emerald: { card: "border-emerald-200 bg-emerald-50/40", text: "text-emerald-800", iconBg: "bg-emerald-100 text-emerald-700" },
    blue:    { card: "border-blue-200 bg-blue-50/40",        text: "text-blue-800",    iconBg: "bg-blue-100 text-blue-700" },
    amber:   { card: "border-amber-200 bg-amber-50/40",      text: "text-amber-800",   iconBg: "bg-amber-100 text-amber-700" },
    rose:    { card: "border-rose-200 bg-rose-50/40",        text: "text-rose-800",    iconBg: "bg-rose-100 text-rose-700" },
    slate:   { card: "border-slate-200 bg-slate-50/40",      text: "text-slate-700",   iconBg: "bg-slate-100 text-slate-600" },
  };

  type Panel = { key: string; title: string; status: { label: string; tone: keyof typeof TONE; icon: React.ComponentType<{ className?: string }> }; href: string; brandIcon: React.ComponentType<{ className?: string }> };
  const panels: Panel[] = [
    { key: "kitchen", title: "Kitchen", status: kitchenStatus, href: `/admin/orders?id=${facts.id}`, brandIcon: ChefHat },
    { key: "dispatch", title: "Driver", status: dispatchStatus, href: `/admin/order-assignments?orderId=${facts.id}`, brandIcon: Truck },
    { key: "staff", title: "Staff", status: { label: `${k.staffOnShiftCount} on shift`, tone: k.staffOnShiftCount > 0 ? "emerald" : "amber", icon: k.staffOnShiftCount > 0 ? CheckCircle2 : AlertCircle }, href: `/admin/teams/kitchen?date=${facts.event_date || ""}`, brandIcon: Users },
    { key: "cleaning", title: "Cleaning", status: cleaningStatus, href: c.handoverExpectedAt ? `/team-portal/cleaning/dashboard` : `/admin/teams/cleaning`, brandIcon: Sparkles },
    { key: "shopping", title: "Shopping", status: shoppingStatus, href: `/admin/shopping`, brandIcon: ShoppingBag },
  ];

  return (
    <div className="space-y-3">
      {moneyBlock}

      {/* Cross-role conductor panels - Bobby's brief: the owner is
          NOT just a bookkeeper. They need to see kitchen / driver /
          staff / cleaning / shopping status at a glance, not click
          through five tabs. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
        {panels.map((p) => {
          const tone = TONE[p.status.tone];
          const StatusIcon = p.status.icon;
          const BrandIcon = p.brandIcon;
          return (
            <Link
              key={p.key}
              href={withSlug(p.href)}
              className={`block rounded-lg border ${tone.card} p-3 hover:brightness-105 transition-all print:bg-white print:border-slate-300 print:hover:brightness-100`}
              title={`${p.title}: ${p.status.label}`}
            >
              <div className="flex items-start gap-2 mb-1.5">
                <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${tone.iconBg}`}>
                  <BrandIcon className="w-3 h-3" />
                </span>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-700">{p.title}</p>
              </div>
              <div className={`text-xs ${tone.text} flex items-start gap-1`}>
                <StatusIcon className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{p.status.label}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Kitchen prep detail strip - only when there are prep tasks
          (the panel above signals the at-a-glance state; this strip
          adds the count detail without forcing a navigation). */}
      {k.prepTaskCount > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-900">{k.prepDone}</span>
                <span className="text-slate-500"> of {k.prepTaskCount} prep tasks done</span>
                {k.prepPending > 0 && (
                  <span className="text-slate-500"> · {k.prepPending} still to do</span>
                )}
              </p>
              <Badge variant="outline" className="text-[10px] bg-slate-50">
                {Math.round((k.prepDone / k.prepTaskCount) * 100)}%
              </Badge>
            </div>
            {/* Tiny progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                style={{ width: `${(k.prepDone / k.prepTaskCount) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Client: their booking from their perspective ────────────────────────

function ClientFacts({ facts }: { facts: BookingFactsClient }) {
  const { user } = useAuth();
  const tenantCurrency = useTenantCurrency((user as any)?.company_id ?? null);
  return (
    <div className="space-y-3">
      <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white print:bg-white print:shadow-none print:border print:border-slate-300">
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Your order</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Total</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {facts.total_amount != null ? tenantCurrency.format(Number(facts.total_amount)) : "--"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">VAT included</p>
              <p className="text-sm tabular-nums text-slate-700">
                {facts.tax_amount != null ? tenantCurrency.format(Number(facts.tax_amount)) : "--"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Balance to pay</p>
              <p className={`text-sm tabular-nums font-semibold ${Number(facts.balance_due || 0) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {facts.balance_due != null ? tenantCurrency.format(Number(facts.balance_due)) : "--"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {facts.items.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Items ordered</p>
            <ul className="divide-y divide-slate-100">
              {facts.items.map((it, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-800">
                    <span className="font-medium">{it.quantity}×</span> {it.item_name || "Item"}
                  </span>
                  {it.line_total != null && it.line_total > 0 && (
                    <span className="text-sm tabular-nums text-slate-700">{tenantCurrency.format(Number(it.line_total))}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Kitchen: what to cook, when to be ready ─────────────────────────────

function KitchenFacts({ facts }: { facts: BookingFactsKitchen }) {
  return (
    <div className="space-y-3">
      {/* Timing strip - kitchen's primary fact: when does it need
          to be ready? Driver pickup_time is the deadline; setup_time
          is the kitchen's setup window. NO money fields anywhere on
          the kitchen variant - stripped server-side. */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-orange-50 to-red-50 print:bg-white print:shadow-none print:border print:border-slate-300">
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-orange-700 font-bold mb-2">Kitchen timing</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Event time</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{facts.event_time?.slice(0, 5) || "--"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Setup</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{facts.setup_time?.slice(0, 5) || "--"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Driver collects</p>
              <p className="text-lg font-bold tabular-nums text-orange-700">{facts.pickup_time?.slice(0, 5) || "--"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {facts.items.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
              <ChefHat className="w-3 h-3" />
              Menu ({facts.items.length} items)
            </p>
            <ul className="divide-y divide-slate-100">
              {facts.items.map((it, i) => (
                <li key={i} className="py-2">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-base font-bold tabular-nums text-slate-900">{it.quantity}×</span>
                    <span className="text-sm font-medium text-slate-800">{it.item_name || "Item"}</span>
                  </div>
                  {it.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5 pl-6">{it.description}</p>
                  )}
                  {it.special_instructions && (
                    <p className="text-[11px] text-amber-700 mt-0.5 pl-6 italic">
                      Note: {it.special_instructions}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Driver: where, when, who ─────────────────────────────────────────────

function DriverFacts({ facts }: { facts: BookingFactsDriver }) {
  const phoneHref = facts.client_phone
    ? `tel:${facts.client_phone.replace(/[^+\d]/g, "")}`
    : null;
  return (
    <div className="space-y-3">
      <Card className="border-0 shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50 print:bg-white print:shadow-none print:border print:border-slate-300">
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-blue-700 font-bold mb-2">Run sheet</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Pickup</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{facts.pickup_time?.slice(0, 5) || "--"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Setup</p>
              <p className="text-sm tabular-nums text-slate-700">{facts.setup_time?.slice(0, 5) || "--"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Delivery</p>
              <p className="text-lg font-bold tabular-nums text-blue-700">{facts.event_time?.slice(0, 5) || "--"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-2.5">
          {facts.venue_address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facts.venue_address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-700 hover:underline"
              >
                {facts.venue_address}
              </a>
            </div>
          )}
          {phoneHref && (
            <div className="flex items-start gap-2">
              <Phone className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <a href={phoneHref} className="text-sm text-blue-700 hover:underline">
                {facts.client_phone}
              </a>
            </div>
          )}
          {facts.special_instructions && (
            <div className="flex items-start gap-2 pt-2 border-t border-slate-100">
              <FileText className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">{facts.special_instructions}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Cleaning: what's coming back, when ──────────────────────────────────

function CleaningFacts({ facts }: { facts: BookingFactsCleaning }) {
  const handoverHref = facts.handover.id ? `/team-portal/cleaning/handovers/${facts.handover.id}` : null;
  return (
    <Card className="border-0 shadow-sm bg-gradient-to-r from-cyan-50 to-blue-50 print:bg-white print:shadow-none print:border print:border-slate-300">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Cleaning handover
        </p>
        {facts.handover.id ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Status</p>
                <p className="text-sm font-semibold text-slate-900 capitalize">{facts.handover.status?.replace("_", " ") || "--"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Items expected back</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">{facts.handover.items_expected}</p>
              </div>
            </div>
            {facts.handover.expected_at && (
              <p className="text-xs text-cyan-700">
                Expected back by {new Date(facts.handover.expected_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
              </p>
            )}
            {handoverHref && (
              <Link href={handoverHref} className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-900 mt-2 font-medium">
                Open handover detail →
              </Link>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">No handover scheduled yet for this booking.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Shopping: ingredient demand ──────────────────────────────────────────

function ShoppingFacts({ facts }: { facts: BookingFactsShopping }) {
  return (
    <Card className="border-0 shadow-sm bg-gradient-to-r from-emerald-50 to-green-50 print:bg-white print:shadow-none print:border print:border-slate-300">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold mb-2 flex items-center gap-1.5">
          <ShoppingBag className="w-3 h-3" />
          Items to procure ({facts.items.length})
        </p>
        {facts.items.length === 0 ? (
          <p className="text-sm text-slate-600">No line items on this booking yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {facts.items.map((it, i) => (
              <li key={i} className="py-1.5 flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span className="text-sm text-slate-800 flex-1">{it.item_name || "Item"}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{it.quantity}×</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-slate-500 mt-3">
          Tip: open the Shopping portal &gt; Buy list for ingredient-level demand across all upcoming events.
        </p>
      </CardContent>
    </Card>
  );
}
