/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";

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
    // Tenant-timezone aware "today" - Vercel cron runs on UTC, so
    // a SAST tenant's valid_until=2026-05-20 is already yesterday
    // at 02:00 SAST when UTC hits midnight on the 21st. Previous
    // UTC-today logic left the quote unexpired for an extra 2
    // hours after it should have flipped. Now we join companies
    // to read each tenant's timezone and filter quotes by their
    // local today.
    const now = new Date();

    // `quote_status` enum is (draft, sent, accepted, rejected,
    // expired). Non-terminal states that should still be expired by
    // valid_until are draft + sent. Prior code listed "viewed" and
    // "negotiating" too, but neither value is in the enum - the
    // .in filter raised a CHECK violation at the DB layer and the
    // cron returned 500 with no rows processed. Confirmed via live
    // schema query on 2026-05-18.
    // Pull the quote row + its tenant timezone so we can evaluate
    // expiry against the tenant's local date, not the cron server's
    // UTC date. The query upper-bounds with UTC tomorrow so we never
    // miss a quote that's expired in any timezone east of UTC.
    const utcTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const { data: stale, error: selErr } = await sb
      .from("quotes")
      .select("id, valid_until, company_id, company:companies(timezone)")
      .lte("valid_until", utcTomorrow)
      .in("status", ["draft", "sent"])
      .is("deleted_at", null)
      .limit(2000);
    if (selErr) {
      console.error("[expire-stale-quotes] select failed:", selErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: selErr.message });
      return res.status(500).json({ error: selErr.message });
    }

    // Filter per-tenant. A quote is stale only when its valid_until
    // is strictly before the tenant's local today. The UTC upper
    // bound above is a coarse pre-filter; this is the precise check.
    const ids = ((stale as any[]) || [])
      .filter((r) => {
        if (!r.valid_until) return false;
        const tz = r.company?.timezone || DEFAULT_TENANT_TIMEZONE;
        const tenantTodayIso = toZonedISO(now, tz);
        return r.valid_until < tenantTodayIso;
      })
      .map((r) => r.id);
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
