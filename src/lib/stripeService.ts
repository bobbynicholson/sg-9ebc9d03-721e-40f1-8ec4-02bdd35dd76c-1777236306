/**
 * Stripe Checkout integration - per-tenant variant.
 *
 * Tenants who pick Stripe in /admin/payment-gateways have their secret
 * key stored in payment_gateway_credentials.credentials.secretKey. This
 * module is server-only: every call uses the raw secret, so it must
 * never run in a browser bundle.
 *
 * Each call instantiates a Stripe client with the tenant's secret key.
 * We do NOT cache clients across tenants.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Stripe from "stripe";

const STRIPE_API_VERSION = "2024-12-18.acacia" as Stripe.LatestApiVersion;

function makeClient(secretKey: string): Stripe {
  if (!secretKey) {
    throw new Error("Stripe secret key missing - tenant has not configured Stripe");
  }
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

export interface StripeCheckoutInput {
  secretKey: string;
  /** ZAR amount in major units (rands). Stripe wants integer cents. */
  amount: number;
  /** ISO currency, defaults to "zar". Lowercase per Stripe convention. */
  currency?: string;
  /** Description shown on the Checkout line item. */
  description: string;
  successUrl: string;
  cancelUrl: string;
  /** Round-tripped on checkout.session.completed. */
  metadata: Record<string, string>;
  /** Buyer email pre-fill (Stripe still lets them edit). */
  customerEmail?: string;
}

export interface StripeCheckoutResult {
  /** cs_... session id. */
  id: string;
  /** Hosted Checkout URL we redirect the buyer to. */
  url: string;
}

/**
 * Create a Stripe Checkout session in payment mode. Throws on Stripe error.
 */
export async function createStripeCheckout(
  input: StripeCheckoutInput,
): Promise<StripeCheckoutResult> {
  const stripe = makeClient(input.secretKey);
  const currency = (input.currency || "zar").toLowerCase();
  const amountInCents = Math.round(input.amount * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: input.description },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata,
    customer_email: input.customerEmail,
  });

  if (!session.id || !session.url) {
    throw new Error("Stripe Checkout session creation returned no url");
  }
  return { id: session.id, url: session.url };
}

/**
 * Credential ping - retrieves the account balance. Cheapest authenticated
 * call Stripe exposes; succeeds only if the secret key is valid.
 */
export async function pingStripeCredentials(secretKey: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!secretKey) return { ok: false, message: "No secret key" };
  try {
    const stripe = makeClient(secretKey);
    await stripe.balance.retrieve();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Stripe ping failed" };
  }
}

/**
 * Verify a Stripe webhook signature using the tenant's whsec_... secret.
 * Returns the parsed Stripe event on success, or null on failure.
 *
 * The caller MUST pass the raw request body (Buffer or string) - if
 * the body has already been JSON-parsed by Next.js, signature
 * verification will fail. Configure the API route with
 * `bodyParser: false` and read req as a stream first.
 */
export function constructStripeEvent(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  webhookSigningSecret: string,
): Stripe.Event | null {
  if (!signatureHeader || !webhookSigningSecret) return null;
  try {
    // signature verification doesn't require a real Stripe client
    // instance, but Stripe.webhooks is exposed off the prototype, so we
    // create a throwaway client with a placeholder key.
    const stripe = new Stripe("sk_placeholder_for_webhook_verification", {
      apiVersion: STRIPE_API_VERSION,
    });
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSigningSecret);
  } catch (e) {
    console.warn("Stripe webhook signature verification failed:", e);
    return null;
  }
}
