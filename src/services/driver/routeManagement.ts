import { supabase } from "@/integrations/supabase/client";

/**
 * Driver Route Management Module
 * Handles route creation, optimization, and stop management
 */

export interface RouteStop {
  id: string;
  orderId: string;
  address: string;
  latitude: number;
  longitude: number;
  sequence: number;
  estimatedArrival: string;
  status: "pending" | "arrived" | "completed" | "skipped";
}

export interface DeliveryRoute {
  id: string;
  driverId: string;
  date: string;
  stops: RouteStop[];
  status: "planned" | "in_progress" | "completed";
  totalDistance?: number;
  estimatedDuration?: number;
}

/**
 * Create a new delivery route
 */
export async function createDeliveryRoute(
  driverId: string,
  companyId: string,
  date: string,
  orderIds: string[]
): Promise<{ success: boolean; route?: DeliveryRoute; error?: string }> {
  try {
    // Create the route
    const { data: route, error: routeError } = await supabase
      .from("delivery_routes")
      .insert({
        driver_id: driverId,
        company_id: companyId,
        route_date: date,
        status: "planned",
      })
      .select()
      .single();

    if (routeError) throw routeError;

    // Add stops for each order
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, venue_address")
        .in("id", orderIds);

      const stops = orders?.map((order: any, index) => ({
        route_id: route.id,
        order_id: order.id,
        stop_address: order.venue_address,
        latitude: order.venue_latitude || -26.1076, // Fallback latitude
        longitude: order.venue_longitude || 28.0567, // Fallback longitude
        sequence_number: index + 1,
        status: "pending",
      }));

      const { error: stopsError } = await supabase
        .from("delivery_route_stops")
        .insert(stops || []);

      if (stopsError) throw stopsError;
    }

    return { success: true, route: route as any };
  } catch (error: any) {
    console.error("Error creating delivery route:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get routes for a specific driver
 */
export async function getDriverRoutes(
  driverId: string,
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; routes?: DeliveryRoute[]; error?: string }> {
  try {
    let query = supabase
      .from("delivery_routes")
      .select(`
        *,
        stops:delivery_route_stops(
          id,
          order_id,
          stop_address,
          latitude,
          longitude,
          sequence_number,
          status,
          estimated_arrival_time
        )
      `)
      .eq("driver_id", driverId)
      .order("route_date", { ascending: false });

    if (startDate) query = query.gte("route_date", startDate);
    if (endDate) query = query.lte("route_date", endDate);

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, routes: data as any };
  } catch (error: any) {
    console.error("Error fetching driver routes:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Update route stop status
 */
export async function updateStopStatus(
  stopId: string,
  status: "pending" | "arrived" | "completed" | "skipped",
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("delivery_route_stops")
      .update({
        status,
        notes,
        updated_at: new Date().toISOString(),
        ...(status === "arrived" && { actual_arrival_time: new Date().toISOString() }),
        ...(status === "completed" && { completion_time: new Date().toISOString() }),
      })
      .eq("id", stopId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error updating stop status:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Optimize route stops using simple distance calculation
 */
export async function optimizeRoute(
  routeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get all stops for the route
    const { data: stops, error: stopsError } = await supabase
      .from("delivery_route_stops")
      .select("*")
      .eq("route_id", routeId)
      .order("sequence_number");

    if (stopsError) throw stopsError;
    if (!stops || stops.length === 0) return { success: true };

    // Simple optimization: nearest neighbor algorithm
    const optimized = [];
    let current = stops[0];
    optimized.push(current);
    const remaining = stops.slice(1);

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let minDistance = Number.MAX_VALUE;

      remaining.forEach((stop, index) => {
        const distance = calculateDistance(
          current.latitude,
          current.longitude,
          stop.latitude,
          stop.longitude
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = index;
        }
      });

      current = remaining[nearestIndex];
      optimized.push(current);
      remaining.splice(nearestIndex, 1);
    }

    // Update sequence numbers
    const updates = optimized.map((stop, index) =>
      supabase
        .from("delivery_route_stops")
        .update({ sequence_number: index + 1 })
        .eq("id", stop.id)
    );

    await Promise.all(updates);

    return { success: true };
  } catch (error: any) {
    console.error("Error optimizing route:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}