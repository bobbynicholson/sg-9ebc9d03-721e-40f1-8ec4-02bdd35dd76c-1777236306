import { webcrypto } from "crypto";
import {
  decryptCredentialBundle,
  decryptSecret,
  encryptCredentialBundle,
  encryptSecret,
  hasStrongEncryptionKey,
  isCredentialEnvelope,
  keyedSecretHash,
} from "@/lib/credentialVault";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

describe("credential vault", () => {
  const priorKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
  });

  afterAll(() => {
    if (priorKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = priorKey;
  });

  it("encrypts secrets and authenticates ciphertext before returning plaintext", async () => {
    const encrypted = await encryptSecret("bank-account-1234");
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("bank-account-1234");
    await expect(decryptSecret(encrypted)).resolves.toBe("bank-account-1234");

    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    await expect(decryptSecret(tampered)).rejects.toThrow();
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
});
