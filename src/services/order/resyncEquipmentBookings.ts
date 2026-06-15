// Shared equipment_bookings resync used by BOTH order-edit paths so they stay
// symmetric (see the "two divergent edit-cascade paths" bug class):
//   - quote edits      -> src/services/quote/propagateQuoteEdit.ts
//   - order amendments -> src/pages/api/orders/amendment-review.ts
//
// equipment_items is editable on the amendment path, but the amendment cascade
// only re-stamped the cleaning expected-count via resyncOrderScheduleArtifacts
// and never reconciled equipment_bookings (quantities / booked vs cancelled
// rows / the availability window). So an equipment change via amendment left
// equipment_bookings + the availability calendar stale. This helper is the one
// place that reconciles bookings from an equipment_items snapshot.
//
// The supabase client is passed in because the two callers use different
// clients (the quote path's module service-role client vs the amendment
// handler's ssr client).

export interface ResyncEquipmentBookingsResult {
  ok: boolean;
  reason?: string;
}

function coerceEquipmentItems(raw: any): any[] {
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
 * Reconcile equipment_bookings for `orderId` against an equipment_items
 * snapshot: INSERT new lines, UPDATE quantity / window changes (and revive
 * cancelled rows), and cancel rows no longer wanted (soft — preserve history).
 * The booking window is event_date ± 1 day, matching creation.
 */
export async function resyncEquipmentBookings(
  supabase: any,
  orderId: string,
  companyId: string,
  equipmentItemsRaw: any,
  eventDate: string | null | undefined,
): Promise<ResyncEquipmentBookingsResult> {
  if (!eventDate) return { ok: true, reason: "no_event_date" };

  const eventTs = new Date(`${eventDate}T00:00:00`).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const bookedFrom = new Date(eventTs - oneDayMs).toISOString();
  const bookedUntil = new Date(eventTs + oneDayMs).toISOString();

  const items = coerceEquipmentItems(equipmentItemsRaw);
  const desired = new Map<string, { quantity: number }>();
  for (const it of items) {
    const equipmentId = it.id || it.equipment_id || null;
    const quantity = Number(it.quantity || 0);
    if (!equipmentId || quantity <= 0) continue;
    desired.set(equipmentId, { quantity });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("equipment_bookings")
    .select("id, equipment_id, quantity, status")
    .eq("order_id", orderId);
  if (existingErr) return { ok: false, reason: `existing_lookup_failed: ${existingErr.message}` };

  const existingMap = new Map<string, any>();
  for (const row of (existing || []) as any[]) {
    existingMap.set(row.equipment_id, row);
  }

  // INSERT new, UPDATE quantity / window changes.
  for (const [equipmentId, want] of desired.entries()) {
    const have = existingMap.get(equipmentId);
    if (!have) {
      await supabase.from("equipment_bookings").insert([{
        company_id: companyId,
        order_id: orderId,
        equipment_id: equipmentId,
        quantity: want.quantity,
        status: "booked",
        booked_from: bookedFrom,
        booked_until: bookedUntil,
      }]);
    } else if (have.quantity !== want.quantity || have.status === "cancelled") {
      await supabase
        .from("equipment_bookings")
        .update({
          quantity: want.quantity,
          status: "booked",
          booked_from: bookedFrom,
          booked_until: bookedUntil,
        })
        .eq("id", have.id);
    } else {
      // Quantity unchanged but window may have moved.
      await supabase
        .from("equipment_bookings")
        .update({ booked_from: bookedFrom, booked_until: bookedUntil })
        .eq("id", have.id);
    }
  }

  // Cancel removed bookings (soft — preserve history).
  for (const [equipmentId, row] of existingMap.entries()) {
    if (!desired.has(equipmentId) && row.status !== "cancelled") {
      await supabase
        .from("equipment_bookings")
        .update({ status: "cancelled" })
        .eq("id", row.id);
    }
  }

  return { ok: true };
}
