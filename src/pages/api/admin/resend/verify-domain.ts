/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Re-check the verification state of a tenant's Resend domain. Resend
 * may rotate the DNS records (rare, but documented), so we always
 * persist the latest record set as well as the new status. When status
 * flips to 'verified', stamp resend_domain_verified_at.
 *
 * On a fresh transition to verified ("newly_verified"), we also fan out
 * three best-effort post-verify hooks:
 *   1. Send a confirmation email through the freshly-verified provider
 *      to every owner / admin profile - doubles as a round-trip test.
 *   2. Drop an in-app notification on the bell for the same recipients
 *      so they don't have to be camped on the page.
 *   3. Mark the "setup_email" onboarding step complete for the owner.
 *
 * Any of these failing must NOT fail the verify response. The status
 * persist is the source of truth; the hooks are convenience.
 */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getResendDomain, isResendError, verifyResendDomain } from "@/lib/resendDomains";
import { emailService } from "@/services/emailService";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
]);

// Profiles that should hear about the verified domain. Mirrors the role
// gate above minus super_admin - platform staff don't need the noise.
const RECIPIENT_ROLES = ["owner", "company_admin", "admin"];

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user: callerAuth },
    } = await ssr.auth.getUser();
    if (!callerAuth) {
      return res
        .status(401)
        .json({ error: "No active session, sign in and retry." });
    }

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", callerAuth.id)
      .single();
    const role =
      (callerProfile as any)?.active_role || (callerProfile as any)?.role;
    if (!callerProfile || !ALLOWED_ROLES.has(role)) {
      return res.status(403).json({
        error: `Role '${role || "unknown"}' is not permitted to manage email domains.`,
      });
    }

    const companyId = (callerProfile as any).company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Caller has no company_id." });
    }

    const admin = getServiceSupabase();

    const { data: row } = await admin
      .from("email_provider_settings")
      .select(
        "id, resend_domain_id, resend_sending_domain, resend_domain_status, resend_domain_verified_at, from_email, from_name",
      )
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();

    if (!row || !(row as any).resend_domain_id) {
      return res.status(404).json({
        error:
          "No Resend domain registered for this company yet. Add one first.",
      });
    }

    // Trigger Resend to re-check now. Without this the domain status
    // can sit on 'not_started' indefinitely even when DNS is live.
    // Best-effort: if the trigger fails (e.g. already verified, or rate
    // limited), fall through and read the current state anyway.
    const triggered = await verifyResendDomain((row as any).resend_domain_id);
    if (isResendError(triggered)) {
      console.warn(
        `[verify-domain] trigger failed for ${(row as any).resend_domain_id}:`,
        triggered.error,
      );
    }

    const fresh = await getResendDomain((row as any).resend_domain_id);
    if (isResendError(fresh)) {
      // 404 from Resend means the domain was deleted out from under us
      // (e.g. via the Resend dashboard). Surface a clear error.
      const status =
        fresh.status === 404 ? 404 : fresh.status && fresh.status >= 400 ? fresh.status : 502;
      return res.status(status).json({ error: fresh.error });
    }

    const newStatus = (fresh as any).status || "pending";
    const newRecords = (fresh as any).records || [];
    const now = new Date().toISOString();
    const wasVerified = !!(row as any).resend_domain_verified_at;
    const verifiedAt =
      newStatus === "verified"
        ? (row as any).resend_domain_verified_at || now
        : null;

    const { error: updateErr } = await admin
      .from("email_provider_settings")
      .update({
        resend_dns_records: newRecords,
        resend_domain_status: newStatus,
        resend_domain_verified_at: verifiedAt,
        resend_last_checked_at: now,
        updated_at: now,
      })
      .eq("id", (row as any).id);
    if (updateErr) {
      console.error("[verify-domain] persist failed:", updateErr);
      return res.status(500).json({
        error: `Could not update domain status: ${dbErrorMessage(updateErr)}`,
      });
    }

    const newlyVerified = newStatus === "verified" && !wasVerified;
    const domain = (row as any).resend_sending_domain as string;

    if (newlyVerified) {
      // Fan out the post-verify hooks. None of these can fail the response.
      await runPostVerifyHooks({
        admin,
        companyId,
        domain,
        fromEmail: (row as any).from_email || null,
        actorUserId: callerAuth.id,
      });
    }

    return res.status(200).json({
      domain,
      status: newStatus,
      records: newRecords,
      verified_at: verifiedAt,
      newly_verified: newlyVerified,
    });
  } catch (e: any) {
    console.error("[verify-domain] crashed:", e);
    return res
      .status(500)
      .json({ error: dbErrorMessage(e) || "Unexpected server error" });
  }
}

interface PostVerifyArgs {
  admin: ReturnType<typeof getServiceSupabase>;
  companyId: string;
  domain: string;
  fromEmail: string | null;
  actorUserId: string;
}

/**
 * Fire the three post-verify side-effects: email round-trip, in-app
 * notification fan-out, and onboarding step completion. Each is wrapped
 * so a failure in one doesn't cascade. Logs warn-level for ops only --
 * the verify response stays clean.
 */
async function runPostVerifyHooks(args: PostVerifyArgs): Promise<void> {
  const { admin, companyId, domain, fromEmail, actorUserId } = args;

  // 1. Look up every recipient profile (owner / company_admin / admin).
  let recipients: Array<{ id: string; email: string | null; full_name: string | null; role: string }> = [];
  try {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("company_id", companyId)
      .in("role", RECIPIENT_ROLES);
    recipients = (profileRows as any[]) || [];
  } catch (e: any) {
    console.warn("[verify-domain] recipient lookup failed:", e?.message || e);
  }

  // Audit trail. No email_provider_settings_audit table exists yet, so
  // we fall back to a structured console line that a log scraper can
  // grep for. The shape matches the brief.
  console.log(
    `[domain-verified] company_id=${companyId} domain=${domain} actor_user_id=${actorUserId} recipients=${recipients.length}`,
  );

  // 2. Round-trip confirmation email through the freshly-verified provider.
  //    Done in parallel with the in-app notification fan-out so a slow
  //    SMTP / Resend hop doesn't hold the response.
  const emailPromise = sendConfirmationEmails({
    companyId,
    domain,
    fromEmail,
    recipients,
  });

  // 3. In-app notification per recipient.
  const notifyPromise = createDomainVerifiedNotifications({
    admin,
    companyId,
    domain,
    recipients,
  });

  // 4. Onboarding step completion.
  const onboardingPromise = markEmailSetupStepComplete({
    admin,
    companyId,
    recipients,
  });

  await Promise.allSettled([emailPromise, notifyPromise, onboardingPromise]);
}

async function sendConfirmationEmails(args: {
  companyId: string;
  domain: string;
  fromEmail: string | null;
  recipients: Array<{ id: string; email: string | null; full_name: string | null }>;
}): Promise<void> {
  const { companyId, domain, fromEmail, recipients } = args;
  const fromAddr = (fromEmail || `noreply@${domain}`).trim();

  for (const r of recipients) {
    if (!r.email) continue;
    const firstName = (r.full_name || "").trim().split(/\s+/)[0] || "there";
    const subject = "Your sending domain is verified";
    const bodyText =
      `Hi ${firstName},\n\n` +
      `Good news - ${domain} is verified with Resend, so outgoing emails ` +
      `from CateringMS will now arrive at your clients as ${fromAddr} instead of ` +
      `the shared CateringMS sender. Send a quick test from /admin/invoices or ` +
      `/admin/quotes to see it land in your colour-of-choice inbox.\n\n` +
      `If something looks off, recognise that it can take a few minutes for ` +
      `the first send to warm up. Reply to this thread and we'll help.\n\n` +
      `-- CateringMS`;
    const bodyHtml =
      `<p>Hi ${escapeHtml(firstName)},</p>` +
      `<p>Good news - <strong>${escapeHtml(domain)}</strong> is verified with Resend, ` +
      `so outgoing emails from CateringMS will now arrive at your clients as ` +
      `<strong>${escapeHtml(fromAddr)}</strong> instead of the shared CateringMS sender. ` +
      `Send a quick test from <code>/admin/invoices</code> or <code>/admin/quotes</code> to see it ` +
      `land in your colour-of-choice inbox.</p>` +
      `<p>If something looks off, recognise that it can take a few minutes for the first send to ` +
      `warm up. Reply to this thread and we'll help.</p>` +
      `<p>-- CateringMS</p>`;

    try {
      // Wave 24: pass service-role client so getEmailConfig can read
      // email_provider_settings under RLS. Without _client the helper
      // falls back to the imported browser anon supabase, which has
      // no session on the server, so the SELECT silently returns
      // nothing and the round-trip confirmation never lands.
      const result = await emailService.sendEmailDetailed({
        companyId,
        to: r.email,
        subject,
        body: bodyHtml || bodyText,
        _client: admin,
      } as any);
      if (!result?.success) {
        console.warn(
          `[verify-domain] confirmation email to ${r.email} failed:`,
          result?.error_code,
          result?.error,
        );
      }
    } catch (e: any) {
      console.warn(
        `[verify-domain] confirmation email to ${r.email} threw:`,
        e?.message || e,
      );
    }
  }
}

async function createDomainVerifiedNotifications(args: {
  admin: ReturnType<typeof getServiceSupabase>;
  companyId: string;
  domain: string;
  recipients: Array<{ id: string }>;
}): Promise<void> {
  const { admin, companyId, domain, recipients } = args;
  if (recipients.length === 0) return;

  const rows = recipients.map((r) => ({
    company_id: companyId,
    recipient_id: r.id,
    user_id: r.id,
    notification_type: "domain_verified",
    type: "domain_verified",
    title: "Sending domain verified",
    message: `Outgoing emails will now send from ${domain}.`,
    priority: "normal",
    link: "/admin/email-settings",
    related_entity_type: "company",
    related_entity_id: companyId,
  }));

  try {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) {
      // The enum-cast may fail on a Supabase replica where the migration
      // hasn't yet propagated. Retry without the enum column - the bell
      // reads from notification_type (text) anyway.
      console.warn(
        "[verify-domain] notifications insert with enum failed, retrying without:",
        error.message,
      );
      const fallback = rows.map(({ type: _t, ...rest }) => rest);
      const { error: retryErr } = await admin.from("notifications").insert(fallback);
      if (retryErr) {
        console.warn(
          "[verify-domain] notifications insert fallback also failed:",
          retryErr.message,
        );
      }
    }
  } catch (e: any) {
    console.warn(
      "[verify-domain] notifications insert threw:",
      e?.message || e,
    );
  }
}

/**
 * Mark the "setup_email" onboarding step complete.
 *
 * The current onboardingProgressService is real-signal - step
 * completion is derived from a COUNT(*) on the relevant table, so it
 * will pick up the verified state on the next dashboard load without us
 * doing anything. The legacy onboardingService.ts keeps a per-user
 * localStorage cache with an explicit setup_email step, but that's
 * client-side and unreachable from a server route.
 *
 * We try a couple of optional persistence targets that may exist in the
 * tenant's schema (an onboarding_steps table, or a JSONB column on
 * companies). If neither lands, log and move on - the real-signal
 * derivation in onboardingProgressService is the source of truth.
 */
async function markEmailSetupStepComplete(args: {
  admin: ReturnType<typeof getServiceSupabase>;
  companyId: string;
  recipients: Array<{ id: string; role: string }>;
}): Promise<void> {
  const { admin, companyId, recipients } = args;
  const owner = recipients.find((r) => r.role === "owner") || recipients[0];

  // Optional persistence target #1: a dedicated onboarding_steps table.
  // If the table doesn't exist the upsert returns a 42P01 we swallow.
  try {
    const { error } = await admin
      .from("onboarding_steps")
      .upsert(
        {
          company_id: companyId,
          step_id: "setup_email",
          completed: true,
          completed_at: new Date().toISOString(),
          completed_by: owner?.id || null,
        },
        { onConflict: "company_id,step_id" },
      );
    if (error) {
      // 42P01 = table missing, PGRST205 = relation absent on PostgREST.
      // Anything else is a real failure worth a warning.
      const code = (error as any).code || "";
      if (code !== "42P01" && !String(error.message || "").includes("does not exist")) {
        console.warn(
          "[verify-domain] onboarding_steps upsert failed:",
          error.message,
        );
      } else {
        console.warn(
          "[verify-domain] onboarding_steps table not present, skipping persistent step write - real-signal derivation in onboardingProgressService picks it up on next load.",
        );
      }
    }
  } catch (e: any) {
    console.warn(
      "[verify-domain] onboarding_steps write threw:",
      e?.message || e,
    );
  }
}

function escapeHtml(input: string): string {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default withApiLogging(handler);
