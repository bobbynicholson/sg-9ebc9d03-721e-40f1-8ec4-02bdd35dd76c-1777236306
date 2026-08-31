/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "prune-chat-history";
const CHAT_RETENTION_DAYS = 90;

/**
 * Hard-delete saved assistant sessions older than the retention window.
 * chat_messages are removed by the session foreign-key cascade.
 * Temporary assistant requests do not create rows and need no cleanup.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const cutoffIso = new Date(Date.now() - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString();
    const { count, error: countError } = await sb
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .lt("started_at", cutoffIso);

    if (countError) throw countError;
    const sessions = count || 0;
    if (sessions > 0) {
      const { error: deleteError } = await sb.from("chat_sessions").delete().lt("started_at", cutoffIso);
      if (deleteError) throw deleteError;
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", {
      source: auth.source,
      cutoff_iso: cutoffIso,
      retention_days: CHAT_RETENTION_DAYS,
      deleted_sessions: sessions,
    });
    return res.status(200).json({ ok: true, cutoff_iso: cutoffIso, retention_days: CHAT_RETENTION_DAYS, deleted_sessions: sessions });
  } catch (error: any) {
    console.error(`[${CRON_NAME}] failed:`, error);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error?.message || "cleanup failed" });
    return res.status(500).json({ error: error?.message || "Could not prune chat history" });
  }
}

export default withApiLogging(handler);
