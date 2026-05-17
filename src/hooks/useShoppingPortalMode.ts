/**
 * useShoppingPortalMode -- Wave 70.29
 *
 * Detects which phase of the day the shopping team is in, based on
 * four signals queried from the tenant's data:
 *
 *   1. Shortfall items in the 7-day outlook
 *   2. Upcoming events in the next 48h (confirmed orders)
 *   3. Active shopping_list rows (draft / in_progress / pending)
 *   4. Today's completed lists missing receipts
 *
 * Modes (priority order, first match wins):
 *
 *   run        -- a shopping_list is in_progress / pending right
 *                 now. The shopper is physically out buying.
 *   reconcile  -- no active list, but today's completed list(s) have
 *                 receipts to file. End-of-day admin window.
 *   plan       -- no active list, no unfiled receipts, BUT there
 *                 are shortfall items or events in the next 48h.
 *                 Morning planning window.
 *   quiet      -- none of the above. Catch up on suppliers /
 *                 inventory / etc.
 *
 * Manual override: sessionStorage-scoped, same pattern as kitchen /
 * cleaning. Owner doing end-of-day deep reconcile when the
 * auto-detector says quiet can lock the mode for the session.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalISO } from "@/lib/localDate";

export type ShoppingPortalMode = "quiet" | "plan" | "run" | "reconcile";

export interface ShoppingPortalModeState {
  mode: ShoppingPortalMode;
  autoMode: ShoppingPortalMode;
  override: ShoppingPortalMode | null;
  /** Count of shortfall items in the 7-day outlook. */
  shortfallCount: number;
  /** Count of confirmed orders in the next 48h. */
  upcomingEvents48h: number;
  /** Count of active shopping_list rows. */
  activeLists: number;
  /** Count of today's completed lists missing receipts. */
  unfiledReceiptsToday: number;
  loading: boolean;
  setOverride: (mode: ShoppingPortalMode | null) => void;
  refresh: () => void;
}

const SESSION_KEY = "shoppingPortalMode:override";
const REFRESH_MS = 60_000;

function readOverride(): ShoppingPortalMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    if (v === "quiet" || v === "plan" || v === "run" || v === "reconcile") return v;
  } catch { /* ignore */ }
  return null;
}

function writeOverride(v: ShoppingPortalMode | null) {
  if (typeof window === "undefined") return;
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

function computeAutoMode(
  activeLists: number,
  unfiledReceiptsToday: number,
  shortfallCount: number,
  upcomingEvents48h: number,
): ShoppingPortalMode {
  if (activeLists > 0) return "run";
  if (unfiledReceiptsToday > 0) return "reconcile";
  if (shortfallCount > 0 || upcomingEvents48h > 0) return "plan";
  return "quiet";
}

export function useShoppingPortalMode(): ShoppingPortalModeState {
  const { user } = useAuth();
  const companyId = (user as { company_id?: string } | null)?.company_id;
  const userId = (user as { id?: string } | null)?.id;

  const [shortfallCount, setShortfallCount] = useState(0);
  const [upcomingEvents48h, setUpcomingEvents48h] = useState(0);
  const [activeLists, setActiveLists] = useState(0);
  const [unfiledReceiptsToday, setUnfiledReceiptsToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [override, setOverrideState] = useState<ShoppingPortalMode | null>(() => readOverride());
  const [refreshTick, setRefreshTick] = useState(0);

  const fetchSignals = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const todayIso = toLocalISO(new Date());
      const in48h = toLocalISO(new Date(Date.now() + 2 * 86400000));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [shortRes, eventsRes, activeRes, unfiledRes] = await Promise.all([
        sb
          .from("inventory_demand_outlook")
          .select("inventory_item_id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "shortfall"),
        sb
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("event_date", todayIso)
          .lte("event_date", in48h)
          .in("status", ["confirmed", "preparing", "ready"]),
        // Wave 70.30: prefer lists owned by the current shopper
        // (one-shopper-per-tenant dominant case). Falls back to
        // unassigned lists when no personal list exists.
        userId
          ? sb
              .from("shopping_lists")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .in("status", ["draft", "pending", "in_progress", "shopping"])
              .or(`shopper_id.eq.${userId},shopper_id.is.null`)
          : sb
              .from("shopping_lists")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .in("status", ["draft", "pending", "in_progress", "shopping"]),
        sb
          .from("shopping_lists")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "completed")
          .gte("list_date", todayIso)
          .lte("list_date", todayIso)
          .is("receipt_url", null),
      ]);

      setShortfallCount(shortRes?.count || 0);
      setUpcomingEvents48h(eventsRes?.count || 0);
      setActiveLists(activeRes?.count || 0);
      setUnfiledReceiptsToday(unfiledRes?.count || 0);
    } catch {
      // Silent fail -- mode defaults to "quiet" via the zeros.
    } finally {
      setLoading(false);
    }
  }, [companyId, userId]);

  useEffect(() => {
    void fetchSignals();
  }, [fetchSignals, refreshTick]);

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
    () => computeAutoMode(activeLists, unfiledReceiptsToday, shortfallCount, upcomingEvents48h),
    [activeLists, unfiledReceiptsToday, shortfallCount, upcomingEvents48h],
  );

  const setOverride = (v: ShoppingPortalMode | null) => {
    setOverrideState(v);
    writeOverride(v);
  };

  const refresh = () => setRefreshTick((t) => t + 1);

  return {
    mode: override || autoMode,
    autoMode,
    override,
    shortfallCount,
    upcomingEvents48h,
    activeLists,
    unfiledReceiptsToday,
    loading,
    setOverride,
    refresh,
  };
}
