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
import { orderService } from "@/services/orderService";
import { paymentProcessingService } from "@/services/paymentProcessingService";
import type Stripe from "stripe";

export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const companyId =
      parsedPreview?.data?.object?.metadata?.companyId ||
      parsedPreview?.data?.object?.metadata?.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "metadata.companyId missing on Stripe event" });
    }

    const sb = getServiceSupabase();
    const active = await paymentGatewayService.getActiveWithCredentials(
      companyId,
      sb,
    );
    if (!active || active.gateway.provider !== "stripe") {
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

    if (event.type !== "checkout.session.completed") {
      return res.status(200).json({ message: "Ignored event type" });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return res.status(200).json({ message: "Session not paid yet" });
    }

    const metadata = session.metadata || {};
    const orderId = metadata.orderId;
    const paymentType = (metadata.paymentType || "").toLowerCase();
    const stripeTxId =
      (typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id) || session.id;

    if (!orderId || !stripeTxId) {
      return res.status(400).json({ error: "Stripe session missing orderId/payment_intent" });
    }

    // Idempotency. Wave 24: tri-state - duplicate (200), unique
    // (proceed), or check failed (500 so Stripe retries instead of
    // double-processing on a transient DB blip).
    const dupCheck = await isDuplicateStripePayment(sb, stripeTxId);
    if (dupCheck === "duplicate") {
      return res.status(200).json({ message: "Already processed", orderId });
    }
    if (dupCheck === "error") {
      console.error("[stripe-webhook] dedup check failed for txId", stripeTxId);
      return res.status(500).json({ error: "Dedup check failed, retry the event" });
    }

    const amountInRands =
      typeof session.amount_total === "number" ? session.amount_total / 100 : 0;

    const orderResult = await orderService.getOrderById(orderId);
    if (!orderResult.success || !orderResult.data) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order: any = orderResult.data;

    const isDeposit = paymentType
      ? paymentType === "deposit"
      : !order.deposit_paid;

    const recordResult = await orderService.recordPayment(
      order.id,
      amountInRands,
      "stripe",
      stripeTxId,
      {
        userId: order.user_id,
        companyId: order.company_id || order.user_id,
        clientId: order.client_id || undefined,
        currency: order.currency,
        paymentType: isDeposit ? "deposit" : "balance",
        gatewayProvider: "stripe",
      },
    );
    if (!recordResult.success) {
      return res.status(500).json({ error: "Failed to record payment" });
    }

    if (isDeposit) {
      await paymentProcessingService.processDepositPayment(
        order.id,
        stripeTxId,
        "stripe",
        order.user_id,
      );
    } else {
      await paymentProcessingService.processBalancePayment(
        order.id,
        stripeTxId,
        "stripe",
        order.user_id,
      );
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[stripe-webhook] crashed:", e);
    return res.status(500).json({ error: e?.message || "Stripe webhook failed" });
  }
}

// Wave 24: returns tri-state instead of boolean. The previous
// boolean variant treated DB errors as "not duplicate", which means a
// flaky RLS / network blip would silently double-process the payment
// (the client gets charged once, our system records the deposit
// twice, the operator chases a phantom credit). Returning "error"
// lets the caller fail closed - Stripe + Yoco both retry on 5xx.
async function isDuplicateStripePayment(sb: any, stripeTxId: string): Promise<"duplicate" | "unique" | "error"> {
  const { data, error } = await sb
    .from("payments")
    .select("id")
    .or(`gateway_transaction_id.eq.${stripeTxId},transaction_id.eq.${stripeTxId}`)
    .limit(1);
  if (error) return "error";
  return Array.isArray(data) && data.length > 0 ? "duplicate" : "unique";
}
