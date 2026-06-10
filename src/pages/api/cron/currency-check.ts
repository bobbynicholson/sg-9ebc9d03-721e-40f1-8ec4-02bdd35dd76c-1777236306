/**
 * GET / POST /api/cron/currency-check
 *
 * Daily currency monitor worker. Pulls live USD/ZAR from
 * exchangerate-api.com, stores the rate in exchange_rates, and
 * raises a currency_fluctuation_alerts row + admin_notifications
 * entry when the 90-day rolling change crosses 15% (de-duped to one
 * alert per 7 days).
 *
 * Two callers, one route:
 *   1. Vercel cron - daily at 04:00 UTC (06:00 SAST). Auth via
 *      Authorization: Bearer ${CRON_SECRET}. Same pattern used by
 *      /api/cron/process-email-queue and /api/cron/late-event-check.
 *   2. Admin "Run Check Now" button on /admin/platform/currency-
 *      monitoring. Auth via authenticated super_admin session
 *      (createPagesServerClient cookie).
 *
 * Either auth path is sufficient; the route resolves whichever the
 * caller presents.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { currencyMonitoringService } from "@/services/currencyMonitoringService";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "currency-check";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  // Service role client so the upserts always go through regardless
  // of who the caller is. The check + writes don't need RLS context.
  const sb: any = getServiceSupabase();

  try {
    const result = await currencyMonitoringService.runDailyCheck(sb);
    await recordCronHeartbeat(sb, CRON_NAME, "ok", {
      source: auth.source,
      rate: result.rate,
      fluctuation_pct: result.fluctuation,
      alert_created: result.alertCreated,
    });
    return res.status(200).json({
      ok: true,
      rate: result.rate,
      fluctuation_pct: result.fluctuation,
      alert_created: result.alertCreated,
    });
  } catch (e: any) {
    console.error("/api/cron/currency-check crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", {
      source: auth.source,
      error_message: e?.message || "Currency check failed",
    });
    return res.status(500).json({ error: e?.message || "Currency check failed" });
  }
}

export default withApiLogging(handler);
