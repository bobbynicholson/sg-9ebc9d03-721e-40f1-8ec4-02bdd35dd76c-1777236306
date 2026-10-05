/**
 * Yoco webhook handler - per-tenant variant.
 *
 * Tenants who pick Yoco in /admin/payment-gateways have their
 * webhookSecret stored in payment_gateway_credentials. Yoco signs
 * webhooks with HMAC-SHA256 over id.timestamp.rawBody using the
 * base64-decoded secret.
 * Idempotency on the Yoco transaction id mirrors the PayFast IPN
 * pattern in payment-confirmation.ts - DO NOT modify that file from
 * here, the PayFast path is owned separately.
 *
 * Body contract (Yoco):
 *   {
 *     id: "evt_...",
 *     type: "payment.succeeded" | ... ,
 *     payload: {
 *       id: "ch_...",
 *       status: "succeeded" | "failed",
 *       amount: 12500,            // cents
 *       currency: "ZAR",
 *       metadata: {
 *         checkoutId // Other metadata is optional; saved attempt owns routing.
 *       }
 *     }
 *   }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyYocoSignature } from "@/lib/yocoService";
import { getCheckoutGatewayCredentials } from "@/lib/checkoutGatewayCredentials";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { settleTenantGatewayPayment, TenantGatewaySettlementError } from "@/lib/tenantGatewaySettlement";
import { getPaymentAttemptByReference, touchPaymentAttempt, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { notifyPaymentAttemptFailed } from "@/services/payments/notifyPaymentAttemptFailed";


// We need the raw body for HMAC verification.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c) => {
      const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += chunk.length;
      if (size > 1024 * 1024) return reject(new TenantGatewaySettlementError("Yoco event body is too large", 413));
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let raw = "";
  try {
    raw = await readRawBody(req);
    let event: any;
    try { event = JSON.parse(raw); }
    catch { return res.status(400).json({ error: "Invalid JSON body" }); }
    if (!event || typeof event !== "object" || !event.payload || typeof event.payload !== "object") {
      return res.status(400).json({ error: "Invalid Yoco event" });
    }
    const payload = event.payload;
    const metadata = payload.metadata || {};
    const eventType = String(event.type || "").toLowerCase();
    // Platform plan payments have their own endpoint. If the platform and a
    // tenant share a Yoco account, both receive every event; acknowledge the
    // plan ones here instead of asking Yoco to retry forever.
    if (metadata.purpose === "platform_plan") {
      return res.status(200).json({ message: "Ignored platform plan payment" });
    }
    const checkoutId = typeof metadata.checkoutId === "string" ? metadata.checkoutId : "";
    const providedAttemptId = typeof metadata.paymentAttemptId === "string" ? metadata.paymentAttemptId : "";
    if (!providedAttemptId && !checkoutId) return res.status(eventType.startsWith("payment.") ? 400 : 200)
      .json({ message: "Event has no tracked checkout reference" });
    const sb = getServiceSupabase();
    const paymentAttempt = await getPaymentAttemptByReference("yoco", providedAttemptId || checkoutId);
    if (!paymentAttempt) {
      // A callback may beat the session attach. Ask Yoco to retry it rather
      // than acknowledging a payment that cannot yet be tracked.
      if (eventType.startsWith("payment.")) return res.status(503).json({ error: "Yoco checkout tracking is not available yet" });
      return res.status(200).json({ message: "Ignored unrelated event" });
    }
    const companyId = paymentAttempt.company_id;
    const paymentType = paymentAttempt.payment_type;
    const orderId = paymentType === "invoice" ? paymentAttempt.invoice_id : paymentAttempt.order_id;
    const attemptId = paymentAttempt.id;
    const yocoTxId = typeof payload.id === "string" ? payload.id : "";
    const savedGatewayId = String(paymentAttempt.metadata?.gatewayId || "");
    const active = await getCheckoutGatewayCredentials(sb, paymentAttempt, savedGatewayId);
    if (!active || active.gateway.company_id !== companyId || active.gateway.provider !== "yoco") {
      return res.status(503).json({ error: "Could not load the original Yoco checkout account" });
    }
    const header = (name: string) => typeof req.headers[name] === "string" ? req.headers[name] as string : undefined;
    if (!verifyYocoSignature(raw, header("webhook-signature"), active.credentials.webhookSecret || "",
      header("webhook-id"), header("webhook-timestamp"))) {
      return res.status(401).json({ error: "Invalid Yoco signature or timestamp" });
    }
    if (metadata.companyId && metadata.companyId !== companyId || metadata.orderId && metadata.orderId !== orderId ||
      metadata.paymentType && metadata.paymentType !== paymentType || metadata.invoiceId && metadata.invoiceId !== paymentAttempt.invoice_id) {
      return res.status(400).json({ error: "Yoco metadata does not match the saved checkout" });
    }
    if (checkoutId && checkoutId !== paymentAttempt.provider_session_id) {
      return res.status(paymentAttempt.provider_session_id === attemptId ? 503 : 400).json({ error: "Yoco checkout ID does not match the saved session" });
    }
    if (payload.mode && payload.mode !== (active.gateway.is_test ? "test" : "live")) {
      return res.status(400).json({ error: "Yoco payment mode does not match the checkout account" });
    }
    // Refund success must never be added as new incoming money. Unknown
    // event families cannot change a checkout's financial state either.
    if (!["payment.succeeded", "payment.failed", "payment.cancelled", "payment.expired", "payment.pending", "payment.processing"].includes(eventType)) {
      return res.status(200).json({ message: "Ignored event type" });
    }
    if (!checkoutId || !yocoTxId || !orderId) return res.status(400).json({ error: "Missing Yoco checkout/payment reference" });
    if (payload.type && payload.type !== "payment" || eventType === "payment.succeeded" && payload.status !== "succeeded") {
      return res.status(400).json({ error: "Yoco event contains inconsistent payment status/type" });
    }

    // Do not turn intermediate provider events into failures. A later
    // signed success event must remain able to complete this attempt.
    const status = (payload.status || "").toLowerCase();
    const succeeded =
      eventType === "payment.succeeded" && status === "succeeded";
    if (!succeeded) {
      // A declined card inside Yoco's hosted checkout can be retried on the
      // same page (same checkoutId). Like Stripe's payment_intent.payment_failed,
      // record it for support but keep the attempt open so a later success
      // settles cleanly and the payer is not sent a premature failure notice.
      if (eventType === "payment.failed") {
        await touchPaymentAttempt(paymentAttempt.id, "payment_failed_retryable");
        return res.status(200).json({ message: "Retryable card failure recorded" });
      }
      const terminalFailure =
        eventType.includes("cancel") || eventType.includes("expired") ||
        ["cancelled", "canceled", "expired"].includes(status);
      if (terminalFailure) {
        const terminalStatus = eventType.includes("expired") || status === "expired" ? "expired" : "failed";
        const transitioned = await transitionPaymentAttempt({
          provider: "yoco",
          attemptId: paymentAttempt?.id || attemptId,
          providerSessionId: checkoutId,
          status: terminalStatus,
          providerStatus: payload.status || event.type || "unknown",
          failureReason: `Yoco event/status: ${event.type || payload.status || "unknown"}`,
        });
        if (transitioned.changed && transitioned.attempt) {
          await notifyPaymentAttemptFailed({
            admin: sb,
            attempt: transitioned.attempt,
            reason: `Yoco returned ${event.type || payload.status || "a failed status"}.`,
          });
        }
      } else if (paymentAttempt?.id) {
        await touchPaymentAttempt(paymentAttempt.id, payload.status || event.type || "pending");
      }
      return res.status(200).json({ message: "Ignored non-success event" });
    }

    // Idempotency on the Yoco transaction id. Mirrors the PayFast IPN
    // pattern in /api/webhooks/payment-confirmation.ts. Wave 24:
    // tri-state - duplicate (200), unique (proceed), or check failed
    // (500 so Yoco retries instead of double-processing on a transient
    // DB blip).
    const amountInRands = typeof payload.amount === "number" ? payload.amount / 100 : 0;
    const settlement = await settleTenantGatewayPayment({
      admin: sb,
      provider: "yoco",
      transactionId: yocoTxId,
      companyId,
      orderId,
      paymentType,
      invoiceId: paymentAttempt.invoice_id,
      paymentAttempt,
      amount: amountInRands,
      currency: payload.currency || "ZAR",
    });


    // Keep the existing best-effort reminders / receipt workflow for a
    // newly settled order. The ledger, order flags, and invoice were already
    // written with the service-role client above.
    return res.status(200).json({ ok: true, duplicate: settlement.duplicate });
  } catch (e: any) {
    // Phase 6 follow-up: same rationale as PayFast webhook capture.
    const { captureException } = await import("@/lib/observability");
    captureException(e, {
      tags: { route: "/api/webhooks/yoco-confirmation", provider: "yoco" },
      level: "error",
    });
    const statusCode = e instanceof TenantGatewaySettlementError ? e.statusCode : 500;
    return res.status(statusCode).json({ error: e?.message || "Yoco webhook failed" });
  }
}

export default withApiLogging(handler);
