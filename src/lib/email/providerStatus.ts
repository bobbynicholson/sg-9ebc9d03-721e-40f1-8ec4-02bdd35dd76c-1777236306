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
 * "Configured" means: a row exists for this company in
 * email_provider_settings AND the chosen provider has the columns
 * it needs (Resend domain set + verified, OR SMTP host populated,
 * OR Mailchimp key set).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmailProviderStatus {
  configured: boolean;
  provider: string | null;
  isVerified: boolean;
  /** Plain-English reason this tenant isn't ready to send (when not configured). */
  reason: string | null;
}

const NOT_FOUND: EmailProviderStatus = {
  configured: false,
  provider: null,
  isVerified: false,
  reason: "No email provider configured.",
};

export async function getEmailProviderStatus(
  supabase: SupabaseClient,
  companyId: string,
): Promise<EmailProviderStatus> {
  if (!companyId) return NOT_FOUND;

  const { data, error } = await (supabase as any)
    .from("email_provider_settings")
    .select(
      "provider, smtp_host, smtp_user, mailchimp_api_key_encrypted, resend_domain_status, is_verified",
    )
    .eq("company_id", companyId)
    .maybeSingle();

  // RLS / row-missing -> "not configured" so the banner shows.
  // Failing closed: the cost of a false positive (one banner) is
  // tiny vs. clients silently never receiving emails.
  if (error || !data) return NOT_FOUND;

  const provider = (data.provider || "").toLowerCase();
  const isVerified = !!data.is_verified;

  if (!provider) {
    return {
      configured: false,
      provider: null,
      isVerified: false,
      reason: "No provider chosen yet.",
    };
  }

  // Per-provider readiness check.
  let providerReady = false;
  let providerMissing = "";
  if (provider === "resend") {
    // resend_domain_status === 'verified' is the strict gate; older
    // tenants without the domain workflow can fall back to is_verified.
    providerReady = data.resend_domain_status === "verified" || isVerified;
    if (!providerReady) providerMissing = "Resend domain isn't verified yet.";
  } else if (provider === "smtp") {
    providerReady = !!data.smtp_host && !!data.smtp_user;
    if (!providerReady) providerMissing = "SMTP host or user is missing.";
  } else if (provider === "mailchimp") {
    providerReady = !!data.mailchimp_api_key_encrypted;
    if (!providerReady) providerMissing = "Mailchimp API key is missing.";
  } else {
    providerMissing = `Unknown provider "${provider}".`;
  }

  return {
    configured: providerReady,
    provider,
    isVerified,
    reason: providerReady ? null : providerMissing,
  };
}
