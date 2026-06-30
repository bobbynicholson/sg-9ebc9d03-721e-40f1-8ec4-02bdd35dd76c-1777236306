/**
 * Wave 41 Phase 3 - staff_shift_tasks service.
 *
 * staff_shift_tasks lets one parent shift contain multiple typed
 * task rows (kitchen/cleaning/delivery/shopping/waitering/setup/
 * breakdown/admin). billable=FALSE means the labour falls under
 * the parent shift's pay envelope - no extra cost.
 *
 * The schedule grid renders these as inline chips per shift cell
 * so an operator can see at a glance "this shift = kitchen + a
 * 20-min cleaning task + a delivery run".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskType =
  | "kitchen"
  | "cleaning"
  | "delivery"
  | "shopping"
  | "waitering"
  | "setup"
  | "breakdown"
  | "admin";

export interface ShiftTaskRow {
  id: string;
  company_id: string;
  shift_id: string;
  task_type: TaskType;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  planned_minutes: number | null;
  billable: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Pull every active task for a list of shift_ids in one query.
 * Returns a Map keyed by shift_id for O(1) lookup in the grid
 * render loop.
 */
export async function listTasksForShifts(
  supabase: SupabaseClient,
  shiftIds: string[],
): Promise<Map<string, ShiftTaskRow[]>> {
  const map = new Map<string, ShiftTaskRow[]>();
  if (shiftIds.length === 0) return map;
  const { data, error } = await (supabase as any)
    .from("staff_shift_tasks")
    .select(
      "id, company_id, shift_id, task_type, planned_start, planned_end, actual_start, actual_end, planned_minutes, billable, related_entity_type, related_entity_id, notes, created_at",
    )
    .in("shift_id", shiftIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[staffShiftTasksService.listTasksForShifts] read failed:", error);
    return map;
  }
  for (const r of (data || []) as ShiftTaskRow[]) {
    const arr = map.get(r.shift_id) || [];
    arr.push(r);
    map.set(r.shift_id, arr);
  }
  return map;
}

export async function createTask(
  supabase: SupabaseClient,
  args: {
    companyId: string;
    shiftId: string;
    taskType: TaskType;
    plannedMinutes?: number | null;
    billable?: boolean;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    notes?: string | null;
    actorUserId?: string | null;
    /** Profile id of the staffer who owns the parent shift. The shift
     *  tables are polymorphic (kitchen_shifts.staff_id /
     *  driver_shifts.driver_id), so the caller - which holds the shift
     *  row - resolves this and passes it in for the assignment ping. */
    assignedUserId?: string | null;
  },
): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  try {
    const { data, error } = await (supabase as any)
      .from("staff_shift_tasks")
      .insert({
        company_id: args.companyId,
        shift_id: args.shiftId,
        task_type: args.taskType,
        planned_minutes: args.plannedMinutes ?? null,
        billable: args.billable ?? true,
        related_entity_type: args.relatedEntityType ?? null,
        related_entity_id: args.relatedEntityId ?? null,
        notes: args.notes?.trim() || null,
        created_by_user_id: args.actorUserId ?? null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const taskId = (data as any)?.id;
    // Communication: tell the staffer a task was added to their shift so
    // they aren't blindsided on the day. Best-effort - a notify failure
    // must never fail task creation. Skip self-assignment (an operator
    // adding a task to their own shift doesn't need a ping).
    if (args.assignedUserId && args.assignedUserId !== args.actorUserId) {
      try {
        const { notificationService } = await import("@/services/notificationService");
        await notificationService.createNotification({
          company_id: args.companyId,
          recipient_id: args.assignedUserId,
          type: "shift_task_assigned",
          title: "New task on your shift",
          message: `A ${args.taskType} task was added to your shift${args.plannedMinutes ? ` (${args.plannedMinutes} min)` : ""}.`,
          priority: "normal",
          related_entity_type: "staff_shift_task",
          related_entity_id: taskId ?? undefined,
          dedup: true,
        }, supabase);
      } catch (notifyErr) {
        console.warn("[staffShiftTasksService.createTask] assignment notify failed:", notifyErr);
      }
    }
    return { ok: true, taskId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "createTask crashed" };
  }
}

/**
 * Mark a shift task done. The table has no status enum - completion is
 * `actual_end IS NOT NULL` (same convention as kitchen_shifts /
 * driver_shifts), so we stamp actual_end now and backfill actual_start if
 * the task was never explicitly started.
 *
 * Communication (notification-audit gap #11): when a staffer ticks off a
 * task that an operator added to their shift, ping that operator so they
 * know the work is done without having to chase. Mirrors createTask's
 * assignment ping in reverse - best-effort, dedup'd, skips self (an
 * operator closing out their own task doesn't need to notify themselves).
 */
export async function completeTask(
  supabase: SupabaseClient,
  taskId: string,
  actorUserId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: row } = await (supabase as any)
      .from("staff_shift_tasks")
      .select("company_id, created_by_user_id, task_type, actual_start")
      .eq("id", taskId)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("staff_shift_tasks")
      .update({
        actual_end: nowIso,
        actual_start: (row as any)?.actual_start ?? nowIso,
      })
      .eq("id", taskId);
    if (error) return { ok: false, error: error.message };

    const createdBy = (row as any)?.created_by_user_id;
    if (createdBy && createdBy !== actorUserId) {
      try {
        const { notificationService } = await import("@/services/notificationService");
        await notificationService.createNotification({
          company_id: (row as any).company_id,
          recipient_id: createdBy,
          type: "shift_task_completed",
          title: "Shift task completed",
          message: `A ${(row as any)?.task_type || "shift"} task you added was marked done.`,
          priority: "normal",
          related_entity_type: "staff_shift_task",
          related_entity_id: taskId,
          dedup: true,
        }, supabase);
      } catch (notifyErr) {
        console.warn("[staffShiftTasksService.completeTask] completion notify failed:", notifyErr);
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "completeTask crashed" };
  }
}

/** Undo a completion (clears actual_end). No notification - reopening is an
 *  operator correction, not a communication event. */
export async function reopenTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase as any)
    .from("staff_shift_tasks")
    .update({ actual_end: null })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase as any)
    .from("staff_shift_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Single-place chip styling so kitchen + cleaning grids look the
 * same. Returns Tailwind class strings only (no JSX) to keep this
 * file framework-agnostic.
 */
export function taskChipMeta(t: TaskType): {
  label: string;
  chip: string;
  shortLabel: string;
} {
  switch (t) {
    case "kitchen":
      return { label: "Kitchen", shortLabel: "K", chip: "bg-orange-100 text-orange-800 border-orange-300" };
    case "cleaning":
      return { label: "Cleaning", shortLabel: "C", chip: "bg-brand-primary/15 text-brand-primary border-brand-primary/30" };
    case "delivery":
      return { label: "Delivery", shortLabel: "D", chip: "bg-blue-100 text-blue-800 border-blue-300" };
    case "shopping":
      return { label: "Shopping", shortLabel: "S", chip: "bg-brand-primary/15 text-brand-primary border-brand-primary/30" };
    case "waitering":
      return { label: "Waitering", shortLabel: "W", chip: "bg-amber-100 text-amber-800 border-amber-300" };
    case "setup":
      return { label: "Setup", shortLabel: "Su", chip: "bg-brand-primary/15 text-brand-primary border-brand-primary/30" };
    case "breakdown":
      return { label: "Breakdown", shortLabel: "Br", chip: "bg-amber-100 text-amber-800 border-amber-300" };
    case "admin":
      return { label: "Admin", shortLabel: "A", chip: "bg-slate-100 text-slate-800 border-slate-300" };
  }
}
