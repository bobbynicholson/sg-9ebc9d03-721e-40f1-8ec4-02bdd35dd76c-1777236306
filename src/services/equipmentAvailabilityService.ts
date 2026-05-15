/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Equipment availability calculator.
 *
 * Source of truth: `equipment.quantity` (units the company owns) and
 * `equipment_bookings` (one row per equipment line on an order, with
 * booked_from / booked_until / quantity / status / order_id). The
 * older "orders.equipment_items jsonb" path was abandoned when that
 * column was dropped -- the previous implementation here selected
 * `orders.equipment_items` and silently caught the resulting Postgres
 * error, returning `reserved=0` for every query. The page therefore
 * showed "everything is free" no matter what was actually committed.
 * This rewrite reads `equipment_bookings` directly, which is the
 * authoritative reservation table going forward.
 *
 * Reservation window: each booking holds equipment from booked_from
 * to booked_until. We treat any booking that overlaps the target date
 * (after expanding by `windowDays`) as a competitor. Multi-day events
 * can override the default window.
 *
 * Cancelled bookings don't count. Returned bookings honour
 * `returned_quantity` so partial returns release stock correctly.
 */
import { supabase } from "@/integrations/supabase/client";

// Active booking statuses -- anything not in this set is either
// cancelled, fully returned, or not yet committed.
//
// The status vocabulary across the codebase is fragmented today:
// orders.tsx + equipmentService.bookEquipment write "booked"; the
// cleaning dashboard reads "returned" (never written); this filter
// historically expected "confirmed" / "in_use" / etc and silently
// dropped every "booked" row from availability calculations,
// so the conflict detector said "all green" while two events were
// double-booked on the same equipment.
//
// Phase 0 #7 unifies the READ side by accepting both vocabularies.
// Phase 1 will pick one canonical set (confirmed -> out -> returned
// -> cleaning -> ready -> available) and migrate every writer.
const ACTIVE_BOOKING_STATUSES = [
  "booked",     // current orders.tsx + equipmentService writer vocab
  "confirmed",  // historic equipmentAvailabilityService reader vocab
  "in_use",
  "delivered",
  "out",
  "pending",
] as const;

export interface EquipmentAvailability {
  /** Total units the company owns. */
  owned: number;
  /** Reserved against active orders on/around the event date. */
  reserved: number;
  /** owned - reserved, floored at 0. */
  available: number;
  /** Per-order breakdown, useful when the UI wants to deep-link. */
  conflicts: Array<{ order_id: string; client_name: string | null; event_date: string; quantity: number }>;
}

/**
 * Compute live availability for ONE equipment row at a given event date.
 *
 * If the caller is editing an existing quote/order, pass `excludeOrderId`
 * so the calculator doesn't count this order against itself when
 * computing the conflict set.
 */
export async function getEquipmentAvailability(
  companyId: string,
  equipmentId: string,
  eventDate: string,
  opts: { windowDays?: number; excludeOrderId?: string | null } = {},
): Promise<EquipmentAvailability> {
  const windowDays = opts.windowDays ?? 1;
  const exclude = opts.excludeOrderId ?? null;

  const empty: EquipmentAvailability = { owned: 0, reserved: 0, available: 0, conflicts: [] };
  if (!companyId || !equipmentId || !eventDate) return empty;

  // Pull the equipment row for `quantity` (owned) AND
  // `cleaning_time_hours` so the overlap window can extend past
  // booked_until to cover the time the item is still being cleaned
  // and isn't actually back on the shelf. Audit Equipment G7 --
  // 100 chairs returning Sunday 11pm looked "available" for a
  // Monday 8am breakfast because nothing padded the window.
  const { data: eq, error: eqErr } = await supabase
    .from("equipment")
    .select("id, quantity, cleaning_time_hours")
    .eq("id", equipmentId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (eqErr) console.error("[equipmentAvailabilityService] equipment lookup (availability) failed:", eqErr);
  const owned = Number((eq as any)?.quantity ?? 0);
  const cleaningHours = Math.max(
    0,
    Number((eq as any)?.cleaning_time_hours ?? 0),
  );

  // Window: any booking whose [booked_from, booked_until + cleaning]
  // interval overlaps [target-windowDays, target+windowDays] is a
  // competitor. cleaning_time_hours pads the END of the window so a
  // booking that "officially" returns at 11pm but needs 4 hours of
  // cleaning isn't considered free for an event starting at 2am.
  const target = new Date(eventDate);
  if (Number.isNaN(target.getTime())) return { ...empty, owned };
  const winStart = new Date(target);
  winStart.setDate(target.getDate() - windowDays);
  const winEnd = new Date(target);
  winEnd.setDate(target.getDate() + windowDays);
  const winStartISO = winStart.toISOString().slice(0, 10);
  const winEndISO = winEnd.toISOString().slice(0, 10);

  // Postgres interval-overlap rule: A.start <= B.end AND A.end >= B.start.
  // We pull bookings whose booked_from <= winEnd AND booked_until >= winStart.
  // The cleaning-time pad is applied per-row below (after fetching),
  // because Supabase's query layer can't trivially express "where
  // (booked_until + INTERVAL N hours) >= winStart" without a stored
  // computed column. Fetching a slightly-wider window and filtering
  // in-memory is cheap at the scale we're at.
  let q = supabase
    .from("equipment_bookings")
    .select(
      "id, equipment_id, quantity, returned_quantity, status, booked_from, booked_until, order_id, orders!equipment_bookings_order_id_fkey(client_name, event_date, status)",
    )
    .eq("company_id", companyId)
    .eq("equipment_id", equipmentId)
    .lte("booked_from", winEndISO)
    .gte("booked_until", winStartISO)
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
  if (exclude) q = q.neq("order_id", exclude);

  const { data: bookings, error } = await q;
  if (error) {
    console.warn("equipmentAvailabilityService.getEquipmentAvailability bookings fetch failed", error);
    return { ...empty, owned };
  }

  const targetTs = target.getTime();
  const cleaningPadMs = cleaningHours * 60 * 60 * 1000;
  let reserved = 0;
  const conflicts: EquipmentAvailability["conflicts"] = [];
  for (const b of (bookings || []) as any[]) {
    const qty = Math.max(0, Number(b.quantity || 0) - Number(b.returned_quantity || 0));
    if (qty <= 0) continue;
    // Skip bookings whose order is cancelled / completed -- the
    // booking row may live on but it shouldn't compete for stock.
    const orderStatus = String(b.orders?.status || "").toLowerCase();
    if (orderStatus === "cancelled" || orderStatus === "completed") continue;

    // Apply the cleaning-time pad: extend the booking's effective
    // unavailable window by cleaning_time_hours past booked_until.
    // A booking whose padded window doesn't reach the target date is
    // safe to release back into available stock.
    if (cleaningPadMs > 0 && b.booked_until) {
      const paddedUntil = new Date(b.booked_until).getTime() + cleaningPadMs;
      if (paddedUntil < targetTs) {
        // Booking + cleaning already finished before the target event
        // starts. Not a conflict.
        continue;
      }
    }

    reserved += qty;
    conflicts.push({
      order_id: b.order_id,
      client_name: b.orders?.client_name || null,
      event_date: b.orders?.event_date || (b.booked_from || "").slice(0, 10),
      quantity: qty,
    });
  }

  return {
    owned,
    reserved,
    available: Math.max(0, owned - reserved),
    conflicts,
  };
}

/**
 * Pull the per-equipment hire_in_cost for a row -- the quote builder
 * uses this with the shortfall to compute the margin hit when the team
 * overcommits beyond their stock.
 */
export async function getEquipmentMeta(
  companyId: string,
  equipmentId: string,
): Promise<{ hire_in_cost: number; rental_price: number } | null> {
  if (!companyId || !equipmentId) return null;
  const { data, error } = await supabase
    .from("equipment")
    .select("hire_in_cost, rental_price")
    .eq("id", equipmentId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) console.error("[equipmentAvailabilityService/getEquipmentMeta] equipment lookup failed:", error);
  if (!data) return null;
  return {
    hire_in_cost: Number((data as any).hire_in_cost ?? 0),
    rental_price: Number((data as any).rental_price ?? 0),
  };
}

/**
 * Split a requested qty into "from stock" vs "hire-in" based on what's
 * available right now. Pure helper (no I/O) so the UI can derive
 * splits cheaply once it has the availability data.
 */
export function splitQuantity(
  requested: number,
  available: number,
): { fromStock: number; fromHire: number } {
  const r = Math.max(0, Number(requested) || 0);
  const a = Math.max(0, Number(available) || 0);
  const fromStock = Math.min(r, a);
  return { fromStock, fromHire: r - fromStock };
}

export interface EquipmentReservationRow {
  order_id: string;
  client_name: string | null;
  event_date: string;
  status: string;
  quantity: number;
  from_stock_qty: number;
  from_hire_qty: number;
  /** True when this row puts the equipment over its owned capacity --
   *  the drawer can flag it red. */
  isShortfall: boolean;
}

/**
 * List every active reservation against ONE equipment row across a
 * forward-looking window. Used by the /admin/equipment "View
 * bookings" drawer so the team can see the calendar at a glance:
 * what's committed, on which day, by which client, owned vs hire-in.
 *
 * Tenant-scoped + RLS-enforced. Active statuses only -- cancelled
 * and completed orders drop out.
 */
export async function listUpcomingReservations(
  companyId: string,
  equipmentId: string,
  opts: { fromDate?: string; days?: number } = {},
): Promise<EquipmentReservationRow[]> {
  if (!companyId || !equipmentId) return [];
  const days = opts.days ?? 90;
  const fromDate = opts.fromDate || new Date().toISOString().slice(0, 10);
  const to = new Date(fromDate);
  to.setDate(to.getDate() + days);
  const toISO = to.toISOString().slice(0, 10);

  // Read directly from `equipment_bookings` -- the older path that
  // pulled `orders.equipment_items` always failed silently because
  // that column was dropped, so the drawer was permanently empty.
  const { data, error } = await supabase
    .from("equipment_bookings")
    .select(
      "id, quantity, returned_quantity, status, booked_from, booked_until, order_id, orders!equipment_bookings_order_id_fkey(client_name, event_date, status)",
    )
    .eq("company_id", companyId)
    .eq("equipment_id", equipmentId)
    .gte("booked_from", fromDate)
    .lte("booked_from", toISO)
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[])
    .order("booked_from", { ascending: true });
  if (error) {
    console.warn("listUpcomingReservations failed", error);
    return [];
  }

  // Pull owned count once so we can flag rows that pushed past it.
  const { data: eq, error: eqErr } = await supabase
    .from("equipment")
    .select("quantity")
    .eq("id", equipmentId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (eqErr) console.error("[equipmentAvailabilityService/listUpcomingReservations] equipment lookup failed:", eqErr);
  const owned = Number((eq as any)?.quantity ?? 0);

  const out: EquipmentReservationRow[] = [];
  for (const b of (data || []) as any[]) {
    const qty = Math.max(0, Number(b.quantity || 0) - Number(b.returned_quantity || 0));
    if (qty <= 0) continue;
    const orderStatus = String(b.orders?.status || "").toLowerCase();
    if (orderStatus === "cancelled" || orderStatus === "completed") continue;
    // booked_from is the canonical date for sorting; fall back to the
    // joined order's event_date for display when present.
    const evDate = b.orders?.event_date || (b.booked_from || "").slice(0, 10);
    out.push({
      order_id: b.order_id,
      client_name: b.orders?.client_name || null,
      event_date: evDate,
      status: String(b.status || ""),
      quantity: qty,
      // equipment_bookings doesn't track stock-vs-hire split today
      // -- full qty is treated as stock-side, shortfall flag picks up
      // the over-capacity case if any.
      from_stock_qty: qty,
      from_hire_qty: 0,
      isShortfall: qty > owned,
    });
  }
  return out;
}
