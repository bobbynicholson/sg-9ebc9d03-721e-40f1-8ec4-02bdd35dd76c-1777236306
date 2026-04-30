/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Equipment availability calculator.
 *
 * Source of truth: equipment.quantity (units the company owns) and
 * orders.equipment_items (jsonb arrays of bookings against that
 * stock). We compute reserved counts on-the-fly rather than
 * maintaining a separate `equipment_reservations` table -- keeps the
 * data model tight and there's no second source to drift.
 *
 * Reservation window: each event holds equipment for ~24h around the
 * event_date by default. The catering team can widen this on a per-
 * lookup basis (e.g. multi-day weddings).
 *
 * Cancelled / completed orders don't count toward reserved stock.
 * "delivered" still counts because the equipment is still off-site
 * until the team collects it.
 */
import { supabase } from "@/integrations/supabase/client";

// Cast to any so .in("status", ACTIVE_STATUSES) doesn't fight with
// the orders.status enum union type Supabase generates -- the values
// here are all real members, but TS expects a tuple of literals.
const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready", "in_transit", "delivered"] as any;

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

  // Pull the equipment row for `quantity` (owned). We don't trust a
  // stored `available_quantity` for this -- that's a free-text field
  // the admin overrides, not a live count.
  const { data: eq } = await supabase
    .from("equipment")
    .select("id, quantity")
    .eq("id", equipmentId)
    .eq("company_id", companyId)
    .maybeSingle();
  const owned = Number((eq as any)?.quantity ?? 0);

  // Window: we treat any active order whose event_date is within
  // ±windowDays of the target date as a competitor. Multi-day events
  // can override this.
  const target = new Date(eventDate);
  if (Number.isNaN(target.getTime())) return { ...empty, owned };
  const start = new Date(target);
  start.setDate(target.getDate() - windowDays);
  const end = new Date(target);
  end.setDate(target.getDate() + windowDays);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  let q = supabase
    .from("orders")
    .select("id, client_name, event_date, status, equipment_items")
    .eq("company_id", companyId)
    .gte("event_date", startISO)
    .lte("event_date", endISO)
    .in("status", ACTIVE_STATUSES);
  if (exclude) q = q.neq("id", exclude);

  const { data: orders, error } = await q;
  if (error) {
    console.warn("equipmentAvailabilityService.getEquipmentAvailability orders fetch failed", error);
    return { ...empty, owned };
  }

  let reserved = 0;
  const conflicts: EquipmentAvailability["conflicts"] = [];
  for (const o of (orders || []) as any[]) {
    const items = Array.isArray(o.equipment_items) ? o.equipment_items : [];
    let perOrderQty = 0;
    for (const it of items) {
      if (it && it.equipment_id === equipmentId) {
        perOrderQty += Number(it.quantity) || 0;
      }
    }
    if (perOrderQty > 0) {
      reserved += perOrderQty;
      conflicts.push({
        order_id: o.id,
        client_name: o.client_name,
        event_date: o.event_date,
        quantity: perOrderQty,
      });
    }
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
  const { data } = await supabase
    .from("equipment")
    .select("hire_in_cost, rental_price")
    .eq("id", equipmentId)
    .eq("company_id", companyId)
    .maybeSingle();
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

  const { data, error } = await supabase
    .from("orders")
    .select("id, client_name, event_date, status, equipment_items")
    .eq("company_id", companyId)
    .gte("event_date", fromDate)
    .lte("event_date", toISO)
    .in("status", ACTIVE_STATUSES)
    .order("event_date", { ascending: true });
  if (error) {
    console.warn("listUpcomingReservations failed", error);
    return [];
  }

  // Pull owned count once so we can flag rows that pushed past it.
  const { data: eq } = await supabase
    .from("equipment")
    .select("quantity")
    .eq("id", equipmentId)
    .eq("company_id", companyId)
    .maybeSingle();
  const owned = Number((eq as any)?.quantity ?? 0);

  const out: EquipmentReservationRow[] = [];
  for (const o of (data || []) as any[]) {
    const items = Array.isArray(o.equipment_items) ? o.equipment_items : [];
    for (const it of items) {
      if (!it || it.equipment_id !== equipmentId) continue;
      const qty = Number(it.quantity) || 0;
      if (qty <= 0) continue;
      out.push({
        order_id: o.id,
        client_name: o.client_name,
        event_date: o.event_date,
        status: o.status,
        quantity: qty,
        from_stock_qty: Number(it.from_stock_qty) || 0,
        from_hire_qty: Number(it.from_hire_qty) || 0,
        isShortfall: qty > owned,
      });
    }
  }
  return out;
}
