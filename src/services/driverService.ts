
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

  async acceptAssignment(assignmentId: string, driverId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString()
      })
      .eq("id", assignmentId)
      .eq("driver_id", driverId)
      .select()
      .single();

    if (error) {
      console.error("Error accepting assignment:", error);
      throw error;
    }

    return data;
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
  }
};
