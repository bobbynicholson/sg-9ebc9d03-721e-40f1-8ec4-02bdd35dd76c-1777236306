/**
 * Application-level secret encryption for server-side credential stores.
 * This module uses Web Crypto so the shared payment-gateway service can
 * reference it without pulling Node-only modules into browser bundles.
 * ENCRYPTION_KEY must be a long, random, server-only environment secret.
 */
const ENVELOPE_KEY = "__encrypted_v1";
const FINGERPRINT_KEY = "__fingerprint";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  return globalThis.crypto;
}

function secretKey(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY is not set");
  return secret;
}

function requireStrongKey(): string {
  if (!hasStrongEncryptionKey()) throw new Error("ENCRYPTION_KEY must be a 32-byte hex or base64 value");
  return secretKey();
}

export function hasStrongEncryptionKey(): boolean {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return false;
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return true;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(secret)) return false;
  try {
    const decoded = atob(secret);
    return decoded.length === 32 && btoa(decoded) === secret;
  } catch {
    return false;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derivedKey(): Promise<CryptoKey> {
  const api = cryptoApi();
  const raw = await api.subtle.digest("SHA-256", encoder.encode(secretKey()));
  return api.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function fingerprint(value: string): Promise<string> {
  requireStrongKey();
  const api = cryptoApi();
  const raw = await api.subtle.digest("SHA-256", encoder.encode(secretKey()));
  const key = await api.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await api.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function encryptSecret(value: string): Promise<string> {
  if (!value) return "";
  requireStrongKey();
  const api = cryptoApi();
  const iv = api.getRandomValues(new Uint8Array(12));
  const encrypted = await api.subtle.encrypt({ name: "AES-GCM", iv }, await derivedKey(), encoder.encode(value));
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const [version, ivText, ciphertextText] = String(value || "").split(".");
  if (version !== "v1" || !ivText || !ciphertextText) throw new Error("Saved secret is not readable");
  const decrypted = await cryptoApi().subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivText) }, await derivedKey(), fromBase64Url(ciphertextText),
  );
  return decoder.decode(decrypted);
}

export type CredentialEnvelope = { [ENVELOPE_KEY]: string; [FINGERPRINT_KEY]: string };

export function isCredentialEnvelope(value: unknown): value is CredentialEnvelope {
  return !!value && typeof value === "object" &&
    typeof (value as Record<string, unknown>)[ENVELOPE_KEY] === "string";
}

/** Store a credential bundle as ciphertext plus a keyed stable fingerprint. */
export async function encryptCredentialBundle(credentials: Record<string, string>, context = ""): Promise<CredentialEnvelope> {
  const plaintext = JSON.stringify(credentials || {});
  return {
    [ENVELOPE_KEY]: await encryptSecret(plaintext),
    [FINGERPRINT_KEY]: await fingerprint(`${plaintext}:${context}`),
  };
}

/** Read new ciphertext and legacy plaintext rows during the vault migration. */
export async function decryptCredentialBundle(value: unknown): Promise<Record<string, string>> {
  if (isCredentialEnvelope(value)) {
    const parsed = JSON.parse(await decryptSecret(value[ENVELOPE_KEY]));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Saved credentials are invalid");
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function keyedSecretHash(value: string): Promise<string> {
  return fingerprint(value);
}
