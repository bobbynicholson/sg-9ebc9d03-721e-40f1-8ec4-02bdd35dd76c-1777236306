/** Server-side handling of a company's WhatsApp Business credentials. */
import crypto from "crypto";
import { decryptSecret, encryptSecret, hasStrongEncryptionKey, keyedSecretHash } from "@/lib/credentialVault";

const GRAPH_URL = "https://graph.facebook.com/v25.0";

export interface StoredWhatsAppCredentials {
  phoneNumberId: string;
  businessAccountId: string;
  accessTokenEncrypted: string;
  /** Proves webhooks really came from Meta. */
  appSecretEncrypted?: string;
}

/**
 * New WhatsApp ciphertext uses the shared versioned credential envelope.
 * The four-part v1 envelope remains readable until legacy rows are migrated.
 */
export async function encryptWhatsAppToken(token: string): Promise<string> {
  return encryptSecret(token);
}

export async function decryptWhatsAppToken(stored: string): Promise<string> {
  return decryptSecret(stored);
}

export function canStoreWhatsAppToken(): boolean {
  return hasStrongEncryptionKey();
}

/** Do not let a reconnect mutate its integration row before the vault migration exists. */
export async function isWhatsAppCredentialVaultAvailable(sb: any): Promise<boolean> {
  const { error } = await sb.from("whatsapp_credential_vault").select("integration_id").limit(1);
  return !error;
}

/** Read an encrypted or legacy plaintext verification token during rollout. */
export async function readWhatsAppWebhookVerifyToken(
  settings: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const encrypted = typeof settings?.webhookVerifyTokenEncrypted === "string" ? settings.webhookVerifyTokenEncrypted : "";
  if (encrypted) return decryptWhatsAppToken(encrypted);
  const legacy = typeof settings?.webhookVerifyToken === "string" ? settings.webhookVerifyToken : "";
  return legacy || null;
}

export async function loadWhatsAppWebhookVerifyToken(
  sb: any,
  companyId: string,
  legacySettings?: Record<string, unknown> | null,
): Promise<string | null> {
  const { data: integration, error: integrationError } = await sb.from("integrations")
    .select("id, settings").eq("company_id", companyId).eq("integration_type", "whatsapp").maybeSingle();
  if (integrationError) throw integrationError;
  if (!integration) return null;
  const { data: vault, error: vaultError } = await sb.from("whatsapp_credential_vault")
    .select("webhook_verify_token_ciphertext")
    .eq("integration_id", integration.id).maybeSingle();
  if (vaultError && !integration.settings?.webhookVerifyTokenEncrypted && !integration.settings?.webhookVerifyToken) {
    throw vaultError;
  }
  if (vault?.webhook_verify_token_ciphertext) return decryptWhatsAppToken(vault.webhook_verify_token_ciphertext);
  return readWhatsAppWebhookVerifyToken(legacySettings || integration.settings);
}

export async function hasWhatsAppWebhookVerifyToken(sb: any, companyId: string, legacySettings?: Record<string, unknown> | null): Promise<boolean> {
  const { data: integration, error } = await sb.from("integrations")
    .select("id, settings").eq("company_id", companyId).eq("integration_type", "whatsapp").maybeSingle();
  if (error) throw error;
  if (!integration) return false;
  const { data: vault, error: vaultError } = await sb.from("whatsapp_credential_vault")
    .select("webhook_verify_token_hash").eq("integration_id", integration.id).maybeSingle();
  if (vaultError && !integration.settings?.webhookVerifyTokenEncrypted && !integration.settings?.webhookVerifyToken) {
    throw vaultError;
  }
  return !!(vault?.webhook_verify_token_hash || legacySettings?.webhookVerifyTokenHash ||
    integration.settings?.webhookVerifyTokenHash || integration.settings?.webhookVerifyTokenEncrypted ||
    integration.settings?.webhookVerifyToken);
}

/** Save new token values only in the service-role credential vault table. */
export async function storeWhatsAppCredentials(
  sb: any,
  integrationId: string,
  companyId: string,
  values: { accessToken: string; appSecret: string; verifyToken: string },
): Promise<void> {
  const { error } = await sb.from("whatsapp_credential_vault").upsert({
    integration_id: integrationId,
    company_id: companyId,
    access_token_ciphertext: await encryptWhatsAppToken(values.accessToken),
    app_secret_ciphertext: await encryptWhatsAppToken(values.appSecret),
    webhook_verify_token_ciphertext: await encryptWhatsAppToken(values.verifyToken),
    webhook_verify_token_hash: await keyedSecretHash(values.verifyToken),
    updated_at: new Date().toISOString(),
  }, { onConflict: "integration_id" });
  if (error) throw error;
}

export async function storeWhatsAppVerifyToken(sb: any, integrationId: string, verifyToken: string): Promise<void> {
  const { data: existing, error: readError } = await sb.from("whatsapp_credential_vault")
    .select("access_token_ciphertext, app_secret_ciphertext")
    .eq("integration_id", integrationId).maybeSingle();
  if (readError) throw readError;
  if (!existing?.access_token_ciphertext || !existing?.app_secret_ciphertext) {
    throw new Error("WhatsApp credential vault entry is missing; reconnect WhatsApp before rotating its verify token");
  }
  const { error } = await sb.from("whatsapp_credential_vault").update({
    webhook_verify_token_ciphertext: await encryptWhatsAppToken(verifyToken),
    webhook_verify_token_hash: await keyedSecretHash(verifyToken),
    updated_at: new Date().toISOString(),
  }).eq("integration_id", integrationId);
  if (error) throw error;
}

/** Asks Meta whether these details work before they are saved. */
export async function verifyWhatsAppCredentials(phoneNumberId: string, accessToken: string): Promise<{ ok: boolean; displayNumber?: string }> {
  const response = await fetch(`${GRAPH_URL}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { ok: false };
  const json = await response.json().catch(() => ({}));
  return { ok: true, displayNumber: json?.display_phone_number };
}

export async function postWhatsAppMessage(
  credentials: StoredWhatsAppCredentials,
  message: Record<string, unknown>,
): Promise<{ ok: boolean; id: string | null; error: string | null; httpStatus: number; response: unknown }> {
  const response = await fetch(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await decryptWhatsAppToken(credentials.accessTokenEncrypted)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...message }),
  });
  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    id: json?.messages?.[0]?.id || null,
    error: response.ok ? null : json?.error?.message || `HTTP ${response.status}`,
    httpStatus: response.status,
    response: json,
  };
}

/** Calls Meta's API with the company's token, for template management. */
export async function callMeta(
  credentials: StoredWhatsAppCredentials,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; json: any; error: string | null }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const response = await fetch(`${GRAPH_URL}/${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${await decryptWhatsAppToken(credentials.accessTokenEncrypted)}`,
      "Content-Type": "application/json",
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    json,
    error: response.ok ? null : json?.error?.error_user_msg || json?.error?.message || `HTTP ${response.status}`,
  };
}

/** Checks Meta's X-Hub-Signature-256 header against the raw request body. */
export function isValidMetaSignature(rawBody: string | Buffer, header: string, appSecret: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const actual = Buffer.from(header.slice("sha256=".length));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export async function loadWhatsAppCredentials(sb: any, companyId: string): Promise<StoredWhatsAppCredentials | null> {
  const { data: integration, error } = await sb.from("integrations")
    .select("id, credentials")
    .eq("company_id", companyId)
    .eq("integration_type", "whatsapp")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!integration) return null;

  const metadata = integration.credentials || {};
  const { data: vault, error: vaultError } = await sb.from("whatsapp_credential_vault")
    .select("access_token_ciphertext, app_secret_ciphertext")
    .eq("integration_id", integration.id).maybeSingle();
  const legacy = metadata as Partial<StoredWhatsAppCredentials>;
  if (vaultError && !legacy.accessTokenEncrypted) throw vaultError;
  const accessTokenEncrypted = vault?.access_token_ciphertext || legacy.accessTokenEncrypted || "";
  const appSecretEncrypted = vault?.app_secret_ciphertext || legacy.appSecretEncrypted;
  if (!metadata.phoneNumberId || !accessTokenEncrypted) return null;
  return {
    phoneNumberId: String(metadata.phoneNumberId),
    businessAccountId: String(metadata.businessAccountId || ""),
    accessTokenEncrypted,
    ...(appSecretEncrypted ? { appSecretEncrypted } : {}),
  };
}
