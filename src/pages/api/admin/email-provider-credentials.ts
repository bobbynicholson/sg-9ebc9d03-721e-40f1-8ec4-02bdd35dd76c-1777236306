import type { NextApiRequest, NextApiResponse } from "next";
import { requireActiveApiProfile } from "@/lib/requireActiveApiProfile";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  loadEmailProviderCredentials,
  readLegacyEmailProviderCredentials,
  saveEmailProviderCredentials,
  type EmailCredentialProvider,
} from "@/lib/email/providerCredentials";
import { withApiLogging } from "@/lib/withApiLogging";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const PROVIDERS = new Set<EmailCredentialProvider>(["smtp", "mailchimp", "gmail_oauth", "ms365_oauth"]);
const SECRET_FIELD: Record<EmailCredentialProvider, string> = {
  smtp: "smtpPassword",
  mailchimp: "apiKey",
  gmail_oauth: "refreshToken",
  ms365_oauth: "refreshToken",
};
const LEGACY_SECRET_COLUMN: Record<EmailCredentialProvider, string> = {
  smtp: "smtp_pass_encrypted",
  mailchimp: "mailchimp_api_key_encrypted",
  gmail_oauth: "oauth_refresh_token_encrypted",
  ms365_oauth: "oauth_refresh_token_encrypted",
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  const actor = await requireActiveApiProfile(req, res, ADMIN_ROLES);
  if (!actor) return;
  const companyId = actor.profile.company_id;
  if (!companyId) return res.status(403).json({ error: "Company access required" });

  if (req.method === "GET") {
    try {
      const status: Record<string, { configured: boolean; decryptable: boolean }> = {};
      for (const provider of PROVIDERS) {
        const stored = await loadEmailProviderCredentials(companyId, provider);
        if (stored) {
          const present = typeof stored[SECRET_FIELD[provider]] === "string";
          status[provider] = { configured: present, decryptable: present };
          continue;
        }
        const legacy = await readLegacyEmailProviderCredentials(companyId, provider);
        status[provider] = { configured: !!legacy[SECRET_FIELD[provider]], decryptable: false };
      }
      return res.status(200).json({ credentials: status });
    } catch {
      return res.status(503).json({ error: "Could not check saved email credentials" });
    }
  }

  if (req.method === "POST") {
    const provider = String(req.body?.provider || "") as EmailCredentialProvider;
    const secret = req.body?.secret;
    if (!PROVIDERS.has(provider)) return res.status(400).json({ error: "Unsupported email provider" });
    if (typeof secret !== "string" || !secret.trim() || secret.length > 8192) {
      return res.status(400).json({ error: "A valid credential is required" });
    }
    try {
      const admin = getServiceSupabase();
      // Ensure the settings row exists before saving a secret. It also
      // prevents orphaned credentials from being created for bad providers.
      const { data: row, error: rowError } = await admin.from("email_provider_settings")
        .select("id")
        .eq("company_id", companyId)
        .eq("provider", provider)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row) return res.status(409).json({ error: "Save the provider settings before saving its credential" });

      await saveEmailProviderCredentials(companyId, provider, { [SECRET_FIELD[provider]]: secret }, admin);
      // A newly submitted secret supersedes any old value in the client
      // settings row. Clear that legacy copy only after the encrypted
      // vault write has succeeded.
      const { error: clearError } = await admin.from("email_provider_settings")
        .update({ [LEGACY_SECRET_COLUMN[provider]]: null })
        .eq("company_id", companyId)
        .eq("provider", provider);
      if (clearError) throw clearError;
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(503).json({ error: "Could not save the encrypted email credential" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

export default withApiLogging(handler);
