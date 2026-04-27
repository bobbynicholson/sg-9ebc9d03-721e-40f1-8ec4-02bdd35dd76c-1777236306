/**
 * Client access tokens -- the auth that lets a one-off booker open
 * their order page without an account.
 *
 *   Raw token format: ord_<10char order-id prefix>_<32char random>
 *   We store SHA-256(rawToken) in client_access_tokens.token_hash and
 *   only ever surface the raw value once (in the "Copy client link"
 *   button on the admin order detail).
 *
 *   The URL we hand to the client is:
 *     /c/order/{order_id}?t={raw_token}
 *
 *   The /c/order/[id] page POSTs the token to /api/client-tokens/validate,
 *   which calls the SECURITY DEFINER `client_view_order(token_hash,
 *   order_id)` RPC. If valid, the page sets a short-lived cookie and
 *   redirects to the bare /c/order/{id} URL so the token doesn't sit in
 *   browser history / referrer headers.
 */

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomBase62(len: number): string {
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
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateClientToken(orderId: string): Promise<{
  rawToken: string;
  tokenHash: string;
  tokenPrefix: string;
}> {
  const orderShort = orderId.replace(/-/g, "").slice(0, 10);
  const rand = randomBase62(32);
  const rawToken = `ord_${orderShort}_${rand}`;
  const tokenHash = await sha256Hex(rawToken);
  return { rawToken, tokenHash, tokenPrefix: rawToken.slice(0, 14) };
}

/** Build the public URL the client will use. */
export function buildClientLink(origin: string, orderId: string, rawToken: string): string {
  const o = origin.replace(/\/$/, "");
  return `${o}/c/order/${orderId}?t=${encodeURIComponent(rawToken)}`;
}

/** Default token lifetime: 60 days from now. */
export function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString();
}
