import { supabase } from "@/integrations/supabase/client";

/**
 * Driver GPS Tracking Module
 * Handles real-time location tracking and updates
 */

export interface GPSLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}

/**
 * Update driver's current location
 */
export async function updateDriverLocation(
  driverId: string,
  location: GPSLocation
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("gps_tracking")
      .upsert({
        driver_id: driverId,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        heading: location.heading,
        speed: location.speed,
        timestamp: new Date().toISOString(),
      }, {
        onConflict: "driver_id",
      });

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error updating driver location:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get driver's current location
 */
export async function getDriverLocation(
  driverId: string
): Promise<{ success: boolean; location?: GPSLocation; error?: string }> {
  try {
    // maybeSingle keeps the 'driver hasn't reported a location yet' case
    // from raising an error.
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("*")
      .eq("driver_id", driverId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return {
      success: true,
      location: data
        ? {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy || undefined,
            heading: data.heading || undefined,
            speed: data.speed || undefined,
          }
        : undefined,
    };
  } catch (error: any) {
    console.error("Error fetching driver location:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Track location history for a driver
 */
export async function getLocationHistory(
  driverId: string,
  startTime?: string,
  endTime?: string
): Promise<{ success: boolean; history?: GPSLocation[]; error?: string }> {
  try {
    let query = supabase
      .from("gps_tracking")
      .select("*")
      .eq("driver_id", driverId)
      .order("timestamp", { ascending: true });

    if (startTime) query = query.gte("timestamp", startTime);
    if (endTime) query = query.lte("timestamp", endTime);

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      history: data?.map((d) => ({
        latitude: d.latitude,
        longitude: d.longitude,
        accuracy: d.accuracy || undefined,
        heading: d.heading || undefined,
        speed: d.speed || undefined,
      })),
    };
  } catch (error: any) {
    console.error("Error fetching location history:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate ETA to destination
 */
export async function calculateETA(
  driverId: string,
  destinationLat: number,
  destinationLon: number
): Promise<{ success: boolean; eta?: number; distance?: number; error?: string }> {
  try {
    const { location } = await getDriverLocation(driverId);
    if (!location) {
      return { success: false, error: "Driver location not available" };
    }

    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      destinationLat,
      destinationLon
    );

    // Estimate ETA based on average speed (assume 40 km/h in city)
    const averageSpeed = location.speed || 40;
    const eta = (distance / averageSpeed) * 60; // in minutes

    return {
      success: true,
      eta: Math.round(eta),
      distance: Math.round(distance * 100) / 100,
    };
  } catch (error: any) {
    console.error("Error calculating ETA:", error);
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