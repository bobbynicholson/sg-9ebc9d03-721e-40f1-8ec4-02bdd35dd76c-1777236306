import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateDriverLocation, type ActiveDriverTrip } from "@/services/driver/gpsTracking";

function driverTripErrorMessage(message?: string | null) {
  const text = String(message || "");
  if (
    /column .* does not exist/i.test(text)
    && /driver_assignment_id|service_sitting_id|assignment_type|gps_trip_duration_minutes|driver_shift_id/.test(text)
  ) {
    return "Driver GPS attribution needs database migration 20261114180000_driver_gps_trip_attribution.sql. Apply the pending Supabase migrations to enable trip tracking.";
  }
  return text || "The active driver timer could not be read.";
}

async function requestWakeLock(): Promise<any | null> {
  try {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return null;
    return await (navigator as any).wakeLock.request("screen");
  } catch {
    return null;
  }
}

/** Track GPS only for the driver's currently open order-specific timer. */
export function useDriverGPSPing(
  driverId: string | null | undefined,
  intervalMs = 30_000,
) {
  const [activeTrip, setActiveTrip] = useState<ActiveDriverTrip | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [wakeLockHeld, setWakeLockHeld] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const wakeLockRef = useRef<any | null>(null);

  // Poll the open shift so starting or stopping the normal driver timer
  // automatically starts or stops the GPS watcher on Android and iOS.
  useEffect(() => {
    if (!driverId) {
      setActiveTrip(null);
      return;
    }
    let cancelled = false;
    const loadActiveTrip = async () => {
      const { data, error } = await (supabase as any)
        .from("driver_shifts")
        .select("id, order_id, driver_assignment_id, service_sitting_id, assignment_type, actual_start")
        .eq("driver_id", driverId)
        .eq("source", "auto")
        .eq("status", "active")
        .not("order_id", "is", null)
        .is("actual_end", null)
        .is("deleted_at", null)
        .order("actual_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setLastError(driverTripErrorMessage(error.message));
        setActiveTrip(null);
        return;
      }
      if (!data) setLastError(null);
      const nextTrip: ActiveDriverTrip | null = data ? {
        shiftId: data.id,
        orderId: data.order_id,
        driverAssignmentId: data.driver_assignment_id || null,
        serviceSittingId: data.service_sitting_id || null,
        assignmentType: data.assignment_type === "collection" ? "collection" : "delivery",
        startedAt: data.actual_start || null,
      } : null;
      setActiveTrip((current) => current?.shiftId === nextTrip?.shiftId
        && current?.orderId === nextTrip?.orderId
        && current?.driverAssignmentId === nextTrip?.driverAssignmentId
        && current?.serviceSittingId === nextTrip?.serviceSittingId
        && current?.assignmentType === nextTrip?.assignmentType
        && current?.startedAt === nextTrip?.startedAt
        ? current
        : nextTrip);
    };
    void loadActiveTrip();
    const pollId = setInterval(() => void loadActiveTrip(), 12_000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [driverId]);

  const tripKey = activeTrip
    ? `${activeTrip.shiftId}:${activeTrip.orderId}:${activeTrip.driverAssignmentId || ""}`
    : "";

  useEffect(() => {
    if (!driverId || !activeTrip || !tripKey) {
      setIsTracking(false);
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release?.(); } catch { /* best effort */ }
        wakeLockRef.current = null;
        setWakeLockHeld(false);
      }
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLastError("Location is unavailable on this device.");
      return;
    }

    let stopped = false;
    lastWriteRef.current = 0;
    setIsTracking(true);
    setLastError(null);
    const trip = activeTrip;
    const acquireWakeLock = async () => {
      if (wakeLockRef.current) return;
      const lock = await requestWakeLock();
      if (!lock || stopped) return;
      wakeLockRef.current = lock;
      setWakeLockHeld(true);
      lock.addEventListener?.("release", () => {
        wakeLockRef.current = null;
        setWakeLockHeld(false);
      });
    };
    void acquireWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastWriteRef.current < intervalMs) return;
        lastWriteRef.current = now;
        const result = await updateDriverLocation(driverId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? undefined,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
        }, trip);
        if (stopped) return;
        if (!result.success) setLastError(driverTripErrorMessage(result.error || "The GPS trip point could not be saved."));
        else {
          setLastError(null);
          setLastPingAt(now);
        }
      },
      (error) => {
        setLastError(error.message || "Location permission is needed while the trip timer runs.");
        if (error.code === 1 && watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setIsTracking(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );

    return () => {
      stopped = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release?.(); } catch { /* best effort */ }
        wakeLockRef.current = null;
        setWakeLockHeld(false);
      }
      setIsTracking(false);
    };
  }, [activeTrip, driverId, intervalMs, tripKey]);

  return { activeTrip, isTracking, lastError, lastPingAt, wakeLockHeld };
}
