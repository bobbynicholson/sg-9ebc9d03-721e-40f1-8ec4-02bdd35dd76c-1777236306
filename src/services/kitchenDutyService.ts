/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { notificationService } from "./notificationService";
import { billingEmailService } from "./billingEmailService";
import { UserRole } from "@/types/app";
import { toLocalISO } from "@/lib/localDate";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForAutomaticRoleClockNote,
  promptForRoleHandoffNote,
  saveRoleHandoffNote,
} from "@/services/roleClockService";

// Admin-side roles that should receive kitchen-duty pings. Audit (May
// 2026): every kitchen notification in this service was routed back to
// the staff member who just clocked in / completed a task / reported
// an emergency. Admins never saw the signal. Fixed by broadcasting to
// dispatch/admin roles within the same tenant.
const KITCHEN_ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
  UserRole.REGION_ADMIN,
];

type DutyShift = Database["public"]["Tables"]["kitchen_duty_shifts"]["Row"];
type DutyShiftInsert = Database["public"]["Tables"]["kitchen_duty_shifts"]["Insert"];
type TaskCompletion = Database["public"]["Tables"]["kitchen_task_completions"]["Row"];
type TaskCompletionInsert = Database["public"]["Tables"]["kitchen_task_completions"]["Insert"];

export const kitchenDutyService = {
  // Get current active duty shift for a staff member
  async getCurrentDutyShift(staffId: string): Promise<DutyShift | null> {
    const { data, error } = await supabase
      .from("kitchen_duty_shifts")
      .select("*")
      .eq("staff_id", staffId)
      .eq("is_active", true)
      .order("shift_start", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  // Get all active duty shifts (scoped to a company)
  async getActiveDutyShifts(companyId?: string): Promise<DutyShift[]> {
    let q = supabase
      .from("kitchen_duty_shifts")
      .select(`
        *,
        staff:staff_id (
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .eq("is_active", true)
      .order("shift_start", { ascending: false });

    if (companyId) q = q.eq("company_id", companyId);

    const { data, error } = await q;

    if (error) throw error;
    return data || [];
  },

  // Start a duty shift
  async startDutyShift(userId: string, staffId: string, orderId?: string): Promise<DutyShift> {
    // First, end any existing active shifts for this staff member
    const currentShift = await this.getCurrentDutyShift(staffId);
    if (currentShift) {
      await this.endDutyShift(currentShift.id);
    }

    // Resolve company_id from the staff member's profile, NOT from the
    // optional order. Audit (May 2026): non-order-bound shifts (prep
    // days, deep cleans, opening hours) were inserted with NULL
    // company_id, so any tenant-scoped wage query missed those hours.
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, full_name")
      .eq("id", staffId)
      .maybeSingle();
    const companyId = profile?.company_id || null;

    if (companyId) {
      try {
        const roleClock = await beginRoleClock({
          companyId,
          userId,
          role: "kitchen",
          orderId: orderId || null,
        });
        if (roleClock.closed.length > 0) {
          await saveRoleHandoffNote(
            roleClock.closed,
            await promptForRoleHandoffNote(roleClock.closed, "kitchen"),
          );
        }
      } catch (roleErr) {
        console.warn("[kitchenDutyService.startDutyShift] role clock failed (non-blocking):", roleErr);
      }
    }

    const shiftData: DutyShiftInsert = {
      user_id: userId,
      staff_id: staffId,
      order_id: orderId || null,
      shift_start: new Date().toISOString(),
      is_active: true,
      company_id: companyId,
    };

    const { data, error } = await supabase
      .from("kitchen_duty_shifts")
      .insert([shiftData])
      .select()
      .single();

    if (error) throw error;

    // Notify the tenant's admins that a staff member is on duty.
    // Audit (May 2026): the old code set recipient_id = data.user_id
    // (the staff member themselves) so admins never saw the signal.
    if (data && companyId) {
      try {
        await notificationService.broadcastNotification({
          companyId,
          type: "kitchen_clock_in",
          title: "Kitchen staff clocked in",
          message: `${profile?.full_name || "A staff member"} has clocked in for kitchen duty.`,
          targetRoles: KITCHEN_ADMIN_ROLES,
          priority: "low",
          // Phase 3b kitchen sweep: the old link targeted the
          // /admin/kitchen-duty-tracking redirect stub. Admins were
          // bounced into the kitchen-staff portal which is the wrong
          // context. Point at the dispatcher view (weekly schedule
          // with late/missed badges) so the admin lands where the
          // signal is actionable.
          link: `/admin/kitchen-schedule?shiftId=${data.id}`,
          relatedEntityType: "kitchen_shift",
          relatedEntityId: data.id,
        });
      } catch (e) {
        console.warn("[kitchenDutyService.startDutyShift] notify failed:", e);
      }
    }

    return data;
  },

  /**
   * Dynamic clock-out for the kitchen. Mirrors the driver autoClockOut
   * and the cleaning autoEndCleaningDutyIfClear: a chef clocks in, works
   * the prep tasks, and the moment there's no prep left in the kitchen
   * their open kitchen_duty_shifts session closes itself - no manual
   * "Clock out" tap.
   *
   * "No prep left" = no kitchen_prep_tasks in pending/in_progress for any
   * order that's actively in the kitchen. An order counts as active-prep
   * when prep has started (orders.prep_started_at) OR its event is today
   * or earlier, AND it hasn't moved past prep (status not ready/in_transit/
   * delivered/completed/cancelled). That scoping keeps a chef clocked in
   * while next week's pre-generated tasks sit waiting, and clocks them out
   * once today's board is clear.
   *
   * Scoped to the ACTOR (staffId) so a co-chef still on the line isn't
   * pulled off duty. Best-effort: never throws.
   */
  async autoEndKitchenDutyIfClear(params: {
    companyId: string;
    staffId: string;
  }): Promise<{ ended: number; remaining: number }> {
    try {
      const { data: pending, error: pErr } = await supabase
        .from("kitchen_prep_tasks")
        .select("order_id, status")
        .eq("company_id", params.companyId)
        .in("status", ["pending", "in_progress"]);
      if (pErr) {
        console.warn("[autoEndKitchenDutyIfClear] pending-tasks read failed:", pErr);
        return { ended: 0, remaining: -1 };
      }
      const rows = (pending || []) as Array<{ order_id: string; status: string }>;
      let remaining = 0;
      if (rows.length > 0) {
        const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean)));
        const { data: orders } = await supabase
          .from("orders")
          .select("id, status, prep_started_at, event_date")
          .in("id", orderIds);
        const today = toLocalISO(new Date());
        const terminal = new Set(["ready", "in_transit", "delivered", "completed", "cancelled"]);
        const activeOrderIds = new Set(
          ((orders || []) as any[])
            .filter((o) => {
              const st = String(o.status || "").toLowerCase();
              if (terminal.has(st)) return false;
              return !!o.prep_started_at || (!!o.event_date && String(o.event_date) <= today);
            })
            .map((o) => o.id as string),
        );
        remaining = rows.filter((r) => activeOrderIds.has(r.order_id)).length;
      }
      if (remaining > 0) return { ended: 0, remaining };

      // Kitchen queue is clear - close this chef's open duty shift(s).
      const { data: openShifts, error: sErr } = await supabase
        .from("kitchen_duty_shifts")
        .select("id")
        .eq("company_id", params.companyId)
        .eq("staff_id", params.staffId)
        .eq("is_active", true);
      if (sErr) {
        console.warn("[autoEndKitchenDutyIfClear] open-shift read failed:", sErr);
        return { ended: 0, remaining: 0 };
      }
      const shifts = (openShifts || []) as Array<{ id: string }>;
      if (shifts.length === 0) return { ended: 0, remaining: 0 };

      const nowIso = new Date().toISOString();
      const closeNote = await promptForAutomaticRoleClockNote(
        "kitchen",
        "All kitchen prep is complete, so this kitchen timer is closing automatically.",
      );
      let ended = 0;
      for (const sh of shifts) {
        const { error: updErr } = await supabase
          .from("kitchen_duty_shifts")
        .update({
          is_active: false,
          shift_end: nowIso,
          updated_at: nowIso,
          end_reason: "auto_queue_clear",
          end_note: closeNote,
        } as any)
          .eq("id", sh.id);
        if (updErr) {
          console.warn("[autoEndKitchenDutyIfClear] shift close failed:", updErr);
          continue;
        }
        ended += 1;
        // Mirror the manual clock-out: stamp the linked roster row so
        // /admin/kitchen-schedule and payroll see the shift as completed.
        try {
          await (supabase as any)
            .from("kitchen_shifts")
            .update({ actual_end: nowIso, status: "completed" } as any)
            .eq("duty_shift_id", sh.id);
        } catch (rosterErr) {
          console.warn("[autoEndKitchenDutyIfClear] roster stamp failed:", rosterErr);
        }
        // Tell the chef their shift auto-closed (best-effort).
        try {
          await notificationService.createNotification({
            company_id: params.companyId,
            recipient_id: params.staffId,
            user_id: params.staffId,
            notification_type: "kitchen_clock_out",
            title: "Clocked out - all prep done",
            message: "All kitchen prep in the queue is finished, so your shift was closed automatically. Nice work!",
            priority: "low",
            link: "/team-portal/kitchen/duty",
          } as any);
        } catch (notifyErr) {
          console.warn("[autoEndKitchenDutyIfClear] chef notify failed:", notifyErr);
        }
      }
      try {
        await endCurrentRoleClock({
          companyId: params.companyId,
          userId: params.staffId,
          role: "kitchen",
          endedAt: nowIso,
          reason: "auto_queue_clear",
          note: closeNote,
        });
      } catch (roleErr) {
        console.warn("[autoEndKitchenDutyIfClear] shared kitchen role clock close failed:", roleErr);
      }
      return { ended, remaining: 0 };
    } catch (e) {
      console.warn("[autoEndKitchenDutyIfClear] crashed (non-blocking):", e);
      return { ended: 0, remaining: -1 };
    }
  },

  // End a duty shift
  async endDutyShift(shiftId: string, notes?: string): Promise<DutyShift> {
    const endedAt = new Date().toISOString();
    const note = notes?.trim() || "Kitchen duty closed; no additional note supplied.";
    const reason = notes?.trim()?.toLowerCase().startsWith("auto clock-out")
      ? "auto_order_complete"
      : "manual";
    const { data, error } = await supabase
      .from("kitchen_duty_shifts")
      // kitchen_duty_shifts has no `notes` column - writing it 400s the
      // whole update, so every kitchen clock-out (and clock-in, which
      // closes any prior active shift via this fn) threw "Failed to
      // toggle duty status".
      .update({
        shift_end: endedAt,
        is_active: false,
        updated_at: endedAt,
        end_reason: reason,
        end_note: note,
      } as any)
      .eq("id", shiftId)
      .select()
      .single();

    if (error) throw error;

    const actorId = (data as any)?.staff_id || (data as any)?.user_id;
    const companyId = (data as any)?.company_id;
    if (actorId && companyId) {
      try {
        await endCurrentRoleClock({
          companyId,
          userId: actorId,
          role: "kitchen",
          endedAt,
          reason,
          note,
        });
      } catch (roleErr) {
        console.warn("[kitchenDutyService.endDutyShift] role clock close failed (non-blocking):", roleErr);
      }
    }

    // NOTIFICATION: Kitchen staff clocked out -> admins. The clock-IN +
    // task-complete paths were fixed (May 2026 audit) to broadcast to
    // admin roles, but clock-OUT still set recipient_id = data.user_id
    // (the staffer, mislabelled "// Admin") so admins never saw it - and
    // the call was unguarded, so a failed insert would throw and break
    // clock-out entirely. Broadcast to KITCHEN_ADMIN_ROLES, best-effort.
    if (data && data.order_id) {
      try {
        const { data: order } = await supabase
          .from("orders")
          .select("company_id")
          .eq("id", data.order_id)
          .maybeSingle();
        if (order?.company_id) {
          await notificationService.broadcastNotification({
            companyId: order.company_id,
            type: "kitchen_clock_out",
            title: "Kitchen staff clocked out",
            message: "A kitchen staff member has clocked out from duty.",
            targetRoles: KITCHEN_ADMIN_ROLES,
            priority: "low",
            // Point at the dispatcher's weekly schedule (matches clock-in).
            link: `/admin/kitchen-schedule?shiftId=${shiftId}`,
            relatedEntityType: "kitchen_shift",
            relatedEntityId: shiftId,
          });
        }
      } catch (notifyErr) {
        console.warn("[kitchenDutyService.endDutyShift] notify failed:", notifyErr);
      }
    }

    return data;
  },

  // Get duty shift history
  async getDutyShiftHistory(
    filters?: {
      staffId?: string;
      orderId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<DutyShift[]> {
    let query = supabase
      .from("kitchen_duty_shifts")
      .select(`
        *,
        staff:staff_id (
          id,
          full_name,
          avatar_url,
          email
        ),
        order:order_id (
          id,
          order_number,
          client_name,
          event_date
        )
      `)
      .order("shift_start", { ascending: false });

    if (filters?.staffId) {
      query = query.eq("staff_id", filters.staffId);
    }

    if (filters?.orderId) {
      query = query.eq("order_id", filters.orderId);
    }

    if (filters?.startDate) {
      query = query.gte("shift_start", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("shift_start", filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  // Mark a task as complete
  async completeTask(
    userId: string,
    orderId: string,
    staffId: string,
    taskType: string,
    dutyShiftId?: string,
    options?: {
      taskDescription?: string;
      notes?: string;
      photoUrl?: string;
      location?: { lat: number; lng: number };
    }
  ): Promise<TaskCompletion> {
    // kitchen_task_completions only has: completed_by (NOT NULL), order_id
    // (NOT NULL), task_type (NOT NULL), staff_id, user_id, notes,
    // completed_at. The old insert wrote 5 phantom columns (duty_shift_id,
    // task_description, photo_url, location_lat/lng) AND omitted the
    // required completed_by, so every task-complete 500'd. Fold the extras
    // into notes so nothing is lost.
    const noteParts = [
      options?.notes || null,
      options?.taskDescription ? `Task: ${options.taskDescription}` : null,
      dutyShiftId ? `Shift: ${dutyShiftId}` : null,
      options?.photoUrl ? `Photo: ${options.photoUrl}` : null,
      options?.location ? `Loc: ${options.location.lat},${options.location.lng}` : null,
    ].filter(Boolean);
    const taskData = {
      user_id: userId,
      order_id: orderId,
      staff_id: staffId,
      completed_by: staffId || userId,
      task_type: taskType,
      notes: noteParts.length ? noteParts.join(" | ") : null,
      completed_at: new Date().toISOString(),
    } as unknown as TaskCompletionInsert;

    const { data, error } = await supabase
      .from("kitchen_task_completions")
      .insert([taskData] as any)
      .select()
      .single();

    if (error) throw error;

    // Notify admins of the completion. Audit (May 2026): old code
    // set recipient_id = data.user_id (the staffer who just completed
    // the task) so admins never saw it. Broadcast to admin roles
    // instead.
    if (data && data.order_id) {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("company_id, assigned_driver_id, order_number")
        .eq("id", data.order_id)
        .maybeSingle();
      if (orderErr) console.error("[kitchenDutyService] orders lookup failed:", orderErr);
      if (order?.company_id) {
        try {
          await notificationService.broadcastNotification({
            companyId: order.company_id,
            type: "kitchen_task_completed",
            title: "Kitchen task completed",
            message: `Task "${data.task_type}" for ${order.order_number || `order ${data.order_id}`} is done.`,
            targetRoles: KITCHEN_ADMIN_ROLES,
            priority: "medium",
            link: `/order/${data.order_id}?role=admin`,
            relatedEntityType: "order",
            relatedEntityId: data.order_id,
          });
        } catch (e) {
          console.warn("[kitchenDutyService] task-complete notify failed:", e);
        }

        // Milestone: prep done -> ping the assigned driver(s). Also
        // fan-out to every driver_assignments row so multi-driver
        // orders dispatched via the assignment table aren't missed.
        if (taskType === "prep_completed" || taskType === "all_tasks_completed") {
          const recipientIds = new Set<string>();
          if (order.assigned_driver_id) recipientIds.add(order.assigned_driver_id);
          const { data: assignments, error: assignmentsErr } = await supabase
            .from("driver_assignments")
            .select("driver_id, status")
            .eq("order_id", data.order_id);
          if (assignmentsErr) console.error("[kitchenDutyService] driver_assignments lookup failed:", assignmentsErr);
          for (const a of (assignments || []) as any[]) {
            if (a.driver_id && a.status !== "cancelled" && a.status !== "declined") {
              recipientIds.add(a.driver_id);
            }
          }
          for (const driverId of recipientIds) {
            try {
              await notificationService.createNotification({
                company_id: order.company_id,
                user_id: data.user_id,
                recipient_id: driverId,
                title: `${order.order_number || "Order"} ready for pickup`,
                message: `Kitchen prep complete. You're cleared to head to the kitchen.`,
                notification_type: "order_ready",
                priority: "high",
                link: `/team-portal/driver/deliveries?orderId=${data.order_id}`,
                related_entity_type: "order",
                related_entity_id: data.order_id,
              });
            } catch (e) {
              console.warn("[kitchenDutyService] driver ready notify failed:", e);
            }
          }
        }
      }
    }

    return data;
  },

  // Get task completions for an order
  async getOrderTaskCompletions(orderId: string): Promise<TaskCompletion[]> {
    const { data, error } = await supabase
      .from("kitchen_task_completions")
      // No duty_shift_id column/FK on kitchen_task_completions - embedding
      // it 400s the whole query. Drop the embed.
      .select(`
        *,
        staff:staff_id (
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .eq("order_id", orderId)
      .order("completed_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Get task completion history
  async getTaskCompletionHistory(
    filters?: {
      staffId?: string;
      orderId?: string;
      taskType?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<TaskCompletion[]> {
    let query = supabase
      .from("kitchen_task_completions")
      .select(`
        *,
        staff:staff_id (
          id,
          full_name,
          avatar_url,
          email
        ),
        order:order_id (
          id,
          order_number,
          client_name,
          event_date
        )
      `)
      .order("completed_at", { ascending: false });

    if (filters?.staffId) {
      query = query.eq("staff_id", filters.staffId);
    }

    if (filters?.orderId) {
      query = query.eq("order_id", filters.orderId);
    }

    if (filters?.taskType) {
      query = query.eq("task_type", filters.taskType);
    }

    if (filters?.startDate) {
      query = query.gte("completed_at", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("completed_at", filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  // Get staff performance summary
  async getStaffPerformanceSummary(staffId: string, days: number = 30): Promise<{
    totalShifts: number;
    totalTasksCompleted: number;
    taskBreakdown: Record<string, number>;
    averageShiftDuration: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [shiftsResult, tasksResult] = await Promise.all([
      supabase
        .from("kitchen_duty_shifts")
        .select("*")
        .eq("staff_id", staffId)
        .gte("shift_start", startDate.toISOString()),
      supabase
        .from("kitchen_task_completions")
        .select("task_type")
        .eq("staff_id", staffId)
        .gte("completed_at", startDate.toISOString()),
    ]);

    if (shiftsResult.error) throw shiftsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    const shifts = shiftsResult.data || [];
    const tasks = tasksResult.data || [];

    // Calculate average shift duration
    const completedShifts = shifts.filter(s => s.shift_end);
    const totalDuration = completedShifts.reduce((sum, shift) => {
      if (!shift.shift_end) return sum;
      const duration = new Date(shift.shift_end).getTime() - new Date(shift.shift_start).getTime();
      return sum + duration;
    }, 0);
    const averageShiftDuration = completedShifts.length > 0
      ? totalDuration / completedShifts.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    // Task breakdown
    const taskBreakdown: Record<string, number> = {};
    tasks.forEach(task => {
      taskBreakdown[task.task_type] = (taskBreakdown[task.task_type] || 0) + 1;
    });

    return {
      totalShifts: shifts.length,
      totalTasksCompleted: tasks.length,
      taskBreakdown,
      averageShiftDuration,
    };
  },

  // Report kitchen emergency
  async reportEmergency(
    userId: string,
    staffId: string,
    orderId: string,
    companyId: string,
    emergencyType: string,
    description: string
  ): Promise<void> {
    // Audit (May 2026): the previous code wrote recipient_id = userId
    // - the same userId that called the function. So the emergency
    // alert fired straight back to the person reporting it; no admin
    // ever saw "🚨 KITCHEN EMERGENCY". Broadcast to every admin role
    // in the tenant on urgent priority.
    await notificationService.broadcastNotification({
      companyId,
      type: "kitchen_emergency",
      title: `🚨 KITCHEN EMERGENCY: ${emergencyType}`,
      message: `Emergency reported for order ${orderId}: ${description}`,
      targetRoles: KITCHEN_ADMIN_ROLES,
      priority: "urgent",
      link: `/order/${orderId}?role=admin`,
      relatedEntityType: "order",
      relatedEntityId: orderId,
    });
  },
};
