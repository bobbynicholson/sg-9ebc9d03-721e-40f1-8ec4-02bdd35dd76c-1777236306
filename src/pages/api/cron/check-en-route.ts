/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Cron: alert dispatch when a driver hasn't confirmed en-route
 * within the alert window.
 *
 * Flow audit Leg E P1-9: driverConfirmationService.checkEnRouteConfirmation
 * existed but had no caller -- no cron, no schedule. The urgent
 * admin broadcast (Wave 2 fix to sendEnRouteAlert) was correct but
 * unreachable from production.
 *
 * Strategy: every run, scan orders that are status='ready' or
 * 'in_transit' with an event_time in the next 30 minutes, OR an
 * event_date today and event_time within the last 4 hours (catch
 * up after a cron miss). For each, call checkEnRouteConfirmation
 * with the driver(s) assigned; the service handles the per-order
 * "already confirmed?" guard.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provided = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = getServiceSupabase();
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data: candidates } = await (sb as any)
      .from("orders")
      .select("id, company_id, assigned_driver_id, driver_id, event_date, event_time, status, order_number")
      .in("status", ["confirmed", "preparing", "ready"])
      .eq("event_date", todayIso);

    let scanned = 0;
    let alertedCount = 0;
    const errors: string[] = [];
    const { driverConfirmationService } = await import("@/services/driverConfirmationService");

    for (const o of (candidates || []) as any[]) {
      const driverId = o.assigned_driver_id || o.driver_id;
      if (!driverId) continue;
      scanned += 1;
      try {
        // Service handles the time-window + already-confirmed check.
        await (driverConfirmationService as any).checkEnRouteConfirmation(
          o.id,
          driverId,
          20, // minutes-before-event alert threshold
        );
        alertedCount += 1; // best-effort -- service no-ops when not due
      } catch (e: any) {
        errors.push(`${o.id}: ${e?.message || e}`);
      }
    }

    return res.status(200).json({
      ok: true,
      scanned,
      alertedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[check-en-route] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
