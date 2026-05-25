/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { notificationService } from "./notificationService";
import { billingEmailService } from "./billingEmailService";
import { UserRole } from "@/types/app";

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

  // End a duty shift
  async endDutyShift(shiftId: string, notes?: string): Promise<DutyShift> {
    const { data, error } = await supabase
      .from("kitchen_duty_shifts")
      .update({
        shift_end: new Date().toISOString(),
        is_active: false,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", shiftId)
      .select()
      .single();

    if (error) throw error;

    // NOTIFICATION: Kitchen staff clocked out → Notification to admin
    if (data) {
        const {data: order} = await supabase.from('orders').select('company_id').eq('id', data.order_id).single();
        if (order) {
            await notificationService.createNotification({
                company_id: order.company_id,
                user_id: data.user_id,
                recipient_id: data.user_id, // Admin
                title: "Kitchen Staff Clocked Out",
                message: `A staff member has clocked out from kitchen duty.`,
                notification_type: "kitchen_clock_out",
                priority: "low",
                // Phase 3b kitchen sweep: see the clock-in notification
                // above. Point at the dispatcher's weekly schedule
                // instead of the redirect-to-kitchen-portal stub.
                link: `/admin/kitchen-schedule?shiftId=${shiftId}`,
                related_entity_type: "kitchen_shift",
                related_entity_id: shiftId,
            });
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
    const taskData = {
      user_id: userId,
      order_id: orderId,
      staff_id: staffId,
      duty_shift_id: dutyShiftId || null,
      task_type: taskType,
      task_description: options?.taskDescription || null,
      notes: options?.notes || null,
      photo_url: options?.photoUrl || null,
      location_lat: options?.location?.lat || null,
      location_lng: options?.location?.lng || null,
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
      .select(`
        *,
        staff:staff_id (
          id,
          full_name,
          avatar_url,
          email
        ),
        duty_shift:duty_shift_id (
          id,
          shift_start,
          shift_end
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
