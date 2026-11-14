import type { SupabaseClient } from "@supabase/supabase-js";

type GpsPoint = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  timestamp: string | null;
};

export type DriverTripDistance = {
  distanceKm: number | null;
  status: "complete" | "partial" | "not_available";
  acceptedPoints: number;
};

const MAX_ACCURACY_METERS = 60;
const MAX_GAP_MS = 3 * 60 * 1000;
const MAX_SPEED_KMH = 160;
const MIN_MOVEMENT_KM = 0.008;

function haversineKm(a: GpsPoint, b: GpsPoint): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = Number(a.latitude);
  const lat2 = Number(b.latitude);
  const dLat = radians(lat2 - lat1);
  const dLng = radians(Number(b.longitude) - Number(a.longitude));
  const curve = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(curve), Math.sqrt(1 - curve));
}

/**
 * Sum only plausible GPS segments captured during one driver timer. Poor
 * accuracy fixes, stationary noise, long outages, and impossible jumps are
 * excluded so a bad phone fix cannot inflate a driver's paid mileage.
 */
export function calculateDriverTripDistance(
  rawPoints: GpsPoint[],
  startedAt: string | null,
  endedAt: string,
): DriverTripDistance {
  const startMs = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(endMs)) return { distanceKm: null, status: "not_available", acceptedPoints: 0 };

  const points = rawPoints
    .filter((point) => {
      const lat = Number(point.latitude);
      const lng = Number(point.longitude);
      const at = point.timestamp ? new Date(point.timestamp).getTime() : Number.NaN;
      const accuracy = Number(point.accuracy);
      return Number.isFinite(lat) && lat >= -90 && lat <= 90
        && Number.isFinite(lng) && lng >= -180 && lng <= 180
        && Number.isFinite(at) && at <= endMs
        && (!Number.isFinite(startMs) || at >= startMs)
        && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= MAX_ACCURACY_METERS;
    })
    .sort((a, b) => new Date(a.timestamp as string).getTime() - new Date(b.timestamp as string).getTime());

  if (points.length < 2) {
    return { distanceKm: null, status: points.length ? "partial" : "not_available", acceptedPoints: points.length };
  }

  let distanceKm = 0;
  let hasGap = false;
  let acceptedSegments = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousMs = new Date(previous.timestamp as string).getTime();
    const currentMs = new Date(current.timestamp as string).getTime();
    const gapMs = currentMs - previousMs;
    if (gapMs <= 0) continue;
    if (gapMs > MAX_GAP_MS) {
      hasGap = true;
      continue;
    }
    const segmentKm = haversineKm(previous, current);
    const speedKmh = segmentKm / (gapMs / 3_600_000);
    if (!Number.isFinite(segmentKm) || speedKmh > MAX_SPEED_KMH) continue;
    if (segmentKm >= MIN_MOVEMENT_KM) distanceKm += segmentKm;
    acceptedSegments += 1;
  }

  const firstMs = new Date(points[0].timestamp as string).getTime();
  const lastMs = new Date(points[points.length - 1].timestamp as string).getTime();
  const edgesCovered = Number.isFinite(startMs)
    && firstMs - startMs <= 5 * 60 * 1000
    && endMs - lastMs <= 5 * 60 * 1000;
  const status = acceptedSegments > 0 && !hasGap && edgesCovered ? "complete" : "partial";
  return {
    distanceKm: Number(distanceKm.toFixed(2)),
    status,
    acceptedPoints: points.length,
  };
}

export async function getDriverTripDistance(
  client: SupabaseClient<any> | any,
  trip: { shiftId: string; driverId: string; startedAt: string | null; endedAt: string },
): Promise<DriverTripDistance> {
  const { data, error } = await client
    .from("gps_tracking")
    .select("latitude, longitude, accuracy, timestamp")
    .eq("driver_shift_id", trip.shiftId)
    .eq("driver_id", trip.driverId)
    .gte("timestamp", trip.startedAt || trip.endedAt)
    .lte("timestamp", trip.endedAt)
    .order("timestamp", { ascending: true });
  if (error) {
    console.warn("[tripDistance] GPS samples could not be loaded:", error);
    return { distanceKm: null, status: "not_available", acceptedPoints: 0 };
  }
  return calculateDriverTripDistance((data || []) as GpsPoint[], trip.startedAt, trip.endedAt);
}
