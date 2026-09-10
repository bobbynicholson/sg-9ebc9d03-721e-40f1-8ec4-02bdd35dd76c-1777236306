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
 * Update driver's current location.
 *
 * Writes to two tables:
 *   - driver_locations: current state, driver_id PK, UPSERTed.
 *   - gps_tracking: append-only history log, INSERTed.
 *
 * P1-23 (2026-05 audit): the previous implementation upserted on
 * gps_tracking with onConflict("driver_id"), but driver_id wasn't
 * unique on that table - the schema split makes the "current
 * location" lookup a single-row PK read and stops the upsert from
 * fighting a non-existent constraint.
 */
export async function updateDriverLocation(
  driverId: string,
  location: GPSLocation,
  orderId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Resolve the driver's company_id once so the denormalised column
    // on driver_locations is correct (RLS keys off it).
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", driverId)
      .maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id ?? null;

    // Current-state UPSERT. driver_id is the PK so this is structurally
    // sound on retries.
    const { error: curErr } = await (supabase as any)
      .from("driver_locations")
      .upsert(
        {
          driver_id: driverId,
          company_id: companyId,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          heading: location.heading,
          speed: location.speed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "driver_id" },
      );
    if (curErr) throw curErr;

    // Append-only history. Failure here is non-fatal - "where is the
    // driver right now" still works without the trail row.
    const { error: histErr } = await supabase.from("gps_tracking").insert({
      driver_id: driverId,
      order_id: orderId ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      heading: location.heading,
      speed: location.speed,
      timestamp: new Date().toISOString(),
    });
    if (histErr) console.warn("[gpsTracking] history insert failed (non-fatal):", histErr);

    return { success: true };
  } catch (error: any) {
    console.error("Error updating driver location:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get driver's current location. Reads driver_locations (single-row
 * PK lookup) instead of scanning gps_tracking history.
 */
export async function getDriverLocation(
  driverId: string,
): Promise<{ success: boolean; location?: GPSLocation; error?: string }> {
  try {
    const { data, error } = await (supabase as any)
      .from("driver_locations")
      .select("latitude, longitude, accuracy, heading, speed")
      .eq("driver_id", driverId)
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

    // Estimate ETA. `location.speed` originates from the W3C
    // Geolocation API (position.coords.speed), which reports METERS PER
    // SECOND - the UI shows it as km/h via *3.6. distance is in km, so
    // convert speed to km/h before dividing, else a driver doing 10 m/s
    // (36 km/h) is treated as 10 km/h and the ETA comes out ~3.6x too
    // long. Fall back to 40 km/h when speed is missing or effectively
    // stationary (< ~1.8 km/h) so a red light doesn't blow up the ETA.
    const speedKmh = location.speed && location.speed > 0.5 ? location.speed * 3.6 : 40;
    const eta = (distance / speedKmh) * 60; // in minutes

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