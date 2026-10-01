/**
 * Stripe webhook handler - per-tenant variant.
 *
 * Tenants who pick Stripe in /admin/payment-gateways have their
 * webhookSigningSecret stored in payment_gateway_credentials. Stripe
 * signs every webhook with that secret; we MUST verify against the raw
 * body BEFORE parsing it, otherwise Stripe's library rejects the
 * signature. This route therefore reads the body as a stream.
 *
 * Only `checkout.session.completed` is handled today - the dispatch
 * cascade mirrors the PayFast IPN handler for deposits and balance
 * payments. Idempotency is on the Stripe payment_intent id.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { constructStripeEvent } from "@/lib/stripeService";
import { paymentGatewayService } from "@/services/paymentGatewayService";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentProcessingService } from "@/services/paymentProcessingService";
import type Stripe from "stripe";
import { withApiLogging } from "@/lib/withApiLogging";
import { settleTenantGatewayPayment, TenantGatewaySettlementError } from "@/lib/tenantGatewaySettlement";
import { getPaymentAttemptByReference, markPaymentAttemptSucceeded, touchPaymentAttempt, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { notifyPaymentAttemptFailed } from "@/services/payments/notifyPaymentAttemptFailed";


export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let raw: Buffer | null = null;
  try {
    raw = await readRawBody(req);

    // Strategy: peek at the metadata.companyId we set when creating
    // the Checkout session, so we can look up the tenant's signing
    // secret. Stripe's webhooks are POSTs of fully-formed Event
    // objects - we parse defensively before signature check, BUT we
    // only TRUST the parsed body once the signature verifies.
    let parsedPreview: any = null;
    try {
      parsedPreview = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    const eventMetadata = parsedPreview?.data?.object?.metadata || {};
    const companyId = eventMetadata.companyId || eventMetadata.company_id;
    const attemptIdPreview = eventMetadata.paymentAttemptId || null;
    if (!companyId) {
      return res.status(400).json({ error: "metadata.companyId missing on Stripe event" });
    }

    const sb = getServiceSupabase();
    const paymentAttempt = attemptIdPreview
      ? await getPaymentAttemptByReference("stripe", attemptIdPreview)
      : null;
    if (attemptIdPreview && (!paymentAttempt || paymentAttempt.company_id !== companyId)) {
      return res.status(400).json({ error: "Stripe payment attempt does not match this tenant" });
    }
    const savedGatewayId = String(paymentAttempt?.metadata?.gatewayId || "");
    const active = savedGatewayId
      ? await paymentGatewayService.getByIdWithCredentials(savedGatewayId, sb, true)
      : await paymentGatewayService.getActiveWithCredentials(companyId, sb);
    if (
      !active ||
      active.gateway.company_id !== companyId ||
      active.gateway.provider !== "stripe"
    ) {
      return res.status(400).json({ error: "Stripe not active for this company" });
    }
    const signingSecret = active.credentials.webhookSigningSecret || "";
    if (!signingSecret) {
      return res.status(400).json({ error: "Stripe webhook signing secret not configured" });
    }

    const sigHeader = req.headers["stripe-signature"] as string | undefined;
    const event = constructStripeEvent(raw, sigHeader, signingSecret);
    if (!event) {
      return res.status(401).json({ error: "Invalid Stripe signature" });
    }

    const eventObject: any = event.data.object;
    const metadata = eventObject.metadata || {};
    const attemptId = paymentAttempt?.id || metadata.paymentAttemptId || null;

    // A card decline is retryable inside the same Stripe Checkout page.
    // Record that provider state for support, but leave the attempt pending
    // so a later PaymentIntent success can settle it.
    if (event.type === "payment_intent.payment_failed") {
      if (paymentAttempt?.id) await touchPaymentAttempt(paymentAttempt.id, "payment_failed_retryable");
      return res.status(200).json({ message: "Retryable card failure recorded" });
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = eventObject as Stripe.PaymentIntent;
      const transactionId = paymentIntent.id;
      if (!metadata.orderId || !transactionId) {
        return res.status(400).json({ error: "Stripe PaymentIntent is missing payment metadata" });
      }
      const amountInRands = Number(paymentIntent.amount_received || paymentIntent.amount || 0) / 100;
      const duplicate = await completeStripeSettlement({
        admin: sb,
        companyId,
        paymentAttempt,
        attemptId,
        metadata,
        transactionId,
        amount: amountInRands,
        currency: paymentIntent.currency || "ZAR",
        providerSessionId: paymentAttempt?.provider_session_id || null,
        providerStatus: paymentIntent.status || event.type,
      });
      return res.status(200).json({ ok: true, duplicate });
    }

    const session = eventObject as Stripe.Checkout.Session;

    if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      const terminalStatus = event.type === "checkout.session.expired" ? "expired" : "failed";
      const transitioned = await transitionPaymentAttempt({
        provider: "stripe",
        attemptId,
        providerSessionId: session.id,
        status: terminalStatus,
        providerStatus: session.payment_status || event.type,
        failureReason: event.type === "checkout.session.expired"
          ? "Stripe checkout expired before payment was confirmed."
          : "Stripe reported that the asynchronous payment failed.",
      });
      if (transitioned.changed && transitioned.attempt) {
        await notifyPaymentAttemptFailed({
          admin: sb,
          attempt: transitioned.attempt,
          reason: event.type === "checkout.session.expired"
            ? "Stripe checkout expired before payment was confirmed."
            : "Stripe reported that the payment failed.",
        });
      }
      return res.status(200).json({ message: terminalStatus === "expired" ? "Checkout expiration recorded" : "Payment failure recorded" });
    }

    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
      return res.status(200).json({ message: "Ignored event type" });
    }

    if (session.payment_status !== "paid") {
      if (paymentAttempt?.id) await touchPaymentAttempt(paymentAttempt.id, session.payment_status || session.status || "pending");
      return res.status(200).json({ message: "Session not paid yet" });
    }

    const orderId = metadata.orderId;
    const paymentType = (metadata.paymentType || "").toLowerCase();
    const stripeTxId =
      (typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id) || session.id;

    if (!orderId || !stripeTxId) {
      return res.status(400).json({ error: "Stripe session missing orderId/payment_intent" });
    }

    const amountInRands = typeof session.amount_total === "number" ? session.amount_total / 100 : 0;
    const duplicate = await completeStripeSettlement({
      admin: sb,
      companyId,
      paymentAttempt,
      attemptId,
      metadata,
      transactionId: stripeTxId,
      amount: amountInRands,
      currency: session.currency || "ZAR",
      providerSessionId: session.id,
      providerStatus: session.payment_status || event.type,
    });
    return res.status(200).json({ ok: true, duplicate });
  } catch (e: any) {
    // Phase 6 follow-up: same rationale as PayFast webhook capture.
    const { captureException } = await import("@/lib/observability");
    captureException(e, {
      tags: { route: "/api/webhooks/stripe-confirmation", provider: "stripe" },
      level: "error",
    });
    const statusCode = e instanceof TenantGatewaySettlementError ? e.statusCode : 500;
    return res.status(statusCode).json({ error: e?.message || "Stripe webhook failed" });
  }
}

export default withApiLogging(handler);

async function completeStripeSettlement(input: {
  admin: any;
  companyId: string;
  paymentAttempt: any;
  attemptId: string | null;
  metadata: Record<string, any>;
  transactionId: string;
  amount: number;
  currency: string;
  providerSessionId: string | null;
  providerStatus: string;
}): Promise<boolean> {
  const orderId = String(input.metadata.orderId || "");
  const paymentType = String(input.metadata.paymentType || "").toLowerCase();
  if (!orderId) throw new TenantGatewaySettlementError("Stripe payment metadata is missing an order or invoice reference");
  const settlement = await settleTenantGatewayPayment({
    admin: input.admin,
    provider: "stripe",
    transactionId: input.transactionId,
    companyId: input.companyId,
    orderId,
    paymentType,
    invoiceId: input.metadata.invoiceId,
    paymentAttempt: input.paymentAttempt,
    amount: input.amount,
    currency: input.currency,
  });
  await markPaymentAttemptSucceeded({
    provider: "stripe",
    attemptId: input.paymentAttempt?.id || input.attemptId,
    providerSessionId: input.providerSessionId,
    providerStatus: input.providerStatus,
  });
  if (settlement.order && !settlement.duplicate) {
    if (paymentType === "deposit") {
      await paymentProcessingService.processDepositPayment(orderId, input.transactionId, "stripe", settlement.order.user_id);
    } else if (paymentType === "balance") {
      await paymentProcessingService.processBalancePayment(orderId, input.transactionId, "stripe", settlement.order.user_id);
    }
  }
  return settlement.duplicate;
}
