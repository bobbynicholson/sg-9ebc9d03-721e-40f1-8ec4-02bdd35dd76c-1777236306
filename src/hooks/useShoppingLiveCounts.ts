/**
 * useShoppingLiveCounts - Wave 70.29
 *
 * Returns the five numbers that drive the shopping portal's nav
 * live-state strip + per-item badges:
 *
 *   shortItems       - inventory_demand_outlook rows with
 *                       status='shortfall' (7-day window) - items
 *                       the kitchen will run out of soon
 *   activeListItems  - count of items on the current active
 *                       shopping_list (any draft / in_progress /
 *                       pending list). Company-wide - shoppers
 *                       working in parallel see the same number.
 *   receiptsToFile   - shopping_lists completed TODAY where
 *                       receipt_url IS NULL. Today-scoped so the
 *                       count doesn't rot.
 *   spendToday       - sum of actual_total on shopping_lists
 *                       completed today (R or tenant currency)
 *   notifications    - unread shopping-targeted notifications
 *
 * One batched fetch per call. Refreshes every 60s + on tab focus.
 * Network cost: 5 lightweight queries per minute per active tab.
 * Same pattern proven on kitchen + cleaning.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalISO } from "@/lib/localDate";

export interface ShoppingLiveCounts {
  shortItems: number;
  activeListItems: number;
  receiptsToFile: number;
  spendToday: number;
  notifications: number;
  /** ISO timestamp of last successful refresh. */
  refreshedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const REFRESH_MS = 60_000;

export function useShoppingLiveCounts(): ShoppingLiveCounts {
  const { user } = useAuth();
  const companyId = (user as { company_id?: string } | null)?.company_id;
  const userId = (user as { id?: string } | null)?.id;

  const [shortItems, setShortItems] = useState(0);
  const [activeListItems, setActiveListItems] = useState(0);
  const [receiptsToFile, setReceiptsToFile] = useState(0);
  const [spendToday, setSpendToday] = useState(0);
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
      const todayIso = toLocalISO(new Date());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [shortRes, activeListsRes, unfiledRes, spendRes, notifRes] = await Promise.all([
        // Short items: outlook rows where the kitchen will run out
        sb
          .from("inventory_demand_outlook")
          .select("inventory_item_id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "shortfall"),
        // Active shopping_list rows. Prefer lists assigned to the
        // current shopper - "your list" beats "team list" for the
        // one-shopper-per-tenant dominant case (Wave 70.30). Fall
        // back to unassigned lists when there's no personal list.
        userId
          ? sb
              .from("shopping_lists")
              .select("id, estimated_total, shopper_id")
              .eq("company_id", companyId)
              .in("status", ["draft", "pending", "in_progress", "shopping"])
              .or(`shopper_id.eq.${userId},shopper_id.is.null`)
          : sb
              .from("shopping_lists")
              .select("id, estimated_total, shopper_id")
              .eq("company_id", companyId)
              .in("status", ["draft", "pending", "in_progress", "shopping"]),
        // Receipts to file: completed TODAY with no receipt url. The
        // today-scoping prevents the count from accumulating forever.
        sb
          .from("shopping_lists")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "completed")
          .gte("list_date", todayIso)
          .lte("list_date", todayIso)
          .is("receipt_url", null),
        // Spend today: sum of actual totals on lists completed today
        sb
          .from("shopping_lists")
          .select("actual_total")
          .eq("company_id", companyId)
          .eq("status", "completed")
          .gte("list_date", todayIso)
          .lte("list_date", todayIso),
        // Shopping-targeted unread notifications
        userId
          ? sb
              .from("notifications")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .or(`recipient_id.eq.${userId},target_role.eq.shopping`)
              .eq("is_read", false)
          : Promise.resolve({ count: 0 }),
      ]);

      setShortItems(shortRes?.count || 0);

      // activeListItems = number of active lists (one per row).
      // Per-item granular count would need a join into
      // shopping_list_items; pragmatic to start with list count and
      // upgrade when we ship the dedicated buy-list page (Wave 70.30).
      const activeLists = (activeListsRes?.data as Array<{ id: string }> | null) || [];
      setActiveListItems(activeLists.length);

      setReceiptsToFile(unfiledRes?.count || 0);

      const spendRows = (spendRes?.data as Array<{ actual_total: number | null }> | null) || [];
      const spend = spendRows.reduce((sum, r) => sum + Number(r.actual_total || 0), 0);
      setSpendToday(spend);

      setNotifications(notifRes?.count || 0);
      setRefreshedAt(new Date().toISOString());
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refresh shopping counts";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, userId]);

  useEffect(() => {
    void fetchCounts();
    const t = setInterval(() => { void fetchCounts(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchCounts]);

  useEffect(() => {
    const onFocus = () => { void fetchCounts(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchCounts]);

  return {
    shortItems,
    activeListItems,
    receiptsToFile,
    spendToday,
    notifications,
    refreshedAt,
    loading,
    error,
    refresh: () => { void fetchCounts(); },
  };
}
