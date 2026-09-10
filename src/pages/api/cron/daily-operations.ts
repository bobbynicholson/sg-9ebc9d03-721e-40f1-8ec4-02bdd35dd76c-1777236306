/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { getServiceSupabase } from "@/lib/supabase/service";
import { runDailyOperationsScheduler } from "@/services/dailyOperationsScheduler";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;
  const sb = getServiceSupabase();
  try {
    const summary = await runDailyOperationsScheduler(new Date(), sb);
    await recordCronHeartbeat(sb, "daily-operations", summary.errors.length ? "error" : "ok", {
      source: auth.source,
      companies: summary.companies,
      tasks_created: summary.tasksCreated,
      staff_notifications: summary.staffNotifications,
      admin_notifications: summary.adminNotifications,
      errors_count: summary.errors.length,
    });
    return res.status(200).json({ ok: true, ...summary });
  } catch (e: any) {
    await recordCronHeartbeat(sb, "daily-operations", "error", { source: auth.source, error_message: e?.message || String(e) });
    return res.status(500).json({ error: e?.message || "Daily operations scheduler failed" });
  }
}

export default withApiLogging(handler);

