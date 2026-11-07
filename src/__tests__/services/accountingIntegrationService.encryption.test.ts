/** @jest-environment node */
jest.mock("@/integrations/supabase/client", () => ({
  supabase: { from: jest.fn() },
}));

import crypto from "crypto";
import { __testEncryption } from "@/services/accountingIntegrationService";

describe("accounting token encryption", () => {
  const { encryptOne, decryptOne, isLegacyToken, ENCRYPTION_VERSION } = __testEncryption;
  const priorKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => { process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4); });
  afterAll(() => {
    if (priorKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = priorKey;
  });

  it.each([
    "xyz-access-token-123",
    "deterministic-plaintext",
    "eyJhbGciOiJIUzI1NiJ9." + "x".repeat(512) + ".sig",
    "héllo world - caterer's token",
  ])("encrypts and recovers OAuth tokens", async (plain) => {
    const encrypted = await encryptOne(plain);
    expect(encrypted.startsWith(`${ENCRYPTION_VERSION}.`)).toBe(true);
    expect(encrypted).not.toContain(plain);
    await expect(decryptOne(encrypted)).resolves.toBe(plain);
  });

  it("uses a fresh nonce for each encryption", async () => {
    const first = await encryptOne("same input");
    const second = await encryptOne("same input");
    expect(first).not.toBe(second);
    await expect(decryptOne(first)).resolves.toBe("same input");
    await expect(decryptOne(second)).resolves.toBe("same input");
  });

  it("reads legacy base64 tokens and v1 AES-GCM tokens", async () => {
    const legacyBase64 = Buffer.from("old-style-token").toString("base64");
    expect(isLegacyToken(legacyBase64)).toBe(true);
    await expect(decryptOne(legacyBase64)).resolves.toBe("old-style-token");

    const legacyEncrypted = legacyV1("legacy encrypted refresh");
    expect(isLegacyToken(legacyEncrypted)).toBe(false);
    await expect(decryptOne(legacyEncrypted)).resolves.toBe("legacy encrypted refresh");
  });

  it("rejects malformed or modified legacy ciphertext", async () => {
    await expect(decryptOne("v1:not-three-parts")).rejects.toThrow(/Malformed/);
    const [version, body] = legacyV1("payload").split(":");
    const [iv, , ciphertext] = body.split(".");
    const corrupted = `${version}:${iv}.${Buffer.alloc(16, 0).toString("base64url")}.${ciphertext}`;
    await expect(decryptOne(corrupted)).rejects.toThrow();
  });
});

function legacyV1(plaintext: string): string {
  const key = Buffer.from("0123456789abcdef".repeat(4), "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
