/**
 * Server-only handling of a company's WhatsApp Business access token.
 *
 * Company users can read their own integrations row, so the token is stored
 * encrypted (AES-256-GCM) and is only ever decrypted on the server to call
 * Meta. It is never returned to the browser.
 */
import crypto from "crypto";
import { hasStrongEncryptionKey } from "@/lib/credentialVault";

const GRAPH_URL = "https://graph.facebook.com/v25.0";
const VERSION = "v1";

export interface StoredWhatsAppCredentials {
  phoneNumberId: string;
  businessAccountId: string;
  accessTokenEncrypted: string;
  /** Proves webhooks really came from Meta. */
  appSecretEncrypted?: string;
}

function encryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY is not set");
  return crypto.createHash("sha256").update(secret).digest();
}

export function canStoreWhatsAppToken(): boolean {
  return hasStrongEncryptionKey();
}

export function encryptWhatsAppToken(token: string): string {
  if (!hasStrongEncryptionKey()) throw new Error("ENCRYPTION_KEY must be a 32-byte hex or base64 value");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptWhatsAppToken(stored: string): string {
  const [version, iv, tag, encrypted] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !encrypted) throw new Error("Saved WhatsApp token is not readable");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

/** Read a webhook verify token stored encrypted; plaintext is accepted only for lazy migration. */
export function readWhatsAppWebhookVerifyToken(settings: Record<string, unknown> | null | undefined): string | null {
  const encrypted = typeof settings?.webhookVerifyTokenEncrypted === "string" ? settings.webhookVerifyTokenEncrypted : "";
  if (encrypted) return decryptWhatsAppToken(encrypted);
  const legacy = typeof settings?.webhookVerifyToken === "string" ? settings.webhookVerifyToken : "";
  return legacy || null;
}

export function matchesWhatsAppWebhookVerifyToken(settings: Record<string, unknown> | null | undefined, candidate: string): boolean {
  const saved = readWhatsAppWebhookVerifyToken(settings);
  if (!saved || !candidate) return false;
  const expected = Buffer.from(saved);
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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
): Promise<{ ok: boolean; id: string | null; error: string | null; response: unknown }> {
  const response = await fetch(`${GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${decryptWhatsAppToken(credentials.accessTokenEncrypted)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...message }),
  });
  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    id: json?.messages?.[0]?.id || null,
    error: response.ok ? null : json?.error?.message || `HTTP ${response.status}`,
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
      Authorization: `Bearer ${decryptWhatsAppToken(credentials.accessTokenEncrypted)}`,
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
  const { data } = await sb
    .from("integrations")
    .select("credentials")
    .eq("company_id", companyId)
    .eq("integration_type", "whatsapp")
    .eq("is_active", true)
    .maybeSingle();
  const credentials = data?.credentials as StoredWhatsAppCredentials | undefined;
  return credentials?.phoneNumberId && credentials?.accessTokenEncrypted ? credentials : null;
}
