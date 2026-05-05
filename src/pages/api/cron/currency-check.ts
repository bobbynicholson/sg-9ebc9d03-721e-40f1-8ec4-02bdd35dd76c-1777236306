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
 *   1. Vercel cron -- daily at 04:00 UTC (06:00 SAST). Auth via
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
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { currencyMonitoringService } from "@/services/currencyMonitoringService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // -- Auth: cron secret OR super_admin session ---------------------
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const isCron = !!expected && auth === `Bearer ${expected}`;

  let isSuperAdmin = false;
  if (!isCron) {
    try {
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (user) {
        const { data: profile } = await ssr
          .from("profiles")
          .select("role, active_role")
          .eq("id", user.id)
          .maybeSingle();
        const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
        isSuperAdmin = role === "super_admin";
      }
    } catch {
      // fall through -- isSuperAdmin stays false
    }
  }

  if (!isCron && !isSuperAdmin) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  // Service role client so the upserts always go through regardless
  // of who the caller is. The check + writes don't need RLS context.
  const sb: any = getServiceSupabase();

  try {
    const result = await currencyMonitoringService.runDailyCheck(sb);
    return res.status(200).json({
      ok: true,
      rate: result.rate,
      fluctuation_pct: result.fluctuation,
      alert_created: result.alertCreated,
    });
  } catch (e: any) {
    console.error("/api/cron/currency-check crashed:", e);
    return res.status(500).json({ error: e?.message || "Currency check failed" });
  }
}
