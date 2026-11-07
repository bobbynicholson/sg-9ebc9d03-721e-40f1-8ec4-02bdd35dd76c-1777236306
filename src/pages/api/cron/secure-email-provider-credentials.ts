import type { NextApiRequest, NextApiResponse } from "next";
import { requireCronAuth } from "@/lib/cronAuth";
import { decryptCredentialBundle, encryptCredentialBundle } from "@/lib/credentialVault";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

const SECRET_FIELDS = [
  { column: "smtp_pass_encrypted", provider: "smtp", key: "smtpPassword" },
  { column: "mailchimp_api_key_encrypted", provider: "mailchimp", key: "apiKey" },
  { column: "oauth_refresh_token_encrypted", provider: "gmail_oauth", key: "refreshToken" },
] as const;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!["GET", "POST"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const admin = getServiceSupabase();
  const batchSize = 100;
  try {
    const { data: rows, error } = await admin.from("email_provider_settings")
      .select("company_id, provider, smtp_pass_encrypted, mailchimp_api_key_encrypted, oauth_refresh_token_encrypted, updated_at")
      .or("smtp_pass_encrypted.not.is.null,mailchimp_api_key_encrypted.not.is.null,oauth_refresh_token_encrypted.not.is.null")
      .order("company_id", { ascending: true })
      .limit(batchSize + 1);
    if (error) throw error;

    let encrypted = 0;
    let cleared = 0;
    for (const row of (rows || []).slice(0, batchSize)) {
      for (const field of SECRET_FIELDS) {
        const source = row[field.column];
        if (typeof source !== "string") continue;
        const legacyValue = source;
        const value = legacyValue.trim();
        if (!value) {
          const blankClear = await clearLegacy(admin, row, field.column, legacyValue);
          cleared += blankClear;
          continue;
        }

        const provider = field.column === "oauth_refresh_token_encrypted" ? row.provider : field.provider;
        if (field.column === "oauth_refresh_token_encrypted" && !["gmail_oauth", "ms365_oauth"].includes(provider)) continue;
        const { data: vault, error: vaultError } = await admin.from("email_provider_credential_vault")
          .select("credentials")
          .eq("company_id", row.company_id)
          .eq("provider", provider)
          .maybeSingle();
        if (vaultError) throw vaultError;

        const credentials = vault?.credentials ? await decryptCredentialBundle(vault.credentials) : {};
        if (typeof credentials[field.key] !== "string") {
          const next = { ...credentials, [field.key]: legacyValue };
          const { error: saveError } = await admin.from("email_provider_credential_vault").upsert({
            company_id: row.company_id,
            provider,
            credentials: await encryptCredentialBundle(next, `${row.company_id}:${provider}`),
            updated_at: new Date().toISOString(),
          }, { onConflict: "company_id,provider" });
          if (saveError) throw saveError;

          const { data: verified, error: verifyError } = await admin.from("email_provider_credential_vault")
            .select("credentials")
            .eq("company_id", row.company_id)
            .eq("provider", provider)
            .maybeSingle();
          if (verifyError) throw verifyError;
          const decrypted = verified?.credentials ? await decryptCredentialBundle(verified.credentials) : {};
          if (decrypted[field.key] !== legacyValue) throw new Error("Email credential vault verification failed");
          encrypted++;
        }

        cleared += await clearLegacy(admin, row, field.column, legacyValue);
      }
    }

    return res.status(200).json({
      ok: true,
      scanned: Math.min(rows?.length || 0, batchSize),
      encrypted,
      cleared,
      hasMore: (rows?.length || 0) > batchSize,
    });
  } catch {
    return res.status(503).json({ error: "Could not complete the email credential backfill" });
  }
}

async function clearLegacy(admin: any, row: any, column: string, value: string): Promise<number> {
  let query = admin.from("email_provider_settings").update({ [column]: null })
    .eq("company_id", row.company_id)
    .eq("provider", row.provider)
    .eq(column, value);
  query = row.updated_at ? query.eq("updated_at", row.updated_at) : query.is("updated_at", null);
  const { data, error } = await query.select("company_id");
  if (error) throw error;
  return data?.length || 0;
}

export default withApiLogging(handler, "cron");
