/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Cron: hard-delete notifications older than 90 days.
 *
 * Wave 24: complement to the per-tenant "Clear stale" buttons added
 * across every notification page. Those handle the manual "I want to
 * tidy my inbox" case; this handles the unattended case -- inactive
 * tenants, departed drivers whose accounts still receive broadcasts,
 * months of background system_alert rows nobody triages.
 *
 * Without server-side cleanup the notifications table grows
 * unbounded. The bell load + the per-portal /notifications page both
 * pull the most recent 50-100 rows and filter by recipient; query
 * performance degrades over time and the realtime subscription
 * shipping each insert to every connected client only gets noisier.
 *
 * Threshold: 90 days. Generous enough that a tenant who reviews
 * monthly still sees their full audit trail in the bell, tight enough
 * that a year of ignored alerts doesn't pile up. Per-tenant Clear-
 * stale uses 14 days; this is the platform safety net for the long
 * tail past that.
 *
 * Idempotent: the WHERE clause matches only rows older than the
 * cutoff, so re-running mid-day is a no-op.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */

const ARCHIVE_AGE_DAYS = 90;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provided = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = getServiceSupabase();
    const cutoffIso = new Date(Date.now() - ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Count first so the response carries a useful "how big was the
    // sweep this run" signal -- helps catch the case where the cron
    // is firing but the cleanup isn't actually deleting anything
    // (RLS misconfig, cutoff math wrong, etc).
    const { count, error: countErr } = await (sb as any)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffIso);

    if (countErr) {
      console.error("[archive-old-notifications] count failed:", countErr);
      return res.status(500).json({ error: countErr.message });
    }

    if (!count || count === 0) {
      return res.status(200).json({
        ok: true,
        cutoff_iso: cutoffIso,
        archived: 0,
        note: "Nothing older than the threshold.",
      });
    }

    const { error: delErr } = await (sb as any)
      .from("notifications")
      .delete()
      .lt("created_at", cutoffIso);

    if (delErr) {
      console.error("[archive-old-notifications] delete failed:", delErr);
      return res.status(500).json({ error: delErr.message });
    }

    return res.status(200).json({
      ok: true,
      cutoff_iso: cutoffIso,
      archived: count,
    });
  } catch (e: any) {
    console.error("[archive-old-notifications] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
