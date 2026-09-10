/**
 * useOrderRefreshSignal - tick counter that increments whenever order
 * state may have changed.
 *
 * TIGHTEN I.119 (2026-06-02): unified refresh signal for every page
 * that shows order data. An audit after I.117 (realtime publication
 * on quotes + orders) surfaced 14 admin / team-portal / client-portal
 * pages that do one-shot fetches with zero refresh mechanism. So a
 * sales admin who moved an event date on /admin/orders/{id} left
 * /admin/kitchen-schedule showing the old date until someone hit
 * Cmd+R; same for /admin/tracking, /admin/invoices, the team
 * dashboards, the client portal etc.
 *
 * Three event sources roll up into one tick:
 *
 *   1. Supabase realtime postgres_changes on orders + quotes scoped
 *      to the caller's company_id. Picks up edits made in another
 *      tab or another user's session within ~1s.
 *
 *   2. window 'focus' event. Catches the case where the realtime
 *      websocket dropped a frame (laptop sleep, mobile background,
 *      network blip) and the tab regains focus.
 *
 *   3. document 'visibilitychange' -> visible. Mirrors (2) on tab
 *      switches that don't fire window focus.
 *
 * Usage:
 *
 *   const refreshSignal = useOrderRefreshSignal(companyId);
 *   useEffect(() => {
 *     loadOrders();
 *   }, [companyId, refreshSignal]);
 *
 * The hook is a no-op when companyId is null, so it's safe to mount
 * before auth resolves.
 *
 * Realtime falls through RLS, so a client-portal subscriber only
 * receives events on orders their session is allowed to read. That
 * means we can safely subscribe with company_id=null on the client-
 * portal pages and let RLS filter to the orders that contain their
 * client_id.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOrderRefreshSignal(
  companyId: string | null | undefined,
): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setTick((t) => t + 1);

    // Channel key carries a random suffix so HMR / strict-mode double
    // mount doesn't reuse the same channel name across instances.
    const channelKey = companyId
      ? `order-refresh:${companyId}:${Math.random().toString(36).slice(2)}`
      : `order-refresh:any:${Math.random().toString(36).slice(2)}`;

    // Filter by company when we have one; otherwise let RLS scope.
    const ordersConfig: any = {
      event: "*",
      schema: "public",
      table: "orders",
    };
    const quotesConfig: any = {
      event: "*",
      schema: "public",
      table: "quotes",
    };
    if (companyId) {
      ordersConfig.filter = `company_id=eq.${companyId}`;
      quotesConfig.filter = `company_id=eq.${companyId}`;
    }

    const channel = supabase
      .channel(channelKey)
      .on("postgres_changes", ordersConfig, bump)
      .on("postgres_changes", quotesConfig, bump)
      .subscribe();

    const onFocus = () => bump();
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [companyId]);

  return tick;
}
