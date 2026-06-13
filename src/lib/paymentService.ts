/**
 * Provider-agnostic payment dispatcher (server-only).
 *
 * Tenants pick PayFast / Yoco / Stripe in /admin/payment-gateways.
 * Whatever they pick is what `createPaymentSession` dispatches to here:
 * the function looks up the company's active gateway, reads its
 * credentials via service-role Supabase, and hands off to the right
 * provider lib.
 *
 * The PayFast SaaS-subscription path (used to bill tenants for the
 * platform itself) is a SEPARATE concern and lives in
 * paymentProcessingService.generatePaymentLink + lib/payfastService.
 * Don't confuse the two: this file is exclusively about tenants taking
 * money FROM their event clients.
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

/**
 * Resolve and dispatch to the company's active payment provider. If no
 * gateway has been configured, falls back to PayFast with env-var
 * credentials - preserves the legacy single-tenant behaviour so
 * existing deployments don't break the moment this code lands.
 */
export async function createPaymentSession(
  input: PaymentSessionInput,
): Promise<PaymentSessionResult> {
  try {
    const sb = getServiceSupabase();
    const active = await paymentGatewayService.getActiveWithCredentials(
      input.companyId,
      sb,
    );

    // No tenant config - fall back to legacy env-var PayFast so
    // existing single-tenant deployments keep working without forcing
    // a reconfigure on the day of release.
    if (!active) {
      return await dispatchLegacyPayFast(input);
    }

    const provider = active.gateway.provider as PaymentGatewayProvider;
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
    customStr1: input.orderId,
    customStr2: input.type,
    customStr3: input.companyId,
    // Forward the invoice id so the IPN can reconcile the invoice row
    // (deposit/balance payments hit record_order_payment, which only
    // updates the order; the webhook uses this to flip the invoice too).
    customStr4: input.extraMetadata?.invoiceId,
  });
  return {
    ok: true,
    provider: "payfast",
    paymentUrl: html,
    sessionId: input.orderId,
    isHtmlForm: true,
  };
}

async function dispatchLegacyPayFast(
  input: PaymentSessionInput,
): Promise<PaymentSessionResult> {
  const merchantId = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE || "";
  const testMode = process.env.NODE_ENV !== "production";
  if (!merchantId || !merchantKey) {
    return {
      ok: false,
      error:
        "No payment gateway configured for this company. Ask the operator to set one up in Admin -> Payment Gateways.",
    };
  }
  const html = generatePayFastPaymentForm({
    merchantId,
    merchantKey,
    passphrase,
    testMode,
    amount: input.amount,
    itemName: input.description,
    returnUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    notifyUrl: input.notifyUrl,
    nameFirst: input.customer.firstName || "Customer",
    nameLast: input.customer.lastName || "",
    emailAddress: input.customer.email,
    customStr1: input.orderId,
    customStr2: input.type,
    customStr3: input.companyId,
    // See dispatchPayFast: forward invoice id for IPN reconciliation.
    customStr4: input.extraMetadata?.invoiceId,
  });
  return {
    ok: true,
    provider: "payfast",
    paymentUrl: html,
    sessionId: input.orderId,
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
