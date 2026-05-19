/**
 * useDriverTripTimer - elapsed-time tracker for the driver routes
 * trip flow.
 *
 * Bobby's brief: when the driver hits Start Trip they want to SEE
 * the trip running - a visible elapsed timer plus the ability to
 * pause (saves accumulated time) or cancel (zeros the clock back
 * to start fresh).
 *
 * State persists in localStorage keyed by driverId so a phone lock
 * or page reload doesn't lose the clock. The route-signature guard
 * stops a stale timer from leaking onto a new set of claimed stops.
 *
 * Pure UX: this doesn't write to the DB. The order status flips
 * (startJob -> in_transit, completeJob -> delivered) are handled
 * by the caller; the timer is purely informational so the driver
 * can see "trip running for 23 min".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface TripState {
  /** Wall-clock when Start Trip was first tapped. */
  startedAtMs: number;
  /** Wall-clock when the current pause began, or null if running. */
  pausedAtMs: number | null;
  /** Sum of completed pause windows in ms. */
  accumulatedPauseMs: number;
  /** Hash of the route stops at start so a different route doesn't
   *  inherit the prior trip's clock. */
  routeSignature: string;
}

export interface UseDriverTripTimerResult {
  /** True when Start has been called and Cancel hasn't. */
  isActive: boolean;
  /** True when the timer is currently paused (still active, not ticking). */
  isPaused: boolean;
  /** Live elapsed milliseconds (excluding paused windows). */
  elapsedMs: number;
  /** Human "Xh Ym" or "Ym Ss" string. */
  elapsedLabel: string;
  start: () => void;
  pause: () => void;
  resume: () => void;
  /** Wipes the trip - clock back to 0, isActive=false. */
  cancel: () => void;
  /** Marks the trip complete without wiping - sticks at the final
   *  elapsed value so the driver can still see the totals. */
  stop: () => void;
}

function storageKey(driverId: string): string {
  return `cateringms:driver-trip-${driverId}`;
}

function signatureOf(stopIds: string[]): string {
  // Sort so order-of-stops changes (route reoptimised) don't
  // invalidate a running trip. The signature only changes when a
  // different SET of stops is in play.
  return [...stopIds].sort().join(",");
}

function readState(driverId: string | null | undefined): TripState | null {
  if (!driverId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(driverId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TripState;
    if (
      typeof parsed.startedAtMs !== "number" ||
      typeof parsed.accumulatedPauseMs !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeState(driverId: string, next: TripState | null) {
  if (typeof window === "undefined") return;
  if (next === null) {
    window.localStorage.removeItem(storageKey(driverId));
    return;
  }
  window.localStorage.setItem(storageKey(driverId), JSON.stringify(next));
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return "0m 0s";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function useDriverTripTimer(
  driverId: string | null | undefined,
  stopIds: string[],
): UseDriverTripTimerResult {
  const sig = useMemo(() => signatureOf(stopIds), [stopIds]);
  const [state, setState] = useState<TripState | null>(() => readState(driverId));
  // Force re-render every second while the timer is running so the
  // label updates live. We hold a single tick counter rather than
  // a window setInterval inside React state to keep the logic
  // testable and to avoid stale-closure pitfalls.
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate from localStorage when the driverId resolves.
  useEffect(() => {
    setState(readState(driverId));
  }, [driverId]);

  // If the route signature changed AND there's a live trip, treat
  // the prior trip as stale and wipe it. The new route deserves a
  // fresh clock - the driver shouldn't see "running for 4h" because
  // they claimed a new job after yesterday's run.
  useEffect(() => {
    if (!driverId || !state) return;
    if (state.routeSignature && state.routeSignature !== sig) {
      writeState(driverId, null);
      setState(null);
    }
  }, [driverId, sig, state]);

  // Live tick loop only when running.
  useEffect(() => {
    const running = state !== null && state.pausedAtMs === null;
    if (!running) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [state]);

  // Derive elapsed off the persisted state. Reading tick keeps the
  // memo cache from sticking when the driver hasn't paused.
  const elapsedMs = useMemo(() => {
    if (!state) return 0;
    void tick;
    const now = Date.now();
    const endRef = state.pausedAtMs ?? now;
    const raw = endRef - state.startedAtMs - state.accumulatedPauseMs;
    return Math.max(0, raw);
  }, [state, tick]);

  const start = useCallback(() => {
    if (!driverId) return;
    const next: TripState = {
      startedAtMs: Date.now(),
      pausedAtMs: null,
      accumulatedPauseMs: 0,
      routeSignature: sig,
    };
    writeState(driverId, next);
    setState(next);
  }, [driverId, sig]);

  const pause = useCallback(() => {
    if (!driverId) return;
    setState((prev) => {
      if (!prev || prev.pausedAtMs !== null) return prev;
      const next: TripState = { ...prev, pausedAtMs: Date.now() };
      writeState(driverId, next);
      return next;
    });
  }, [driverId]);

  const resume = useCallback(() => {
    if (!driverId) return;
    setState((prev) => {
      if (!prev || prev.pausedAtMs === null) return prev;
      const pausedFor = Date.now() - prev.pausedAtMs;
      const next: TripState = {
        ...prev,
        pausedAtMs: null,
        accumulatedPauseMs: prev.accumulatedPauseMs + Math.max(0, pausedFor),
      };
      writeState(driverId, next);
      return next;
    });
  }, [driverId]);

  const cancel = useCallback(() => {
    if (!driverId) return;
    writeState(driverId, null);
    setState(null);
  }, [driverId]);

  const stop = useCallback(() => {
    if (!driverId) return;
    setState((prev) => {
      if (!prev) return prev;
      // Freeze at current elapsed: setting pausedAtMs to now turns
      // the live tick off without zeroing the totals.
      const next: TripState = {
        ...prev,
        pausedAtMs: prev.pausedAtMs ?? Date.now(),
      };
      writeState(driverId, next);
      return next;
    });
  }, [driverId]);

  return {
    isActive: state !== null,
    isPaused: state !== null && state.pausedAtMs !== null,
    elapsedMs,
    elapsedLabel: formatElapsed(elapsedMs),
    start,
    pause,
    resume,
    cancel,
    stop,
  };
}
