/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Daily platform plan-billing sweep (Stripe + Yoco).
 *
 * Yoco plans are prepaid periods (Yoco cannot re-charge a saved card), so
 * this cron is what makes them recurring:
 *   - 7, 3 and 1 days before the period ends: email the owner a renewal
 *     reminder linking to Billing, where "Renew with Yoco" pays the next
 *     period (stacked onto the current one, so renewing early loses nothing).
 *   - period ended, unpaid: plan -> past_due (access kept) + "renew now" email.
 *   - 7 days past the end, still unpaid: plan -> suspended (access gate closes).
 * Cancelled-at-period-end Yoco plans are ended by /api/cron/expire-trials.
 *
 * Stripe renews by itself; here we only recover plan checkouts whose
 * webhook never arrived (e.g. the buyer closed the browser right after
 * paying and the webhook was lost) by asking Stripe directly.
 *
 * Auth: Vercel cron bearer OR super_admin session. ?dryRun=1 previews.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { confirmStripePlanCheckout, platformBillingProviders } from "@/services/platformPlanBilling";

const CRON_NAME = "platform-plan-renewals";
const GRACE_DAYS = 7;
const REMINDER_DAYS = [7, 3, 1];
const DAY = 86400000;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;
  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const sb: any = getServiceSupabase();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const counts = { reminded: 0, past_due: 0, suspended: 0, stripe_recovered: 0, errors: 0 };
  const errors: string[] = [];

  try {
    // Until migration 20261004150000 is applied (and Stripe/Yoco plan
    // billing is configured) there is nothing for this job to do.
    const { error: schemaError } = await sb.from("platform_subscription_checkouts").select("id").limit(1);
    if (schemaError && ["42P01", "PGRST205", "42703"].includes(String(schemaError.code || ""))) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, skipped: "migration_not_applied" });
      return res.status(200).json({ ok: true, skipped: "migration_not_applied" });
    }
    const { billingEmailService } = await import("@/services/billingEmailService");
    const { data: yocoPlans, error } = await sb.from("subscriptions").select("*")
      .eq("payment_provider", "yoco").in("status", ["active", "past_due"])
      .eq("cancel_at_period_end", false).limit(5000);
    if (error) throw error;

    for (const sub of yocoPlans || []) {
      try {
        const end = new Date(sub.current_period_end).getTime();
        if (!Number.isFinite(end)) continue;
        const daysLeft = Math.ceil((end - now) / DAY);

        if (end > now) {
          if (REMINDER_DAYS.includes(daysLeft) && sub.status === "active" && !dryRun) {
            await billingEmailService.notifySubscriptionExpiring(sub.user_id, {
              ...sub, next_billing_date: sub.current_period_end, payment_method_label: "Yoco (pay the renewal link in Billing)",
            }, daysLeft);
          }
          if (REMINDER_DAYS.includes(daysLeft)) counts.reminded += 1;
          continue;
        }

        const { data: company, error: companyError } = await sb.from("companies")
          .select("subscription_status").eq("id", sub.company_id).maybeSingle();
        if (companyError) throw companyError;
        // Only touch access when this Yoco plan is what grants it.
        const companyFollowsPlan = ["active", "past_due"].includes(String(company?.subscription_status || ""));

        if (now - end >= GRACE_DAYS * DAY) {
          counts.suspended += 1;
          if (dryRun) continue;
          const { error: subError } = await sb.from("subscriptions")
            .update({ status: "suspended", next_billing_date: null, updated_at: nowIso }).eq("id", sub.id);
          if (subError) throw subError;
          if (companyFollowsPlan) {
            const { error: e } = await sb.from("companies").update({ subscription_status: "suspended", updated_at: nowIso }).eq("id", sub.company_id);
            if (e) throw e;
          }
        } else if (sub.status === "active") {
          counts.past_due += 1;
          if (dryRun) continue;
          const { error: subError } = await sb.from("subscriptions")
            .update({ status: "past_due", updated_at: nowIso }).eq("id", sub.id).eq("status", "active");
          if (subError) throw subError;
          if (companyFollowsPlan) {
            const { error: e } = await sb.from("companies").update({ subscription_status: "past_due", updated_at: nowIso }).eq("id", sub.company_id);
            if (e) throw e;
          }
          await billingEmailService.notifyPaymentFailed(sub.user_id, {
            amount: Number(sub.amount), currency: sub.currency || "ZAR", created_at: nowIso,
            failed_reason: `Your prepaid ${sub.plan_name} period ended on ${new Date(end).toLocaleDateString("en-ZA")}. Renew with Yoco from Billing within ${GRACE_DAYS} days to keep access.`,
          });
        }
      } catch (rowError: any) {
        counts.errors += 1;
        errors.push(`subscription ${sub.id}: ${rowError?.message || rowError}`);
      }
    }

    if (platformBillingProviders().stripe) {
      const { data: pending, error: pendingError } = await sb.from("platform_subscription_checkouts").select("*")
        .eq("provider", "stripe").eq("status", "pending").not("provider_session_id", "is", null)
        .lt("created_at", new Date(now - 10 * 60000).toISOString())
        .gt("created_at", new Date(now - 3 * DAY).toISOString()).limit(200);
      if (pendingError) throw pendingError;
      for (const checkout of pending || []) {
        if (dryRun) continue;
        try {
          const status = await confirmStripePlanCheckout(sb, checkout);
          if (status === "succeeded") counts.stripe_recovered += 1;
        } catch (checkError: any) {
          counts.errors += 1;
          errors.push(`checkout ${checkout.id}: ${checkError?.message || checkError}`);
        }
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, counts.errors ? "error" : "ok", { source: auth.source, ...counts });
    return res.status(counts.errors ? 207 : 200).json({ ok: counts.errors === 0, dryRun, ...counts, errors: errors.slice(0, 20) });
  } catch (e: any) {
    console.error("[platform-plan-renewals] failed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message });
    return res.status(500).json({ error: e?.message || "Renewal sweep failed" });
  }
}

export default withApiLogging(handler);
