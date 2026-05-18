/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "archive-old-gps-logs";

/**
 * Cron: prune old driver-tracking GPS log rows.
 *
 * Wave 14 orphan audit: public.archive_old_gps_logs() existed but had
 * no caller. Without it, the gps_logs / driver_gps_pings tables grow
 * unbounded - one row per ping per driver-trip - and read queries
 * on the live tracking map get slower over time. The RPC keeps the
 * most recent window and deletes older rows; the cadence is a
 * platform-level storage hygiene choice rather than tenant-facing,
 * so weekly is fine.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const { data, error } = await sb.rpc("archive_old_gps_logs");
    if (error) {
      console.error("[archive-old-gps-logs] RPC failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }
    const archived = typeof data === "number" ? data : 0;
    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, archived });
    return res.status(200).json({ ok: true, archived });
  } catch (e: any) {
    console.error("[archive-old-gps-logs] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
