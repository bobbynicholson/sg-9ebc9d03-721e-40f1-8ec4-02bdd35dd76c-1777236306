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
 * TODO - Yoco's API surface has gone through several iterations
 * (/api/checkouts vs /v1/charges). Confirm the latest endpoint and
 * request body shape against current Yoco docs before the first live
 * tenant goes live. The implementation below follows the documented
 * Online Checkout API as of 2026 Q1 and the well-known integer-cents
 * convention shared with Stripe.
 */
export async function createYocoCheckout(
  input: YocoCheckoutInput,
): Promise<YocoCheckoutResult> {
  if (!input.secretKey) {
    throw new Error("Yoco secret key missing - tenant has not configured Yoco");
  }
  const amountInCents = Math.round(input.amount * 100);

  const body = {
    amount: amountInCents,
    currency: "ZAR",
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: input.metadata,
  };

  const response = await fetch(`${YOCO_BASE}/checkouts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${input.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

/**
 * Lightweight credential ping - confirm the secret key is valid.
 * Yoco's REST API doesn't have a documented `GET /me` endpoint at the
 * moment; a minimal authenticated GET against the merchants endpoint
 * is the closest thing. If Yoco ships a dedicated /v1/health or
 * /accounts/me later, swap it in here.
 *
 * TODO - replace with the canonical "verify token" endpoint once
 * Yoco publishes one. Today we issue an authenticated HEAD-equivalent
 * (GET against an endpoint that returns 401 on bad keys, 200 on good).
 */
export async function pingYocoCredentials(secretKey: string): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  if (!secretKey) return { ok: false, status: 0, message: "No secret key" };
  try {
    const response = await fetch(`${YOCO_BASE}/checkouts`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${secretKey}` },
    });
    // 200/204/401/403 all indicate Yoco received the request and made an
    // auth decision. Anything else (5xx, network) is a transient issue.
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, message: "Yoco rejected the key" };
    }
    if (response.status >= 200 && response.status < 500) {
      return { ok: true, status: response.status };
    }
    return { ok: false, status: response.status, message: `Yoco returned ${response.status}` };
  } catch (e: any) {
    return { ok: false, status: 0, message: e?.message || "Yoco ping failed" };
  }
}

/**
 * Verify the Yoco webhook signature. Yoco signs webhooks with HMAC-SHA256
 * over the raw request body using the per-tenant webhookSecret the
 * operator pasted into /admin/payment-gateways. Header name is
 * `webhook-signature` - compare against the hex digest.
 *
 * TODO - confirm the exact header name and signing scheme. The
 * implementation here follows the documented HMAC-SHA256 hex pattern.
 */
export function verifyYocoSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  // Lazy require so client bundles never load node:crypto.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  // Constant-time compare, tolerate length mismatch.
  if (expected.length !== signatureHeader.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signatureHeader, "hex"),
  );
}
