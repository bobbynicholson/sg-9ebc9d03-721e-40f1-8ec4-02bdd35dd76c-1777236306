/**
 * cleaningHandoverService - Wave 70.24
 *
 * Event-level container for cleaning_jobs. One row per delivered
 * order's cleaning lifecycle. Created when the order moves to
 * 'confirmed' (status='expected'), flipped to 'in_progress' on
 * delivery, 'complete' when all linked cleaning_jobs are done.
 *
 * Purpose: lets the cleaning portal group jobs by event ("everything
 * from Smith wedding") instead of the legacy flat by-item list, and
 * gives ANTICIPATION ("Brown lunch returns at 14:00, expect 80
 * items") so the cleaning team isn't always reactive.
 *
 * Five public methods + a status-flip helper:
 *   - createExpectedHandover  - on 'confirmed' transition
 *   - markHandoverReturned    - on 'delivered' transition
 *   - cancelHandoverForOrder  - on 'cancelled' transition
 *   - recomputeExpectedCount  - on amendment-review (item count change)
 *   - listHandoversForCompany - powers the new cleaning queue UI
 *   - getHandoverDetail       - per-event detail with all jobs
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export type HandoverStatus = "expected" | "in_progress" | "complete" | "cancelled";

export interface CleaningEventHandover {
  id: string;
  company_id: string;
  order_id: string;
  status: HandoverStatus;
  expected_at: string | null;
  in_progress_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  inspected_by_user_id: string | null;
  total_items_expected: number;
  total_items_returned: number;
  total_items_damaged: number;
  total_items_missing: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface HandoverWithOrderMeta extends CleaningEventHandover {
  order_number: string | null;
  event_name: string | null;
  client_name: string | null;
  event_date: string | null;
  event_time: string | null;
  venue_address: string | null;
}

/**
 * Sum the equipment_bookings.quantity for cleanable items on an
 * order. Filters out:
 *   - equipment with requires_cleaning=false (disposables, tables, etc)
 *   - hire-in equipment where supplier_cleans=true (returns to supplier)
 *
 * Returns null if the order has no equipment_bookings at all.
 */
async function sumCleanableItemsForOrder(
  sb: SupabaseClient,
  orderId: string,
): Promise<number> {
  const { data, error } = await (sb as any)
    .from("equipment_bookings")
    .select(`
      quantity,
      equipment:equipment_id (
        requires_cleaning,
        is_hire_in,
        supplier_cleans
      )
    `)
    .eq("order_id", orderId);
  if (error) {
    console.error("[cleaningHandoverService.sumCleanableItemsForOrder] read failed:", error);
    return 0;
  }
  let total = 0;
  for (const row of (data || []) as any[]) {
    const eq = row.equipment;
    if (!eq?.requires_cleaning) continue;
    if (eq.is_hire_in && eq.supplier_cleans) continue;
    total += Number(row.quantity || 0);
  }
  return total;
}

/**
 * Create the 'expected' handover row for an order. Called when the
 * order transitions to 'confirmed'. Idempotent - UNIQUE
 * (company_id, order_id) constraint means a re-run no-ops.
 *
 * expected_at = event_date + event_time + 4h cleaning lead window
 * so the cleaning portal can sort by "when do we expect this back".
 */
export async function createExpectedHandover(
  sb: SupabaseClient,
  args: {
    companyId: string;
    orderId: string;
    eventDate: string | null;
    eventTime: string | null;
  },
): Promise<{ ok: boolean; handoverId?: string; error?: string }> {
  try {
    const itemCount = await sumCleanableItemsForOrder(sb, args.orderId);

    // Expected return time: end of event + 4h cleaning lead.
    // Catering trucks usually come back the same evening or
    // following morning; 4h is a sensible "by when at the latest"
    // default. Cleaners can refine via the UI later.
    let expectedAtIso: string | null = null;
    if (args.eventDate) {
      const t = args.eventTime ? args.eventTime.slice(0, 8) : "12:00:00";
      const dt = new Date(`${args.eventDate}T${t}`);
      if (!isNaN(dt.getTime())) {
        expectedAtIso = new Date(dt.getTime() + 4 * 60 * 60 * 1000).toISOString();
      }
    }

    const { data, error } = await (sb as any)
      .from("cleaning_event_handovers")
      .upsert(
        {
          company_id: args.companyId,
          order_id: args.orderId,
          status: "expected",
          expected_at: expectedAtIso,
          total_items_expected: itemCount,
        },
        { onConflict: "company_id,order_id", ignoreDuplicates: false },
      )
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, handoverId: (data as any)?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || "createExpectedHandover crashed" };
  }
}

/**
 * Flip the handover from 'expected' to 'in_progress'. Called when
 * the order transitions to 'delivered'. Looks up the existing
 * handover; creates one if missing (defence for orders that
 * skipped 'confirmed' transition for any reason).
 */
export async function markHandoverReturned(
  sb: SupabaseClient,
  args: {
    companyId: string;
    orderId: string;
    eventDate: string | null;
    eventTime: string | null;
  },
): Promise<{ ok: boolean; handoverId?: string; error?: string }> {
  try {
    // Ensure the row exists. Idempotent upsert returns the row.
    const ensured = await createExpectedHandover(sb, args);
    if (!ensured.ok || !ensured.handoverId) {
      return { ok: false, error: ensured.error || "Could not ensure handover row" };
    }

    // Recompute item count in case bookings changed between
    // 'confirmed' and 'delivered' (amendments).
    const itemCount = await sumCleanableItemsForOrder(sb, args.orderId);

    const { error } = await (sb as any)
      .from("cleaning_event_handovers")
      .update({
        status: "in_progress",
        in_progress_at: new Date().toISOString(),
        total_items_expected: itemCount,
      })
      .eq("id", ensured.handoverId)
      .neq("status", "cancelled"); // don't resurrect a cancelled handover
    if (error) return { ok: false, error: error.message };
    return { ok: true, handoverId: ensured.handoverId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "markHandoverReturned crashed" };
  }
}

/**
 * Cancel the handover for an order. Called when the order is
 * cancelled. No-op if no handover exists for the order.
 */
export async function cancelHandoverForOrder(
  sb: SupabaseClient,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await (sb as any)
      .from("cleaning_event_handovers")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .in("status", ["expected", "in_progress"]); // don't touch complete
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "cancelHandoverForOrder crashed" };
  }
}

/**
 * Recompute total_items_expected for an order's handover. Called
 * after amendment-review changes equipment_bookings so the cleaning
 * team sees the updated count without manual intervention.
 */
export async function recomputeExpectedCount(
  sb: SupabaseClient,
  orderId: string,
): Promise<{ ok: boolean; itemCount?: number; error?: string }> {
  try {
    const itemCount = await sumCleanableItemsForOrder(sb, orderId);
    const { error } = await (sb as any)
      .from("cleaning_event_handovers")
      .update({ total_items_expected: itemCount })
      .eq("order_id", orderId)
      .in("status", ["expected", "in_progress"]);
    if (error) return { ok: false, error: error.message };
    return { ok: true, itemCount };
  } catch (e: any) {
    return { ok: false, error: e?.message || "recomputeExpectedCount crashed" };
  }
}

/**
 * List handovers for a company, joined with order metadata so the
 * cleaning portal can render event-grouped cards without per-row
 * extra queries. Filters by status when supplied.
 *
 * Sorted: expected_at ascending for 'expected' (next-due first),
 * in_progress_at descending for 'in_progress' (most recent first).
 */
export async function listHandoversForCompany(
  sb: SupabaseClient,
  companyId: string,
  opts?: { status?: HandoverStatus[]; horizonHours?: number },
): Promise<HandoverWithOrderMeta[]> {
  try {
    const statuses = opts?.status || ["expected", "in_progress", "complete"];
    let query = (sb as any)
      .from("cleaning_event_handovers")
      .select(`
        id, company_id, order_id, status,
        expected_at, in_progress_at, completed_at, cancelled_at,
        inspected_by_user_id,
        total_items_expected, total_items_returned, total_items_damaged, total_items_missing,
        notes, created_at, updated_at, deleted_at,
        order:order_id (
          order_number, event_name, client_name, event_date, event_time, venue_address
        )
      `)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("status", statuses);

    // Optional horizon: "only show expected within N hours" so the
    // cleaning portal doesn't get flooded with wedding-in-4-weeks
    // rows. Caller passes 24-48h for the "today / tomorrow" view.
    if (opts?.horizonHours && statuses.includes("expected")) {
      const cutoff = new Date(Date.now() + opts.horizonHours * 60 * 60 * 1000).toISOString();
      query = query.lte("expected_at", cutoff);
    }

    const { data, error } = await query
      .order("expected_at", { ascending: true, nullsFirst: false });
    if (error) {
      console.error("[cleaningHandoverService.listHandoversForCompany] read failed:", error);
      return [];
    }
    return ((data || []) as any[]).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      order_id: r.order_id,
      status: r.status,
      expected_at: r.expected_at,
      in_progress_at: r.in_progress_at,
      completed_at: r.completed_at,
      cancelled_at: r.cancelled_at,
      inspected_by_user_id: r.inspected_by_user_id,
      total_items_expected: r.total_items_expected,
      total_items_returned: r.total_items_returned,
      total_items_damaged: r.total_items_damaged,
      total_items_missing: r.total_items_missing,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
      order_number: r.order?.order_number ?? null,
      event_name: r.order?.event_name ?? null,
      client_name: r.order?.client_name ?? null,
      event_date: r.order?.event_date ?? null,
      event_time: r.order?.event_time ?? null,
      venue_address: r.order?.venue_address ?? null,
    }));
  } catch (e: any) {
    console.error("[cleaningHandoverService.listHandoversForCompany] crashed:", e);
    return [];
  }
}

/**
 * Get a single handover with its linked cleaning_jobs. Powers the
 * per-event detail view in the cleaning portal.
 */
export async function getHandoverDetail(
  sb: SupabaseClient,
  handoverId: string,
): Promise<{ handover: HandoverWithOrderMeta | null; jobs: any[] }> {
  try {
    const { data: hRow, error: hErr } = await (sb as any)
      .from("cleaning_event_handovers")
      .select(`
        id, company_id, order_id, status,
        expected_at, in_progress_at, completed_at, cancelled_at,
        inspected_by_user_id,
        total_items_expected, total_items_returned, total_items_damaged, total_items_missing,
        notes, created_at, updated_at, deleted_at,
        order:order_id (
          order_number, event_name, client_name, event_date, event_time, venue_address
        )
      `)
      .eq("id", handoverId)
      .maybeSingle();
    if (hErr || !hRow) {
      return { handover: null, jobs: [] };
    }

    const { data: jobRows } = await (sb as any)
      .from("cleaning_jobs")
      .select(`
        id, equipment_id, quantity, method, status,
        planned_start, planned_end, actual_start, actual_end,
        notes
      `)
      .eq("event_handover_id", handoverId)
      .is("deleted_at", null);

    // Batch-resolve equipment names.
    const equipmentIds = Array.from(new Set(((jobRows || []) as any[]).map((j) => j.equipment_id))).filter(Boolean);
    const nameMap = new Map<string, string>();
    if (equipmentIds.length > 0) {
      const { data: eqRows } = await (sb as any)
        .from("equipment")
        .select("id, name")
        .in("id", equipmentIds);
      for (const e of (eqRows || []) as Array<{ id: string; name: string | null }>) {
        if (e.name) nameMap.set(e.id, e.name);
      }
    }

    const handover: HandoverWithOrderMeta = {
      id: hRow.id,
      company_id: hRow.company_id,
      order_id: hRow.order_id,
      status: hRow.status,
      expected_at: hRow.expected_at,
      in_progress_at: hRow.in_progress_at,
      completed_at: hRow.completed_at,
      cancelled_at: hRow.cancelled_at,
      inspected_by_user_id: hRow.inspected_by_user_id,
      total_items_expected: hRow.total_items_expected,
      total_items_returned: hRow.total_items_returned,
      total_items_damaged: hRow.total_items_damaged,
      total_items_missing: hRow.total_items_missing,
      notes: hRow.notes,
      created_at: hRow.created_at,
      updated_at: hRow.updated_at,
      deleted_at: hRow.deleted_at,
      order_number: hRow.order?.order_number ?? null,
      event_name: hRow.order?.event_name ?? null,
      client_name: hRow.order?.client_name ?? null,
      event_date: hRow.order?.event_date ?? null,
      event_time: hRow.order?.event_time ?? null,
      venue_address: hRow.order?.venue_address ?? null,
    };

    return {
      handover,
      jobs: ((jobRows || []) as any[]).map((j) => ({
        ...j,
        equipment_name: nameMap.get(j.equipment_id) ?? null,
      })),
    };
  } catch (e: any) {
    console.error("[cleaningHandoverService.getHandoverDetail] crashed:", e);
    return { handover: null, jobs: [] };
  }
}

/**
 * Mark a handover complete. Called from the cleaning portal UI
 * when all linked cleaning_jobs are done (or admin clicks "all
 * done" override).
 */
export async function completeHandover(
  sb: SupabaseClient,
  handoverId: string,
  args?: { totalReturned?: number; totalDamaged?: number; totalMissing?: number; notes?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const patch: any = {
      status: "complete",
      completed_at: new Date().toISOString(),
    };
    if (args?.totalReturned != null) patch.total_items_returned = args.totalReturned;
    if (args?.totalDamaged != null) patch.total_items_damaged = args.totalDamaged;
    if (args?.totalMissing != null) patch.total_items_missing = args.totalMissing;
    if (args?.notes != null) patch.notes = args.notes;

    const { error } = await (sb as any)
      .from("cleaning_event_handovers")
      .update(patch)
      .eq("id", handoverId)
      .neq("status", "cancelled");
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "completeHandover crashed" };
  }
}
