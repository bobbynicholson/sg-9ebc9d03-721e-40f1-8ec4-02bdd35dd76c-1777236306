import { createCipheriv, createHash, randomBytes, webcrypto } from "crypto";
import {
  decryptCredentialBundle,
  decryptSecret,
  encryptCredentialBundle,
  encryptSecret,
  hasStrongEncryptionKey,
  isCredentialEnvelope,
  keyedSecretHash,
  keyedSecretHashCandidates,
} from "@/lib/credentialVault";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

describe("credential vault", () => {
  const priorKey = process.env.ENCRYPTION_KEY;
  const priorRing = process.env.CREDENTIAL_ENCRYPTION_KEYS;
  const priorActiveId = process.env.CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
    delete process.env.CREDENTIAL_ENCRYPTION_KEYS;
    delete process.env.CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID;
  });

  afterAll(() => {
    if (priorKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = priorKey;
    if (priorRing === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEYS;
    else process.env.CREDENTIAL_ENCRYPTION_KEYS = priorRing;
    if (priorActiveId === undefined) delete process.env.CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID;
    else process.env.CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID = priorActiveId;
  });

  it("encrypts secrets and authenticates ciphertext before returning plaintext", async () => {
    const encrypted = await encryptSecret("bank-account-1234");
    expect(encrypted).toMatch(/^v2\.legacy\./);
    expect(encrypted).not.toContain("bank-account-1234");
    await expect(decryptSecret(encrypted)).resolves.toBe("bank-account-1234");

    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    await expect(decryptSecret(tampered)).rejects.toThrow();
  });

  it("still decrypts the historical WhatsApp envelope with a separate GCM tag", async () => {
    const key = createHash("sha256").update(process.env.ENCRYPTION_KEY!).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update("legacy-whatsapp-token", "utf8"), cipher.final()]);
    const legacy = `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
    await expect(decryptSecret(legacy)).resolves.toBe("legacy-whatsapp-token");
  });

  it("stores credential bundles as an opaque envelope and reads rollout-era plaintext", async () => {
    const secret = "merchant-secret-value";
    const encrypted = await encryptCredentialBundle({ merchantKey: secret }, "live");
    expect(isCredentialEnvelope(encrypted)).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain(secret);
    await expect(decryptCredentialBundle(encrypted)).resolves.toEqual({ merchantKey: secret });
    await expect(decryptCredentialBundle({ merchantKey: secret })).resolves.toEqual({ merchantKey: secret });
  });

  it("creates stable keyed hashes and rejects malformed encryption keys", async () => {
    await expect(keyedSecretHash("verify-token")).resolves.toBe(await keyedSecretHash("verify-token"));
    process.env.ENCRYPTION_KEY = "g".repeat(64);
    expect(hasStrongEncryptionKey()).toBe(false);
    await expect(encryptSecret("secret")).rejects.toThrow("32-byte hex or base64");
    await expect(keyedSecretHash("verify-token")).rejects.toThrow("32-byte hex or base64");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(hasStrongEncryptionKey()).toBe(true);
  });

  it("encrypts under an active key id and keeps old keyed hashes searchable", async () => {
    const legacy = "0123456789abcdef".repeat(4);
    const active = Buffer.alloc(32, 9).toString("base64");
    process.env.CREDENTIAL_ENCRYPTION_KEYS = JSON.stringify({ legacy, next: active });
    process.env.CREDENTIAL_ENCRYPTION_ACTIVE_KEY_ID = "next";

    const encrypted = await encryptSecret("rotated-value");
    expect(encrypted).toMatch(/^v2\.next\./);
    await expect(decryptSecret(encrypted)).resolves.toBe("rotated-value");
    const hashes = await keyedSecretHashCandidates("verify-token");
    expect(hashes).toContain(await keyedSecretHash("verify-token"));
    expect(hashes).toHaveLength(3); // next, legacy v2 fingerprint, and old v1 HMAC
  });
});
