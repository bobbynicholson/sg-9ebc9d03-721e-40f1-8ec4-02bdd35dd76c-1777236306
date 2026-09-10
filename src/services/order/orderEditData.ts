/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared builder for the client-facing order editor payload, used by BOTH
 * edit surfaces so they can't drift:
 *   - magic-link:  /api/client-tokens/order-edit-data  (per-order cookie)
 *   - auth portal: /api/orders/[id]/edit-data          (Supabase session)
 *
 * Returns the tenant's active menu + equipment catalogues (so the client
 * can ADD lines) and the order's current menu/equipment lines resolved
 * with names/prices/quantities (so the editor can prefill), plus the
 * numbers the editor needs for a self-calibrating live total estimate.
 */
export interface OrderEditDataInput {
  id: string;
  company_id: string;
  guest_count?: number | null;
  delivery_fee?: number | null;
  discount_amount?: number | null;
  total_amount?: number | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  tax?: number | null;
  currency?: string | null;
}

export async function buildOrderEditData(sb: any, order: OrderEditDataInput) {
  const companyId = order.company_id;
  const orderId = order.id;

  const [{ data: menuRows }, { data: equipRows }] = await Promise.all([
    sb
      .from("menu_items")
      .select("id, item_name, base_price, category, dietary_tags")
      .eq("company_id", companyId)
      .eq("is_available", true)
      .is("deleted_at", null)
      .order("item_name", { ascending: true }),
    sb
      .from("equipment")
      .select("id, name, rental_price, category, available_quantity")
      .eq("company_id", companyId)
      .eq("is_available", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const menu_catalogue = ((menuRows || []) as any[]).map((m) => ({
    menu_item_id: m.id,
    item_name: m.item_name,
    unit_price: Number(m.base_price) || 0,
    category: m.category || null,
    dietary_tags: m.dietary_tags || null,
  }));
  const equipment_catalogue = ((equipRows || []) as any[]).map((e) => ({
    equipment_id: e.id,
    name: e.name,
    unit_price: Number(e.rental_price) || 0,
    category: e.category || null,
    available_quantity: Number(e.available_quantity) || 0,
  }));

  const { data: itemRows } = await sb
    .from("order_items")
    .select("menu_item_id, item_name, quantity, unit_price, line_total")
    .eq("order_id", orderId);
  const current_menu = ((itemRows || []) as any[]).map((it) => ({
    menu_item_id: it.menu_item_id || null,
    item_name: it.item_name,
    quantity: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    line_total: Number(it.line_total) || 0,
  }));

  const { data: bookingRows } = await sb
    .from("equipment_bookings")
    .select("equipment_id, quantity, status")
    .eq("order_id", orderId)
    .neq("status", "cancelled");
  const bookedIds = Array.from(
    new Set(((bookingRows || []) as any[]).map((b) => b.equipment_id).filter(Boolean)),
  );
  const equipNameById = new Map<string, { name: string; unit_price: number }>();
  if (bookedIds.length > 0) {
    const { data: eqRows } = await sb
      .from("equipment")
      .select("id, name, rental_price")
      .in("id", bookedIds);
    for (const e of (eqRows || []) as any[]) {
      equipNameById.set(e.id, { name: e.name, unit_price: Number(e.rental_price) || 0 });
    }
  }
  const current_equipment = ((bookingRows || []) as any[]).map((b) => {
    const meta = equipNameById.get(b.equipment_id) || { name: "Equipment", unit_price: 0 };
    return {
      equipment_id: b.equipment_id,
      name: meta.name,
      quantity: Number(b.quantity) || 0,
      unit_price: meta.unit_price,
    };
  });

  const subtotal = Number(order.subtotal) || 0;
  const taxAmount = Number(order.tax_amount ?? order.tax) || 0;
  const tax_rate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 10000 : 0.15;

  return {
    ok: true as const,
    currency: order.currency || "ZAR",
    guest_count: Number(order.guest_count) || 0,
    delivery_fee: Number(order.delivery_fee) || 0,
    discount_amount: Number(order.discount_amount) || 0,
    order_total: Number(order.total_amount) || 0,
    order_subtotal: subtotal,
    tax_rate,
    menu_catalogue,
    equipment_catalogue,
    current_menu,
    current_equipment,
  };
}
