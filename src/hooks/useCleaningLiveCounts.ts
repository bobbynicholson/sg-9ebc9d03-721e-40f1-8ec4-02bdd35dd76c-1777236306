/**
 * useCleaningLiveCounts - Wave 70.28
 *
 * Returns the four numbers that drive the cleaning portal's nav
 * live-state strip + per-item badges:
 *
 *   returnsDue   - cleaning_event_handovers status='expected' with
 *                   expected_at within the next 4 hours
 *   inProgress   - cleaning_event_handovers status='in_progress'
 *                   (handovers actively being washed right now)
 *   openDamages  - equipment_damages where resolved=false
 *   onDutyNow    - cleaning_duty_logs on_duty=true (live headcount)
 *
 * One batched fetch per call. Refreshes every 60s + on tab focus.
 * Network cost: 4 head:exact count queries per minute per active
 * cleaning tab. Negligible - proven with the equivalent kitchen
 * hook (useKitchenLiveCounts).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CleaningLiveCounts {
  returnsDue: number;
  inProgress: number;
  openDamages: number;
  onDutyNow: number;
  notifications: number;
  /** ISO timestamp of last successful refresh. */
  refreshedAt: string | null;
  loading: boolean;
  /** Last network error if any - null on success. */
  error: string | null;
  refresh: () => void;
}

const REFRESH_MS = 60_000;
const RETURNS_HORIZON_HOURS = 4;

export function useCleaningLiveCounts(): CleaningLiveCounts {
  const { user } = useAuth();
  const companyId = (user as { company_id?: string } | null)?.company_id;
  const userId = (user as { id?: string } | null)?.id;

  const [returnsDue, setReturnsDue] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [openDamages, setOpenDamages] = useState(0);
  const [onDutyNow, setOnDutyNow] = useState(0);
  const [notifications, setNotifications] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const horizon = new Date(Date.now() + RETURNS_HORIZON_HOURS * 3_600_000).toISOString();

      // 5 counts in parallel. head:true skips row data.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [returnsRes, progressRes, damagesRes, dutyRes, notifRes] = await Promise.all([
        // Returns due in horizon window
        sb
          .from("cleaning_event_handovers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "expected")
          .lte("expected_at", horizon)
          .gte("expected_at", nowIso),
        // In-progress handovers (no time bound - show all live)
        sb
          .from("cleaning_event_handovers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "in_progress"),
        // Open damage reports
        sb
          .from("equipment_damages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("resolved", false),
        // On-duty cleaning staff right now
        sb
          .from("cleaning_duty_logs")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("on_duty", true),
        // Same audience as /team-portal/cleaning/notifications.
        userId
          ? sb
              .from("notifications")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .or(`recipient_id.eq.${userId},user_id.eq.${userId},target_role.eq.cleaning_staff,target_role.eq.cleaning_manager`)
              .eq("is_read", false)
          : Promise.resolve({ count: 0 }),
      ]);

      setReturnsDue(returnsRes?.count || 0);
      setInProgress(progressRes?.count || 0);
      setOpenDamages(damagesRes?.count || 0);
      setOnDutyNow(dutyRes?.count || 0);
      setNotifications(notifRes?.count || 0);
      setRefreshedAt(new Date().toISOString());
      setError(null);
    } catch (e) {
      // Don't blank the counts on failure - keep last good values.
      const msg = e instanceof Error ? e.message : "Could not refresh cleaning counts";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, userId]);

  // Initial fetch + interval refresh.
  useEffect(() => {
    void fetchCounts();
    const t = setInterval(() => { void fetchCounts(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchCounts]);

  // Refresh on tab focus so a cleaner returning to the tab sees fresh data.
  useEffect(() => {
    const onFocus = () => { void fetchCounts(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchCounts]);

  return {
    returnsDue,
    inProgress,
    openDamages,
    onDutyNow,
    notifications,
    refreshedAt,
    loading,
    error,
    refresh: () => { void fetchCounts(); },
  };
}
