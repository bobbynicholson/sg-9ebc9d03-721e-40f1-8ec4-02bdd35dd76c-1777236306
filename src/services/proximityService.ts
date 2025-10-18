import { supabase } from "@/integrations/supabase/client";
import { realtimeNotificationService } from "./realtimeNotificationService";

interface SimpleOrder {
  id: string;
  user_id: string | null;
  client_id: string | null;
  company_id: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_address: string | null;
}

async function markArrived(assignmentId: string): Promise<any | null> {
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
        .select("user_id, company_id")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await realtimeNotificationService.createNotification({
          company_id: orderDetails.company_id,
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
}


function calculateDistance(
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
}

async function checkProximityAndNotify(
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

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id, user_id, client_id, company_id, venue_lat, venue_lng, venue_address")
      .eq("id", assignment.order_id)
      .limit(1);

    if (orderError || !orderData || orderData.length === 0) {
      if(orderError) console.error("Error fetching order for proximity check:", orderError?.message);
      return;
    }

    const order = orderData[0] as SimpleOrder;

    if (!order.venue_lat || !order.venue_lng) return;

    const distance = calculateDistance(
      currentLat,
      currentLng,
      order.venue_lat,
      order.venue_lng
    );

    const distanceInMeters = distance * 1000;

    if (distanceInMeters <= 50 && assignment.status !== "arrived") {
      await markArrived(assignmentId);

      if (order.user_id && order.company_id) {
        await realtimeNotificationService.createNotification({
          company_id: order.company_id,
          user_id: order.user_id,
          recipient_id: order.client_id || order.user_id,
          notification_type: "driver_arrived",
          title: "Driver Has Arrived! 🎉",
          message: `Your driver has arrived at ${order.venue_address}. Food delivery in progress!`,
          priority: "high",
          link: `/orders/${order.id}`,
        });
      }
    }

    const estimatedMinutes = (distance / 40) * 60;

    if (estimatedMinutes <= 10 && estimatedMinutes > 8 && assignment.status === "in_transit") {
      const { count, error: checkError } = await (supabase as any)
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
          if(order.user_id && order.company_id){
             await realtimeNotificationService.createNotification({
                company_id: order.company_id,
                user_id: order.user_id,
                recipient_id: order.client_id || order.user_id,
                notification_type: "driver_10_minutes_away",
                title: "Driver 10 Minutes Away ⏰",
                message: `Your driver is approximately 10 minutes from ${order.venue_address}. Please be ready to receive your delivery!`,
                priority: "high",
                link: `/orders/${order.id}`,
            });
          }
      }
    }
  } catch (error) {
    console.error("Error in proximity check:", error);
  }
}

export const proximityService = {
    checkProximityAndNotify,
};
