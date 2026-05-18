/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "expire-stale-quotes";

/**
 * Wave 50 C3 - nightly stale-quote expiry sweep.
 *
 * Audit (Specialist 4) found quotes past their valid_until date
 * only flipped to status='expired' lazily, when a customer next
 * clicked the public link. Admin lists therefore showed weeks-old
 * 'sent' quotes that were de-facto dead. The follow-up cron
 * above also wastes sends on these.
 *
 * Strategy: nightly job flips any non-terminal quote whose
 * valid_until has passed to status='expired'. Idempotent and
 * narrow.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const todayIso = new Date().toISOString().slice(0, 10);

    // `quote_status` enum is (draft, sent, accepted, rejected,
    // expired). Non-terminal states that should still be expired by
    // valid_until are draft + sent. Prior code listed "viewed" and
    // "negotiating" too, but neither value is in the enum - the
    // .in filter raised a CHECK violation at the DB layer and the
    // cron returned 500 with no rows processed. Confirmed via live
    // schema query on 2026-05-18.
    const { data: stale, error: selErr } = await sb
      .from("quotes")
      .select("id")
      .lt("valid_until", todayIso)
      .in("status", ["draft", "sent"])
      .is("deleted_at", null)
      .limit(500);
    if (selErr) {
      console.error("[expire-stale-quotes] select failed:", selErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: selErr.message });
      return res.status(500).json({ error: selErr.message });
    }

    const ids = ((stale as any[]) || []).map((r) => r.id);
    if (ids.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, expired: 0 });
      return res.status(200).json({ ok: true, expired: 0 });
    }

    const { error: updErr } = await sb
      .from("quotes")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .in("id", ids);
    if (updErr) {
      console.error("[expire-stale-quotes] update failed:", updErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: updErr.message });
      return res.status(500).json({ error: updErr.message });
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, expired: ids.length });
    return res.status(200).json({ ok: true, expired: ids.length });
  } catch (e: any) {
    console.error("[expire-stale-quotes] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
