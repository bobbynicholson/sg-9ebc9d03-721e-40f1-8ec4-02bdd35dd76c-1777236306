import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DriverAssignment = Tables<"driver_assignments">;
export type GPSTracking = Tables<"gps_tracking">;

export const driverService = {
  async getDriverAssignments(driverId: string): Promise<DriverAssignment[]> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching driver assignments:", error);
      return [];
    }

    return data || [];
  },

  async getAvailableAssignments(userId: string): Promise<DriverAssignment[]> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

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

  async startAssignment(assignmentId: string, driverId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "started",
        started_at: new Date().toISOString()
      })
      .eq("id", assignmentId)
      .eq("driver_id", driverId)
      .select()
      .single();

    if (error) {
      console.error("Error starting assignment:", error);
      throw error;
    }

    return data;
  },

  async completeAssignment(assignmentId: string, driverId: string, hours: number, distance: number, earnings: number): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        calculated_hours: hours,
        calculated_distance: distance,
        total_earnings: earnings
      })
      .eq("id", assignmentId)
      .eq("driver_id", driverId)
      .select()
      .single();

    if (error) {
      console.error("Error completing assignment:", error);
      throw error;
    }

    return data;
  },

  async trackGPS(driverId: string, orderId: string, assignmentId: string, latitude: number, longitude: number, speed?: number, heading?: number, accuracy?: number): Promise<GPSTracking | null> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .insert([{
        driver_id: driverId,
        order_id: orderId,
        assignment_id: assignmentId,
        latitude,
        longitude,
        speed,
        heading,
        accuracy
      }])
      .select()
      .single();

    if (error) {
      console.error("Error tracking GPS:", error);
      throw error;
    }

    return data;
  },

  async getGPSTracking(orderId: string): Promise<GPSTracking[]> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("*")
      .eq("order_id", orderId)
      .order("timestamp", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching GPS tracking:", error);
      return [];
    }

    return data || [];
  },

  async getLatestDriverLocation(driverId: string): Promise<GPSTracking | null> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("*")
      .eq("driver_id", driverId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching latest driver location:", error);
      return null;
    }

    return data;
  }
};
