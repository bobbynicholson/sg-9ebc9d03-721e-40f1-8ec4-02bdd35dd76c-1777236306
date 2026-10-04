/**
 * Provider-agnostic payment dispatcher (server-only).
 *
 * Tenants pick PayFast / Yoco / Stripe in /admin/payment-gateways.
 * Whatever they pick is what `createPaymentSession` dispatches to here:
 * the function looks up the company's active gateway, reads its
 * credentials via service-role Supabase, and hands off to the right
 * provider lib.
 *
 * The SaaS subscription path is separate and lives in
 * /api/subscription/create-session. This file handles tenants taking
 * money from their event clients using each tenant's own gateway.
 *
 * Each provider returns the canonical { paymentUrl, sessionId } shape so
 * the call site never branches on provider.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  paymentGatewayService,
  type PaymentGatewayProvider,
} from "@/services/paymentGatewayService";
import { generatePayFastPaymentForm } from "@/lib/payfastService";
import { createYocoCheckout } from "@/lib/yocoService";
import { createStripeCheckout } from "@/lib/stripeService";

export type PaymentSessionType = "deposit" | "balance" | "invoice";

export interface PaymentSessionInput {
  /** The catering company taking payment (NOT the platform). */
  companyId: string;
  orderId: string;
  type: PaymentSessionType;
  amount: number;
  currency?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  /** Buyer details for pre-fill / receipts. */
  customer: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
  /** Extra metadata to round-trip on the webhook (e.g. invoice_id). */
  extraMetadata?: Record<string, string>;
}

export interface PaymentSessionResult {
  ok: boolean;
  /** Active provider that handled the session. */
  provider?: PaymentGatewayProvider;
  /**
   * Either a redirect URL the client navigates to, OR an HTML form
   * snippet that the client auto-submits (PayFast self-posts).
   */
  paymentUrl?: string;
  /** Provider-specific session id (cs_..., ch_..., or PayFast's m_payment_id). */
  sessionId?: string;
  /** True if paymentUrl is HTML rather than a URL. */
  isHtmlForm?: boolean;
  error?: string;
}

export type ResolvedPaymentGateway = NonNullable<
  Awaited<ReturnType<typeof paymentGatewayService.getActiveWithCredentials>>
>;

export async function resolveActivePaymentGateway(
  companyId: string,
): Promise<ResolvedPaymentGateway | null> {
  const sb = getServiceSupabase();
  return paymentGatewayService.getActiveWithCredentials(companyId, sb);
}

export type PublicPaymentAvailability = {
  provider: PaymentGatewayProvider | null;
  online_available: boolean;
  unavailable_reason: "not_configured" | "configuration_incomplete" | "currency_not_supported" | null;
};

/**
 * Return only safe payment-routing information for token-gated public
 * quote and invoice pages. The provider's credentials stay on the server.
 */
export async function getPublicPaymentAvailability(
  companyId: string,
  currency: string | null | undefined,
): Promise<PublicPaymentAvailability> {
  let active: ResolvedPaymentGateway | null;
  try {
    active = await resolveActivePaymentGateway(companyId);
  } catch (error) {
    console.error("[getPublicPaymentAvailability] gateway lookup failed:", error);
    return { provider: null, online_available: false, unavailable_reason: "configuration_incomplete" };
  }

  if (!active) {
    return { provider: null, online_available: false, unavailable_reason: "not_configured" };
  }

  const provider = active.gateway.provider as PaymentGatewayProvider;
  const credentials = active.credentials || {};
  const hasRequiredCredentials = provider === "payfast"
    ? Boolean(credentials.merchantId && credentials.merchantKey)
    : provider === "yoco"
      ? Boolean(credentials.secretKey && credentials.publicKey && credentials.webhookSecret)
      : provider === "stripe"
        ? Boolean(credentials.secretKey && credentials.publishableKey && credentials.webhookSigningSecret)
        : false;

  if (!hasRequiredCredentials) {
    return { provider: null, online_available: false, unavailable_reason: "configuration_incomplete" };
  }

  const code = String(currency || "ZAR").toUpperCase();
  if ((provider === "payfast" || provider === "yoco") && code !== "ZAR") {
    return { provider, online_available: false, unavailable_reason: "currency_not_supported" };
  }

  return { provider, online_available: true, unavailable_reason: null };
}

/**
 * Resolve and dispatch to the company's active payment provider. A tenant
 * must configure its own gateway; platform credentials are never used for
 * customer payments.
 */
export async function createPaymentSession(
  input: PaymentSessionInput,
  resolvedGateway?: ResolvedPaymentGateway | null,
): Promise<PaymentSessionResult> {
  try {
    const active = resolvedGateway === undefined
      ? await resolveActivePaymentGateway(input.companyId)
      : resolvedGateway;

    if (!active) {
      return {
        ok: false,
        error: "This company has no active payment gateway. Configure its own provider in onboarding or Admin → Payment Gateways.",
      };
    }

    if (active.gateway.company_id !== input.companyId) return { ok: false, error: "Checkout gateway does not belong to this company" };
    if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "Invalid checkout amount" };
    const provider = active.gateway.provider as PaymentGatewayProvider;
    if (["payfast", "yoco"].includes(provider) && String(input.currency || "ZAR").toUpperCase() !== "ZAR") {
      return { ok: false, error: "This provider only accepts ZAR" };
    }
    const credentials = active.credentials;

    if (provider === "payfast") {
      return await dispatchPayFast(input, credentials, active.gateway.is_test);
    }
    if (provider === "yoco") {
      return await dispatchYoco(input, credentials);
    }
    if (provider === "stripe") {
      return await dispatchStripe(input, credentials);
    }

    return { ok: false, error: `Unsupported active provider: ${provider}` };
  } catch (e: any) {
    console.error("[createPaymentSession]", e);
    return { ok: false, error: e?.message || "Payment session failed" };
  }
}

// - PayFast -----------------------------------------------------------

async function dispatchPayFast(
  input: PaymentSessionInput,
  credentials: Record<string, string>,
  isTest: boolean,
): Promise<PaymentSessionResult> {
  const merchantId = credentials.merchantId;
  const merchantKey = credentials.merchantKey;
  const passphrase = credentials.passphrase || "";
  if (!merchantId || !merchantKey) {
    return { ok: false, error: "PayFast credentials incomplete for tenant" };
  }
  const html = generatePayFastPaymentForm({
    merchantId,
    merchantKey,
    passphrase,
    testMode: isTest,
    amount: input.amount,
    itemName: input.description,
    returnUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    notifyUrl: input.notifyUrl,
    nameFirst: input.customer.firstName || "Customer",
    nameLast: input.customer.lastName || "",
    emailAddress: input.customer.email,
    merchantPaymentId: input.extraMetadata?.paymentAttemptId || input.orderId,
    customStr1: input.orderId,
    customStr2: input.type,
    customStr3: input.companyId,
    // Forward the invoice id so the IPN can reconcile the invoice row
    // (deposit/balance payments hit record_order_payment, which only
    // updates the order; the webhook uses this to flip the invoice too).
    customStr4: input.extraMetadata?.invoiceId,
    customStr5: input.extraMetadata?.paymentAttemptId,
  });
  return {
    ok: true,
    provider: "payfast",
    paymentUrl: html,
    sessionId: input.extraMetadata?.paymentAttemptId || input.orderId,
    isHtmlForm: true,
  };
}

// - Yoco --------------------------------------------------------------

async function dispatchYoco(
  input: PaymentSessionInput,
  credentials: Record<string, string>,
): Promise<PaymentSessionResult> {
  const secretKey = credentials.secretKey;
  if (!secretKey) {
    return { ok: false, error: "Yoco secret key not configured for tenant" };
  }
  const result = await createYocoCheckout({
    secretKey,
    amount: input.amount,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: {
      orderId: input.orderId,
      paymentType: input.type,
      companyId: input.companyId,
      ...(input.extraMetadata || {}),
    },
  });
  return {
    ok: true,
    provider: "yoco",
    paymentUrl: result.redirectUrl,
    sessionId: result.id,
  };
}

// - Stripe ------------------------------------------------------------

async function dispatchStripe(
  input: PaymentSessionInput,
  credentials: Record<string, string>,
): Promise<PaymentSessionResult> {
  const secretKey = credentials.secretKey;
  if (!secretKey) {
    return { ok: false, error: "Stripe secret key not configured for tenant" };
  }
  const result = await createStripeCheckout({
    secretKey,
    amount: input.amount,
    currency: input.currency || "zar",
    description: input.description,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    customerEmail: input.customer.email,
    metadata: {
      orderId: input.orderId,
      paymentType: input.type,
      companyId: input.companyId,
      ...(input.extraMetadata || {}),
    },
  });
  return {
    ok: true,
    provider: "stripe",
    paymentUrl: result.url,
    sessionId: result.id,
  };
}
