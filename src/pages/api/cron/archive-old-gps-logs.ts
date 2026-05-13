/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Cron: prune old driver-tracking GPS log rows.
 *
 * Wave 14 orphan audit: public.archive_old_gps_logs() existed but had
 * no caller. Without it, the gps_logs / driver_gps_pings tables grow
 * unbounded -- one row per ping per driver-trip -- and read queries
 * on the live tracking map get slower over time. The RPC keeps the
 * most recent window and deletes older rows; the cadence is a
 * platform-level storage hygiene choice rather than tenant-facing,
 * so weekly is fine.
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
    const { data, error } = await (sb as any).rpc("archive_old_gps_logs");
    if (error) {
      console.error("[archive-old-gps-logs] RPC failed:", error);
      return res.status(500).json({ error: error.message });
    }
    const archived = typeof data === "number" ? data : 0;
    return res.status(200).json({ ok: true, archived });
  } catch (e: any) {
    console.error("[archive-old-gps-logs] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
