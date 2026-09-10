/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Hourly: re-check every tenant's pending Resend domain.
 *
 * Closes the audit's Section 7.2 #2 ("Domain DNS lag - no
 * `we'll keep retrying for the next 24h, you're safe to leave` UX").
 *
 * Without this, a tenant who pasted their DNS records on Friday
 * evening would only get a verified status when they next manually
 * clicked "Re-check" on /admin/email-settings. Most don't - they
 * assume CateringMS is polling. This cron makes that assumption true.
 *
 * Live impact (2026-05-18): Spit Braai's spitbraaidelivery.co.za
 * domain has been sitting at resend_domain_status='pending' since
 * 2026-05-15, blocking every queued email. Once this cron runs and
 * Resend's verification clears, the queue will start delivering.
 *
 * Strategy per tenant row:
 *   1. Call Resend's `POST /domains/{id}/verify` to trigger a fresh
 *      DNS lookup (without this, Resend's internal schedule decides).
 *   2. Call `GET /domains/{id}` to read the updated status + records.
 *   3. Persist new status + records + last_checked_at on
 *      email_provider_settings.
 *   4. On newly_verified transition: drop an in-app `domain_verified`
 *      notification on every owner / admin / company_admin profile in
 *      the tenant. The fancier "round-trip confirmation email + mark
 *      onboarding step" hooks stay scoped to the manual /verify-domain
 *      endpoint - the cron is the "keep DB in sync" path.
 *
 * Auth: Vercel cron bearer OR super_admin session (same as every
 * other cron).
 *
 * Schedule: hourly. Resend has its own internal verifier; this is
 * the gentle nudge so the tenant doesn't have to babysit it.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { getResendDomain, isResendError, verifyResendDomain } from "@/lib/resendDomains";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "verify-pending-domains";
const RECIPIENT_ROLES = ["owner", "company_admin", "admin"];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();

  // Pull every Resend row that isn't already verified. We re-check
  // failed and temporary_failure rows too - DNS can lag for hours,
  // and "failed" frequently flips back to "verified" once the user
  // fixes a typo.
  const { data: pending, error: selErr } = await sb
    .from("email_provider_settings")
    .select("id, company_id, resend_domain_id, resend_sending_domain, resend_domain_status, resend_domain_verified_at, is_verified")
    .eq("provider", "resend")
    .not("resend_domain_id", "is", null)
    .neq("resend_domain_status", "verified")
    .limit(200);

  if (selErr) {
    console.error("[verify-pending-domains] select failed:", selErr);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: selErr.message });
    return res.status(500).json({ error: selErr.message });
  }

  if (!pending || pending.length === 0) {
    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, considered: 0, newly_verified: 0 });
    return res.status(200).json({ ok: true, considered: 0 });
  }

  let stillPending = 0;
  let newlyVerified = 0;
  let failures = 0;
  const errors: string[] = [];

  for (const row of pending as any[]) {
    try {
      // Trigger Resend to re-check. Best-effort: failure here doesn't
      // block the GET below, since Resend's status may have flipped on
      // its own schedule even when the trigger errors.
      const triggered = await verifyResendDomain(row.resend_domain_id);
      if (isResendError(triggered)) {
        console.warn(
          `[verify-pending-domains] trigger failed for ${row.resend_domain_id}:`,
          triggered.error,
        );
      }

      const fresh = await getResendDomain(row.resend_domain_id);
      if (isResendError(fresh)) {
        errors.push(`${row.resend_sending_domain}: get failed: ${fresh.error}`);
        failures += 1;
        continue;
      }

      const newStatus = (fresh as any).status || "pending";
      const newRecords = (fresh as any).records || [];
      const now = new Date().toISOString();
      const wasVerified = !!row.resend_domain_verified_at || row.resend_domain_status === "verified";
      const verifiedAt = newStatus === "verified" ? (row.resend_domain_verified_at || now) : null;

      const { error: updErr } = await sb
        .from("email_provider_settings")
        .update({
          resend_dns_records: newRecords,
          resend_domain_status: newStatus,
          resend_domain_verified_at: verifiedAt,
          resend_last_checked_at: now,
          // Flip the operator-visible is_verified bit when newly verified.
          // Don't unset it on a failed re-check - the operator may have
          // already trusted this domain and a transient Resend hiccup
          // shouldn't yank their sender identity.
          ...(newStatus === "verified" ? { is_verified: true } : {}),
          updated_at: now,
        })
        .eq("id", row.id);
      if (updErr) {
        errors.push(`${row.resend_sending_domain}: update failed: ${updErr.message}`);
        failures += 1;
        continue;
      }

      if (newStatus === "verified" && !wasVerified) {
        newlyVerified += 1;
        // Notify owners + admins in this tenant. Best-effort: a failure
        // here doesn't undo the DB update.
        try {
          const { data: recipients } = await sb
            .from("profiles")
            .select("id, role")
            .eq("company_id", row.company_id)
            .in("role", RECIPIENT_ROLES);
          if (recipients && (recipients as any[]).length > 0) {
            const notifRows = (recipients as any[]).map((r) => ({
              company_id: row.company_id,
              recipient_id: r.id,
              user_id: r.id,
              notification_type: "domain_verified",
              title: "Sending domain verified",
              message: `${row.resend_sending_domain} is now verified. Your queued emails will start delivering on the next cron tick.`,
              priority: "normal",
              link: "/admin/email-settings",
              related_entity_type: "company",
              related_entity_id: row.company_id,
            }));
            const { error: notifErr } = await sb.from("notifications").insert(notifRows);
            if (notifErr) {
              errors.push(`${row.resend_sending_domain}: notification fan-out failed: ${notifErr.message}`);
            }
          }
        } catch (notifThrew: any) {
          errors.push(`${row.resend_sending_domain}: notification fan-out threw: ${notifThrew?.message || notifThrew}`);
        }
      } else {
        stillPending += 1;
      }
    } catch (e: any) {
      errors.push(`${row.resend_sending_domain || row.id}: ${e?.message || e}`);
      failures += 1;
    }
  }

  await recordCronHeartbeat(sb, CRON_NAME, failures > 0 ? "error" : "ok", {
    source: auth.source,
    considered: pending.length,
    newly_verified: newlyVerified,
    still_pending: stillPending,
    failures,
    errors_count: errors.length,
  });
  return res.status(200).json({
    ok: true,
    considered: pending.length,
    newly_verified: newlyVerified,
    still_pending: stillPending,
    failures,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export default withApiLogging(handler);
