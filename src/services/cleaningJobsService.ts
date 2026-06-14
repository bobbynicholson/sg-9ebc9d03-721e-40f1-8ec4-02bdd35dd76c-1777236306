/**
 * Wave 41 Phase 2 - cleaning_jobs service.
 *
 * cleaning_jobs is the equipment-availability ledger. Deliberately
 * separate from labour cost (which lives in kitchen_shifts +
 * staff_shift_tasks). Bobby's rule:
 *   - if a staffer on shift handles cleaning, no extra cost --
 *     billable=FALSE on the staff_shift_tasks row.
 *   - what matters here is "when is this gear back in inventory"
 *     so the planner knows availability for the next function.
 *
 * Three methods:
 *   - dishwasher: machine_id set, no shift_task_id (machine does it)
 *   - manual: shift_task_id may be set (staffer pulled to clean)
 *   - outsourced_hire: third party, equipment unavailable until
 *     it returns. No machine_id, no shift_task_id.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CleaningMethod = "dishwasher" | "manual" | "outsourced_hire";
export type CleaningJobStatus = "queued" | "in_progress" | "complete" | "cancelled";

export interface CleaningJobRow {
  id: string;
  company_id: string;
  equipment_id: string;
  quantity: number;
  method: CleaningMethod;
  machine_id: string | null;
  shift_task_id: string | null;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: CleaningJobStatus;
  triggered_by_event_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface CleaningJobWithEquipment extends CleaningJobRow {
  equipment_name: string | null;
}

interface EquipmentLite {
  id: string;
  name: string | null;
  cleaning_time_manual_minutes: number | null;
  cleaning_time_dishwasher_minutes: number | null;
  cleaning_time_hours: number | null; // legacy fallback
  dishwasher_safe: boolean | null;
}

interface MachineLite {
  id: string;
  name: string;
  cycle_minutes: number;
  items_per_cycle: number;
  active: boolean;
}

const FALLBACK_MANUAL_MIN = 20;
const FALLBACK_DISHWASHER_PER_PIECE_MIN = 1;
const FALLBACK_OUTSOURCED_HOURS = 24;

/**
 * Resolve the duration (in minutes) we expect a cleaning job to
 * take, given method + equipment + quantity (+ machine for
 * dishwasher).
 *
 * Falls back to the legacy cleaning_time_hours column if the new
 * minute-resolution columns aren't filled in yet. Outsourced hire
 * defaults to 24h if the operator didn't override.
 */
export function estimateJobMinutes(args: {
  method: CleaningMethod;
  equipment: Pick<
    EquipmentLite,
    "cleaning_time_manual_minutes" | "cleaning_time_dishwasher_minutes" | "cleaning_time_hours"
  >;
  quantity: number;
  machine?: Pick<MachineLite, "cycle_minutes" | "items_per_cycle"> | null;
  overrideMinutes?: number | null;
}): number {
  if (args.overrideMinutes && args.overrideMinutes > 0) return args.overrideMinutes;
  const legacyMin = args.equipment.cleaning_time_hours
    ? Math.round(Number(args.equipment.cleaning_time_hours) * 60)
    : null;

  if (args.method === "dishwasher") {
    // Per-piece dishwasher minutes if set, else machine cycle/capacity.
    const perPiece = args.equipment.cleaning_time_dishwasher_minutes;
    if (perPiece != null && perPiece > 0) {
      return Math.max(perPiece * args.quantity, 1);
    }
    if (args.machine && args.machine.cycle_minutes > 0 && args.machine.items_per_cycle > 0) {
      const cycles = Math.ceil(args.quantity / args.machine.items_per_cycle);
      return cycles * args.machine.cycle_minutes;
    }
    return Math.max(args.quantity * FALLBACK_DISHWASHER_PER_PIECE_MIN, 1);
  }

  if (args.method === "manual") {
    const perPiece = args.equipment.cleaning_time_manual_minutes;
    if (perPiece != null && perPiece > 0) {
      return Math.max(perPiece * args.quantity, 1);
    }
    if (legacyMin != null) return legacyMin;
    return FALLBACK_MANUAL_MIN;
  }

  // outsourced_hire - 24h placeholder unless overridden.
  return 60 * FALLBACK_OUTSOURCED_HOURS;
}

/**
 * List active cleaning_jobs (queued + in_progress) for a company,
 * with equipment_name resolved via a separate batch query.
 *
 * Wave 42 hotfix: avoid the PostgREST embed `equipment:equipment_id(name)`
 * because it requires PostgREST's FK schema cache to be reloaded after
 * the cleaning_jobs migration - which it may not be on a freshly-
 * deployed environment, causing the embed to 400 and the call to
 * crash any consumer that doesn't catch (e.g. CleaningQueueWidget).
 * Two flat queries are bullet-proof and cost one extra round-trip.
 */
export async function listActiveJobs(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CleaningJobWithEquipment[]> {
  const { data, error } = await (supabase as any)
    .from("cleaning_jobs")
    .select(
      "id, company_id, equipment_id, quantity, method, machine_id, shift_task_id, planned_start, planned_end, actual_start, actual_end, status, triggered_by_event_id, notes, created_at",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["queued", "in_progress"])
    .order("planned_end", { ascending: true });
  if (error) {
    console.error("[cleaningJobsService.listActiveJobs] read failed:", error);
    return [];
  }
  const rows = (data || []) as any[];
  if (rows.length === 0) return [];

  // Batch-resolve equipment names. Single query, no embed.
  const equipmentIds = Array.from(new Set(rows.map((r) => r.equipment_id))).filter(Boolean);
  const nameMap = new Map<string, string>();
  if (equipmentIds.length > 0) {
    const { data: eqRows } = await (supabase as any)
      .from("equipment")
      .select("id, name")
      .in("id", equipmentIds);
    for (const e of (eqRows || []) as Array<{ id: string; name: string | null }>) {
      if (e.name) nameMap.set(e.id, e.name);
    }
  }

  return rows.map((r) => ({
    ...r,
    equipment_name: nameMap.get(r.equipment_id) ?? null,
  }));
}

/**
 * Compute a Map<equipment_id, units_currently_in_active_cleaning>.
 * Used to subtract from equipment.available_quantity so the
 * dashboard's "Available" tile reflects gear that's actually
 * available right now (not just nominally on-hand).
 */
export async function unitsInActiveCleaning(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Map<string, number>> {
  const { data, error } = await (supabase as any)
    .from("cleaning_jobs")
    .select("equipment_id, quantity")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["queued", "in_progress"]);
  if (error) {
    console.error("[cleaningJobsService.unitsInActiveCleaning] read failed:", error);
    return new Map();
  }
  const map = new Map<string, number>();
  for (const r of (data || []) as Array<{ equipment_id: string; quantity: number }>) {
    map.set(r.equipment_id, (map.get(r.equipment_id) || 0) + Number(r.quantity || 0));
  }
  return map;
}

/**
 * Create a new cleaning_job. planned_start defaults to now,
 * planned_end is now + estimated minutes. status defaults to
 * 'queued' - caller flips to 'in_progress' via startJob().
 */
export async function createJob(
  supabase: SupabaseClient,
  args: {
    companyId: string;
    equipmentId: string;
    quantity: number;
    method: CleaningMethod;
    machineId?: string | null;
    shiftTaskId?: string | null;
    triggeredByEventId?: string | null;
    notes?: string | null;
    plannedStart?: string | null;
    overrideMinutes?: number | null;
    actorUserId?: string | null;
  },
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    // Pull the equipment metadata + (optional) machine to estimate
    // the duration. Single round-trip each.
    const [{ data: equipment }, machinePromise] = await Promise.all([
      (supabase as any)
        .from("equipment")
        .select(
          "id, name, cleaning_time_manual_minutes, cleaning_time_dishwasher_minutes, cleaning_time_hours, dishwasher_safe",
        )
        .eq("id", args.equipmentId)
        .maybeSingle(),
      args.machineId
        ? (supabase as any)
            .from("cleaning_machines")
            .select("id, name, cycle_minutes, items_per_cycle, active")
            .eq("id", args.machineId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const machine = (machinePromise as any).data;
    if (!equipment) {
      return { ok: false, error: "Equipment not found" };
    }

    const estMinutes = estimateJobMinutes({
      method: args.method,
      equipment: equipment as EquipmentLite,
      quantity: args.quantity,
      machine,
      overrideMinutes: args.overrideMinutes ?? null,
    });

    const start = args.plannedStart ? new Date(args.plannedStart) : new Date();
    const end = new Date(start.getTime() + estMinutes * 60 * 1000);

    const { data, error } = await (supabase as any)
      .from("cleaning_jobs")
      .insert({
        company_id: args.companyId,
        equipment_id: args.equipmentId,
        quantity: args.quantity,
        method: args.method,
        machine_id: args.machineId ?? null,
        shift_task_id: args.shiftTaskId ?? null,
        triggered_by_event_id: args.triggeredByEventId ?? null,
        planned_start: start.toISOString(),
        planned_end: end.toISOString(),
        status: "queued",
        notes: args.notes?.trim() || null,
        created_by_user_id: args.actorUserId ?? null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const jobId = (data as any)?.id;
    // Communication: a new cleaning job means the cleaning team has work
    // waiting - ping cleaning_staff so they don't have to poll the board
    // (mirrors the kitchen prep + shopping list pings). Best-effort; a
    // notification failure must never fail job creation. Pass the same
    // client so service-role callers aren't blocked by RLS.
    try {
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.broadcastNotification({
        companyId: args.companyId,
        type: "cleaning_job_assigned",
        title: "New cleaning job",
        message: `${args.quantity}x ${(equipment as any).name} to clean (${args.method.replace("_", " ")}).`,
        targetRoles: ["cleaning_staff" as any],
        priority: "normal",
        link: "/team-portal/cleaning",
        relatedEntityType: "cleaning_job",
        relatedEntityId: jobId ?? undefined,
      }, supabase);
    } catch (notifyErr) {
      console.warn("[cleaningJobsService] new-job notification failed:", notifyErr);
    }
    return { ok: true, jobId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "createJob crashed" };
  }
}

export async function startJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase as any)
    .from("cleaning_jobs")
    .update({ status: "in_progress", actual_start: new Date().toISOString() })
    .eq("id", jobId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function completeJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ ok: boolean; error?: string }> {
  // CLN2-A (cleaning deep audit, CLN2-26, P0):
  //
  // Before this fix the function flipped status='complete' and wrote
  // actual_end, then stopped. Equipment.available_quantity was NOT
  // incremented back. The cleaning ledger and the equipment table
  // disagreed - same class of "vibes only" bug as SHP2-22 on shopping.
  //
  // The fix: read the job (need equipment_id + quantity), update the
  // status, then bump equipment.available_quantity by the job's
  // quantity. Failure on the inventory bump is logged but does NOT
  // roll back the status change - the tick is the source of truth
  // and inventory can be reconciled via the admin adjustment flow,
  // matching the SHP2-B pattern.
  //
  // Also emits cateringms:order-updated via a window event so the
  // dashboard's overview tile / admin /admin/equipment / dispatch
  // readiness all refresh in their own tabs without a manual reload.

  const sb = supabase as any;

  // 1. Pull equipment_id + quantity for the bump.
  const { data: jobRow, error: readErr } = await sb
    .from("cleaning_jobs")
    .select("equipment_id, quantity")
    .eq("id", jobId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  // 2. Mark complete.
  const { error: completeErr } = await sb
    .from("cleaning_jobs")
    .update({ status: "complete", actual_end: new Date().toISOString() })
    .eq("id", jobId);
  if (completeErr) return { ok: false, error: completeErr.message };

  // 3. Bump inventory back. Non-blocking on the user-visible tick.
  if (jobRow?.equipment_id && Number.isFinite(Number(jobRow.quantity))) {
    const qty = Number(jobRow.quantity);
    try {
      const { data: invRow, error: invReadErr } = await sb
        .from("equipment")
        .select("available_quantity")
        .eq("id", jobRow.equipment_id)
        .maybeSingle();
      if (invReadErr || !invRow) {
        // eslint-disable-next-line no-console
        console.warn("[cleaningJobsService.completeJob] inventory read failed:", invReadErr);
      } else {
        const newAvail = Number(invRow.available_quantity || 0) + qty;
        const { error: bumpErr } = await sb
          .from("equipment")
          .update({ available_quantity: newAvail, updated_at: new Date().toISOString() })
          .eq("id", jobRow.equipment_id);
        if (bumpErr) {
          // eslint-disable-next-line no-console
          console.warn("[cleaningJobsService.completeJob] inventory bump failed:", bumpErr);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[cleaningJobsService.completeJob] inventory bump threw:", e);
    }
  }

  // 4. Cross-tab signal. Listeners on admin /admin/equipment,
  // /admin/order-assignments, and the kitchen dashboard refetch.
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("cateringms:cleaning-job-completed", {
        detail: { jobId, equipmentId: jobRow?.equipment_id ?? null, quantity: jobRow?.quantity ?? null },
      }));
    } catch { /* old browsers without CustomEvent polyfill */ }
  }

  return { ok: true };
}

export async function cancelJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase as any)
    .from("cleaning_jobs")
    .update({ status: "cancelled" })
    .eq("id", jobId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
