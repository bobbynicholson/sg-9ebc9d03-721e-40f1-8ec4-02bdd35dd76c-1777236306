/**
 * usePortalServiceMode -- Wave 70.7
 *
 * Detects which "phase of the day" a service-oriented portal is in
 * based on the tenant's events for today. Returns a discriminator
 * the rest of the nav + portal UI can read to shift gears: bigger
 * tiles during service, warm tints, focused quick actions, mobile
 * FAB visibility.
 *
 * Built for the kitchen portal first (where the chef's day has a
 * clear prep -> service -> close arc) but kept portal-agnostic so
 * the driver / cleaning / shopping portals can use the same hook
 * with their own event-source query.
 *
 * Modes:
 *   off     -- no events today; portal is "between jobs"
 *   prep    -- events today but first event still > 1h away
 *   service -- first event_time - 1h <= now <= last event_time + 1h
 *   close   -- last event finished < 2h ago, give them a chance to
 *              wrap up before flipping to "off"
 *
 * The hook also supports a manual override (operator-driven) that
 * sticks for the browser session. Late-night prep for tomorrow's
 * 7am breakfast event should not get "off" treatment just because
 * the auto-detector says today has no more events.
 *
 * Performance: one tiny query per page load + a client-side ticker
 * that re-evaluates every 60s. No subscriptions, no polling churn.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PortalServiceMode = "off" | "prep" | "service" | "close";

export interface PortalServiceModeState {
  mode: PortalServiceMode;
  /** What the auto-detector says, ignoring any manual override. */
  autoMode: PortalServiceMode;
  /** Manual override active for this session, if any. */
  override: PortalServiceMode | null;
  /** Earliest event_time today (HH:mm), or null if none. */
  firstEventTime: string | null;
  /** Latest event_time today (HH:mm), or null if none. */
  lastEventTime: string | null;
  /** Number of events scheduled for today (visible to this portal). */
  todayEventCount: number;
  /** Minutes from now until the next event starts. Negative if past. null if none. */
  minutesToNextEvent: number | null;
  loading: boolean;
  /** Manually override the mode for this session. Pass null to clear. */
  setOverride: (mode: PortalServiceMode | null) => void;
  /** Force a refresh of the underlying event data. */
  refresh: () => void;
}

const SESSION_KEY = "portalServiceMode:override";

function readOverride(): PortalServiceMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    if (v === "off" || v === "prep" || v === "service" || v === "close") return v;
  } catch { /* ignore */ }
  return null;
}

function writeOverride(v: PortalServiceMode | null) {
  if (typeof window === "undefined") return;
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

/**
 * Compute the auto-mode from today's first + last event_time strings
 * and the current clock. event_time = null is treated as "12:00"
 * since most catering events default to lunch service.
 */
function computeAutoMode(
  now: Date,
  firstEventTime: string | null,
  lastEventTime: string | null,
  todayEventCount: number,
): PortalServiceMode {
  if (todayEventCount === 0) return "off";

  const parseHHmm = (s: string | null): number => {
    if (!s) return 12 * 60; // default 12:00 noon
    const [h, m] = s.slice(0, 5).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 12 * 60;
    return h * 60 + m;
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const firstMin = parseHHmm(firstEventTime);
  const lastMin = parseHHmm(lastEventTime);

  // Service window: first - 60 to last + 60
  if (nowMin >= firstMin - 60 && nowMin <= lastMin + 60) return "service";

  // Close window: last + 60 to last + 120
  if (nowMin > lastMin + 60 && nowMin <= lastMin + 180) return "close";

  // Otherwise prep (events scheduled, just not active yet)
  return "prep";
}

export function usePortalServiceMode(): PortalServiceModeState {
  const { user } = useAuth();
  const companyId = (user as any)?.company_id as string | undefined;

  const [todayEventCount, setTodayEventCount] = useState(0);
  const [firstEventTime, setFirstEventTime] = useState<string | null>(null);
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [override, setOverrideState] = useState<PortalServiceMode | null>(() => readOverride());
  const [now, setNow] = useState(() => new Date());
  const [refreshTick, setRefreshTick] = useState(0);

  // Re-evaluate mode every 60s. Cheap pure-client recompute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fetch today's events on mount + on refresh tick.
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const todayIso = new Date().toISOString().slice(0, 10);
        const { data } = await (supabase as any)
          .from("orders")
          .select("event_time")
          .eq("company_id", companyId)
          .eq("event_date", todayIso)
          .in("status", ["confirmed", "preparing", "ready", "in_transit"])
          .order("event_time", { ascending: true });
        if (cancelled) return;
        const rows = (data || []) as Array<{ event_time: string | null }>;
        setTodayEventCount(rows.length);
        setFirstEventTime(rows[0]?.event_time || null);
        setLastEventTime(rows[rows.length - 1]?.event_time || null);
      } catch {
        // Silent fail -- mode falls back to "off" via the count.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshTick]);

  const autoMode = useMemo(
    () => computeAutoMode(now, firstEventTime, lastEventTime, todayEventCount),
    [now, firstEventTime, lastEventTime, todayEventCount],
  );

  const minutesToNextEvent = useMemo(() => {
    if (!firstEventTime || todayEventCount === 0) return null;
    const [h, m] = firstEventTime.slice(0, 5).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const eventMin = h * 60 + m;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return eventMin - nowMin;
  }, [firstEventTime, now, todayEventCount]);

  const setOverride = (v: PortalServiceMode | null) => {
    setOverrideState(v);
    writeOverride(v);
  };

  const refresh = () => setRefreshTick((t) => t + 1);

  return {
    mode: override || autoMode,
    autoMode,
    override,
    firstEventTime,
    lastEventTime,
    todayEventCount,
    minutesToNextEvent,
    loading,
    setOverride,
    refresh,
  };
}
