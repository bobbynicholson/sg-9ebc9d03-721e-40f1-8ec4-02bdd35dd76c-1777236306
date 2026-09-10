/**
 * Email-provider status check.
 *
 * Wave 40.2 - before this, two surfaces (the dashboard
 * EmailProviderBanner and the admin/leads "email is on" banner)
 * both queried the WRONG table (`email_settings` instead of
 * `email_provider_settings`) AND filtered by the WRONG column
 * (`user_id` instead of `company_id`) AND asked for columns that
 * don't exist on either table (`smtp_host` / `resend_api_key_set`
 * etc. on a 9-column `email_settings` skeleton).
 *
 * Net: the banner showed "not configured" for every tenant, even
 * the ones who'd properly set up Resend or SMTP via
 * /admin/email-settings. Both call sites now route through this
 * helper so the check stays consistent and any schema change lands
 * in one place.
 *
 * TIGHTEN I.37 (2026-06-01): the helper now returns a tri-state
 * `state` because "configured: false" was conflating two very
 * different situations and the dashboard banner was screaming
 * "EMAILS WILL NOT BE SENT" at every fresh tenant when in practice
 * their emails were going out fine via the shared platform Resend
 * sender. The three states are:
 *
 *   - "verified"          - operator's own domain is verified, emails
 *                           send from their address (best state).
 *   - "platform_default"  - sending via shared noreply@send.cateringms.com
 *                           with Reply-To set to the operator's address.
 *                           This is the OUT-OF-THE-BOX working state for
 *                           every tenant who hasn't done DNS yet. Emails
 *                           DO go out; clicking "Reply" in the client's
 *                           inbox routes back to the operator. The only
 *                           thing missing is the FROM brand.
 *   - "broken"            - operator explicitly chose an alternative
 *                           provider (SMTP / Mailchimp / Gmail) and
 *                           didn't finish wiring it. emailService cannot
 *                           fall back to platform Resend in this branch
 *                           because they've told it to use something
 *                           specific.
 *
 * `configured` is preserved for back-compat - it's true for both
 * "verified" and "platform_default" (emails work), false for "broken".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailProviderState = "verified" | "platform_default" | "broken";

export interface EmailProviderStatus {
  /** Tri-state, see file header. */
  state: EmailProviderState;
  /** Back-compat: true when emails can actually be sent (verified OR
   *  platform_default). False only when state === "broken". */
  configured: boolean;
  provider: string | null;
  isVerified: boolean;
  /** The address replies route to (and, when verified, the from address). */
  fromEmail: string | null;
  /** Plain-English reason a tenant in "broken" state can't send. Null
   *  for the other two states. */
  reason: string | null;
}

const PLATFORM_DEFAULT_NO_ROW: EmailProviderStatus = {
  state: "platform_default",
  configured: true,
  provider: null,
  isVerified: false,
  fromEmail: null,
  reason: null,
};

export async function getEmailProviderStatus(
  supabase: SupabaseClient,
  companyId: string,
): Promise<EmailProviderStatus> {
  if (!companyId) return PLATFORM_DEFAULT_NO_ROW;

  const { data, error } = await (supabase as any)
    .from("email_provider_settings")
    .select(
      "provider, from_email, smtp_host, smtp_user, mailchimp_api_key_encrypted, resend_domain_status, is_verified",
    )
    .eq("company_id", companyId)
    .maybeSingle();

  // RLS / row-missing -> fall through to platform default. emailService
  // sends via the shared noreply@send.cateringms.com Resend sender in
  // this branch, so emails DO go out - the operator just hasn't set up
  // their own branding yet.
  if (error || !data) return PLATFORM_DEFAULT_NO_ROW;

  const provider = (data.provider || "").toLowerCase();
  const isVerified = !!data.is_verified;
  const fromEmail: string | null = data.from_email || null;

  // No explicit provider chosen yet - same as no row.
  if (!provider) {
    return {
      state: "platform_default",
      configured: true,
      provider: null,
      isVerified: false,
      fromEmail,
      reason: null,
    };
  }

  // Resend is the default - and the only provider that has the
  // platform fallback. If the domain isn't verified, emails still go
  // out from noreply@send.cateringms.com with Reply-To = fromEmail.
  if (provider === "resend") {
    const verified = data.resend_domain_status === "verified" || isVerified;
    return {
      state: verified ? "verified" : "platform_default",
      configured: true,
      provider,
      isVerified: verified,
      fromEmail,
      reason: null,
    };
  }

  // Alternative providers - the operator has explicitly opted out of
  // the platform fallback, so a half-wired config really does break
  // sending.
  if (provider === "smtp") {
    const ready = !!data.smtp_host && !!data.smtp_user;
    return {
      state: ready ? "verified" : "broken",
      configured: ready,
      provider,
      isVerified: ready,
      fromEmail,
      reason: ready ? null : "SMTP host or user is missing.",
    };
  }

  if (provider === "mailchimp") {
    const ready = !!data.mailchimp_api_key_encrypted;
    return {
      state: ready ? "verified" : "broken",
      configured: ready,
      provider,
      isVerified: ready,
      fromEmail,
      reason: ready ? null : "Mailchimp API key is missing.",
    };
  }

  // Unknown provider string - treat as broken so an operator notices
  // and routes through email settings.
  return {
    state: "broken",
    configured: false,
    provider,
    isVerified: false,
    fromEmail,
    reason: `Unknown provider "${provider}".`,
  };
}
