// Shared order_items rebuild used by BOTH order-edit paths so they stay
// symmetric (see the "two divergent edit-cascade paths" bug class):
//   - quote edits   -> src/services/quote/propagateQuoteEdit.ts
//   - order amendments -> src/pages/api/orders/amendment-review.ts
//
// order_items is the authoritative line-item layer that totals, the
// inventory deduction, the demand view and the invoice all read from. The
// amendment path historically wrote the new menu_items JSONB onto the order
// but never rebuilt order_items, so a menu_items / guest_count amendment fed
// stale line items into totals + inventory + invoice. This helper is the one
// place that turns a menu_items snapshot (+ guest count) into order_items
// rows, matching the shape postCreationCascade Step 0 builds at creation.
//
// NOTE: order_items has no soft-delete column on every tenant's schema, so
// this hard-deletes then re-inserts (simpler + safer than a per-line diff).

export interface RebuildOrderItemsResult {
  rebuilt: boolean;
  errors: string[];
}

/**
 * Normalise a menu_items value (array | JSON string | other) to an array.
 */
function coerceMenuItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Delete + re-insert order_items for `orderId` from a menu_items snapshot.
 * Per-person lines fall back to `guestCount` when their stored quantity is 0,
 * so passing the live guest count re-scales those lines on a guest change.
 * unit_cost is re-snapshotted from menu_items.cost_per_unit (cashflow mapping).
 */
export async function rebuildOrderItemsFromMenu(
  supabase: any,
  orderId: string,
  menuItemsRaw: any,
  guestCount: number,
): Promise<RebuildOrderItemsResult> {
  const errors: string[] = [];
  const items = coerceMenuItems(menuItemsRaw);
  const guests = Number(guestCount || 0);

  const { error: delErr } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (delErr) {
    errors.push(`order_items_delete_failed: ${delErr.message}`);
    return { rebuilt: false, errors };
  }

  // Re-snapshot menu_items.cost_per_unit onto unit_cost.
  const menuItemIds = Array.from(
    new Set(
      items
        .map((it: any) => it.menu_item_id)
        .filter((x: any): x is string => typeof x === "string" && x.length > 0),
    ),
  );
  const costById = new Map<string, number>();
  if (menuItemIds.length > 0) {
    try {
      const { data: menuRows } = await supabase
        .from("menu_items")
        .select("id, cost_per_unit")
        .in("id", menuItemIds);
      for (const m of (menuRows || []) as any[]) {
        const c = Number(m?.cost_per_unit);
        if (Number.isFinite(c) && c > 0) costById.set(m.id, c);
      }
    } catch (e: any) {
      errors.push(`menu_cost_lookup_warn: ${e?.message || e}`);
    }
  }

  const rows = items
    .map((it: any) => {
      const name = it.item_name || it.name || "";
      if (!name) return null;
      const mode = String(it.pricing_mode || it.pricingMode || "per_person");
      const baseQty = Number(it.quantity || 0);
      const qty =
        mode === "per_person"
          ? baseQty > 0
            ? baseQty
            : guests
          : mode === "flat"
            ? 1
            : baseQty;
      const unit = Number(it.unit_price ?? it.unitPrice ?? it.pricePerPerson ?? 0);
      const lineTotal = Number(it.line_total ?? qty * unit);
      const menuItemId = it.menu_item_id || null;
      const unitCost =
        menuItemId && costById.has(menuItemId) ? costById.get(menuItemId)! : null;
      return {
        order_id: orderId,
        menu_item_id: menuItemId,
        item_name: name,
        description: it.category || it.dietary_tags?.join?.(", ") || null,
        quantity: qty,
        unit_price: unit,
        unit_cost: unitCost,
        line_total: lineTotal,
      };
    })
    .filter(Boolean);

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("order_items").insert(rows);
    if (insErr) {
      errors.push(`order_items_insert_failed: ${insErr.message}`);
      return { rebuilt: false, errors };
    }
  }

  return { rebuilt: true, errors };
}
