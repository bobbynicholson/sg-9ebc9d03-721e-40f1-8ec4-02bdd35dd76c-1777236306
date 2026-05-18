/**
 * bookingFacts - Wave 70.42
 *
 * Server-side helper that loads a booking + its related artifacts
 * and returns ONLY the fields the calling role is allowed to see.
 *
 * Why this exists (per Bobby's brief): "obviously taking financials
 * info out of the staff-facing portal info. only admin and client
 * should see costs in their versions". Hiding $ in the UI alone is
 * not enough - a curl + DevTools Network tab would still leak the
 * value. This helper enforces the rule at the data layer so staff
 * payloads never carry money fields in the first place.
 *
 * Roles + visibility matrix:
 *
 *   admin / company_admin / super_admin / owner
 *     - conductor view: every field, every related artifact
 *        (kitchen prep state, driver assignment, staff on duty,
 *         cleaning handover, shopping ingredient demand)
 *
 *   client (magic-link order view)
 *     - their booking from their perspective: order items + totals
 *        (it IS their money), no internal driver/staff/prep detail
 *
 *   kitchen_staff
 *     - menu items + prep tasks + recipe data + event date/time +
 *        client name (operational context). NO money fields.
 *
 *   driver_staff
 *     - venue + contact at venue + event date/time + delivery
 *        windows + special access notes. NO money fields. NO menu.
 *
 *   cleaning_staff
 *     - equipment list + return status + damage history. NO money,
 *        NO menu, NO driver detail.
 *
 *   shopping_staff
 *     - ingredient demand (from recipes) + low-stock flags.
 *        Ingredient unit cost may surface for procurement decisions
 *        but order totals do NOT.
 *
 * The function returns a discriminated union so the caller's
 * TypeScript narrows on the role.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServiceSupabase } from "@/lib/supabase/service";

export type BookingFactsRole =
  | "admin"
  | "client"
  | "kitchen"
  | "driver"
  | "cleaning"
  | "shopping";

// Fields stripped from every non-admin / non-client payload.
const MONEY_FIELDS_ORDER = [
  "total_amount",
  "subtotal",
  "tax_amount",
  "deposit_amount",
  "deposit_paid_amount",
  "balance_due",
  "discount_amount",
  "delivery_fee",
];

const MONEY_FIELDS_ORDER_ITEM = [
  "unit_price",
  "line_total",
];

function omitMoneyFromOrder<T extends Record<string, any>>(order: T): T {
  const cleaned: Record<string, any> = {};
  for (const k of Object.keys(order)) {
    if (MONEY_FIELDS_ORDER.includes(k)) continue;
    cleaned[k] = order[k];
  }
  return cleaned as T;
}

function omitMoneyFromItems<T extends Record<string, any>>(items: T[]): T[] {
  return items.map((it) => {
    const cleaned: Record<string, any> = {};
    for (const k of Object.keys(it)) {
      if (MONEY_FIELDS_ORDER_ITEM.includes(k)) continue;
      cleaned[k] = it[k];
    }
    return cleaned as T;
  });
}

export interface BookingFactsBase {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  client_name: string | null;
  venue_address: string | null;
  status: string | null;
}

export interface BookingFactsAdmin extends BookingFactsBase {
  role: "admin";
  // Money + everything else admin sees.
  total_amount: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  balance_due: number | null;
  // Cross-role aggregated panels - the conductor view. Each
  // panel is a flat summary the admin can scan; deep links go to
  // the dedicated dashboard for that role.
  kitchen: { prepTaskCount: number; prepDone: number; prepPending: number; staffOnShiftCount: number };
  dispatch: { driverAssigned: boolean; driverName: string | null; pickupTime: string | null };
  cleaning: { handoverExpectedAt: string | null; itemsToReturn: number };
  shopping: { ingredientsShort: number };
}

export interface BookingFactsClient extends BookingFactsBase {
  role: "client";
  total_amount: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  balance_due: number | null;
  items: Array<{ item_name: string | null; quantity: number; unit: string | null; line_total: number | null }>;
}

export interface BookingFactsKitchen extends BookingFactsBase {
  role: "kitchen";
  // No money fields.
  pickup_time: string | null;
  setup_time: string | null;
  items: Array<{ item_name: string | null; quantity: number; description: string | null; special_instructions: string | null }>;
}

export interface BookingFactsDriver extends BookingFactsBase {
  role: "driver";
  pickup_time: string | null;
  setup_time: string | null;
  client_phone: string | null;
  special_instructions: string | null;
}

export interface BookingFactsCleaning extends BookingFactsBase {
  role: "cleaning";
  handover: { id: string | null; status: string | null; expected_at: string | null; items_expected: number };
}

export interface BookingFactsShopping extends BookingFactsBase {
  role: "shopping";
  items: Array<{ item_name: string | null; quantity: number }>;
}

export type BookingFacts =
  | BookingFactsAdmin
  | BookingFactsClient
  | BookingFactsKitchen
  | BookingFactsDriver
  | BookingFactsCleaning
  | BookingFactsShopping;

/**
 * Load a booking + role-scoped fields. Uses service-role client so
 * RLS doesn't block the cross-table joins - the role gate is
 * enforced by the caller / by what fields we return, not by RLS
 * on the read.
 */
export async function loadBookingForRole(
  orderId: string,
  role: BookingFactsRole,
): Promise<BookingFacts | null> {
  const admin: any = getServiceSupabase();

  // Base order row - everything the header needs. We always SELECT
  // the money fields server-side because we then omit them
  // role-by-role below. Cheap, single round-trip.
  const { data: order } = await admin
    .from("orders")
    .select(`
      id, order_number, event_name, event_date, event_time, guest_count,
      client_name, client_phone, venue_address, status,
      pickup_time, setup_time, special_instructions,
      total_amount, subtotal, tax_amount, balance_due
    `)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const base: BookingFactsBase = {
    id: order.id,
    order_number: order.order_number,
    event_name: order.event_name,
    event_date: order.event_date,
    event_time: order.event_time,
    guest_count: order.guest_count,
    client_name: order.client_name,
    venue_address: order.venue_address,
    status: order.status,
  };

  if (role === "admin") {
    // Conductor view: fan out to all cross-role aggregates in
    // parallel. Each query is cheap (head:exact counts or single-row
    // max queries). Falls back to safe defaults when a sub-query
    // errors so the admin panel still renders the rest.
    const [prepRes, shiftRes, handoverRes, ingredientShortRes, driverRes] = await Promise.all([
      admin.from("kitchen_prep_tasks")
        .select("status", { count: "exact" })
        .eq("order_id", orderId),
      admin.from("kitchen_shifts")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId),
      admin.from("cleaning_event_handovers")
        .select("expected_at, total_items_expected")
        .eq("order_id", orderId)
        .maybeSingle(),
      admin.from("order_ingredient_demand")
        .select("inventory_item_id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .gt("shortfall", 0),
      admin.from("profiles")
        .select("full_name")
        .eq("id", (order as any).assigned_driver_id || "00000000-0000-0000-0000-000000000000")
        .maybeSingle(),
    ]);

    const prepRows = (prepRes?.data as Array<{ status: string }> | null) || [];
    const prepDone = prepRows.filter((r) => r.status === "done").length;
    const prepPending = prepRows.filter((r) => r.status === "pending" || r.status === "in_progress").length;

    return {
      ...base,
      role: "admin",
      total_amount: order.total_amount,
      subtotal: order.subtotal,
      tax_amount: order.tax_amount,
      balance_due: order.balance_due,
      kitchen: {
        prepTaskCount: prepRows.length,
        prepDone,
        prepPending,
        staffOnShiftCount: shiftRes?.count || 0,
      },
      dispatch: {
        driverAssigned: !!(order as any).assigned_driver_id,
        driverName: (driverRes?.data as any)?.full_name || null,
        pickupTime: order.pickup_time,
      },
      cleaning: {
        handoverExpectedAt: (handoverRes?.data as any)?.expected_at || null,
        itemsToReturn: (handoverRes?.data as any)?.total_items_expected || 0,
      },
      shopping: {
        ingredientsShort: ingredientShortRes?.count || 0,
      },
    };
  }

  if (role === "client") {
    const { data: items } = await admin
      .from("order_items")
      .select("item_name, quantity, unit_price, line_total")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    return {
      ...base,
      role: "client",
      total_amount: order.total_amount,
      subtotal: order.subtotal,
      tax_amount: order.tax_amount,
      balance_due: order.balance_due,
      items: (items || []).map((it: any) => ({
        item_name: it.item_name,
        quantity: Number(it.quantity || 0),
        unit: null, // order_items doesn't carry a unit column
        line_total: it.line_total,
      })),
    };
  }

  if (role === "kitchen") {
    const { data: items } = await admin
      .from("order_items")
      .select("item_name, quantity, description, special_instructions")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    return {
      ...omitMoneyFromOrder(base),
      role: "kitchen",
      pickup_time: order.pickup_time,
      setup_time: order.setup_time,
      items: omitMoneyFromItems(items || []).map((it: any) => ({
        item_name: it.item_name,
        quantity: Number(it.quantity || 0),
        description: it.description,
        special_instructions: it.special_instructions,
      })),
    };
  }

  if (role === "driver") {
    return {
      ...omitMoneyFromOrder(base),
      role: "driver",
      pickup_time: order.pickup_time,
      setup_time: order.setup_time,
      client_phone: order.client_phone,
      special_instructions: order.special_instructions,
    };
  }

  if (role === "cleaning") {
    const { data: handover } = await admin
      .from("cleaning_event_handovers")
      .select("id, status, expected_at, total_items_expected")
      .eq("order_id", orderId)
      .maybeSingle();
    return {
      ...omitMoneyFromOrder(base),
      role: "cleaning",
      handover: {
        id: (handover as any)?.id || null,
        status: (handover as any)?.status || null,
        expected_at: (handover as any)?.expected_at || null,
        items_expected: (handover as any)?.total_items_expected || 0,
      },
    };
  }

  // shopping
  const { data: items } = await admin
    .from("order_items")
    .select("item_name, quantity")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return {
    ...omitMoneyFromOrder(base),
    role: "shopping",
    items: omitMoneyFromItems(items || []).map((it: any) => ({
      item_name: it.item_name,
      quantity: Number(it.quantity || 0),
    })),
  };
}
