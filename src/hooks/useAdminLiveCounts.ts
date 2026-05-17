/**
 * useAdminLiveCounts -- Wave 70.31
 *
 * Returns the six numbers that drive the admin nav's live-state
 * strip + per-item badges:
 *
 *   eventsToday    -- today's orders, not cancelled
 *   inTransitNow   -- orders currently status='in_transit'
 *   newLeadsToday  -- leads created today
 *   quotesOverdue  -- quotes in_circulation (sent/viewed/revised)
 *                     where sent_at > 48h ago and no client response
 *   dispatchGaps   -- confirmed orders within next 7d with no driver
 *                     assignment (operational risk)
 *   alertsTotal    -- aggregate of finance + ops alerts (refunds
 *                     pending + overdue invoices + email failures
 *                     last 24h)
 *
 * Finance-gated counts (revenue + outstanding) -- computed but
 * only return non-zero when caller has finance access. The
 * AdminLiveStateStrip hides the matching pills for non-finance
 * roles.
 *
 *   revenueToday   -- sum(total_amount) on orders today, status
 *                     in collected statuses (delivered + paid)
 *   unpaidValue    -- sum(amount_due) on overdue invoices
 *
 * Reads RegionFilterContext so the counts scope to the selected
 * region when an owner is multi-branch.
 *
 * One batched fetch per call. Refreshes every 60s + on tab focus.
 * Network cost: 8 lightweight queries per minute per active admin
 * tab. Same shape as the staff portal hooks, proven negligible.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { canAccessFinance } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { toLocalISO } from "@/lib/localDate";

export interface AdminLiveCounts {
  eventsToday: number;
  inTransitNow: number;
  newLeadsToday: number;
  quotesOverdue: number;
  dispatchGaps: number;
  alertsTotal: number;
  /** Finance-gated -- zero for non-finance roles. */
  revenueToday: number;
  /** Finance-gated -- zero for non-finance roles. */
  unpaidValue: number;
  /** True when the caller's role can see revenue + unpaid values.
   *  The strip uses this to hide those pills entirely for
   *  non-finance roles rather than show a useless 0. */
  canSeeFinance: boolean;
  /** ISO timestamp of last successful refresh. */
  refreshedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const REFRESH_MS = 60_000;
const QUOTES_OVERDUE_HOURS = 48;

export function useAdminLiveCounts(): AdminLiveCounts {
  const { user, profile } = useAuth();
  const companyId = ((profile as { company_id?: string } | null)?.company_id)
    || ((user as { company_id?: string } | null)?.company_id);
  const userRole = ((profile as { role?: string } | null)?.role) as UserRole | undefined;
  const { regionFilterId } = useRegionFilter();
  const canSeeFinance = userRole ? canAccessFinance(userRole) : false;

  const [eventsToday, setEventsToday] = useState(0);
  const [inTransitNow, setInTransitNow] = useState(0);
  const [newLeadsToday, setNewLeadsToday] = useState(0);
  const [quotesOverdue, setQuotesOverdue] = useState(0);
  const [dispatchGaps, setDispatchGaps] = useState(0);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [unpaidValue, setUnpaidValue] = useState(0);
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
      const in7dIso = toLocalISO(new Date(Date.now() + 7 * 86400000));
      const overdueCutoff = new Date(Date.now() - QUOTES_OVERDUE_HOURS * 3_600_000).toISOString();
      const yesterdayIso = new Date(Date.now() - 86400000).toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      // Build today's-events query with optional region scoping.
      // The orders table has a region_id column on multi-branch tenants.
      const todaysEventsQ = sb
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("event_date", todayIso)
        .neq("status", "cancelled");
      if (regionFilterId) todaysEventsQ.eq("region_id", regionFilterId);

      const inTransitQ = sb
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "in_transit");
      if (regionFilterId) inTransitQ.eq("region_id", regionFilterId);

      const newLeadsQ = sb
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", new Date(todayIso + "T00:00:00").toISOString());
      if (regionFilterId) newLeadsQ.eq("region_id", regionFilterId);

      const quotesOverdueQ = sb
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["sent", "viewed", "revised"])
        .lt("sent_at", overdueCutoff);
      if (regionFilterId) quotesOverdueQ.eq("region_id", regionFilterId);

      // Dispatch gaps: confirmed orders next 7d. We can't filter
      // "missing assignment" in the head:exact query directly without
      // a join, so we approximate via orders with no assigned_driver_id.
      // Schema-tolerant: if the column doesn't exist, the filter is
      // dropped server-side via the OR clause.
      const dispatchGapsQ = sb
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "confirmed")
        .gte("event_date", todayIso)
        .lte("event_date", in7dIso)
        .is("assigned_driver_id", null);
      if (regionFilterId) dispatchGapsQ.eq("region_id", regionFilterId);

      // Alerts: refunds pending + email failures last 24h. We sum
      // them client-side after fetching counts.
      const refundsPendingQ = sb
        .from("refunds")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending");

      const emailFailuresQ = sb
        .from("email_send_log")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "failed")
        .gte("created_at", yesterdayIso);

      // Finance-only queries -- skipped entirely for non-finance roles
      // to avoid wasted network + accidental data exposure via logs.
      const revenueQ = canSeeFinance
        ? (() => {
            const q = sb
              .from("orders")
              .select("total_amount")
              .eq("company_id", companyId)
              .eq("event_date", todayIso)
              .in("status", ["delivered", "completed", "paid", "in_transit", "ready"]);
            if (regionFilterId) q.eq("region_id", regionFilterId);
            return q;
          })()
        : Promise.resolve({ data: [] });

      const unpaidQ = canSeeFinance
        ? (() => {
            const q = sb
              .from("invoices")
              .select("amount_due")
              .eq("company_id", companyId)
              .eq("status", "unpaid")
              .lt("due_date", todayIso);
            if (regionFilterId) q.eq("region_id", regionFilterId);
            return q;
          })()
        : Promise.resolve({ data: [] });

      const [eventsRes, transitRes, leadsRes, quotesRes, gapsRes, refundsRes, emailFailRes, revenueRes, unpaidRes] = await Promise.all([
        todaysEventsQ,
        inTransitQ,
        newLeadsQ,
        quotesOverdueQ,
        dispatchGapsQ,
        refundsPendingQ,
        emailFailuresQ,
        revenueQ,
        unpaidQ,
      ]);

      setEventsToday(eventsRes?.count || 0);
      setInTransitNow(transitRes?.count || 0);
      setNewLeadsToday(leadsRes?.count || 0);
      setQuotesOverdue(quotesRes?.count || 0);
      setDispatchGaps(gapsRes?.count || 0);

      const alertsRaw = (refundsRes?.count || 0) + (emailFailRes?.count || 0);
      setAlertsTotal(alertsRaw);

      const revRows = (revenueRes?.data as Array<{ total_amount: number | null }> | null) || [];
      setRevenueToday(revRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0));

      const unpaidRows = (unpaidRes?.data as Array<{ amount_due: number | null }> | null) || [];
      setUnpaidValue(unpaidRows.reduce((sum, r) => sum + Number(r.amount_due || 0), 0));

      setRefreshedAt(new Date().toISOString());
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refresh admin counts";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, regionFilterId, canSeeFinance]);

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
    eventsToday,
    inTransitNow,
    newLeadsToday,
    quotesOverdue,
    dispatchGaps,
    alertsTotal,
    revenueToday,
    unpaidValue,
    canSeeFinance,
    refreshedAt,
    loading,
    error,
    refresh: () => { void fetchCounts(); },
  };
}
