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

    // Trial-ending-soon reminder emails (the platform-editable
    // trial_ending_soon template previously had NO producer anywhere).
    // Fires at exactly 3 days and 1 day remaining - the cron runs daily,
    // so each threshold sends once per company without a dedup table.
    let trialReminders = 0;
    if (!dryRun) {
      try {
        const in3DaysIso = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
        const { data: endingSoon } = await sb
          .from("companies")
          .select("id, owner_id, trial_ends_at")
          .eq("subscription_status", "trial")
          .not("trial_ends_at", "is", null)
          .gt("trial_ends_at", nowIso)
          .lte("trial_ends_at", in3DaysIso)
          .is("deleted_at", null)
          .limit(500);
        const { billingEmailService } = await import("@/services/billingEmailService");
        for (const c of (endingSoon as any[]) || []) {
          try {
            const daysRemaining = Math.ceil(
              (new Date(c.trial_ends_at).getTime() - Date.now()) / (24 * 3600 * 1000),
            );
            if (daysRemaining !== 3 && daysRemaining !== 1) continue;
            if (!c.owner_id) continue;
            const [clients, quotes, orders] = await Promise.all([
              sb.from("clients").select("id", { count: "exact", head: true }).eq("company_id", c.id),
              sb.from("quotes").select("id", { count: "exact", head: true }).eq("company_id", c.id),
              sb.from("orders").select("id", { count: "exact", head: true }).eq("company_id", c.id),
            ]);
            await billingEmailService.notifyTrialEnding(c.owner_id, daysRemaining, c.trial_ends_at, {
              clients: clients.count || 0,
              quotes: quotes.count || 0,
              orders: orders.count || 0,
            });
            trialReminders++;
          } catch (perCoErr) {
            console.warn("[expire-trials] trial reminder failed for company", c.id, perCoErr);
          }
        }
      } catch (reminderErr) {
        console.warn("[expire-trials] trial reminder sweep crashed (non-blocking):", reminderErr);
      }
    }

    const ids = ((lapsed as any[]) || []).map((r) => r.id);
    if (ids.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, expired: 0, trial_reminders: trialReminders });
      return res.status(200).json({ ok: true, expired: 0, trial_reminders: trialReminders });
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

    // Communication: tell each lapsed tenant's owners/admins their trial
    // ended and access is now limited, so they're routed to pick a plan.
    // The TrialExpiryBanner counted down to 0 but nothing actually
    // pinged them when the gate closed. Best-effort, per-tenant; a notify
    // failure must never fail the cron. Pass the service-role client so
    // RLS doesn't block these cross-tenant inserts.
    try {
      const { notificationService } = await import("@/services/notificationService");
      for (const c of (lapsed as any[]) || []) {
        try {
          await notificationService.broadcastNotification({
            companyId: c.id,
            type: "trial_expiring",
            title: "Your free trial has ended",
            message: "Your trial period is over and access is now limited. Pick a plan to restore full access.",
            targetRoles: ["owner", "company_admin", "super_admin", "admin"] as any,
            priority: "urgent",
            link: "/admin/subscription",
            relatedEntityType: "company",
            relatedEntityId: c.id,
            dedup: true,
          }, sb);
        } catch (perCoErr) {
          console.warn("[expire-trials] notify failed for company", c.id, perCoErr);
        }
      }
    } catch (notifyErr) {
      console.warn("[expire-trials] notification cascade crashed (non-blocking):", notifyErr);
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, expired: ids.length, trial_reminders: trialReminders });
    return res.status(200).json({ ok: true, expired: ids.length, trial_reminders: trialReminders });
  } catch (e: any) {
    console.error("[expire-trials] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
