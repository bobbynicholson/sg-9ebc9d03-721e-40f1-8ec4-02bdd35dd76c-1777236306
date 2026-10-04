/**
 * Yoco Online Checkout integration - per-tenant variant.
 *
 * Tenants who pick Yoco in /admin/payment-gateways have their secret
 * key stored in payment_gateway_credentials.credentials.secretKey. This
 * module is server-only: every call needs the raw secret, so it must
 * never run from a browser bundle.
 *
 * Yoco's Online Checkout API (as of 2026):
 *   POST https://payments.yoco.com/api/checkouts
 *   Authorization: Bearer {secretKey}
 *   Body: { amount, currency: "ZAR", successUrl, cancelUrl, metadata }
 *   Returns: { id, redirectUrl, status, ... }
 *
 * Amounts are sent in CENTS (ZAR * 100), per Yoco docs.
 */

export interface YocoCheckoutInput {
  /** Tenant secret key (sk_test_... / sk_live_...). */
  secretKey: string;
  /** ZAR amount in major units (rands, not cents). We multiply by 100. */
  amount: number;
  successUrl: string;
  cancelUrl: string;
  /** Free-form metadata round-tripped on the webhook. */
  metadata: Record<string, string>;
}

export interface YocoCheckoutResult {
  /** Yoco checkout id, e.g. "ch_...". */
  id: string;
  /** Hosted Checkout URL we redirect the buyer to. */
  redirectUrl: string;
}

const YOCO_BASE = "https://payments.yoco.com/api";

/**
 * Create a Yoco checkout session. Throws on non-2xx.
 *
 * Uses Yoco's Checkout API. Provider returns never establish paid status.
 */
export async function createYocoCheckout(
  input: YocoCheckoutInput,
): Promise<YocoCheckoutResult> {
  if (!input.secretKey) {
    throw new Error("Yoco secret key missing - tenant has not configured Yoco");
  }
  const amountInCents = Math.round(input.amount * 100);
  if (!Number.isFinite(input.amount) || !Number.isSafeInteger(amountInCents) || amountInCents <= 0 ||
    Math.abs(input.amount * 100 - amountInCents) > 0.000001) throw new Error("Invalid Yoco payment amount");

  const body = {
    amount: amountInCents,
    currency: "ZAR",
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    failureUrl: input.cancelUrl,
    metadata: input.metadata,
  };

  const response = await fetch(`${YOCO_BASE}/checkouts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${input.secretKey}`,
      "Content-Type": "application/json",
      ...(input.metadata.paymentAttemptId ? { "Idempotency-Key": input.metadata.paymentAttemptId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Yoco checkout failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    id?: string;
    redirectUrl?: string;
    redirect_url?: string;
  };

  const id = json.id;
  const redirectUrl = json.redirectUrl || json.redirect_url;
  if (!id || !redirectUrl) {
    throw new Error("Yoco response missing id/redirectUrl");
  }
  return { id, redirectUrl };
}

/** Read-only authentication check using the documented List webhooks endpoint. */
export async function pingYocoCredentials(secretKey: string): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  if (!secretKey) return { ok: false, status: 0, message: "No secret key" };
  try {
    const response = await fetch(`${YOCO_BASE}/webhooks`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, message: "Yoco rejected the key" };
    }
    // Only a 2xx proves the key authenticated against a real endpoint.
    // The old `< 500` window passed 404/405 responses too, which say
    // nothing about the key (a wrong base URL would read as "verified").
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status };
    }
    return { ok: false, status: response.status, message: `Yoco returned ${response.status} - key not confirmed` };
  } catch (e: any) {
    return { ok: false, status: 0, message: e?.message || "Yoco ping failed" };
  }
}

/**
 * Checkout API signs id.timestamp.rawBody with a base64-decoded whsec_
 * secret. Match any v1 signature, in constant time, within three minutes.
 */
export function verifyYocoSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
  webhookId?: string,
  webhookTimestamp?: string,
): boolean {
  if (!signatureHeader || !webhookId || !webhookTimestamp || !/^\d+$/.test(webhookTimestamp) ||
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(webhookSecret)) return false;
  const signedAt = Number(webhookTimestamp);
  if (!Number.isSafeInteger(signedAt) || Math.abs(Date.now() / 1000 - signedAt) > 180) return false;
  // Lazy require so client bundles never load node:crypto.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const expected = crypto
    .createHmac("sha256", Buffer.from(webhookSecret.slice(6), "base64"))
    .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
    .digest();
  return signatureHeader.split(/\s+/).some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    const actual = Buffer.from(value, "base64");
    return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
  });
}
