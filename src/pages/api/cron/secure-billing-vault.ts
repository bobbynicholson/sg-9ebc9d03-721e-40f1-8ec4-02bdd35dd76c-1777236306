/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { decryptCredentialBundle, decryptSecret, encryptCredentialBundle, encryptSecret, keyedSecretHash } from "@/lib/credentialVault";
import { migrateLegacyPayfastTokens } from "@/lib/platformBillingCredentialVault";
import { encryptWhatsAppToken } from "@/lib/whatsapp/credentials";
import { withApiLogging } from "@/lib/withApiLogging";

async function applyBatch<T>(rows: T[], updateRow: (row: T) => Promise<{ data: any[] | null; error: any }>): Promise<number> {
  let updated = 0;
  for (let offset = 0; offset < rows.length; offset += 25) {
    const results = await Promise.all(rows.slice(offset, offset + 25).map(updateRow));
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    updated += results.reduce((count, result) => count + (result.data?.length || 0), 0);
  }
  return updated;
}

function missingLegacyColumn(error: any, column: string): boolean {
  const message = String(error?.message || "");
  return (error?.code === "42703" || error?.code === "PGRST204") && message.toLowerCase().includes(column.toLowerCase());
}

/** Bring late writes from the old app into the encrypted PayFast vault, then erase the old source value. */
async function migrateCompanyPayfastTokens(admin: any, limit: number): Promise<{ scanned: number; cleared: number; encrypted: number }> {
  const { data: companies, error } = await admin.from("companies")
    .select("id, payfast_subscription_token, updated_at")
    .not("payfast_subscription_token", "is", null).neq("payfast_subscription_token", "").limit(limit);
  if (error) {
    if (missingLegacyColumn(error, "payfast_subscription_token")) return { scanned: 0, cleared: 0, encrypted: 0 };
    throw error;
  }

  for (const company of companies || []) {
    const token = String(company.payfast_subscription_token || "").trim();
    if (!token) continue;
    const { data: vault, error: vaultError } = await admin.from("platform_billing_credentials")
      .select("token_ciphertext, legacy_token, updated_at").eq("company_id", company.id).maybeSingle();
    if (vaultError) throw vaultError;
    const currentToken = vault?.token_ciphertext ? await decryptSecret(vault.token_ciphertext) : String(vault?.legacy_token || "");
    if (currentToken !== token) {
      const sourceAt = Date.parse(String(company.updated_at || "")) || 0;
      const vaultAt = Date.parse(String(vault?.updated_at || "")) || 0;
      if (!vault || sourceAt >= vaultAt) {
        const patch = {
          company_id: company.id,
          provider: "payfast",
          token_ciphertext: null,
          token_hash: null,
          legacy_token: token,
          updated_at: company.updated_at || new Date().toISOString(),
        };
        if (!vault) {
          const { error: insertError } = await admin.from("platform_billing_credentials").insert(patch);
          if (insertError && String(insertError.code) !== "23505") throw insertError;
        } else {
          let update = admin.from("platform_billing_credentials").update(patch).eq("company_id", company.id);
          update = vault.updated_at ? update.eq("updated_at", vault.updated_at) : update.is("updated_at", null);
          const { error: updateError } = await update;
          if (updateError) throw updateError;
        }
      }
    }
  }

  const tokenRowsMigrated = await migrateLegacyPayfastTokens(admin, limit);
  let cleared = 0;
  for (const company of companies || []) {
    const token = String(company.payfast_subscription_token || "").trim();
    if (!token) continue;
    const { data: vault, error: vaultError } = await admin.from("platform_billing_credentials")
      .select("token_ciphertext, updated_at").eq("company_id", company.id).maybeSingle();
    if (vaultError) throw vaultError;
    if (!vault?.token_ciphertext) continue;
    const vaultToken = await decryptSecret(vault.token_ciphertext);
    const sourceAt = Date.parse(String(company.updated_at || "")) || 0;
    const vaultAt = Date.parse(String(vault.updated_at || "")) || 0;
    if (vaultToken !== token && vaultAt < sourceAt) continue;
    let clear = admin.from("companies").update({ payfast_subscription_token: null }).eq("id", company.id)
      .eq("payfast_subscription_token", company.payfast_subscription_token);
    if (company.updated_at) clear = clear.eq("updated_at", company.updated_at);
    const { data: changed, error: clearError } = await clear.select("id");
    if (clearError) throw clearError;
    cleared += changed?.length || 0;
  }
  return { scanned: companies?.length || 0, cleared, encrypted: tokenRowsMigrated };
}

/** Copy late legacy supplier edits, encrypt the service-only vault row, then clear the old browser-readable column. */
async function migrateLegacySupplierAccounts(admin: any, limit: number): Promise<{ scanned: number; cleared: number; encrypted: number }> {
  const { data: suppliers, error } = await admin.from("suppliers")
    .select("id, company_id, account_number, updated_at")
    .not("account_number", "is", null).neq("account_number", "").limit(limit);
  if (error) {
    if (missingLegacyColumn(error, "account_number")) return { scanned: 0, cleared: 0, encrypted: 0 };
    throw error;
  }

  for (const supplier of suppliers || []) {
    const accountNumber = String(supplier.account_number || "");
    if (!accountNumber) continue;
    const { data: bank, error: bankError } = await admin.from("supplier_bank_details")
      .select("account_number, account_number_ciphertext, updated_at")
      .eq("supplier_id", supplier.id).eq("company_id", supplier.company_id).maybeSingle();
    if (bankError) throw bankError;
    if (!bank) {
      const { error: insertError } = await admin.from("supplier_bank_details").insert({
        supplier_id: supplier.id,
        company_id: supplier.company_id,
        account_number: accountNumber,
        account_number_ciphertext: null,
        updated_at: supplier.updated_at || new Date().toISOString(),
      });
      if (insertError && String(insertError.code) !== "23505") throw insertError;
      continue;
    }

    const stored = bank.account_number_ciphertext
      ? await decryptSecret(bank.account_number_ciphertext)
      : String(bank.account_number || "");
    if (stored !== accountNumber) {
      const sourceAt = Date.parse(String(supplier.updated_at || "")) || 0;
      const bankAt = Date.parse(String(bank.updated_at || "")) || 0;
      if (sourceAt >= bankAt) {
        let update = admin.from("supplier_bank_details").update({
          account_number: accountNumber,
          account_number_ciphertext: null,
          updated_at: supplier.updated_at || new Date().toISOString(),
        }).eq("supplier_id", supplier.id).eq("company_id", supplier.company_id);
        update = bank.updated_at ? update.eq("updated_at", bank.updated_at) : update.is("updated_at", null);
        const { error: updateError } = await update;
        if (updateError) throw updateError;
      }
    }
  }

  const { data: plaintextRows, error: plainError } = await admin.from("supplier_bank_details")
    .select("supplier_id, account_number, updated_at")
    .is("account_number_ciphertext", null).not("account_number", "is", null).neq("account_number", "").limit(limit);
  if (plainError) throw plainError;
  const encrypted = await applyBatch(plaintextRows || [], async (row: any) => admin.from("supplier_bank_details")
    .update({ account_number_ciphertext: await encryptSecret(String(row.account_number)), account_number: null })
    .eq("supplier_id", row.supplier_id).eq("account_number", row.account_number).eq("updated_at", row.updated_at)
    .is("account_number_ciphertext", null).select("supplier_id"));

  let cleared = 0;
  for (const supplier of suppliers || []) {
    if (!supplier.account_number) continue;
    const { data: bank, error: bankError } = await admin.from("supplier_bank_details")
      .select("account_number_ciphertext, updated_at").eq("supplier_id", supplier.id).maybeSingle();
    if (bankError) throw bankError;
    if (!bank?.account_number_ciphertext) continue;
    const securedAccount = await decryptSecret(bank.account_number_ciphertext);
    const sourceAt = Date.parse(String(supplier.updated_at || "")) || 0;
    const bankAt = Date.parse(String(bank.updated_at || "")) || 0;
    if (securedAccount !== supplier.account_number && bankAt < sourceAt) continue;
    let clear = admin.from("suppliers").update({ account_number: null }).eq("id", supplier.id)
      .eq("company_id", supplier.company_id).eq("account_number", supplier.account_number);
    if (supplier.updated_at) clear = clear.eq("updated_at", supplier.updated_at);
    const { data: changed, error: clearError } = await clear.select("id");
    if (clearError) throw clearError;
    cleared += changed?.length || 0;
  }
  return { scanned: suppliers?.length || 0, cleared, encrypted };
}

/** Incrementally encrypts rows written before application-level vault encryption shipped. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const admin: any = getServiceSupabase();
  try {
    const batchSize = 250;

    const { data: gateways, error: gatewayError } = await admin.from("payment_gateways")
      .select("id, is_test").order("id").limit(10000);
    if (gatewayError) throw gatewayError;
    const modeByGateway = new Map((gateways || []).map((row: any) => [row.id, row.is_test]));

    const { data: currentRows, error: currentError } = await admin.from("payment_gateway_credentials")
      .select("gateway_id, credentials, updated_at").is("credentials->>__encrypted_v1", null).limit(batchSize);
    if (currentError) throw currentError;
    const currentMigrated = await applyBatch(currentRows || [], async (row: any) => admin.from("payment_gateway_credentials")
      .update({ credentials: await encryptCredentialBundle(
        await decryptCredentialBundle(row.credentials), String(modeByGateway.get(row.gateway_id) ?? true),
      ), updated_at: new Date().toISOString() })
      .eq("gateway_id", row.gateway_id).eq("updated_at", row.updated_at)
      .is("credentials->>__encrypted_v1", null).select("gateway_id"));

    const { data: versionRows, error: versionError } = await admin.from("payment_gateway_credential_versions")
      .select("id, gateway_id, company_id, provider, is_test, fingerprint, created_at, credentials")
      .is("credentials->>__encrypted_v1", null)
      .order("created_at", { ascending: true }).limit(batchSize);
    if (versionError) throw versionError;
    const versionMigrated = await applyBatch(versionRows || [], async (row: any) => admin.from("payment_gateway_credential_versions")
      .update({ credentials: await encryptCredentialBundle(await decryptCredentialBundle(row.credentials), String(row.is_test)) })
      .eq("id", row.id).is("credentials->>__encrypted_v1", null).select("id"));

    const payfastMigration = await migrateCompanyPayfastTokens(admin, batchSize);
    const supplierMigration = await migrateLegacySupplierAccounts(admin, batchSize);
    const { data: whatsappRows, error: whatsappError } = await admin.from("integrations")
      .select("id, settings").eq("integration_type", "whatsapp")
      .not("settings->>webhookVerifyToken", "is", null)
      .neq("settings->>webhookVerifyToken", "")
      .is("settings->>webhookVerifyTokenEncrypted", null).limit(batchSize);
    if (whatsappError) throw whatsappError;
    const whatsappMigrated = await applyBatch((whatsappRows || []).filter((row: any) => row.settings?.webhookVerifyToken), async (row: any) => {
      const token = String(row.settings?.webhookVerifyToken || "");
      const { webhookVerifyToken: _legacyToken, ...safeSettings } = row.settings || {};
      return admin.from("integrations").update({ settings: {
        ...safeSettings,
        webhookVerifyTokenEncrypted: encryptWhatsAppToken(token),
        webhookVerifyTokenHash: await keyedSecretHash(token),
      } }).eq("id", row.id).eq("settings", JSON.stringify(row.settings))
        .is("settings->>webhookVerifyTokenEncrypted", null).select("id");
    });
    const morePending = currentRows?.length === batchSize || versionRows?.length === batchSize ||
      payfastMigration.scanned === batchSize || payfastMigration.encrypted === batchSize ||
      supplierMigration.scanned === batchSize || supplierMigration.encrypted === batchSize || whatsappRows?.length === batchSize;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, migrated: {
      current: currentMigrated, checkoutVersions: versionMigrated,
      payfastTokens: payfastMigration.encrypted, supplierBankAccounts: supplierMigration.encrypted,
      legacySourceRowsCleared: payfastMigration.cleared + supplierMigration.cleared,
      whatsappVerifyTokens: whatsappMigrated,
    }, morePending });
  } catch (error: any) {
    console.error("[secure-billing-vault] migration failed:", error);
    return res.status(503).json({ ok: false, error: "Could not finish billing vault migration." });
  }
}

export default withApiLogging(handler);
