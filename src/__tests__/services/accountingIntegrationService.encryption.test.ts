/**
 * TIGHTEN I.105: round-trip + legacy detection coverage for the
 * AES-256-GCM token encryption introduced in accountingIntegrationService.
 *
 * Test boots without ENCRYPTION_KEY set in the environment so it
 * exercises the dev-fallback derived key. NODE_ENV defaults to 'test'
 * in jest, so the prod-throw branch isn't triggered here - separate
 * integration check verifies the prod throw.
 */

// Mock the supabase browser client - the module is imported transitively
// but the encryption helpers don't touch it. The test only exercises the
// __testEncryption surface.
jest.mock("@/integrations/supabase/client", () => ({
  supabase: { from: jest.fn() },
}));

import { __testEncryption } from "@/services/accountingIntegrationService";

describe("accountingIntegrationService encryption (TIGHTEN I.105)", () => {
  const { encryptOne, decryptOne, isLegacyToken, ENCRYPTION_VERSION } = __testEncryption;

  describe("round-trip", () => {
    it("encrypts a short string and recovers the plaintext", () => {
      const plain = "xyz-access-token-123";
      const ct = encryptOne(plain);
      expect(ct.startsWith(`${ENCRYPTION_VERSION}:`)).toBe(true);
      expect(ct).not.toContain(plain);
      expect(decryptOne(ct)).toBe(plain);
    });

    it("produces a different ciphertext for the same plaintext each call (random IV)", () => {
      const plain = "deterministic-plaintext";
      const ct1 = encryptOne(plain);
      const ct2 = encryptOne(plain);
      expect(ct1).not.toBe(ct2);
      expect(decryptOne(ct1)).toBe(plain);
      expect(decryptOne(ct2)).toBe(plain);
    });

    it("round-trips a long, high-entropy token (real OAuth refresh shape)", () => {
      const plain = "eyJhbGciOiJIUzI1NiJ9." + "x".repeat(512) + ".sig";
      const ct = encryptOne(plain);
      expect(decryptOne(ct)).toBe(plain);
    });

    it("round-trips UTF-8 / non-ASCII payloads", () => {
      const plain = "héllo wörld - caterer's token";
      expect(decryptOne(encryptOne(plain))).toBe(plain);
    });
  });

  describe("legacy detection + transparent decode", () => {
    it("flags a raw base64 string as legacy", () => {
      const legacy = Buffer.from("legacy-access-token").toString("base64");
      expect(isLegacyToken(legacy)).toBe(true);
    });

    it("does not flag a v1-prefixed ciphertext as legacy", () => {
      const ct = encryptOne("anything");
      expect(isLegacyToken(ct)).toBe(false);
    });

    it("decrypts a legacy row transparently (returns the original plaintext)", () => {
      const plain = "old-style-token";
      const legacyStored = Buffer.from(plain).toString("base64");
      expect(decryptOne(legacyStored)).toBe(plain);
    });
  });

  describe("malformed input", () => {
    it("throws on a v1 payload with the wrong shape", () => {
      expect(() => decryptOne("v1:not-three-parts")).toThrow(/Malformed/);
      expect(() => decryptOne("v1:one.two")).toThrow(/Malformed/);
    });

    it("throws on a v1 payload with a corrupt tag (auth check fails)", () => {
      const ct = encryptOne("payload");
      const [version, body] = ct.split(":");
      const [iv, , ciphertext] = body.split(".");
      // Replace the entire tag with zeros - guarantees auth mismatch.
      const zeroTag = Buffer.alloc(16, 0).toString("base64url");
      const corrupted = `${version}:${iv}.${zeroTag}.${ciphertext}`;
      expect(() => decryptOne(corrupted)).toThrow();
    });

    it("throws on a v1 payload with a corrupt ciphertext (auth check fails)", () => {
      const ct = encryptOne("payload");
      const [version, body] = ct.split(":");
      const [iv, tag] = body.split(".");
      // Replace ciphertext with random bytes of the same length.
      const fake = Buffer.alloc(7, 0xaa).toString("base64url");
      const corrupted = `${version}:${iv}.${tag}.${fake}`;
      expect(() => decryptOne(corrupted)).toThrow();
    });
  });
});
