/**
 * useCleaningPortalMode - Wave 70.28
 *
 * Detects which phase of the day the cleaning team is in, based on
 * three signals queried from the tenant's data:
 *
 *   1. Outbound orders for today (status in confirmed/preparing/
 *      ready/in_transit) - equipment going OUT
 *   2. Expected handovers within the next 4h (cleaning_event_handovers
 *      status='expected' with expected_at in window) - equipment
 *      coming BACK
 *   3. Active handovers (status='in_progress') - equipment being
 *      washed right now
 *
 * Modes (priority-ordered, first match wins):
 *
 *   returns   - expected handover due in next 4h OR an in-progress
 *                handover exists. The peak activity window.
 *   wrap      - no returns due in next 4h, no outbound today still
 *                in the field, BUT an in-progress handover exists.
 *                Effectively "last washes of the day".
 *   dispatch  - outbound equipment in the field today (orders not
 *                yet completed) OR equipment still on a non-today
 *                handover (multi-day events). No active returns.
 *   quiet     - none of the above. No events out, nothing returning,
 *                nothing being washed. Maintenance window.
 *
 * Manual override: sessionStorage-scoped, same pattern as
 * usePortalServiceMode. Cleaner doing late-night damage triage when
 * the auto-detector says "quiet" can lock the mode for the session.
 *
 * Performance: 3 head:exact counts per page load + 60s ticker.
 * Identical cost to kitchen's mode hook.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type CleaningPortalMode = "quiet" | "dispatch" | "returns" | "wrap";

export interface CleaningPortalModeState {
  mode: CleaningPortalMode;
  /** What the auto-detector says, ignoring any manual override. */
  autoMode: CleaningPortalMode;
  /** Manual override active for this session, if any. */
  override: CleaningPortalMode | null;
  /** Count of outbound orders today still in the field. */
  outboundToday: number;
  /** Count of expected handovers within the next 4h. */
  returnsDue: number;
  /** Count of in-progress handovers right now. */
  activeHandovers: number;
  /** ISO timestamp of the next expected return, if any. */
  nextReturnAt: string | null;
  loading: boolean;
  /** Manually override the mode for this session. Pass null to clear. */
  setOverride: (mode: CleaningPortalMode | null) => void;
  /** Force a refresh of the underlying signals. */
  refresh: () => void;
}

const SESSION_KEY = "cleaningPortalMode:override";
const REFRESH_MS = 60_000;
const RETURNS_HORIZON_HOURS = 4;

function readOverride(): CleaningPortalMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    if (v === "quiet" || v === "dispatch" || v === "returns" || v === "wrap") return v;
  } catch { /* ignore */ }
  return null;
}

function writeOverride(v: CleaningPortalMode | null) {
  if (typeof window === "undefined") return;
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

function computeAutoMode(
  outboundToday: number,
  returnsDue: number,
  activeHandovers: number,
): CleaningPortalMode {
  // returns wins - it's the most urgent surface
  if (returnsDue > 0 || activeHandovers > 0) {
    // Distinguish "active wash but no more incoming" (wrap) from
    // "incoming returns or peak wash" (returns).
    if (returnsDue === 0 && outboundToday === 0 && activeHandovers > 0) return "wrap";
    return "returns";
  }
  // Equipment in the field but nothing back yet - dispatch window
  if (outboundToday > 0) return "dispatch";
  return "quiet";
}

export function useCleaningPortalMode(): CleaningPortalModeState {
  const { user } = useAuth();
  const companyId = (user as { company_id?: string } | null)?.company_id;

  const [outboundToday, setOutboundToday] = useState(0);
  const [returnsDue, setReturnsDue] = useState(0);
  const [activeHandovers, setActiveHandovers] = useState(0);
  const [nextReturnAt, setNextReturnAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [override, setOverrideState] = useState<CleaningPortalMode | null>(() => readOverride());
  const [refreshTick, setRefreshTick] = useState(0);

  const fetchSignals = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const todayIso = nowIso.slice(0, 10);
      const horizon = new Date(Date.now() + RETURNS_HORIZON_HOURS * 3_600_000).toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [outboundRes, returnsRes, activeRes, nextRes] = await Promise.all([
        // Outbound today: orders for today still in the field
        sb
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("event_date", todayIso)
          .in("status", ["confirmed", "preparing", "ready", "in_transit"]),
        // Returns due in next 4h
        sb
          .from("cleaning_event_handovers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "expected")
          .lte("expected_at", horizon)
          .gte("expected_at", nowIso),
        // Active handovers being washed
        sb
          .from("cleaning_event_handovers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "in_progress"),
        // Next expected return (for the subline copy)
        sb
          .from("cleaning_event_handovers")
          .select("expected_at")
          .eq("company_id", companyId)
          .eq("status", "expected")
          .gte("expected_at", nowIso)
          .order("expected_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      setOutboundToday(outboundRes?.count || 0);
      setReturnsDue(returnsRes?.count || 0);
      setActiveHandovers(activeRes?.count || 0);
      setNextReturnAt((nextRes?.data?.expected_at as string | null) || null);
    } catch {
      // Silent fail - mode defaults to "quiet" via the zeros.
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchSignals();
  }, [fetchSignals, refreshTick]);

  // Periodic refresh + tab-focus refresh.
  useEffect(() => {
    const t = setInterval(() => { void fetchSignals(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchSignals]);

  useEffect(() => {
    const onFocus = () => { void fetchSignals(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchSignals]);

  const autoMode = useMemo(
    () => computeAutoMode(outboundToday, returnsDue, activeHandovers),
    [outboundToday, returnsDue, activeHandovers],
  );

  const setOverride = (v: CleaningPortalMode | null) => {
    setOverrideState(v);
    writeOverride(v);
  };

  const refresh = () => setRefreshTick((t) => t + 1);

  return {
    mode: override || autoMode,
    autoMode,
    override,
    outboundToday,
    returnsDue,
    activeHandovers,
    nextReturnAt,
    loading,
    setOverride,
    refresh,
  };
}
