import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { realtimeNotificationService } from "./realtimeNotificationService";
import { billingEmailService } from "./billingEmailService";

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

  // Get all active duty shifts
  async getActiveDutyShifts(): Promise<DutyShift[]> {
    const { data, error } = await supabase
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

    const shiftData: DutyShiftInsert = {
      user_id: userId,
      staff_id: staffId,
      order_id: orderId || null,
      shift_start: new Date().toISOString(),
      is_active: true,
    };

    const { data, error } = await supabase
      .from("kitchen_duty_shifts")
      .insert([shiftData])
      .select()
      .single();

    if (error) throw error;

    // NOTIFICATION: Kitchen staff clocked in → Notification to admin
    if(data) {
        const {data: order} = await supabase.from('orders').select('company_id').eq('id', data.order_id).single();
        if (order) {
            await realtimeNotificationService.createNotification({
                company_id: order.company_id,
                user_id: data.user_id,
                recipient_id: data.user_id, // Admin
                title: "Kitchen Staff Clocked In",
                message: `A staff member has clocked in for kitchen duty.`,
                notification_type: "info",
                priority: "low",
                link: `/admin/kitchen-duty-tracking`,
            });
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
      })
      .eq("id", shiftId)
      .select()
      .single();

    if (error) throw error;

    // NOTIFICATION: Kitchen staff clocked out → Notification to admin
    if (data) {
        const {data: order} = await supabase.from('orders').select('company_id').eq('id', data.order_id).single();
        if (order) {
            await realtimeNotificationService.createNotification({
                company_id: order.company_id,
                user_id: data.user_id,
                recipient_id: data.user_id, // Admin
                title: "Kitchen Staff Clocked Out",
                message: `A staff member has clocked out from kitchen duty.`,
                notification_type: "info",
                priority: "low",
                link: `/admin/kitchen-duty-tracking`,
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
    const taskData: TaskCompletionInsert = {
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
    };

    const { data, error } = await supabase
      .from("kitchen_task_completions")
      .insert([taskData])
      .select()
      .single();

    if (error) throw error;

    // NOTIFICATION: Kitchen task completed → Notification to admin
    if (data) {
        const {data: order} = await supabase.from('orders').select('company_id').eq('id', data.order_id).single();
        if (order) {
            await realtimeNotificationService.createNotification({
                company_id: order.company_id,
                user_id: data.user_id,
                recipient_id: data.user_id, // Admin
                title: "Kitchen Task Completed",
                message: `Task "${data.task_type}" for order ${data.order_id} has been completed.`,
                notification_type: "success",
                priority: "medium",
                link: `/orders/${data.order_id}`,
            });
        }
    }

    // Check if this is a milestone task that affects driver
    if ((taskType === "prep_completed" || taskType === "all_tasks_completed") && data.order_id) {
        const { data: order } = await supabase.from('orders').select('assigned_driver_id, company_id').eq('id', data.order_id).single();
        if (order?.assigned_driver_id) {
            await realtimeNotificationService.createNotification({
                company_id: order.company_id,
                user_id: data.user_id,
                recipient_id: order.assigned_driver_id,
                title: `Order ${data.order_id} Ready for Pickup`,
                message: `Kitchen tasks for order ${data.order_id} are complete.`,
                notification_type: "info",
                priority: "high",
                link: `/drivers/deliveries`,
            });
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
    // NOTIFICATION: Kitchen emergency/issue → Urgent notification to admin
    await realtimeNotificationService.createNotification({
        company_id: companyId,
        user_id: staffId,
        recipient_id: userId, // Admin
        title: `🚨 KITCHEN EMERGENCY: ${emergencyType}`,
        message: `Emergency reported for order ${orderId}: ${description}`,
        notification_type: "error",
        priority: "urgent",
        link: `/orders/${orderId}`,
    });
  },
};
