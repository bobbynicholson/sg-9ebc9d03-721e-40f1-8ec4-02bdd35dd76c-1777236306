/**
 * /admin/orders/[id]/ticket - print-friendly kitchen ticket.
 *
 * Wave 66.9 - full rewrite from the 5-specialist audit. The Phase 12
 * ticket was a stripped-down order summary (order number, client,
 * venue, menu items, allergens). Bobby's brief on this wave: maximum
 * intelligence on the printed sheet so the chef can work from one
 * piece of paper. Backplanned cook + prep times, allergens per dish,
 * recipe instructions, equipment + serving gear, driver / collection
 * details, advance-notice-respecting timeline.
 *
 * Data sources joined on render:
 *   orders                       - header band + setup/pickup/event times
 *   order_items                  - line items (qty + name + per-line notes)
 *   menu_items (by id or name)   - recipe times, allergens, instructions,
 *                                   advance-notice hours, base_servings
 *   equipment_bookings + equipment - serving gear grouped by category
 *   driver_assignments + profiles  - who's collecting + when
 *
 * Backplan: for each menu line we compute LATEST cook-start and
 * LATEST prep-start using the recipe times scaled by guest count
 * with a 3x parallelism cap (matches kitchenPrepService logic).
 * `requires_advance_notice_hours` pulls prep-start further back when
 * the item supports cook-ahead (e.g. "lamb spit can start prepping
 * 6h before pickup - start at 10:30").
 *
 * Missing recipe data: each item without prep_time_minutes /
 * cook_time_minutes shows an inline warning chip with a link to the
 * menu editor scoped to that item. No double-entry: the admin sets
 * it once and every future order's ticket inherits.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Loader2, AlertCircle, ChefHat, Truck, Package, Clock, Edit3, ExternalLink, FileText } from "lucide-react";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";

interface OrderRow {
  id: string;
  order_number: string | null;
  // Wave 70.45c - event_name added so the canonical BookingHeader can
  // surface the client-facing event label (the chef knows which event
  // they're cooking for, not just the internal order number).
  event_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  special_instructions: string | null;
  internal_notes: string | null;
  setup_time: string | null;
  pickup_time: string | null;
  status: string | null;
}

interface OrderItemRow {
  id: string;
  menu_item_id: string | null;
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  special_instructions: string | null;
}

interface MenuItemRow {
  id: string;
  item_name: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  base_servings: number | null;
  requires_advance_notice_hours: number | null;
  allergen_codes: string[] | null;
  dietary_tags: string[] | null;
  instructions: string | null;
  recipe_name: string | null;
}

interface EquipmentBookingRow {
  id: string;
  quantity: number | null;
  status: string | null;
  equipment: { name: string | null; category: string | null } | null;
}

interface DriverAssignmentRow {
  driver_id: string | null;
  assignment_type: string | null;
  status: string | null;
  accepted_at: string | null;
  profiles: { full_name: string | null; phone_number: string | null } | null;
}

// Backplan parallelism cap matches kitchenPrepService default (3).
// Stops a 200-guest job naively becoming 5x the recipe time when the
// kitchen has multiple stations and ovens.
const PARALLELISM_CAP = 3;
// Safety buffer matches the kitchenPrepService default. Cook ends
// this many minutes before pickup so the pack/plate has breathing room.
const SAFETY_BUFFER_MIN = 30;

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return iso; }
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "TBC";
  return t.slice(0, 5);
}

function fmtDateTime(d: Date | null): string {
  if (!d) return "-";
  try {
    return d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
}

function fmtClock(d: Date | null): string {
  if (!d) return "-";
  try {
    return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
}

function combineDateTime(date: string | null, time: string | null): Date | null {
  if (!date) return null;
  const t = time ? time.slice(0, 5) : "12:00";
  const dt = new Date(`${date}T${t}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Resolve the pickup moment using the same rules as
 * kitchenPrepService.planTasksForOrder. Prefer pickup_time, fall back
 * to event_time on event_date, fall back to noon on event_date.
 */
function resolvePickupAt(order: OrderRow): Date | null {
  if (order.pickup_time) {
    const dt = new Date(`${order.event_date}T${order.pickup_time.slice(0, 5)}:00`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return combineDateTime(order.event_date, order.event_time);
}

interface BackplannedItem {
  orderItemId: string;
  itemName: string;
  qty: number;
  menuItem: MenuItemRow | null;
  prepMinScaled: number;
  cookMinScaled: number;
  prepStartsAt: Date | null;
  cookStartsAt: Date | null;
  cookEndsAt: Date | null;
  allergens: string[];
  diets: string[];
  instructions: string | null;
  missingRecipeData: boolean;
}

function backplanItem(
  oi: OrderItemRow,
  menuItem: MenuItemRow | null,
  guestCount: number,
  pickupAt: Date | null,
): BackplannedItem {
  const qty = Number(oi.quantity || 1);
  const basePrepMin = Number(menuItem?.prep_time_minutes ?? 0);
  const baseCookMin = Number(menuItem?.cook_time_minutes ?? 0);
  const baseServings = Math.max(1, Number(menuItem?.base_servings ?? 1));
  const rawBatches = Math.ceil(guestCount / baseServings);
  const effectiveBatches = Math.max(1, Math.min(rawBatches, PARALLELISM_CAP));
  const prepMinScaled = Math.ceil(basePrepMin * effectiveBatches);
  const cookMinScaled = Math.ceil(baseCookMin * effectiveBatches);

  // requires_advance_notice_hours - when set, this dish CAN be
  // prepped that many hours ahead of pickup. We use it to pull
  // prep_starts_at FORWARD (earlier) so the chef sees a wider window
  // to work in. The deadline (cookEndsAt) stays at pickup - safety.
  const advanceHrs = Number(menuItem?.requires_advance_notice_hours ?? 0);

  let cookEndsAt: Date | null = null;
  let cookStartsAt: Date | null = null;
  let prepStartsAt: Date | null = null;

  if (pickupAt && (basePrepMin > 0 || baseCookMin > 0)) {
    cookEndsAt = new Date(pickupAt.getTime() - SAFETY_BUFFER_MIN * 60_000);
    cookStartsAt = new Date(cookEndsAt.getTime() - cookMinScaled * 60_000);
    prepStartsAt = new Date(cookStartsAt.getTime() - prepMinScaled * 60_000);
    // Pull prep-start back when the dish supports cook-ahead. The
    // chef gets a "you can start as early as X" earlier signal, but
    // the latest-start is still cookStartsAt - prepMin.
    if (advanceHrs > 0) {
      const earliestStart = new Date(pickupAt.getTime() - advanceHrs * 3_600_000);
      if (earliestStart.getTime() < prepStartsAt.getTime()) {
        prepStartsAt = earliestStart;
      }
    }
  }

  return {
    orderItemId: oi.id,
    itemName: oi.item_name || "Item",
    qty,
    menuItem,
    prepMinScaled,
    cookMinScaled,
    prepStartsAt,
    cookStartsAt,
    cookEndsAt,
    allergens: Array.isArray(menuItem?.allergen_codes) ? menuItem!.allergen_codes! : [],
    diets: Array.isArray(menuItem?.dietary_tags) ? menuItem!.dietary_tags! : [],
    instructions: menuItem?.instructions || null,
    missingRecipeData: !menuItem || (basePrepMin === 0 && baseCookMin === 0),
  };
}

function KitchenTicketPage() {
  const router = useRouter();
  const orderId = typeof router.query.id === "string" ? router.query.id : null;
  const { profile } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const callerCompanyId = (profile as any)?.company_id || null;
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [menuMap, setMenuMap] = useState<Map<string, MenuItemRow>>(new Map());
  const [menuByName, setMenuByName] = useState<Map<string, MenuItemRow>>(new Map());
  const [equipment, setEquipment] = useState<EquipmentBookingRow[]>([]);
  const [drivers, setDrivers] = useState<DriverAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        let q = (supabase as any)
          .from("orders")
          // Wave 66.9 hotfix - final_guest_count was in the select
          // but doesn't exist on orders. PostgREST 400'd and the page
          // silently null-rendered as "Order not found". Same trap as
          // Wave 43. Use guest_count alone; if the column ever ships,
          // re-add it here AND read it in the BackplannedItem helper.
          .select("id, order_number, event_name, client_name, client_phone, event_date, event_time, guest_count, venue_address, special_instructions, internal_notes, setup_time, pickup_time, status")
          .eq("id", orderId)
          .is("deleted_at", null);
        if (callerCompanyId) q = q.eq("company_id", callerCompanyId);
        const { data, error } = await q.maybeSingle();
        if (error) console.error("[ticket] orders fetch failed:", error);
        if (!cancelled) setOrder((data || null) as OrderRow | null);

        // Pull line items + equipment + driver in parallel.
        const [itemsRes, equipmentRes, driversRes] = await Promise.all([
          (supabase as any)
            .from("order_items")
            .select("id, menu_item_id, item_name, description, quantity, special_instructions")
            .eq("order_id", orderId)
            .order("created_at", { ascending: true }),
          (supabase as any)
            .from("equipment_bookings")
            .select("id, quantity, status, equipment:equipment_id (name, category)")
            .eq("order_id", orderId)
            .neq("status", "cancelled"),
          (supabase as any)
            .from("driver_assignments")
            .select("driver_id, assignment_type, status, accepted_at, profiles:driver_id (full_name, phone_number)")
            .eq("order_id", orderId),
        ]);
        if (itemsRes.error) console.error("[ticket] order_items fetch failed:", itemsRes.error);
        if (equipmentRes.error) console.error("[ticket] equipment_bookings fetch failed:", equipmentRes.error);
        if (driversRes.error) console.error("[ticket] driver_assignments fetch failed:", driversRes.error);

        const itemRows = (itemsRes.data || []) as OrderItemRow[];
        if (!cancelled) {
          setItems(itemRows);
          setEquipment((equipmentRes.data || []) as EquipmentBookingRow[]);
          setDrivers((driversRes.data || []) as DriverAssignmentRow[]);
        }

        // Join order_items -> menu_items via id first, fall back to
        // name match (order_items.menu_item_id is often null on legacy
        // imports + older quotes; the item_name string is the
        // canonical lookup the rest of the system uses).
        const menuItemIds = itemRows.map((r) => r.menu_item_id).filter((x): x is string => !!x);
        const itemNames = itemRows.map((r) => (r.item_name || "").trim()).filter(Boolean);

        const orRows: MenuItemRow[] = [];
        if (callerCompanyId && (menuItemIds.length > 0 || itemNames.length > 0)) {
          // Single round-trip: pull all candidate menu items for this
          // company that match either by id or by case-insensitive name.
          // Two separate queries avoids a complex .or() over an
          // ARRAY-vs-text and keeps the planner happy.
          const queries: Promise<any>[] = [];
          if (menuItemIds.length > 0) {
            queries.push(
              (supabase as any)
                .from("menu_items")
                .select("id, item_name, prep_time_minutes, cook_time_minutes, base_servings, requires_advance_notice_hours, allergen_codes, dietary_tags, instructions, recipe_name")
                .eq("company_id", callerCompanyId)
                .in("id", menuItemIds),
            );
          }
          if (itemNames.length > 0) {
            queries.push(
              (supabase as any)
                .from("menu_items")
                .select("id, item_name, prep_time_minutes, cook_time_minutes, base_servings, requires_advance_notice_hours, allergen_codes, dietary_tags, instructions, recipe_name")
                .eq("company_id", callerCompanyId)
                .in("item_name", itemNames),
            );
          }
          const results = await Promise.all(queries);
          for (const r of results) {
            for (const row of (r?.data || []) as MenuItemRow[]) orRows.push(row);
          }
        }
        const byId = new Map<string, MenuItemRow>();
        const byName = new Map<string, MenuItemRow>();
        for (const m of orRows) {
          byId.set(m.id, m);
          if (m.item_name) byName.set(m.item_name.toLowerCase(), m);
        }
        if (!cancelled) {
          setMenuMap(byId);
          setMenuByName(byName);
        }
      } catch (e) {
        console.error("[ticket] unexpected error:", e);
        if (!cancelled) {
          setOrder(null);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, callerCompanyId]);

  useEffect(() => {
    if (!loading && order) {
      const t = setTimeout(() => {
        try { window.print(); } catch { /* noop */ }
      }, 500);
      return () => clearTimeout(t);
    }
  }, [loading, order]);

  // Backplan all items + compute the global "kitchen starts at" /
  // "kitchen ends at" envelope so the header timeline ribbon reads
  // accurately even when each item has its own internal start.
  const guestCount = Number(order?.guest_count || 1);
  const pickupAt = order ? resolvePickupAt(order) : null;
  const eventAt = order ? combineDateTime(order.event_date, order.event_time) : null;
  const setupAt = order ? combineDateTime(order.event_date, order.setup_time) : null;

  const backplanned: BackplannedItem[] = useMemo(() => {
    return items.map((oi) => {
      const mi = (oi.menu_item_id && menuMap.get(oi.menu_item_id))
        || (oi.item_name && menuByName.get(oi.item_name.toLowerCase()))
        || null;
      return backplanItem(oi, mi || null, guestCount, pickupAt);
    });
  }, [items, menuMap, menuByName, guestCount, pickupAt]);

  // Earliest prep-start across all items - kitchen reports for duty here.
  const earliestPrepStart = useMemo(() => {
    const dates = backplanned.map((b) => b.prepStartsAt).filter((d): d is Date => !!d);
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates.map((d) => d.getTime())));
  }, [backplanned]);

  // Latest cook-end across all items - last dish off the heat.
  const latestCookEnd = useMemo(() => {
    const dates = backplanned.map((b) => b.cookEndsAt).filter((d): d is Date => !!d);
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [backplanned]);

  // Aggregate allergens across all items so the watch-out banner
  // catches everything in one place.
  const allAllergens = useMemo(() => {
    const set = new Set<string>();
    for (const b of backplanned) for (const a of b.allergens) set.add(a);
    return Array.from(set).sort();
  }, [backplanned]);

  // Group equipment by category for the serving-gear section.
  const equipmentByCategory = useMemo(() => {
    const map = new Map<string, EquipmentBookingRow[]>();
    for (const eb of equipment) {
      const cat = eb.equipment?.category || "Other";
      const arr = map.get(cat);
      if (arr) arr.push(eb); else map.set(cat, [eb]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [equipment]);

  // Deliver driver is the primary "who's collecting" for the ticket.
  // Collection-type assignments (post-event gear pickup) are separate
  // and shown only when present.
  const deliveryDriver = drivers.find((d) => d.assignment_type === "delivery" || !d.assignment_type) || null;
  const collectionDriver = drivers.find((d) => d.assignment_type === "collection") || null;

  // Items missing recipe data so the "fix it" panel lists them.
  const missingRecipeItems = backplanned.filter((b) => b.missingRecipeData);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparing ticket...
      </div>
    );
  }
  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Order not found.
      </div>
    );
  }

  return (
    <>
      <Head><title>Kitchen ticket - {order.order_number}</title></Head>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="min-h-screen bg-slate-50 print:bg-white">
        <div className="no-print bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            {/* ODOC G.3: ticket complements the doc - this CTA hops
                back to the interactive operational surface. */}
            <Link
              href={withSlug(staffOrderHref(orderId, "kitchen_staff"))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-semibold text-orange-700 hover:bg-orange-50 border border-orange-200"
            >
              <FileText className="w-4 h-4" />
              Open full order document
            </Link>
          </div>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8 print:px-4 print:py-0">
          <div className="bg-white border border-slate-300 rounded-lg p-6 print:border-0 print:rounded-none print:p-0 space-y-4">
            {/* Wave 70.45c - canonical BookingHeader (kitchen variant).
                Replaces the bespoke header band so this surface inherits
                the tenant brand bar + variant ribbon + facts row that
                every other event document now shares. Setup/pickup live
                in the rightSlot so chefs still get the at-a-glance
                operational timestamps that the bespoke header showed. */}
            <BookingHeader
              variant="kitchen"
              booking={{
                id: order.id,
                order_number: order.order_number,
                event_name: order.event_name,
                event_date: order.event_date,
                event_time: order.event_time,
                guest_count: guestCount,
                status: order.status,
                client_name: order.client_name,
                venue_address: order.venue_address,
              }}
              rightSlot={(setupAt || pickupAt) ? (
                <div className="text-right text-[11px] text-slate-600 leading-tight">
                  {setupAt && <div>setup <span className="tabular-nums font-semibold text-slate-900">{fmtClock(setupAt)}</span></div>}
                  {pickupAt && <div>pickup <span className="tabular-nums font-semibold text-slate-900">{fmtClock(pickupAt)}</span></div>}
                </div>
              ) : undefined}
            />

            {/* Wave 66.9 - backplanned timeline ribbon. Single line so
                the chef sees the day's choreography at the top of the
                ticket before reading anything else. Falls back to a
                "Times pending" message when nothing is set. */}
            {(earliestPrepStart || latestCookEnd || pickupAt) && (
              <div className="rounded-md border-2 border-orange-300 bg-orange-50 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-widest text-orange-700 font-bold mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Backplanned timeline
                </p>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  {earliestPrepStart && (
                    <>
                      <span className="font-semibold text-slate-900">Start prep</span>
                      <span className="tabular-nums font-bold text-orange-800">{fmtClock(earliestPrepStart)}</span>
                      <span className="text-slate-400">→</span>
                    </>
                  )}
                  {latestCookEnd && (
                    <>
                      <span className="font-semibold text-slate-900">Cook done by</span>
                      <span className="tabular-nums font-bold text-orange-800">{fmtClock(latestCookEnd)}</span>
                      <span className="text-slate-400">→</span>
                    </>
                  )}
                  {pickupAt && (
                    <>
                      <span className="font-semibold text-slate-900">Driver collects</span>
                      <span className="tabular-nums font-bold text-orange-800">{fmtClock(pickupAt)}</span>
                      <span className="text-slate-400">→</span>
                    </>
                  )}
                  {eventAt && (
                    <>
                      <span className="font-semibold text-slate-900">Event</span>
                      <span className="tabular-nums font-bold text-orange-800">{fmtClock(eventAt)}</span>
                    </>
                  )}
                </div>
                {!earliestPrepStart && !latestCookEnd && (
                  <p className="text-[11px] text-slate-600 mt-1">
                    Add prep + cook times to each menu item to see the full backplan.
                  </p>
                )}
              </div>
            )}

            {/* Wave 70.45c - client / guests / venue used to live here as
                a 3-cell grid; they now render inside <BookingHeader> above
                so the same facts row appears on every event document. The
                only thing not in the header is the client phone - chefs
                rarely need it, and when they do it's on the order page;
                keeping it off the printed ticket avoids leaking client
                PII onto a piece of paper that gets handled by multiple
                staff. */}

            {/* Wave 66.9 - driver / collection band. Chef needs to
                know exactly who's collecting + when so they can hand
                off cleanly. Pulled from driver_assignments + profiles. */}
            {(deliveryDriver || collectionDriver) && (
              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-200">
                {deliveryDriver && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      Driver
                    </p>
                    <p className="text-base font-semibold text-slate-900">
                      {deliveryDriver.profiles?.full_name || "Assigned"}
                    </p>
                    {deliveryDriver.profiles?.phone_number && (
                      <p className="text-xs text-slate-600 tabular-nums">{deliveryDriver.profiles.phone_number}</p>
                    )}
                    {pickupAt && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        collects at <span className="font-semibold tabular-nums">{fmtClock(pickupAt)}</span>
                      </p>
                    )}
                  </div>
                )}
                {collectionDriver && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      Collection driver
                    </p>
                    <p className="text-base font-semibold text-slate-900">
                      {collectionDriver.profiles?.full_name || "Assigned"}
                    </p>
                    {collectionDriver.profiles?.phone_number && (
                      <p className="text-xs text-slate-600 tabular-nums">{collectionDriver.profiles.phone_number}</p>
                    )}
                    <p className="text-xs text-slate-600 mt-0.5">post-event equipment pickup</p>
                  </div>
                )}
              </div>
            )}

            {/* Allergen watch-out band */}
            {allAllergens.length > 0 && (
              <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold mb-1">Watch out - allergens across this order</p>
                <div className="flex flex-wrap gap-1.5">
                  {allAllergens.map((t) => (
                    <span key={t} className="text-[11px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border border-rose-300 bg-white text-rose-800">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Wave 66.9 - missing recipe data panel. Surfaces the
                quick-fix path so admins can fill in prep/cook times
                without leaving the ticket workflow. */}
            {missingRecipeItems.length > 0 && (
              <div className="no-print rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Recipe data missing for {missingRecipeItems.length} item{missingRecipeItems.length === 1 ? "" : "s"}
                </p>
                <p className="text-[11px] text-amber-900 mb-1.5">
                  The timeline above can&apos;t backplan without prep + cook times. Set them once on the menu item and every future ticket inherits.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missingRecipeItems.map((b) => (
                    <Link
                      key={b.orderItemId}
                      href={withSlug(`/admin/menu?q=${encodeURIComponent(b.itemName)}`)}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-white border border-amber-300 rounded-md px-2 py-0.5 hover:bg-amber-100"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      {b.itemName}
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Menu items - backplan-aware. Each row shows per-item
                latest prep / cook start so the chef can read the
                ticket sequentially and pick the right thing to start. */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1">
                <ChefHat className="w-3 h-3" />
                Menu ({backplanned.length})
              </p>
              {backplanned.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No menu items on this order.</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {backplanned.map((b) => (
                    <li key={b.orderItemId} className="py-3">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl font-bold tabular-nums text-slate-900 w-14 shrink-0">{b.qty}x</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <p className="text-base font-semibold text-slate-900">{b.itemName}</p>
                            {b.menuItem?.recipe_name && b.menuItem.recipe_name !== b.itemName && (
                              <span className="text-[11px] text-slate-500">({b.menuItem.recipe_name})</span>
                            )}
                          </div>
                          {/* Per-item backplan times */}
                          {(b.prepStartsAt || b.cookStartsAt || b.cookEndsAt) && (
                            <div className="text-[11px] text-slate-700 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                              {b.prepStartsAt && (
                                <span>
                                  <span className="text-slate-500">Prep from</span>{" "}
                                  <span className="font-semibold">{fmtClock(b.prepStartsAt)}</span>
                                  {b.prepMinScaled > 0 && (
                                    <span className="text-slate-500"> ({b.prepMinScaled}m)</span>
                                  )}
                                </span>
                              )}
                              {b.cookStartsAt && (
                                <span>
                                  <span className="text-slate-500">Cook from</span>{" "}
                                  <span className="font-semibold">{fmtClock(b.cookStartsAt)}</span>
                                  {b.cookMinScaled > 0 && (
                                    <span className="text-slate-500"> ({b.cookMinScaled}m)</span>
                                  )}
                                </span>
                              )}
                              {b.cookEndsAt && (
                                <span>
                                  <span className="text-slate-500">Ready by</span>{" "}
                                  <span className="font-semibold text-emerald-700">{fmtClock(b.cookEndsAt)}</span>
                                </span>
                              )}
                            </div>
                          )}
                          {b.missingRecipeData && (
                            <p className="text-[11px] text-amber-700 mt-1 inline-flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5" />
                              No recipe times on file - chef plans manually.
                            </p>
                          )}
                          {b.menuItem?.requires_advance_notice_hours ? (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Can be prepared up to {b.menuItem.requires_advance_notice_hours}h in advance.
                            </p>
                          ) : null}
                          {/* Per-item allergens + diet tags */}
                          {(b.allergens.length > 0 || b.diets.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {b.allergens.map((a) => (
                                <span key={`a-${a}`} className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border border-rose-300 bg-rose-50 text-rose-800">
                                  {a}
                                </span>
                              ))}
                              {b.diets.map((d) => (
                                <span key={`d-${d}`} className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-700">
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                          {b.instructions && (
                            <p className="text-[11px] text-slate-600 mt-1.5 whitespace-pre-wrap leading-snug">
                              <span className="font-semibold text-slate-700">Recipe: </span>
                              {b.instructions}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Wave 66.9 - equipment / serving gear band. Grouped by
                category so the chef packs cutlery + crockery + serving
                tools as separate batches, not one wall of items. */}
            {equipmentByCategory.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  Pack with the order
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {equipmentByCategory.map(([category, rows]) => (
                    <div key={category} className="rounded-md border border-slate-200 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1">{category}</p>
                      <ul className="space-y-0.5">
                        {rows.map((eb) => (
                          <li key={eb.id} className="text-xs text-slate-900 flex items-baseline justify-between gap-2 tabular-nums">
                            <span>{eb.equipment?.name || "Item"}</span>
                            <span className="font-semibold">{eb.quantity ?? 1}x</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(order.special_instructions || order.internal_notes) && (
              <div className="pt-3 border-t border-slate-200 space-y-2">
                {order.special_instructions && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Client special instructions</p>
                    <p className="text-sm text-slate-900 whitespace-pre-wrap leading-snug">{order.special_instructions}</p>
                  </div>
                )}
                {order.internal_notes && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Internal notes</p>
                    <p className="text-sm text-slate-900 whitespace-pre-wrap leading-snug">{order.internal_notes}</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t-2 border-slate-900 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Backplan computed live · parallelism cap {PARALLELISM_CAP} · safety buffer {SAFETY_BUFFER_MIN}m</span>
              <span>Printed {new Date().toLocaleString("en-ZA")}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProtectedKitchenTicketPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.KITCHEN_STAFF]}>
      <KitchenTicketPage />
    </ProtectedRoute>
  );
}
