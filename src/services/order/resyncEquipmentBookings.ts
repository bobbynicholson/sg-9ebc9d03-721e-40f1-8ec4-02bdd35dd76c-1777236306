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
 * cancelled rows), and cancel rows no longer wanted (soft - preserve history).
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
  const sittingSequences = new Set<number>();
  const { data: sittingRows, error: sittingErr } = await supabase
    .from("service_sittings")
    .select("sequence_number")
    .eq("order_id", orderId)
    .eq("company_id", companyId);
  if (sittingErr) return { ok: false, reason: `sittings_lookup_failed: ${sittingErr.message}` };
  for (const sitting of (sittingRows || []) as any[]) sittingSequences.add(Number(sitting.sequence_number));

  const keyFor = (equipmentId: string, sequence: number | null) => `${equipmentId}::${sequence ?? "shared"}`;
  const desired = new Map<string, { equipmentId: string; sequence: number | null; quantity: number; unitPrice: number }>();
  for (const it of items) {
    const equipmentId = it.id || it.equipment_id || null;
    const quantity = Number(it.quantity || 0);
    if (!equipmentId || quantity <= 0) continue;
    const rawSequence = it.service_sitting_sequence ?? it.serviceSittingSequence ?? null;
    const sequence = rawSequence == null || rawSequence === "" ? null : Number(rawSequence);
    if (sequence != null && (!Number.isInteger(sequence) || !sittingSequences.has(sequence))) {
      return { ok: false, reason: `invalid_equipment_sitting: Sitting ${String(rawSequence)} is not part of this booking.` };
    }
    const unitPrice = Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0);
    const key = keyFor(equipmentId, sequence);
    const previous = desired.get(key);
    if (!previous) desired.set(key, { equipmentId, sequence, quantity, unitPrice });
    else {
      const combinedQuantity = previous.quantity + quantity;
      previous.unitPrice = combinedQuantity > 0
        ? (previous.unitPrice * previous.quantity + unitPrice * quantity) / combinedQuantity
        : unitPrice;
      previous.quantity = combinedQuantity;
    }
  }

  const { data: existing, error: existingErr } = await supabase
    .from("equipment_bookings")
    .select("id, equipment_id, quantity, status, service_sitting_sequence")
    .eq("order_id", orderId);
  if (existingErr) return { ok: false, reason: `existing_lookup_failed: ${existingErr.message}` };

  const existingMap = new Map<string, any>();
  for (const row of (existing || []) as any[]) {
    existingMap.set(keyFor(row.equipment_id, row.service_sitting_sequence == null ? null : Number(row.service_sitting_sequence)), row);
  }

  // INSERT new, UPDATE quantity / window changes.
  for (const [key, want] of desired.entries()) {
    const have = existingMap.get(key);
    if (!have) {
      const { error: insertError } = await supabase.from("equipment_bookings").insert([{
        company_id: companyId,
        order_id: orderId,
        equipment_id: want.equipmentId,
        quantity: want.quantity,
        unit_price: want.unitPrice,
        service_sitting_sequence: want.sequence,
        status: "booked",
        booked_from: bookedFrom,
        booked_until: bookedUntil,
      }]);
      if (insertError) return { ok: false, reason: `equipment_insert_failed: ${insertError.message}` };
    } else if (have.quantity !== want.quantity || have.status === "cancelled" || Number(have.unit_price || 0) !== want.unitPrice) {
      const { error: updateError } = await supabase
        .from("equipment_bookings")
        .update({
          quantity: want.quantity,
          unit_price: want.unitPrice,
          service_sitting_sequence: want.sequence,
          status: "booked",
          booked_from: bookedFrom,
          booked_until: bookedUntil,
        })
        .eq("id", have.id);
      if (updateError) return { ok: false, reason: `equipment_update_failed: ${updateError.message}` };
    } else {
      // Quantity unchanged but window may have moved.
      const { error: updateError } = await supabase
        .from("equipment_bookings")
        .update({ booked_from: bookedFrom, booked_until: bookedUntil, unit_price: want.unitPrice })
        .eq("id", have.id);
      if (updateError) return { ok: false, reason: `equipment_update_failed: ${updateError.message}` };
    }
  }

  // Cancel removed bookings (soft - preserve history).
  for (const [key, row] of existingMap.entries()) {
    if (!desired.has(key) && row.status !== "cancelled") {
      const { error: cancelError } = await supabase
        .from("equipment_bookings")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      if (cancelError) return { ok: false, reason: `equipment_cancel_failed: ${cancelError.message}` };
    }
  }

  return { ok: true };
}
