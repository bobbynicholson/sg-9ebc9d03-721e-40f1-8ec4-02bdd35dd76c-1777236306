/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "expire-trials";

/**
 * Daily trial-expiry sweep.
 *
 * Every company is created with subscription_status='trial' and
 * trial_ends_at = signup + 30 days. Nothing flipped that status when the
 * window lapsed - the TrialExpiryBanner counted down to 0 but the
 * company stayed 'trial' forever (and the access gate treats 'trial' as
 * fully-featured). This cron closes that: any company still on 'trial'
 * whose trial_ends_at is in the past is moved to 'suspended' (a lapsed
 * trial - distinct from a user-initiated 'cancelled'). The subscription
 * gate (lib/subscriptionGate.ts) does NOT grant access to 'suspended',
 * and /admin/subscription shows the "pick a plan to restore access"
 * state, so the owner is routed to upgrade.
 *
 * The `subscription_status` enum has no "expired" member, so we reuse
 * 'suspended'. When the owner subscribes, the PayFast/Stripe
 * subscription webhook flips them back to 'active'.
 *
 * Idempotent + narrow: only touches rows that are still 'trial' AND past
 * their trial_ends_at. Supports ?dryRun=1 to preview the count without
 * writing.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const sb: any = getServiceSupabase();

  try {
    const nowIso = new Date().toISOString();

    // Lapsed trials: still on 'trial', a trial_ends_at that has passed,
    // not soft-deleted.
    const { data: lapsed, error: selErr } = await sb
      .from("companies")
      .select("id, company_name, trial_ends_at")
      .eq("subscription_status", "trial")
      .not("trial_ends_at", "is", null)
      .lt("trial_ends_at", nowIso)
      .is("deleted_at", null)
      .limit(2000);

    if (selErr) {
      console.error("[expire-trials] select failed:", selErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: selErr.message });
      return res.status(500).json({ error: selErr.message });
    }

    const ids = ((lapsed as any[]) || []).map((r) => r.id);
    if (ids.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, expired: 0 });
      return res.status(200).json({ ok: true, expired: 0 });
    }

    if (dryRun) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, expired: 0, dryRun: true, would_expire: ids.length });
      return res.status(200).json({ ok: true, dryRun: true, would_expire: ids.length, companies: lapsed });
    }

    const { error: updErr } = await sb
      .from("companies")
      .update({ subscription_status: "suspended", updated_at: nowIso })
      .in("id", ids);

    if (updErr) {
      console.error("[expire-trials] update failed:", updErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: updErr.message });
      return res.status(500).json({ error: updErr.message });
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, expired: ids.length });
    return res.status(200).json({ ok: true, expired: ids.length });
  } catch (e: any) {
    console.error("[expire-trials] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
