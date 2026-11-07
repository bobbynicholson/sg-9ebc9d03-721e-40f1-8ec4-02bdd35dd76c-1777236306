/**
 * Server-side credential encryption and keyed fingerprints.
 *
 * New ciphertext uses AES-256-GCM with a key id and HKDF-derived, domain-
 * separated encryption and HMAC subkeys. The old v1 format is still readable
 * with ENCRYPTION_KEY so existing rows remain available during a rotation.
 *
 * Rotation configuration:
 *   ENCRYPTION_KEY                         legacy v1 key (retain until all v1
 *                                           data, including accounting tokens,
 *                                           has been re-encrypted)
 *   CREDENTIAL_ENCRYPTION_KEYS             JSON object of key id to 32-byte
 *                                           hex/base64 key strings
 *   CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID    key id used for new writes
 */
const ENVELOPE_KEY = "__encrypted_v1";
const FINGERPRINT_KEY = "__fingerprint";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HKDF_SALT = encoder.encode("cateringms/credential-vault/v2");
const LEGACY_KEY_ID = "legacy";

type KeyEntry = { id: string; text: string; bytes: Uint8Array };

function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
  return globalThis.crypto;
}

function decodeKey(text: string): Uint8Array {
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    return Uint8Array.from(text.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
  }
  if (/^[A-Za-z0-9+/]{43}=$/.test(text)) {
    try {
      const binary = atob(text);
      if (binary.length === 32 && btoa(binary) === text) {
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
      }
    } catch { /* handled below */ }
  }
  throw new Error("Credential encryption keys must be 32-byte hex or base64 values");
}

function configuredKeys(): { keys: Map<string, KeyEntry>; active: KeyEntry } {
  const keys = new Map<string, KeyEntry>();
  const rawRing = process.env.CREDENTIAL_ENCRYPTION_KEYS;
  if (rawRing) {
    let parsed: unknown;
    try { parsed = JSON.parse(rawRing); } catch { throw new Error("CREDENTIAL_ENCRYPTION_KEYS must be a JSON object"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("CREDENTIAL_ENCRYPTION_KEYS must be a JSON object");
    }
    for (const [id, value] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || typeof value !== "string") {
        throw new Error("Credential encryption key ids or values are invalid");
      }
      keys.set(id, { id, text: value, bytes: decodeKey(value) });
    }
  }

  const legacyText = process.env.ENCRYPTION_KEY;
  if (legacyText && !keys.has(LEGACY_KEY_ID)) {
    keys.set(LEGACY_KEY_ID, { id: LEGACY_KEY_ID, text: legacyText, bytes: decodeKey(legacyText) });
  }
  if (!keys.size) throw new Error("ENCRYPTION_KEY is not set");

  const activeId = process.env.CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID || LEGACY_KEY_ID;
  const active = keys.get(activeId);
  if (!active) throw new Error("Active credential encryption key id is not present in CREDENTIAL_ENCRYPTION_KEYS");
  return { keys, active };
}

export function hasStrongEncryptionKey(): boolean {
  try {
    configuredKeys();
    return true;
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
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveSubkey(entry: KeyEntry, purpose: "encryption" | "fingerprint"): Promise<CryptoKey> {
  const api = cryptoApi();
  const material = await api.subtle.importKey("raw", entry.bytes, "HKDF", false, ["deriveKey"]);
  if (purpose === "encryption") {
    return api.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(`cateringms/${purpose}/v2`) },
      material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
  }
  return api.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(`cateringms/${purpose}/v2`) },
    material, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"],
  );
}

async function legacyEncryptionKey(): Promise<CryptoKey> {
  const key = configuredKeys().keys.get(LEGACY_KEY_ID);
  if (!key) throw new Error("The legacy ENCRYPTION_KEY must remain available until v1 ciphertext is migrated");
  const digest = await cryptoApi().subtle.digest("SHA-256", encoder.encode(key.text));
  return cryptoApi().subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function fingerprintWith(entry: KeyEntry, value: string): Promise<string> {
  const key = await deriveSubkey(entry, "fingerprint");
  const signed = await cryptoApi().subtle.sign("HMAC", key, encoder.encode(value));
  return `v2.${entry.id}.${toBase64Url(new Uint8Array(signed))}`;
}

async function legacyFingerprint(value: string): Promise<string> {
  const legacy = configuredKeys().keys.get(LEGACY_KEY_ID);
  if (!legacy) throw new Error("The legacy ENCRYPTION_KEY must remain available until old fingerprints are migrated");
  const digest = await cryptoApi().subtle.digest("SHA-256", encoder.encode(legacy.text));
  const key = await cryptoApi().subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await cryptoApi().subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function encryptSecret(value: string): Promise<string> {
  if (!value) return "";
  const { active } = configuredKeys();
  const api = cryptoApi();
  const iv = api.getRandomValues(new Uint8Array(12));
  const ciphertext = await api.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`v2.${active.id}`) },
    await deriveSubkey(active, "encryption"), encoder.encode(value),
  );
  return `v2.${active.id}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const parts = String(value || "").split(".");
  if (parts[0] === "v1" && parts[1]) {
    if ((parts.length !== 3 && parts.length !== 4) || !parts[2] || (parts.length === 4 && !parts[3])) {
      throw new Error("Saved secret is not readable");
    }
    const ivText = parts[1];
    let ciphertext = fromBase64Url(parts.length === 3 ? parts[2] : parts[3]);
    if (parts.length === 4) {
      // Older WhatsApp entries stored the GCM tag in its own field.
      const tag = fromBase64Url(parts[2]);
      const joined = new Uint8Array(ciphertext.length + tag.length);
      joined.set(ciphertext);
      joined.set(tag, ciphertext.length);
      ciphertext = joined;
    }
    const decrypted = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivText) }, await legacyEncryptionKey(), ciphertext,
    );
    return decoder.decode(decrypted);
  }
  if (parts[0] !== "v2" || parts.length !== 4 || !parts[1] || !parts[2] || !parts[3]) {
    throw new Error("Saved secret is not readable");
  }
  const entry = configuredKeys().keys.get(parts[1]);
  if (!entry) throw new Error(`Credential encryption key ${parts[1]} is unavailable`);
  const decrypted = await cryptoApi().subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(parts[2]), additionalData: encoder.encode(`v2.${entry.id}`) },
    await deriveSubkey(entry, "encryption"), fromBase64Url(parts[3]),
  );
  return decoder.decode(decrypted);
}

export type CredentialEnvelope = { [ENVELOPE_KEY]: string; [FINGERPRINT_KEY]: string };

export function isCredentialEnvelope(value: unknown): value is CredentialEnvelope {
  return !!value && typeof value === "object" &&
    typeof (value as Record<string, unknown>)[ENVELOPE_KEY] === "string";
}

/** Store a credential bundle as ciphertext plus a keyed, non-reversible fingerprint. */
export async function encryptCredentialBundle(credentials: Record<string, string>, context = ""): Promise<CredentialEnvelope> {
  const plaintext = JSON.stringify(credentials || {});
  const { active } = configuredKeys();
  return {
    [ENVELOPE_KEY]: await encryptSecret(plaintext),
    [FINGERPRINT_KEY]: await fingerprintWith(active, `${plaintext}:${context}`),
  };
}

/** Read encrypted bundles and legacy plaintext rows during the staged backfill. */
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
  const { active } = configuredKeys();
  return fingerprintWith(active, value);
}

/** Stable pre-v2 hash, retained only for old idempotency identifiers. */
export async function keyedSecretHashLegacy(value: string): Promise<string> {
  return legacyFingerprint(value);
}

/** Includes prior hashes while a key ring is being rolled out or rotated. */
export async function keyedSecretHashCandidates(value: string): Promise<string[]> {
  const { keys } = configuredKeys();
  const hashes = await Promise.all([...keys.values()].map((entry) => fingerprintWith(entry, value)));
  if (keys.has(LEGACY_KEY_ID)) hashes.push(await legacyFingerprint(value));
  return [...new Set(hashes)];
}
