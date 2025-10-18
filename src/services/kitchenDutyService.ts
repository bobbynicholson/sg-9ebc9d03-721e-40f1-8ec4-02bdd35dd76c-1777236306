import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { emailAutomationService } from "./emailAutomationService";
import { realtimeNotificationService } from "./realtimeNotificationService";

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
    await this.sendStaffClockedInNotification(data);

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
    await this.sendStaffClockedOutNotification(data);

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
    await this.sendTaskCompletedNotification(data);

    // Check if this is a milestone task that affects driver
    if (taskType === "prep_completed" || taskType === "all_tasks_completed") {
      await this.sendMilestoneNotificationToDriver(data);
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
    emergencyType: string,
    description: string
  ): Promise<void> {
    // NOTIFICATION: Kitchen emergency/issue → Urgent notification to admin
    await this.sendEmergencyNotification(userId, staffId, orderId, emergencyType, description);
  },

  // NOTIFICATION METHODS

  async sendStaffClockedInNotification(shift: DutyShift): Promise<void> {
    try {
      // Get staff and company details
      const { data: staff } = await supabase
        .from("profiles")
        .select("id, full_name, email, company_id")
        .eq("id", shift.staff_id)
        .single();

      if (!staff) return;

      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name, admin_email")
        .eq("id", staff.company_id)
        .single();

      if (!company) return;

      // Email to admin
      if (company.admin_email) {
        await emailAutomationService.sendEmail({
          to: company.admin_email,
          subject: "Kitchen Staff Clocked In",
          template: "staff_clocked_in",
          variables: {
            companyName: company.company_name,
            staffName: staff.full_name,
            clockInTime: new Date(shift.shift_start).toLocaleString(),
            orderId: shift.order_id || "N/A",
          },
          companyId: staff.company_id,
        });
      }

      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: staff.company_id,
        user_id: shift.user_id,
        title: "Kitchen Staff Clocked In",
        message: `${staff.full_name} has clocked in for kitchen duty`,
        type: "info",
        priority: "low",
        action_url: `/admin/kitchen-duty-tracking`,
      });
    } catch (error) {
      console.error("Error sending staff clocked in notification:", error);
    }
  },

  async sendStaffClockedOutNotification(shift: DutyShift): Promise<void> {
    try {
      // Get staff and company details
      const { data: staff } = await supabase
        .from("profiles")
        .select("id, full_name, email, company_id")
        .eq("id", shift.staff_id)
        .single();

      if (!staff) return;

      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name, admin_email")
        .eq("id", staff.company_id)
        .single();

      if (!company) return;

      // Calculate shift duration
      const duration = shift.shift_end
        ? (new Date(shift.shift_end).getTime() - new Date(shift.shift_start).getTime()) / (1000 * 60 * 60)
        : 0;

      // Email to admin
      if (company.admin_email) {
        await emailAutomationService.sendEmail({
          to: company.admin_email,
          subject: "Kitchen Staff Clocked Out",
          template: "staff_clocked_out",
          variables: {
            companyName: company.company_name,
            staffName: staff.full_name,
            clockOutTime: shift.shift_end ? new Date(shift.shift_end).toLocaleString() : "N/A",
            duration: duration.toFixed(2),
            notes: shift.notes || "No notes",
          },
          companyId: staff.company_id,
        });
      }

      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: staff.company_id,
        user_id: shift.user_id,
        title: "Kitchen Staff Clocked Out",
        message: `${staff.full_name} has clocked out. Duration: ${duration.toFixed(2)} hours`,
        type: "info",
        priority: "low",
        action_url: `/admin/kitchen-duty-tracking`,
      });
    } catch (error) {
      console.error("Error sending staff clocked out notification:", error);
    }
  },

  async sendTaskCompletedNotification(task: TaskCompletion): Promise<void> {
    try {
      // Get staff, order, and company details
      const { data: staff } = await supabase
        .from("profiles")
        .select("id, full_name, company_id")
        .eq("id", task.staff_id)
        .single();

      if (!staff) return;

      const { data: order } = await supabase
        .from("orders")
        .select("id, order_number, client_name")
        .eq("id", task.order_id)
        .single();

      // Portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: staff.company_id,
        user_id: task.user_id,
        title: "Kitchen Task Completed",
        message: `${staff.full_name} completed: ${task.task_type} for order ${order?.order_number || "N/A"}`,
        type: "success",
        priority: "medium",
        action_url: `/orders/${task.order_id}`,
      });
    } catch (error) {
      console.error("Error sending task completed notification:", error);
    }
  },

  async sendMilestoneNotificationToDriver(task: TaskCompletion): Promise<void> {
    try {
      // Get order and driver details
      const { data: order } = await supabase
        .from("orders")
        .select("id, order_number, driver_id, company_id")
        .eq("id", task.order_id)
        .single();

      if (!order || !order.driver_id) return;

      const { data: driver } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .eq("id", order.driver_id)
        .single();

      if (!driver) return;

      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("id", order.company_id)
        .single();

      if (!company) return;

      const milestoneMessage = task.task_type === "all_tasks_completed"
        ? "All kitchen tasks are complete! Ready for pickup."
        : "Kitchen prep milestone reached";

      // Email to driver
      if (driver.email) {
        await emailAutomationService.sendEmail({
          to: driver.email,
          subject: "Kitchen Update - Order Ready",
          template: "kitchen_milestone",
          variables: {
            companyName: company.company_name,
            driverName: driver.full_name,
            orderNumber: order.order_number,
            milestone: milestoneMessage,
            orderUrl: `${window.location.origin}/orders/${order.id}`,
          },
          companyId: order.company_id,
        });
      }

      // WhatsApp to driver (if phone provided)
      if (driver.phone) {
        // WhatsApp integration would go here
        console.log("WhatsApp notification to driver:", driver.phone);
      }

      // Portal notification to driver
      await realtimeNotificationService.createNotification({
        company_id: order.company_id,
        user_id: driver.id,
        title: "Kitchen Milestone Reached",
        message: `${milestoneMessage} for order ${order.order_number}`,
        type: "info",
        priority: "high",
        action_url: `/orders/${order.id}`,
      });
    } catch (error) {
      console.error("Error sending milestone notification to driver:", error);
    }
  },

  async sendEmergencyNotification(
    userId: string,
    staffId: string,
    orderId: string,
    emergencyType: string,
    description: string
  ): Promise<void> {
    try {
      // Get staff, order, and company details
      const { data: staff } = await supabase
        .from("profiles")
        .select("id, full_name, company_id")
        .eq("id", staffId)
        .single();

      if (!staff) return;

      const { data: order } = await supabase
        .from("orders")
        .select("id, order_number, client_name")
        .eq("id", orderId)
        .single();

      const { data: company } = await supabase
        .from("companies")
        .select("id, company_name, admin_email")
        .eq("id", staff.company_id)
        .single();

      if (!company) return;

      // Urgent email to admin
      if (company.admin_email) {
        await emailAutomationService.sendEmail({
          to: company.admin_email,
          subject: `🚨 URGENT: Kitchen Emergency - ${emergencyType}`,
          template: "kitchen_emergency",
          variables: {
            companyName: company.company_name,
            staffName: staff.full_name,
            emergencyType: emergencyType,
            description: description,
            orderNumber: order?.order_number || "N/A",
            orderUrl: `${window.location.origin}/orders/${orderId}`,
          },
          companyId: staff.company_id,
        });
      }

      // Urgent portal notification to admin
      await realtimeNotificationService.createNotification({
        company_id: staff.company_id,
        user_id: userId,
        title: `🚨 Kitchen Emergency: ${emergencyType}`,
        message: `${staff.full_name} reported: ${description}`,
        type: "error",
        priority: "urgent",
        action_url: `/orders/${orderId}`,
      });
    } catch (error) {
      console.error("Error sending emergency notification:", error);
    }
  },
};