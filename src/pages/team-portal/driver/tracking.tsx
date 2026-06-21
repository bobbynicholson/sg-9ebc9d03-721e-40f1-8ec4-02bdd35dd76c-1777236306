import { useState, useEffect } from "react";
import Link from "next/link";
import { PortalCard } from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  MapPin, Navigation, Clock, CheckCircle, Package, Users,
  UtensilsCrossed, AlertTriangle, ChefHat, Phone, Calendar, ExternalLink,
} from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { UserRole } from "@/types/app";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { openNavigation as openMapsNavigation } from "@/lib/driverNavigation";
import { useKitchenOrigin } from "@/hooks/useKitchenOrigin";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

interface MenuLine {
  id: string;
  name: string;
  quantity: number;
  description: string | null;
  special_instructions: string | null;
}

interface EquipmentLine {
  id: string;
  name: string;
  quantity: number;
}

interface ActiveDelivery {
  assignmentId: string;
  orderId: string;
  orderNumber: string;
  eventName: string | null;
  clientName: string;
  clientPhone: string | null;
  venueAddress: string;
  venueLat: number | null;
  venueLng: number | null;
  guestCount: number;
  eventDate: string;
  eventTime: string | null;
  setupTime: string | null;
  /** Kitchen collection time (HH:MM, no date). Surfaces alongside
   *  event_time so the driver knows when to leave the kitchen, not
   *  just when they need to arrive. */
  pickupTime: string | null;
  specialInstructions: string | null;
  dietaryRequirements: string | null;
  status: string;
  picked_up_at: string | null;
  arrived_at_venue_at: string | null;
  menuItems: MenuLine[];
  equipment: EquipmentLine[];
}

/** Format "14:30:00" / "14:30" / "" -> "14:30" or fallback. Driver
 *  surfaces never want seconds. */
function fmtClockTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** SA locale date format so a UK / US browser default doesn't flip
 *  21 May to 5/21. */
function fmtEventDate(iso: string | null | undefined): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  assigned: { label: "Assigned", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  accepted: { label: "Accepted", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  en_route: { label: "En Route", tone: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900" },
  picked_up: { label: "Picked Up", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

function DriverTrackingInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [delivery, setDelivery] = useState<ActiveDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  // Kitchen origin: driver's region kitchen if set, otherwise company HQ
  const { origin: kitchenOrigin } = useKitchenOrigin(user?.id, user?.company_id);

  const loadActiveDelivery = async () => {
    if (!user?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("driver_assignments")
      .select(`
        id,
        order_id,
        status,
        picked_up_at,
        arrived_at_venue_at,
        orders (
          order_number,
          event_name,
          client_name,
          client_phone,
          venue_address,
          venue_lat,
          venue_lng,
          guest_count,
          event_date,
          event_time,
          setup_time,
          pickup_time,
          special_instructions,
          dietary_requirements
        )
      `)
      .eq("driver_id", user.id)
      .in("status", ["assigned", "accepted", "en_route", "picked_up", "at_venue"])
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error loading active delivery:", error);
      setDelivery(null);
      setLoading(false);
      return;
    }

    if (!data || !data.orders) {
      setDelivery(null);
      setLoading(false);
      return;
    }

    const order: any = data.orders;

    // Pull the food + equipment manifest in parallel. These two
    // lists are what the driver actually loads off the kitchen
    // bench. Best-effort - a missing read collapses the
    // accordion section to empty rather than blocking the page.
    const [itemsRes, equipRes] = await Promise.all([
      supabase
        .from("order_items")
        .select("id, item_name, quantity, description, special_instructions")
        .eq("order_id", data.order_id)
        .order("created_at", { ascending: true }),
      supabase
        .from("equipment_bookings")
        .select("id, quantity, equipment:equipment_id(id, name)")
        .eq("order_id", data.order_id),
    ]);

    const menuItems: MenuLine[] = ((itemsRes.data as any[]) || []).map((r) => ({
      id: r.id,
      name: r.item_name || "Item",
      quantity: Number(r.quantity) || 0,
      description: r.description || null,
      special_instructions: r.special_instructions || null,
    }));

    const equipment: EquipmentLine[] = ((equipRes.data as any[]) || [])
      .map((r) => ({
        id: r.id,
        name: r.equipment?.name || "Equipment",
        quantity: Number(r.quantity) || 0,
      }))
      .filter((r) => r.quantity > 0);

    setDelivery({
      assignmentId: data.id,
      orderId: data.order_id,
      orderNumber: order.order_number,
      eventName: order.event_name ?? null,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      venueAddress: order.venue_address,
      venueLat: order.venue_lat ?? null,
      venueLng: order.venue_lng ?? null,
      guestCount: order.guest_count,
      eventDate: order.event_date,
      eventTime: order.event_time,
      setupTime: order.setup_time ?? null,
      pickupTime: order.pickup_time ?? null,
      specialInstructions: order.special_instructions ?? null,
      dietaryRequirements: order.dietary_requirements ?? null,
      status: data.status,
      picked_up_at: data.picked_up_at,
      arrived_at_venue_at: data.arrived_at_venue_at,
      menuItems,
      equipment,
    });
    setLoading(false);
  };

  useEffect(() => {
    loadActiveDelivery();
  }, [user?.id]);

  const markArrived = async () => {
    if (!delivery) return;
    setUpdating(true);
    // `at_venue` is the canonical "driver has reached the delivery
    // venue" state in assignment_status. Prior code wrote `picked_up`
    // here, which is the earlier lifecycle moment (driver collected
    // food from the kitchen) - so "Mark arrived" was writing the wrong
    // state and the toast copy ("Status updated to picked up") was
    // misleading.
    const { error } = await supabase
      .from("driver_assignments")
      .update({
        status: "at_venue",
        arrived_at_venue_at: new Date().toISOString(),
      })
      .eq("id", delivery.assignmentId);

    setUpdating(false);
    if (error) {
      toast({ title: "Could not update", description: dbErrorMessage(error, { entity: "delivery" }), variant: "destructive" });
      return;
    }
    toast({ title: "Marked as arrived", description: "Status updated to at venue." });
    loadActiveDelivery();
  };

  const openNavigation = () => {
    if (!delivery) return;
    openMapsNavigation(
      { lat: delivery.venueLat, lng: delivery.venueLng, address: delivery.venueAddress },
      kitchenOrigin ?? undefined,
    );
  };

  const statusMeta = delivery ? STATUS_LABELS[delivery.status] || { label: delivery.status, tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" } : null;

  return (
    <DriverPageShell
      pageTitle="Delivery Tracking - Driver Portal"
      heading="Current Delivery"
      subheading="Track your active delivery"
      icon={Navigation}
      width="full"
      hideFooter
    >
          {loading ? (
            <div className="space-y-6" aria-busy="true" aria-label="Loading your active delivery">
              <div className="h-40 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
              <div className="h-32 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
            </div>
          ) : !delivery ? (
            <PortalCard padded={false}>
              <div className="py-16 px-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  <Package className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">No active delivery</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  When dispatch assigns you a delivery, it&apos;ll appear here with the collect time, manifest and venue.
                </p>
              </div>
            </PortalCard>
          ) : (
            <div className="space-y-6">
              {/* Single delivery card. Sections (collect / deliver /
                  items / instructions / contact / actions) live
                  together so the driver isn't hopping between
                  cards on a phone. Accordion collapses items by
                  default; everything time-critical is above the
                  fold. */}
              <PortalCard padded={false} className="overflow-hidden">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        {delivery.orderNumber}
                      </p>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white truncate">
                        {delivery.eventName || delivery.clientName}
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                        For {delivery.clientName}
                      </p>
                    </div>
                    <Badge className={`${statusMeta!.tone} shrink-0`}>
                      {statusMeta!.label}
                    </Badge>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {/* COLLECT FROM KITCHEN. First-action info. Big
                      pickup_time, kitchen origin if we have it. */}
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shrink-0">
                        <ChefHat className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Collect from kitchen
                        </p>
                        {delivery.pickupTime ? (
                          <p className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1">
                            {fmtClockTime(delivery.pickupTime)}
                          </p>
                        ) : (
                          <p className="text-sm italic text-slate-500 dark:text-slate-400 mt-1">
                            Pickup time not set - check with dispatch.
                          </p>
                        )}
                        {kitchenOrigin?.address && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                            {kitchenOrigin.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* DELIVER TO VENUE. Address + event time + guest count
                      grouped so the driver sees "where + when + how many"
                      in one glance. */}
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Deliver to venue
                        </p>
                        <p className="font-semibold text-slate-900 dark:text-white mt-1">
                          {delivery.venueAddress}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <Calendar className="w-3.5 h-3.5" />
                            {fmtEventDate(delivery.eventDate)}
                          </span>
                          {delivery.setupTime && (
                            <span className="inline-flex items-center gap-1.5 tabular-nums">
                              <Clock className="w-3.5 h-3.5" />
                              Setup {fmtClockTime(delivery.setupTime)}
                            </span>
                          )}
                          {delivery.eventTime && (
                            <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-amber-700 dark:text-amber-400">
                              <Clock className="w-3.5 h-3.5" />
                              Event {fmtClockTime(delivery.eventTime)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <Users className="w-3.5 h-3.5" />
                            {delivery.guestCount} guests
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DIETARY + SPECIAL INSTRUCTIONS. Red strip - the
                      driver needs to see allergens / special asks
                      before they hit the venue. */}
                  {(delivery.dietaryRequirements || delivery.specialInstructions) && (
                    <div className="p-5 bg-rose-50 dark:bg-rose-950/40">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 text-sm">
                          {delivery.dietaryRequirements && (
                            <p>
                              <span className="font-semibold text-rose-800 dark:text-rose-200">Dietary: </span>
                              <span className="text-rose-900 dark:text-rose-100">{delivery.dietaryRequirements}</span>
                            </p>
                          )}
                          {delivery.specialInstructions && (
                            <p>
                              <span className="font-semibold text-rose-800 dark:text-rose-200">Notes: </span>
                              <span className="text-rose-900 dark:text-rose-100">{delivery.specialInstructions}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ITEMS TO LOAD. Accordion housed inside the same
                      card. Collapsed by default - the driver opens it
                      while loading the bakkie, then closes it and
                      drives. Two sections: food + equipment, each
                      with a quantity total in the trigger. */}
                  {(delivery.menuItems.length > 0 || delivery.equipment.length > 0) && (
                    <div className="px-2 sm:px-3">
                      <Accordion type="multiple" className="w-full">
                        {delivery.menuItems.length > 0 && (
                          <AccordionItem value="food" className="border-0">
                            <AccordionTrigger className="hover:no-underline py-4 px-3">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shrink-0">
                                  <UtensilsCrossed className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Food to load
                                  </p>
                                  <p className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                                    {delivery.menuItems.length} {delivery.menuItems.length === 1 ? "item" : "items"}
                                    {" · "}
                                    {delivery.menuItems.reduce((s, i) => s + i.quantity, 0)} portions
                                  </p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3">
                              <ul className="space-y-2">
                                {delivery.menuItems.map((m) => (
                                  <li
                                    key={m.id}
                                    className="flex items-start justify-between gap-3 p-3 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-slate-900 dark:text-white">{m.name}</p>
                                      {m.description && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{m.description}</p>
                                      )}
                                      {m.special_instructions && (
                                        <p className="text-xs text-rose-700 dark:text-rose-300 italic mt-1">
                                          Note: {m.special_instructions}
                                        </p>
                                      )}
                                    </div>
                                    <Badge variant="outline" className="tabular-nums shrink-0">
                                      x{m.quantity}
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {delivery.equipment.length > 0 && (
                          <AccordionItem value="equipment" className="border-0">
                            <AccordionTrigger className="hover:no-underline py-4 px-3">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shrink-0">
                                  <Package className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Equipment to load
                                  </p>
                                  <p className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                                    {delivery.equipment.length} {delivery.equipment.length === 1 ? "type" : "types"}
                                    {" · "}
                                    {delivery.equipment.reduce((s, e) => s + e.quantity, 0)} units
                                  </p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3">
                              <ul className="space-y-2">
                                {delivery.equipment.map((e) => (
                                  <li
                                    key={e.id}
                                    className="flex items-center justify-between gap-3 p-3 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                                  >
                                    <p className="font-medium text-slate-900 dark:text-white">{e.name}</p>
                                    <Badge variant="outline" className="tabular-nums shrink-0">
                                      x{e.quantity}
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        )}
                      </Accordion>
                    </div>
                  )}

                  {/* CLIENT CONTACT row - inline so the driver doesn't
                      need to scroll to a separate card. tel: link on
                      mobile pops the dialer. */}
                  {delivery.clientPhone && (
                    <a
                      href={`tel:${String(delivery.clientPhone).replace(/[^+\d]/g, "")}`}
                      onClick={() => {
                        // Desktop has no dialer, so a tel: click is a dead
                        // no-op there. Copy the number + toast as a fallback
                        // so "Call" always does something; mobile still dials.
                        try {
                          navigator.clipboard
                            ?.writeText(String(delivery.clientPhone))
                            .then(() =>
                              toast({ title: "Number copied", description: String(delivery.clientPhone) }),
                            )
                            .catch(() => {});
                        } catch {
                          /* clipboard unavailable - tel: still fires on mobile */
                        }
                      }}
                      className="flex items-center gap-3 p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center shrink-0">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Client contact
                        </p>
                        <p className="font-medium text-slate-900 dark:text-white tabular-nums">
                          {delivery.clientPhone}
                        </p>
                      </div>
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">Tap to call / click to copy</span>
                    </a>
                  )}

                  {/* ACTIONS. Primary nav button + Mark arrived gate.
                      Kept at the bottom so the driver scrolls past
                      the manifest first. */}
                  <div className="p-5 space-y-2">
                    <Link
                      href={withSlug(staffOrderHref(delivery.orderId, "driver"))}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold min-h-[32px] transition-colors duration-150 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900/60"
                      title="Open the driver brief for this order"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open brief
                    </Link>
                    <Button
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      size="lg"
                      onClick={() => openNavigation()}
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      Open in Navigation App
                    </Button>
                    {delivery.status !== "at_venue" && (
                      <Button
                        variant="outline"
                        className="w-full"
                        size="lg"
                        onClick={markArrived}
                        disabled={updating}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {updating ? "Updating..." : "Mark as Arrived"}
                      </Button>
                    )}
                  </div>
                </div>
              </PortalCard>
            </div>
          )}

      <ChatBot userRole="driver" companyId={user?.company_id} />
    </DriverPageShell>
  );
}

// DRV-A (driver deep audit, DRV-1 / DRV-2 / DRV-21): defense-in-depth.
// Matches the dashboard wrapper.
export default function DriverTracking() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.DRIVER, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DriverTrackingInner />
    </ProtectedRoute>
  );
}
