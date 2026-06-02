/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { updateDriverLocation } from "@/services/driver/gpsTracking";

/**
 * Phase 2 #11: Wake Lock keeps the device screen on while the
 * driver has at least one active job, so the foreground GPS pinger
 * keeps writing location updates instead of going silent the moment
 * the screen times out. Returns null on devices that don't support
 * the Wake Lock API (Safari < 16.4, very old Chrome) - those drivers
 * just get the screen-on default behaviour.
 *
 * True background tracking via a service worker is a larger piece of
 * work (PWA install + periodic background sync, Chrome-only). Wake
 * Lock covers the realistic catering case: driver opens portal,
 * starts route, screen stays on, pings keep flowing for the duration
 * of the delivery.
 */
async function requestWakeLock(): Promise<any | null> {
  try {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return null;
    const lock = await (navigator as any).wakeLock.request("screen");
    return lock;
  } catch (e) {
    // Permission denied or feature gated. Best-effort only.
    return null;
  }
}

/**
 * Drip-feeds the active driver's GPS position to driver_locations +
 * gps_tracking while they have at least one active job. Dispatch can
 * then watch a live pin on the map and the client-portal tracking
 * link has fresh coords without the driver having to remember to tap
 * "start tracking" on the legacy DriverGPSTracker component.
 *
 * Why a hook + not a service worker: the driver portal is a PWA
 * that's usually open in the foreground while they're on a job. A
 * silent watchPosition + throttled write is enough today and avoids
 * the background-permission song-and-dance that kills install rates.
 * If we later add a true background tracker, this hook stays as the
 * foreground fallback.
 *
 * Args:
 *   driverId        - profiles.id of the logged-in driver. Pings are
 *                     no-op until this is set.
 *   activeOrderIds  - list of order_ids the driver is currently on.
 *                     The first one is forwarded to gps_tracking.order_id
 *                     so the breadcrumb is associated with a job. The
 *                     pinger only runs while this list is non-empty --
 *                     a driver sitting at home doesn't burn battery.
 *   intervalMs      - throttle floor between writes. Default 30s; the
 *                     browser fires watchPosition far more often than
 *                     that on a moving vehicle, and we don't need 1Hz
 *                     fidelity for dispatch ETAs.
 *
 * Returns a status object so the dashboard can show a "Tracking
 * active" badge without re-implementing the geolocation plumbing.
 */
export function useDriverGPSPing(
  driverId: string | null | undefined,
  activeOrderIds: string[],
  intervalMs: number = 30_000,
) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [wakeLockHeld, setWakeLockHeld] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef<number>(0);
  const wakeLockRef = useRef<any | null>(null);

  // Stable string key for the activeOrderIds array so the effect doesn't
  // teardown + re-mount on every parent re-render that produces a new
  // array reference with the same contents.
  const activeKey = activeOrderIds.join(",");

  useEffect(() => {
    if (!driverId) return;
    if (!activeKey) {
      setIsTracking(false);
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLastError("Geolocation unsupported on this device");
      return;
    }

    setIsTracking(true);
    setLastError(null);

    const orderIds = activeKey.split(",").filter(Boolean);
    const primaryOrderId = orderIds[0] || undefined;

    // Phase 2 #11: keep the screen awake while the watcher is active.
    // The Wake Lock auto-releases when the tab goes hidden (browser
    // contract), so we re-request it on visibilitychange to survive
    // a phone-in-pocket moment where the tab gets backgrounded then
    // foregrounded again.
    const acquireLock = async () => {
      if (wakeLockRef.current) return;
      const lock = await requestWakeLock();
      if (!lock) return;
      wakeLockRef.current = lock;
      setWakeLockHeld(true);
      lock.addEventListener?.("release", () => {
        wakeLockRef.current = null;
        setWakeLockHeld(false);
      });
    };
    void acquireLock();
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void acquireLock();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastWriteRef.current < intervalMs) return;
        lastWriteRef.current = now;

        try {
          const res = await updateDriverLocation(
            driverId,
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? undefined,
              heading: position.coords.heading ?? undefined,
              speed: position.coords.speed ?? undefined,
            },
            primaryOrderId,
          );
          if (!res.success && res.error) {
            setLastError(res.error);
          } else {
            setLastPingAt(now);
          }
        } catch (e: any) {
          setLastError(e?.message || "ping_failed");
        }
      },
      (err) => {
        // PERMISSION_DENIED=1 means the driver refused - there's no
        // point retrying. Other errors (POSITION_UNAVAILABLE / TIMEOUT)
        // resolve themselves on the next fix, so we leave the watcher
        // running and just surface the latest message.
        setLastError(err.message || `geolocation error code ${err.code}`);
        if (err.code === 1 && watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setIsTracking(false);
        }
      },
      {
        enableHighAccuracy: true,
        // High accuracy + a long maximumAge is fine - we want the
        // most-recent fix the OS has, even if it's a few seconds old.
        maximumAge: 10_000,
        timeout: 30_000,
      },
    );

    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release?.(); } catch { /* ignore */ }
        wakeLockRef.current = null;
        setWakeLockHeld(false);
      }
      setIsTracking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, activeKey, intervalMs]);

  return { isTracking, lastError, lastPingAt, wakeLockHeld };
}
