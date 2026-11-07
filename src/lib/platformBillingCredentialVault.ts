import { decryptSecret, encryptSecret, keyedSecretHash, keyedSecretHashCandidates } from "@/lib/credentialVault";

/** PayFast billing tokens are readable only by service-role server code. */
export async function getPayfastSubscriptionToken(admin: any, companyId: string): Promise<string | null> {
  const { data, error } = await admin.from("platform_billing_credentials")
    .select("token_ciphertext, token_hash, legacy_token").eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.token_ciphertext) return decryptSecret(data.token_ciphertext);
  if (!data.legacy_token) return null;
  await migrateLegacyPayfastToken(admin, companyId, String(data.legacy_token));
  const { data: refreshed, error: refreshError } = await admin.from("platform_billing_credentials")
    .select("token_ciphertext, legacy_token").eq("company_id", companyId).maybeSingle();
  if (refreshError) throw refreshError;
  if (refreshed?.token_ciphertext) return decryptSecret(refreshed.token_ciphertext);
  return refreshed?.legacy_token || null;
}

export async function storePayfastSubscriptionToken(admin: any, companyId: string, token: string): Promise<void> {
  const clean = String(token || "").trim();
  if (!clean) return;
  const { error } = await admin.from("platform_billing_credentials").upsert({
    company_id: companyId,
    provider: "payfast",
    token_ciphertext: await encryptSecret(clean),
    token_hash: await keyedSecretHash(clean),
    legacy_token: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" });
  if (error) throw error;
}

export async function findCompanyByPayfastToken(admin: any, token: string): Promise<string | null> {
  const clean = String(token || "").trim();
  if (!clean) return null;
  const hashes = await keyedSecretHashCandidates(clean);
  const { data: hashed, error: hashError } = await admin.from("platform_billing_credentials")
    .select("company_id").in("token_hash", hashes).limit(1).maybeSingle();
  if (hashError) throw hashError;
  if (hashed?.company_id) return hashed.company_id;

  // Migrate a token copied out of the previous companies column as soon
  // as PayFast retries an existing notification for that agreement.
  const { data: legacy, error: legacyError } = await admin.from("platform_billing_credentials")
    .select("company_id").eq("legacy_token", clean).maybeSingle();
  if (legacyError) throw legacyError;
  if (!legacy?.company_id) return null;
  await migrateLegacyPayfastToken(admin, legacy.company_id, clean);
  return legacy.company_id;
}

async function migrateLegacyPayfastToken(admin: any, companyId: string, token: string): Promise<boolean> {
  const { data, error } = await admin.from("platform_billing_credentials").update({
    token_ciphertext: await encryptSecret(token),
    token_hash: await keyedSecretHash(token),
    legacy_token: null,
  }).eq("company_id", companyId).eq("legacy_token", token).is("token_ciphertext", null).select("company_id");
  if (error) throw error;
  return !!data?.length;
}

/** Encrypt every legacy row in one idempotent pass; safe to call from a cron/admin task. */
export async function migrateLegacyPayfastTokens(admin: any, limit = 250): Promise<number> {
  const { data, error } = await admin.from("platform_billing_credentials")
    .select("company_id, legacy_token").not("legacy_token", "is", null).neq("legacy_token", "").limit(limit);
  if (error) throw error;
  const rows = (data || []).filter((row: any) => row.legacy_token);
  if (!rows.length) return 0;
  const results = await Promise.all(rows.map((row: any) => migrateLegacyPayfastToken(admin,
    row.company_id, String(row.legacy_token))));
  return results.filter(Boolean).length;
}
