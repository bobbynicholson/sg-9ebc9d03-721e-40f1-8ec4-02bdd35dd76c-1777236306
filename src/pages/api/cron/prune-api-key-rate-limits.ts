/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "prune-api-key-rate-limits";

/**
 * Daily: trim the api_key_rate_limits table.
 *
 * The per-key sliding-window rate-limiter (PR #14 P0-17 + P2F-2)
 * inserts a row on every gated API call (integrations/leads,
 * integrations/quotes, integrations/invoice-paid). Without pruning,
 * a single busy tenant generates hundreds of rows per minute and
 * the table never stops growing. The DB function
 * `prune_api_key_rate_limits` deletes any row older than 24h
 * (anything older than the window is irrelevant to the rate-limit
 * check).
 *
 * Audit reference: A.13 follow-up #2F-2 / runbook action #7.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const { data, error } = await sb.rpc("prune_api_key_rate_limits");
    if (error) {
      console.error("[prune-api-key-rate-limits] RPC failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", {
        source: auth.source,
        error_message: error.message,
      });
      return res.status(500).json({ error: error.message });
    }
    const deleted = typeof data === "number" ? data : 0;
    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, deleted });
    return res.status(200).json({ ok: true, deleted });
  } catch (e: any) {
    console.error("[prune-api-key-rate-limits] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", {
      source: auth.source,
      error_message: e?.message || "crash",
    });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
