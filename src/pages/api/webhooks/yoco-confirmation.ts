/**
 * Yoco webhook handler - per-tenant variant.
 *
 * Tenants who pick Yoco in /admin/payment-gateways have their
 * webhookSecret stored in payment_gateway_credentials. Yoco signs
 * webhooks with HMAC-SHA256 over the raw body using that secret.
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
 *         orderId, paymentType, companyId
 *       }
 *     }
 *   }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyYocoSignature } from "@/lib/yocoService";
import { paymentGatewayService } from "@/services/paymentGatewayService";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentProcessingService } from "@/services/paymentProcessingService";
import { withApiLogging } from "@/lib/withApiLogging";
import { settleTenantGatewayPayment, TenantGatewaySettlementError } from "@/lib/tenantGatewaySettlement";
import { getPaymentAttemptByReference, markPaymentAttemptSucceeded, touchPaymentAttempt, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { notifyPaymentAttemptFailed } from "@/services/payments/notifyPaymentAttemptFailed";


// We need the raw body for HMAC verification.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
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
    const event = JSON.parse(raw) as {
      type?: string;
      payload?: {
        id?: string;
        status?: string;
        amount?: number;
        currency?: string;
        metadata?: Record<string, string>;
      };
    };

    const payload = event.payload || {};
    const metadata = payload.metadata || {};
    const orderId = metadata.orderId;
    const companyId = metadata.companyId;
    const paymentType = (metadata.paymentType || "").toLowerCase();
    const yocoTxId = payload.id;
    const attemptId = metadata.paymentAttemptId || null;

    if (!orderId || !companyId) {
      return res.status(400).json({ error: "Missing orderId/companyId metadata" });
    }
    if (!yocoTxId) {
      return res.status(400).json({ error: "Missing Yoco payload id" });
    }

    // Resolve tenant credentials so we can verify the signature with
    // the account that created this checkout, even if the owner changed
    // the active provider while the customer was in the hosted checkout.
    const sb = getServiceSupabase();
    const paymentAttempt = attemptId
      ? await getPaymentAttemptByReference("yoco", attemptId)
      : null;
    if (attemptId && (!paymentAttempt || paymentAttempt.company_id !== companyId)) {
      return res.status(400).json({ error: "Yoco payment attempt does not match this tenant" });
    }
    const savedGatewayId = String(paymentAttempt?.metadata?.gatewayId || "");
    const active = savedGatewayId
      ? await paymentGatewayService.getByIdWithCredentials(savedGatewayId, sb, true)
      : await paymentGatewayService.getActiveWithCredentials(companyId, sb);
    if (
      !active ||
      active.gateway.company_id !== companyId ||
      active.gateway.provider !== "yoco"
    ) {
      return res.status(400).json({ error: "Yoco not active for this company" });
    }
    const webhookSecret = active.credentials.webhookSecret || "";

    // Signature gate. Audit (May 2026, Wave 6): the previous code
    // accepted unsigned bodies when no secret was configured, with
    // only a console.warn. Any attacker who knew the public webhook
    // URL could mark orders paid by POSTing fabricated metadata.
    // Now: fail closed in production. Sandbox / dev (NODE_ENV !==
    // 'production') still tolerates missing secrets so test events
    // can flow, but production refuses unsigned requests outright.
    if (webhookSecret) {
      const sigHeader =
        (req.headers["webhook-signature"] as string | undefined) ||
        (req.headers["yoco-signature"] as string | undefined);
      if (!verifyYocoSignature(raw, sigHeader, webhookSecret)) {
        return res.status(401).json({ error: "Invalid Yoco signature" });
      }
    } else if (process.env.NODE_ENV === "production") {
      console.warn(`[yoco-webhook] no webhookSecret for company ${companyId} - REJECTING (production)`);
      return res.status(401).json({
        error: "Yoco webhook secret is not configured for this tenant. Set it in Settings -> Payment Gateways before going live.",
      });
    } else {
      console.warn(`[yoco-webhook] no webhookSecret for company ${companyId} - accepting unsigned (non-prod)`);
    }

    // Do not turn intermediate provider events into failures. A later
    // signed success event must remain able to complete this attempt.
    const eventType = (event.type || "").toLowerCase();
    const status = (payload.status || "").toLowerCase();
    const succeeded =
      eventType.includes("succeeded") || status === "succeeded" || status === "successful";
    if (!succeeded) {
      const terminalFailure =
        eventType.includes("failed") || eventType.includes("cancel") || eventType.includes("expired") ||
        ["failed", "cancelled", "canceled", "expired"].includes(status);
      if (terminalFailure) {
        const terminalStatus = eventType.includes("expired") || status === "expired" ? "expired" : "failed";
        const transitioned = await transitionPaymentAttempt({
          provider: "yoco",
          attemptId: paymentAttempt?.id || attemptId,
          providerSessionId: yocoTxId,
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
      invoiceId: metadata.invoiceId,
      paymentAttempt,
      amount: amountInRands,
      currency: payload.currency || "ZAR",
    });
    await markPaymentAttemptSucceeded({
      provider: "yoco",
      attemptId: paymentAttempt?.id || attemptId,
      providerSessionId: yocoTxId,
      providerStatus: payload.status || event.type || "succeeded",
    });

    // Keep the existing best-effort reminders / receipt workflow for a
    // newly settled order. The ledger, order flags, and invoice were already
    // written with the service-role client above.
    if (settlement.order && !settlement.duplicate) {
      if (paymentType === "deposit") {
        await paymentProcessingService.processDepositPayment(orderId, yocoTxId, "yoco", settlement.order.user_id);
      } else if (paymentType === "balance") {
        await paymentProcessingService.processBalancePayment(orderId, yocoTxId, "yoco", settlement.order.user_id);
      }
    }
    return res.status(200).json({ ok: true, duplicate: settlement.duplicate });
  } catch (e: any) {
    // Phase 6 follow-up: same rationale as PayFast webhook capture.
    const { captureException } = await import("@/lib/observability");
    captureException(e, {
      tags: { route: "/api/webhooks/yoco-confirmation", provider: "yoco" },
      level: "error",
      extra: { raw_preview: raw.slice(0, 200) },
    });
    const statusCode = e instanceof TenantGatewaySettlementError ? e.statusCode : 500;
    return res.status(statusCode).json({ error: e?.message || "Yoco webhook failed" });
  }
}

export default withApiLogging(handler);
