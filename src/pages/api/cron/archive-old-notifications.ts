/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "archive-old-notifications";
const ARCHIVE_AGE_DAYS = 90;

/**
 * Cron: hard-delete notifications older than 90 days.
 *
 * Wave 24: complement to the per-tenant "Clear stale" buttons added
 * across every notification page. Those handle the manual "I want to
 * tidy my inbox" case; this handles the unattended case - inactive
 * tenants, departed drivers whose accounts still receive broadcasts,
 * months of background system_alert rows nobody triages.
 *
 * Threshold: 90 days. Per-tenant Clear-stale uses 14 days; this is
 * the platform safety net for the long tail past that.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const cutoffIso = new Date(Date.now() - ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { count, error: countErr } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffIso);

    if (countErr) {
      console.error("[archive-old-notifications] count failed:", countErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: countErr.message });
      return res.status(500).json({ error: countErr.message });
    }

    if (!count || count === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, cutoff_iso: cutoffIso, archived: 0 });
      return res.status(200).json({
        ok: true,
        cutoff_iso: cutoffIso,
        archived: 0,
        note: "Nothing older than the threshold.",
      });
    }

    const { error: delErr } = await sb
      .from("notifications")
      .delete()
      .lt("created_at", cutoffIso);

    if (delErr) {
      console.error("[archive-old-notifications] delete failed:", delErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: delErr.message });
      return res.status(500).json({ error: delErr.message });
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, cutoff_iso: cutoffIso, archived: count });
    return res.status(200).json({
      ok: true,
      cutoff_iso: cutoffIso,
      archived: count,
    });
  } catch (e: any) {
    console.error("[archive-old-notifications] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
