/**
 * API key helpers used by the integrations page (creation) and the
 * incoming webhook endpoints (validation). Keys look like:
 *
 *   cms_<8-char prefix>_<32-char random>
 *
 * We store only the SHA-256 hash + the first 8 chars as a display
 * prefix. The raw key is shown once to the user and never again.
 */

function randomBase62(len: number): string {
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  // Web Crypto in browser, node:crypto on server.
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHA[bytes[i] % ALPHA.length];
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const arr = new Uint8Array(buf);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateApiKey(slug?: string): Promise<{ rawKey: string; keyHash: string; keyPrefix: string }> {
  const prefix = (slug || "cms").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "cms";
  const random = randomBase62(32);
  const rawKey = `cms_${prefix}_${random}`;
  const keyHash = await sha256Hex(rawKey);
  return { rawKey, keyHash, keyPrefix: rawKey.slice(0, 12) };
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBase62(40)}`;
}
