/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Wave 50 C3 -- nightly stale-quote expiry sweep.
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
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data: stale, error: selErr } = await (sb as any)
      .from("quotes")
      .select("id")
      .lt("valid_until", todayIso)
      .in("status", ["draft", "sent", "viewed", "negotiating"])
      .is("deleted_at", null)
      .limit(500);
    if (selErr) {
      console.error("[expire-stale-quotes] select failed:", selErr);
      return res.status(500).json({ error: selErr.message });
    }

    const ids = ((stale as any[]) || []).map((r) => r.id);
    if (ids.length === 0) {
      return res.status(200).json({ ok: true, expired: 0 });
    }

    const { error: updErr } = await (sb as any)
      .from("quotes")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .in("id", ids);
    if (updErr) {
      console.error("[expire-stale-quotes] update failed:", updErr);
      return res.status(500).json({ error: updErr.message });
    }

    return res.status(200).json({ ok: true, expired: ids.length });
  } catch (e: any) {
    console.error("[expire-stale-quotes] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
