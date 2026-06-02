/**
 * useAdminPortalMode - Wave 70.31
 *
 * Detects which phase of the day the admin / owner is in, based on
 * signals from the tenant's data:
 *
 *   1. Events today (orders today)
 *   2. Events in flight (in_transit count)
 *   3. New leads + overdue quotes (pipeline pressure)
 *   4. Onboarding completion (new tenant)
 *
 * Modes (priority-ordered, first match wins):
 *
 *   setup      - Tenant < 30 days old AND onboarding incomplete.
 *                 First-week / first-month state. Wins ONLY when
 *                 there's no real activity yet - once events start
 *                 happening, ops/pipeline/quiet take over even if
 *                 setup isn't done.
 *   ops        - Events today (event_date = today). Service hours.
 *                 Most urgent surface. Pulses.
 *   review     - No more events today (events all delivered) AND
 *                 the day is past 17:00. End-of-day money window.
 *   pipeline   - No events today, but quotes overdue OR new leads
 *                 unactioned. Sales-focus window.
 *   quiet      - None of the above. Maintenance / catch-up.
 *
 * Manual override: sessionStorage-scoped, same pattern as kitchen /
 * cleaning / shopping. Owner doing late-night strategy work can
 * lock the mode for the session.
 *
 * Performance: 4 small queries per page load + 60s ticker. Negligible.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { toLocalISO } from "@/lib/localDate";

export type AdminPortalMode = "setup" | "quiet" | "pipeline" | "ops" | "review";

export interface AdminPortalModeState {
  mode: AdminPortalMode;
  autoMode: AdminPortalMode;
  override: AdminPortalMode | null;
  /** Count of orders today (any non-cancelled status). */
  eventsToday: number;
  /** Count of orders currently in transit. */
  inTransitNow: number;
  /** Count of quotes in circulation > 48h. */
  quotesOverdue: number;
  /** True when companies.onboarding_completed_at is set. */
  onboardingComplete: boolean;
  /** Days since company creation. Drives the setup-mode window. */
  tenantAgeDays: number | null;
  loading: boolean;
  setOverride: (mode: AdminPortalMode | null) => void;
  refresh: () => void;
}

const SESSION_KEY = "adminPortalMode:override";
const REFRESH_MS = 60_000;
const SETUP_WINDOW_DAYS = 30;
const QUOTES_OVERDUE_HOURS = 48;

function readOverride(): AdminPortalMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    if (v === "setup" || v === "quiet" || v === "pipeline" || v === "ops" || v === "review") return v;
  } catch { /* ignore */ }
  return null;
}

function writeOverride(v: AdminPortalMode | null) {
  if (typeof window === "undefined") return;
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

function computeAutoMode(
  eventsToday: number,
  inTransitNow: number,
  quotesOverdue: number,
  onboardingComplete: boolean,
  tenantAgeDays: number | null,
  nowHour: number,
): AdminPortalMode {
  // Setup wins only for genuinely new tenants with no activity yet.
  // Once a tenant has events today, ops always wins regardless of
  // onboarding state - the day's reality matters more than tutorial
  // progress.
  if (eventsToday > 0 || inTransitNow > 0) return "ops";
  if (
    !onboardingComplete
    && tenantAgeDays !== null
    && tenantAgeDays <= SETUP_WINDOW_DAYS
  ) return "setup";
  // Review window: late afternoon onwards, no live ops.
  if (nowHour >= 17) return "review";
  if (quotesOverdue > 0) return "pipeline";
  return "quiet";
}

export function useAdminPortalMode(): AdminPortalModeState {
  const { user, profile } = useAuth();
  const companyId = ((profile as { company_id?: string } | null)?.company_id)
    || ((user as { company_id?: string } | null)?.company_id);
  const { regionFilterId } = useRegionFilter();

  const [eventsToday, setEventsToday] = useState(0);
  const [inTransitNow, setInTransitNow] = useState(0);
  const [quotesOverdue, setQuotesOverdue] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [tenantAgeDays, setTenantAgeDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [override, setOverrideState] = useState<AdminPortalMode | null>(() => readOverride());
  const [refreshTick, setRefreshTick] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // Re-evaluate the time-of-day part every minute for accurate
  // review-window detection (17:00 cutoff).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchSignals = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const todayIso = toLocalISO(new Date());
      const overdueCutoff = new Date(Date.now() - QUOTES_OVERDUE_HOURS * 3_600_000).toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const eventsQ = sb
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("event_date", todayIso)
        .neq("status", "cancelled");
      if (regionFilterId) eventsQ.eq("region_id", regionFilterId);

      const transitQ = sb
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "in_transit");
      if (regionFilterId) transitQ.eq("region_id", regionFilterId);

      const quotesQ = sb
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        // TIGHTEN I.75: only 'sent' is the live "awaiting reply" state;
        // viewed lives in viewed_at, not status.
        .in("status", ["sent"])
        .lt("sent_at", overdueCutoff);
      if (regionFilterId) quotesQ.eq("region_id", regionFilterId);

      const companyQ = sb
        .from("companies")
        .select("created_at, onboarding_completed_at")
        .eq("id", companyId)
        .maybeSingle();

      const [eventsRes, transitRes, quotesRes, companyRes] = await Promise.all([
        eventsQ, transitQ, quotesQ, companyQ,
      ]);

      setEventsToday(eventsRes?.count || 0);
      setInTransitNow(transitRes?.count || 0);
      setQuotesOverdue(quotesRes?.count || 0);

      const c = companyRes?.data as { created_at: string | null; onboarding_completed_at: string | null } | null;
      setOnboardingComplete(!!c?.onboarding_completed_at);
      if (c?.created_at) {
        const created = new Date(c.created_at).getTime();
        const ageMs = Date.now() - created;
        setTenantAgeDays(Math.floor(ageMs / 86400000));
      }
    } catch {
      // Silent fail - defaults preserve last-known mode.
    } finally {
      setLoading(false);
    }
  }, [companyId, regionFilterId]);

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
    () => computeAutoMode(
      eventsToday,
      inTransitNow,
      quotesOverdue,
      onboardingComplete,
      tenantAgeDays,
      now.getHours(),
    ),
    [eventsToday, inTransitNow, quotesOverdue, onboardingComplete, tenantAgeDays, now],
  );

  const setOverride = (v: AdminPortalMode | null) => {
    setOverrideState(v);
    writeOverride(v);
  };

  const refresh = () => setRefreshTick((t) => t + 1);

  return {
    mode: override || autoMode,
    autoMode,
    override,
    eventsToday,
    inTransitNow,
    quotesOverdue,
    onboardingComplete,
    tenantAgeDays,
    loading,
    setOverride,
    refresh,
  };
}
