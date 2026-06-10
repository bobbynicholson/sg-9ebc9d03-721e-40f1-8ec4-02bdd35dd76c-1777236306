/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "check-en-route";

/**
 * Cron: alert dispatch when a driver hasn't confirmed en-route
 * within the alert window.
 *
 * Flow audit Leg E P1-9: driverConfirmationService.checkEnRouteConfirmation
 * existed but had no caller - no cron, no schedule. The urgent
 * admin broadcast (Wave 2 fix to sendEnRouteAlert) was correct but
 * unreachable from production.
 *
 * Strategy: scan today's orders in status (confirmed, preparing,
 * ready). For each with a driver assigned, call
 * checkEnRouteConfirmation; the service handles the per-order
 * "already confirmed?" + time-window guards.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const todayIso = new Date().toISOString().slice(0, 10);

    // TIGHTEN I.87: add deleted_at guard so the en-route ping cron
    // doesn't chase drivers about a soft-deleted order.
    const { data: candidates } = await sb
      .from("orders")
      .select("id, company_id, assigned_driver_id, driver_id, event_date, event_time, status, order_number")
      .is("deleted_at", null)
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
        await (driverConfirmationService as any).checkEnRouteConfirmation(
          o.id,
          driverId,
          20, // minutes-before-event alert threshold
        );
        alertedCount += 1; // best-effort - service no-ops when not due
      } catch (e: any) {
        errors.push(`${o.id}: ${e?.message || e}`);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      scanned,
      alertedCount,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      scanned,
      alertedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[check-en-route] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
