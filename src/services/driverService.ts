
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DriverAssignment = Tables<"driver_assignments">;
export type GPSTracking = Tables<"gps_tracking">;

export const driverService = {
  async getDriverAssignments(driverId: string): Promise<DriverAssignment[]> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("*, orders(*)")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching driver assignments:", error);
      return [];
    }

    return data || [];
  },

  async getAvailableAssignments(regionId?: string): Promise<DriverAssignment[]> {
    let query = supabase
      .from("driver_assignments")
      .select("*, orders(*)")
      .eq("status", "pending");

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data, error } = await query.order("created_at");

    if (error) {
      console.error("Error fetching available assignments:", error);
      return [];
    }

    return data || [];
  },

  async startJob(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString()
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error starting job:", error);
      throw error;
    }

    return data;
  },

  async completeJob(assignmentId: string, distance?: number): Promise<DriverAssignment | null> {
    const updates: Partial<DriverAssignment> = {
      status: "completed",
      completed_at: new Date().toISOString()
    };

    if (distance !== undefined) {
      updates.calculated_distance = distance;
    }

    const { data, error } = await supabase
      .from("driver_assignments")
      .update(updates)
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error completing job:", error);
      throw error;
    }

    return data;
  },

  async trackGPS(
    driverId: string,
    orderId: string,
    assignmentId: string,
    location: {
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
    }
  ): Promise<GPSTracking | null> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .insert([
        {
          driver_id: driverId,
          order_id: orderId,
          assignment_id: assignmentId,
          latitude: location.latitude,
          longitude: location.longitude,
          speed: location.speed,
          heading: location.heading,
          accuracy: location.accuracy
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error tracking GPS:", error);
      throw error;
    }

    return data;
  },

  async getGPSHistory(orderId: string, limit: number = 100): Promise<GPSTracking[]> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("*")
      .eq("order_id", orderId)
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching GPS history:", error);
      return [];
    }

    return data || [];
  },

  async getLatestGPSLocation(orderId: string): Promise<GPSTracking | null> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("*")
      .eq("order_id", orderId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching latest GPS location:", error);
      return null;
    }

    return data;
  },

  async getDriverEarnings(driverId: string, startDate?: string, endDate?: string): Promise<DriverAssignment[]> {
    let query = supabase
      .from("driver_assignments")
      .select("*")
      .eq("driver_id", driverId)
      .eq("status", "completed");

    if (startDate) {
      query = query.gte("completed_at", startDate);
    }

    if (endDate) {
      query = query.lte("completed_at", endDate);
    }

    const { data, error } = await query.order("completed_at", { ascending: false });

    if (error) {
      console.error("Error fetching driver earnings:", error);
      return [];
    }

    return data || [];
  },

  async markPaymentPaid(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString()
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking payment as paid:", error);
      throw error;
    }

    return data;
  },

  async updateChecklistItem(
    assignmentId: string,
    field: "checklist_cutlery_confirmed" | "checklist_crockery_confirmed" | "checklist_food_verified",
    value: boolean
  ): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({ [field]: value })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error updating checklist:", error);
      throw error;
    }

    return data;
  },

  async confirmDeparture(assignmentId: string): Promise<DriverAssignment | null> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    if (!assignment.checklist_cutlery_confirmed || 
        !assignment.checklist_crockery_confirmed || 
        !assignment.checklist_food_verified) {
      throw new Error("All checklist items must be confirmed before departure");
    }

    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        departure_confirmed: true,
        departure_confirmed_at: new Date().toISOString(),
        checklist_completed_at: new Date().toISOString(),
        status: "in_progress"
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error confirming departure:", error);
      throw error;
    }

    return data;
  },

  async getChecklistStatus(assignmentId: string): Promise<Partial<DriverAssignment> | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("checklist_cutlery_confirmed, checklist_crockery_confirmed, checklist_food_verified, departure_confirmed, departure_confirmed_at, checklist_completed_at")
      .eq("id", assignmentId)
      .single();

    if (error) {
      console.error("Error fetching checklist status:", error);
      return null;
    }

    return data;
  },

  async calculateWaiterEarnings(
    assignmentId: string,
    waiterDurationHours: number,
    waiterHourlyRate: number
  ): Promise<DriverAssignment | null> {
    const waiterEarnings = waiterDurationHours * waiterHourlyRate;

    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        waiter_earnings: waiterEarnings
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error calculating waiter earnings:", error);
      throw error;
    }

    return data;
  },

  /**
   * Get available jobs for driver to accept
   * Shows orders ready for delivery with waiter service info
   */
  async getAvailableJobs(driverId: string, regionId?: string): Promise<any[]> {
    let query = supabase
      .from("orders")
      .select(`
        *,
        driver_assignments!driver_assignments_order_id_fkey (
          id,
          status,
          driver_id
        )
      `)
      .eq("status", "confirmed")
      .eq("balance_paid", true)
      .is("driver_assignments.driver_id", null);

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data, error } = await query.order("event_date");

    if (error) {
      console.error("Error fetching available jobs:", error);
      return [];
    }

    return (data || []).map((order) => ({
      ...order,
      needsWaiter: order.waiter_service_required,
      waiterDuration: order.waiter_duration_hours,
      waiterRate: order.waiter_hourly_rate,
      deliveryDistance: order.delivery_distance_km,
      deliveryRate: (order as any).delivery_rate_per_km,
    }));
  },

  /**
   * Accept an available job
   */
  async acceptJob(orderId: string, driverId: string): Promise<DriverAssignment | null> {
    const { data: order } = await supabase
      .from("orders")
      .select("user_id")
      .eq("id", orderId)
      .single();

    if (!order) {
      throw new Error("Order not found");
    }

    const { data: assignment, error } = await supabase
      .from("driver_assignments")
      .insert({
        order_id: orderId,
        driver_id: driverId,
        user_id: order.user_id,
        assignment_type: "delivery",
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error accepting job:", error);
      throw error;
    }

    await supabase.from("notifications").insert({
      user_id: order.user_id,
      recipient_id: driverId,
      notification_type: "driver_assignment",
      title: "Job Accepted",
      message: "You have successfully accepted a delivery job",
      priority: "medium",
    });

    return assignment;
  },

  /**
   * Start equipment checklist verification
   */
  async startEquipmentChecklist(assignmentId: string): Promise<any> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, orders(*)")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    const order = assignment.orders as any;

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      cutleryRequired: order.cutlery_count || 0,
      crockeryRequired: order.crockery_count || 0,
      menuItems: order.menu_items || [],
      specialInstructions: order.special_instructions,
    };
  },

  /**
   * Confirm all equipment checked and ready to depart
   */
  async confirmReadyToDepart(
    assignmentId: string,
    checklist: {
      cutleryCount: number;
      crockeryCount: number;
      foodItemsVerified: boolean;
    }
  ): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        checklist_cutlery_confirmed: true,
        checklist_crockery_confirmed: true,
        checklist_food_verified: checklist.foodItemsVerified,
        departure_confirmed: true,
        departure_confirmed_at: new Date().toISOString(),
        checklist_completed_at: new Date().toISOString(),
        status: "in_transit",
        actual_cutlery_count: checklist.cutleryCount,
        actual_crockery_count: checklist.crockeryCount,
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error confirming departure:", error);
      throw error;
    }

    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("order_id, driver_id")
      .eq("id", assignmentId)
      .single();

    if (assignment) {
      await supabase.from("orders").update({
        status: "in_transit",
      }).eq("id", assignment.order_id);

      const { data: orderDetails } = await supabase
        .from("orders")
        .select("user_id")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await supabase.from("notifications").insert({
          user_id: orderDetails.user_id,
          recipient_id: assignment.driver_id,
          notification_type: "delivery_started",
          title: "Delivery Started",
          message: "GPS tracking activated. Drive safely!",
          priority: "high",
        });
      }
    }

    return data;
  },

  /**
   * Mark as arrived at venue
   */
  async markArrived(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "arrived",
        arrived_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking arrived:", error);
      throw error;
    }

    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("order_id, driver_id")
      .eq("id", assignmentId)
      .single();

    if (assignment) {
      await supabase.from("orders").update({
        status: "delivered",
      }).eq("id", assignment.order_id);

      const { data: orderDetails } = await supabase
        .from("orders")
        .select("user_id")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await supabase.from("notifications").insert({
          user_id: orderDetails.user_id,
          recipient_id: assignment.driver_id,
          notification_type: "delivery_arrived",
          title: "Arrived at Venue",
          message: "You have arrived at the delivery location",
          priority: "medium",
        });
      }
    }

    return data;
  },

  /**
   * Mark event as complete (for waiter service)
   */
  async markEventComplete(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "event_complete",
        event_completed_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking event complete:", error);
      throw error;
    }

    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("order_id")
      .eq("id", assignmentId)
      .single();

    if (assignment) {
      const { data: orderDetails } = await supabase
        .from("orders")
        .select("user_id, client_id")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await supabase.from("notifications").insert({
          user_id: orderDetails.user_id,
          recipient_id: orderDetails.client_id || orderDetails.user_id,
          notification_type: "event_complete",
          title: "Event Complete",
          message: "Collection available for this order",
          priority: "medium",
        });
      }
    }

    return data;
  },

  /**
   * Confirm equipment collection and check for shortages
   */
  async confirmCollection(
    assignmentId: string,
    collection: {
      cutleryReturned: number;
      crockeryReturned: number;
      notes?: string;
    }
  ): Promise<{ assignment: DriverAssignment; shortages: any[] }> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, orders(*)")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    const order = assignment.orders as any;
    const shortages = [];

    const cutleryShortage = (assignment.actual_cutlery_count || 0) - collection.cutleryReturned;
    const crockeryShortage = (assignment.actual_crockery_count || 0) - collection.crockeryReturned;

    if (cutleryShortage > 0) {
      shortages.push({
        user_id: order.user_id,
        order_id: order.id,
        client_id: order.client_id,
        equipment_type: "cutlery",
        quantity_missing: cutleryShortage,
        notes: collection.notes,
      });
    }

    if (crockeryShortage > 0) {
      shortages.push({
        user_id: order.user_id,
        order_id: order.id,
        client_id: order.client_id,
        equipment_type: "crockery",
        quantity_missing: crockeryShortage,
        notes: collection.notes,
      });
    }

    if (shortages.length > 0) {
      await supabase.from("equipment_shortages").insert(shortages as any);
    }

    const { data: updatedAssignment, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        collection_cutlery_count: collection.cutleryReturned,
        collection_crockery_count: collection.crockeryReturned,
        collection_notes: collection.notes,
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error confirming collection:", error);
      throw error;
    }

    await supabase.from("orders").update({
      status: "completed",
    }).eq("id", order.id);

    return { assignment: updatedAssignment, shortages };
  },

  /**
   * Calculate total earnings for an assignment
   */
  async calculateTotalEarnings(assignmentId: string): Promise<number> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, orders(*)")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      return 0;
    }

    const order = assignment.orders as any;

    let deliveryEarnings = 0;
    if (assignment.calculated_distance && order.delivery_rate_per_km) {
      deliveryEarnings = assignment.calculated_distance * order.delivery_rate_per_km;
    }

    const waiterEarnings = assignment.waiter_earnings || 0;

    const totalEarnings = deliveryEarnings + waiterEarnings;

    await supabase
      .from("driver_assignments")
      .update({
        delivery_earnings: deliveryEarnings,
        waiter_earnings: waiterEarnings,
        total_earnings: totalEarnings,
      })
      .eq("id", assignmentId);

    return totalEarnings;
  },

  /**
   * Get earnings summary for a driver
   */
  async getEarningsSummary(driverId: string, period: "week" | "month" | "all" = "month"): Promise<any> {
    const now = new Date();
    let startDate: Date;

    if (period === "week") {
      startDate = new Date(now.setDate(now.getDate() - 7));
    } else if (period === "month") {
      startDate = new Date(now.setMonth(now.getMonth() - 1));
    } else {
      startDate = new Date(0);
    }

    const { data: assignments } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("driver_id", driverId)
      .eq("status", "completed")
      .gte("completed_at", startDate.toISOString());

    const totalEarnings = (assignments || []).reduce((sum, a) => sum + (a.total_earnings || 0), 0);
    const totalDeliveryEarnings = (assignments || []).reduce((sum, a) => sum + (a.delivery_earnings || 0), 0);
    const totalWaiterEarnings = (assignments || []).reduce((sum, a) => sum + (a.waiter_earnings || 0), 0);
    const totalJobs = assignments?.length || 0;

    const { data: unpaidAssignments } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("driver_id", driverId)
      .eq("status", "completed")
      .eq("payment_status", "pending");

    const totalOwing = (unpaidAssignments || []).reduce((sum, a) => sum + (a.total_earnings || 0), 0);

    return {
      totalEarnings,
      totalDeliveryEarnings,
      totalWaiterEarnings,
      totalJobs,
      totalOwing,
      unpaidJobs: unpaidAssignments?.length || 0,
      averagePerJob: totalJobs > 0 ? totalEarnings / totalJobs : 0,
    };
  }
};
