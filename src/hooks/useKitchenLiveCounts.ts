/**
 * useKitchenLiveCounts - Wave 70.7
 *
 * Returns the four numbers that drive the kitchen portal's nav
 * live-state strip + per-item badges:
 *
 *   overdue   - prep tasks past their start_at and not done yet
 *   onPass    - orders with status='ready' (food sitting on the
 *                pass waiting for driver / collection)
 *   inPrep    - orders with status='preparing' or 'confirmed' for
 *                today (active prep workload)
 *   notifications - unread kitchen-targeted notifications
 *
 * One batched fetch per call. Refreshes every 60s + on tab focus
 * + on manual refresh trigger. Network cost: 4 head:exact count
 * queries per minute per active kitchen tab. Negligible.
 *
 * Built for kitchen first; the shape (LiveCountBucket[]) is
 * generic so driver / cleaning / shopping can implement their own
 * matching hook with their own buckets later.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface KitchenLiveCounts {
  overdue: number;
  onPass: number;
  inPrep: number;
  notifications: number;
  /** Iso timestamp of last successful refresh. */
  refreshedAt: string | null;
  loading: boolean;
  /** Last network error if any - null on success. */
  error: string | null;
  refresh: () => void;
}

const REFRESH_MS = 60_000;

export function useKitchenLiveCounts(): KitchenLiveCounts {
  const { user } = useAuth();
  const companyId = (user as any)?.company_id as string | undefined;
  const userId = (user as any)?.id as string | undefined;

  const [overdue, setOverdue] = useState(0);
  const [onPass, setOnPass] = useState(0);
  const [inPrep, setInPrep] = useState(0);
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
      const todayIso = nowIso.slice(0, 10);

      // Run all four counts in parallel. head:true skips row data.
      const [overdueRes, readyRes, prepRes, notifRes] = await Promise.all([
        // Overdue prep tasks: start_at <= now AND status in pending/in_progress
        (supabase as any)
          .from("kitchen_prep_tasks")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .lte("start_at", nowIso)
          .in("status", ["pending", "in_progress"]),
        // Orders on the pass: status = 'ready'
        (supabase as any)
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "ready")
          .eq("event_date", todayIso),
        // In prep: orders today with status preparing or confirmed
        (supabase as any)
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("event_date", todayIso)
          .in("status", ["preparing", "confirmed"]),
        // Same audience as /team-portal/kitchen/notifications.
        userId
          ? (supabase as any)
              .from("notifications")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .or(`recipient_id.eq.${userId},user_id.eq.${userId},target_role.eq.kitchen_staff,target_role.eq.kitchen_manager`)
              .eq("is_read", false)
          : Promise.resolve({ count: 0 }),
      ]);

      setOverdue(overdueRes?.count || 0);
      setOnPass(readyRes?.count || 0);
      setInPrep(prepRes?.count || 0);
      setNotifications(notifRes?.count || 0);
      setRefreshedAt(new Date().toISOString());
      setError(null);
    } catch (e: any) {
      // Don't blank the counts on failure - keep last good values.
      setError(e?.message || "Could not refresh kitchen counts");
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

  // Refresh on tab focus so a chef returning to the tab sees fresh data.
  useEffect(() => {
    const onFocus = () => { void fetchCounts(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchCounts]);

  return {
    overdue,
    onPass,
    inPrep,
    notifications,
    refreshedAt,
    loading,
    error,
    refresh: () => { void fetchCounts(); },
  };
}
