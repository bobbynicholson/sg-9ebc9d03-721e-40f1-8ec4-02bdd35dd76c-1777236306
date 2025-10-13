import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { realtimeNotificationService } from "./realtimeNotificationService";
import { AppOrder } from "@/types";
import { Order } from "./orderService";

export type DriverAssignment = Tables<"driver_assignments">;
export type GPSTracking = Tables<"gps_tracking">;

export const driverService = {
  async getDriverAssignments(driverId: string): Promise<DriverAssignment[]> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("*, orders(id, order_number, client_name, event_date, venue_address)")
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
      .select("*, orders(id, order_number, client_name, event_date, venue_address)")
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

  async getAvailableJobs(driverId: string, regionId?: string): Promise<AppOrder[]> {
    let query = supabase
      .from("orders")
      .select(`
        id,
        quote_id,
        client_name,
        event_date,
        venue_address,
        guest_count,
        menu_items,
        equipment_items,
        internal_notes,
        status,
        total,
        created_at,
        waiter_service_required,
        waiter_duration_hours,
        waiter_hourly_rate,
        delivery_distance_km,
        delivery_rate_per_km
      `)
      .eq("status", "confirmed")
      .eq("balance_paid", true);

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data: assignedOrders, error: assignedError } = await supabase
      .from('driver_assignments')
      .select('order_id')
      .in('status', ['accepted', 'in_progress', 'heading_to_kitchen', 'in_transit', 'arrived']);

    if (assignedError) {
      console.error("Error fetching assigned orders:", assignedError);
      return [];
    }

    const assignedOrderIds = (assignedOrders || []).map(a => a.order_id).filter(Boolean);

    const { data, error } = await query.order("event_date");

    if (error) {
      console.error("Error fetching available jobs:", error);
      return [];
    }

    const availableOrders = (data || []).filter(order => !assignedOrderIds.includes(order.id));

    return availableOrders.map((order): AppOrder => ({
      id: order.id,
      quoteId: order.quote_id || '',
      client: order.client_name || '',
      clientName: order.client_name || '',
      eventDate: order.event_date,
      date: order.event_date,
      venue: order.venue_address || '',
      location: order.venue_address || '',
      eventLocation: order.venue_address || '',
      guestCount: order.guest_count,
      menuItems: (order.menu_items as any) || [],
      equipmentItems: (order.equipment_items as any) || [],
      kitchenInstructions: order.internal_notes || '',
      status: order.status as AppOrder['status'],
      total: order.total,
      createdAt: order.created_at,
      needsWaiter: order.waiter_service_required,
      waiterDuration: order.waiter_duration_hours,
      waiterRate: order.waiter_hourly_rate,
      deliveryDistance: order.delivery_distance_km,
      deliveryRate: order.delivery_rate_per_km,
    }));
  },

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

  async startEquipmentChecklist(assignmentId: string): Promise<any> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, orders(id, order_number, equipment_items, menu_items, special_instructions)")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    const order: {
        id: string;
        order_number: string;
        equipment_items: any;
        menu_items: any;
        special_instructions: string | null;
    } | null = assignment.orders as any;

    if (!order) {
      throw new Error("Order not found for assignment");
    }

    const equipmentItems = Array.isArray(order.equipment_items) ? order.equipment_items : [];

    const cutleryCount = equipmentItems
      .filter((item: any) => item.category === 'cutlery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

    const crockeryCount = equipmentItems
      .filter((item: any) => item.category === 'crockery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      cutleryRequired: cutleryCount,
      crockeryRequired: crockeryCount,
      menuItems: order.menu_items || [],
      specialInstructions: order.special_instructions,
    };
  },

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

  async confirmCollection(
    assignmentId: string,
    collection: {
      cutleryReturned: number;
      crockeryReturned: number;
      notes?: string;
    }
  ): Promise<{ assignment: DriverAssignment; shortages: any[] }> {
    const { data: assignment, error: assignmentError } = (await supabase
      .from("driver_assignments")
      .select("id, order_id, driver_id, actual_cutlery_count, actual_crockery_count")
      .eq("id", assignmentId)
      .single()) as any;

    if (assignmentError || !assignment) {
      console.error("Error fetching assignment for collection:", assignmentError);
      throw new Error("Assignment not found");
    }

    const { data: order, error: orderError } = (await supabase
      .from("orders")
      .select("id, user_id, client_id, equipment_items")
      .eq("id", assignment.order_id)
      .single()) as any;

    if (orderError || !order) {
        console.error("Error fetching order for collection:", orderError);
        throw new Error("Order not found for assignment");
    }

    const equipmentItems = Array.isArray(order.equipment_items) ? order.equipment_items : [];

    const cutleryCount = equipmentItems
      .filter((item: any) => item.category === 'cutlery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

    const crockeryCount = equipmentItems
      .filter((item: any) => item.category === 'crockery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

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

  async calculateTotalEarnings(assignmentId: string): Promise<number> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, orders(delivery_rate_per_km)")
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
  },

  async updateDriverProfile(
    driverId: string,
    updates: {
      drive_time_to_kitchen_minutes?: number;
      phone_number?: string;
      vehicle_details?: string;
    }
  ): Promise<any> {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", driverId)
      .select()
      .single();

    if (error) {
      console.error("Error updating driver profile:", error);
      throw error;
    }

    return data;
  },

  async getDriverProfile(driverId: string): Promise<any> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", driverId)
      .single();

    if (error) {
      console.error("Error fetching driver profile:", error);
      return null;
    }

    return data;
  },

  async calculateDepartureTimes(assignmentId: string): Promise<{
    leaveForKitchenTime: string;
    leaveForVenueTime: string;
    collectionTime: string;
  } | null> {
    const { data: assignment, error: assignmentError } = await supabase
      .from("driver_assignments")
      .select("id, order_id, driver_id, estimated_drive_time_minutes")
      .eq("id", assignmentId)
      .single();

    if (assignmentError || !assignment) {
      console.error("Error fetching assignment for departure times:", assignmentError);
      return null;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("event_date, event_time")
      .eq("id", assignment.order_id)
      .single();

    if (orderError || !order) {
      console.error("Error fetching order for departure times:", orderError);
      return null;
    }

    const { data: driverProfile, error: profileError } = await supabase
      .from("profiles")
      .select("drive_time_to_kitchen_minutes")
      .eq("id", assignment.driver_id)
      .single();

    if (profileError || !driverProfile) {
      console.error("Error fetching driver profile for departure times:", profileError);
      return null;
    }

    const eventDateTime = new Date(`${order.event_date}T${order.event_time || "12:00:00"}`);
    const driveTimeToKitchen = driverProfile.drive_time_to_kitchen_minutes || 30;
    const driveTimeToVenue = assignment.estimated_drive_time_minutes || 30;
    const bufferTime = 15;

    const leaveForVenueTime = new Date(eventDateTime.getTime() - driveTimeToVenue * 60000 - bufferTime * 60000);
    const collectionTime = new Date(leaveForVenueTime.getTime() - bufferTime * 60000);
    const leaveForKitchenTime = new Date(collectionTime.getTime() - driveTimeToKitchen * 60000);

    return {
      leaveForKitchenTime: leaveForKitchenTime.toISOString(),
      leaveForVenueTime: leaveForVenueTime.toISOString(),
      collectionTime: collectionTime.toISOString(),
    };
  },

  async startTripToKitchen(assignmentId: string): Promise<any> {
    const { data: assignment, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "heading_to_kitchen",
        started_trip_to_kitchen_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .select("*, orders(id, user_id, order_number)")
      .single();

    if (error) {
      console.error("Error starting trip to kitchen:", error);
      throw error;
    }

    const order = assignment.orders as any;

    if (order) {
      await realtimeNotificationService.sendNotification({
        userId: order.user_id,
        recipientId: order.user_id,
        type: "driver_departure",
        title: "Driver En Route to Kitchen",
        message: `Driver is on the way to kitchen for Order ${order.order_number}`,
        priority: "medium",
        orderId: order.id,
      });
    }

    return assignment;
  },

  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  async checkProximityAndNotify(
    assignmentId: string,
    currentLat: number,
    currentLng: number
  ): Promise<void> {
    try {
      const { data: assignment, error: assignmentError } = await supabase
        .from("driver_assignments")
        .select("id, order_id, status")
        .eq("id", assignmentId)
        .single();

      if (assignmentError || !assignment || !assignment.order_id) {
        if (assignmentError) console.error("Error fetching assignment for proximity check:", assignmentError.message);
        return;
      }

      type OrderLocation = {
        id: string;
        user_id: string | null;
        client_id: string | null;
        venue_lat: number | null;
        venue_lng: number | null;
        venue_address: string | null;
      };

      // Fetch as an array to avoid .single() type inference issue
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id, user_id, client_id, venue_lat, venue_lng, venue_address")
        .eq("id", assignment.order_id)
        .limit(1);

      if (orderError || !orderData || orderData.length === 0) {
        if(orderError) console.error("Error fetching order for proximity check:", orderError?.message);
        return;
      }

      const order = orderData[0] as OrderLocation;

      if (!order.venue_lat || !order.venue_lng) return;

      const distance = this.calculateDistance(
        currentLat,
        currentLng,
        order.venue_lat,
        order.venue_lng
      );

      const distanceInMeters = distance * 1000;

      if (distanceInMeters <= 50 && assignment.status !== "arrived") {
        await this.markArrived(assignmentId);

        await realtimeNotificationService.sendNotification({
          userId: order.user_id!,
          recipientId: order.client_id || order.user_id!,
          type: "driver_arrived",
          title: "Driver Has Arrived! 🎉",
          message: `Your driver has arrived at ${order.venue_address}. Food delivery in progress!`,
          priority: "high",
          orderId: order.id,
        });
      }

      const estimatedMinutes = (distance / 40) * 60;

      if (estimatedMinutes <= 10 && estimatedMinutes > 8 && assignment.status === "in_transit") {
        const { count, error: checkError } = await supabase
          .from("notifications")
          .select("id", { count: 'exact', head: true })
          .eq("order_id", order.id)
          .eq("notification_type", "driver_10_minutes_away")
          .limit(1);

        if (checkError) {
          console.error("Error checking for existing notification:", checkError);
          return;
        }

        if (count === 0) {
          await realtimeNotificationService.sendNotification({
            userId: order.user_id!,
            recipientId: order.client_id || order.user_id!,
            type: "driver_10_minutes_away",
            title: "Driver 10 Minutes Away ⏰",
            message: `Your driver is approximately 10 minutes from ${order.venue_address}. Please be ready to receive your delivery!`,
            priority: "high",
            orderId: order.id,
          });
        }
      }
    } catch (error) {
      console.error("Error in proximity check:", error);
    }
  }
};
