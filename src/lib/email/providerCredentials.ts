import { decryptCredentialBundle, encryptCredentialBundle } from "@/lib/credentialVault";

export type EmailCredentialProvider = "smtp" | "mailchimp" | "gmail_oauth" | "ms365_oauth";

function isMissingVaultTable(error: any): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export function getEmailCredentialAdminClient(): any {
  if (typeof window !== "undefined") {
    throw new Error("Email provider credentials are server-only");
  }
  // Keep the service-role client out of browser bundles that import the
  // broader email service for non-secret helpers.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/lib/supabase/service").getServiceSupabase();
}

export async function loadEmailProviderCredentials(
  companyId: string,
  provider: EmailCredentialProvider,
  admin = getEmailCredentialAdminClient(),
): Promise<Record<string, string> | null> {
  const { data, error } = await admin
    .from("email_provider_credential_vault")
    .select("credentials")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .maybeSingle();
  if (error && !isMissingVaultTable(error)) throw error;
  if (error) return null;
  if (!data?.credentials) return null;
  return decryptCredentialBundle(data.credentials);
}

export async function saveEmailProviderCredentials(
  companyId: string,
  provider: EmailCredentialProvider,
  credentials: Record<string, string>,
  admin = getEmailCredentialAdminClient(),
): Promise<void> {
  const { error } = await admin.from("email_provider_credential_vault").upsert({
    company_id: companyId,
    provider,
    credentials: await encryptCredentialBundle(credentials, `${companyId}:${provider}`),
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,provider" });
  if (error) throw error;
}

export async function readLegacyEmailProviderCredentials(
  companyId: string,
  provider: EmailCredentialProvider,
  admin = getEmailCredentialAdminClient(),
): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from("email_provider_settings")
    .select("smtp_pass_encrypted, mailchimp_api_key_encrypted, oauth_refresh_token_encrypted")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  if (!data) return {};
  if (provider === "smtp" && data.smtp_pass_encrypted) return { smtpPassword: data.smtp_pass_encrypted };
  if (provider === "mailchimp" && data.mailchimp_api_key_encrypted) return { apiKey: data.mailchimp_api_key_encrypted };
  if ((provider === "gmail_oauth" || provider === "ms365_oauth") && data.oauth_refresh_token_encrypted) {
    return { refreshToken: data.oauth_refresh_token_encrypted };
  }
  return {};
}

export async function moveLegacyEmailProviderCredentials(
  companyId: string,
  provider: EmailCredentialProvider,
  admin = getEmailCredentialAdminClient(),
): Promise<Record<string, string>> {
  const stored = await loadEmailProviderCredentials(companyId, provider, admin);
  if (stored) return stored;

  const legacy = await readLegacyEmailProviderCredentials(companyId, provider, admin);
  if (!Object.keys(legacy).length) return {};

  try {
    await saveEmailProviderCredentials(companyId, provider, legacy, admin);
  } catch (error) {
    // The app can be deployed before the vault migration. Keep SMTP
    // delivery working during that window; the backfill worker will move
    // the legacy value once the vault table exists.
    if (isMissingVaultTable(error)) return legacy;
    throw error;
  }
  const cleared: Record<string, null> = {};
  if (provider === "smtp") cleared.smtp_pass_encrypted = null;
  if (provider === "mailchimp") cleared.mailchimp_api_key_encrypted = null;
  if (provider === "gmail_oauth" || provider === "ms365_oauth") cleared.oauth_refresh_token_encrypted = null;
  const { error } = await admin.from("email_provider_settings").update(cleared)
    .eq("company_id", companyId).eq("provider", provider);
  if (error) throw error;
  return legacy;
}
