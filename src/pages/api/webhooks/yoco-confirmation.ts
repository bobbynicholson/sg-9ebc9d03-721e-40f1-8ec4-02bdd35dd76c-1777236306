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
import { orderService } from "@/services/orderService";
import { paymentProcessingService } from "@/services/paymentProcessingService";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    if (!orderId || !companyId) {
      return res.status(400).json({ error: "Missing orderId/companyId metadata" });
    }
    if (!yocoTxId) {
      return res.status(400).json({ error: "Missing Yoco payload id" });
    }

    // Resolve tenant credentials so we can verify the signature with
    // their webhookSecret. Service-role read; the credentials table is
    // RLS-locked.
    const sb = getServiceSupabase();
    const active = await paymentGatewayService.getActiveWithCredentials(
      companyId,
      sb,
    );
    if (!active || active.gateway.provider !== "yoco") {
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

    // We only act on succeeded payments. Anything else is a 200 noop so
    // Yoco doesn't retry forever.
    const eventType = (event.type || "").toLowerCase();
    const status = (payload.status || "").toLowerCase();
    const succeeded =
      eventType.includes("succeeded") || status === "succeeded" || status === "successful";
    if (!succeeded) {
      return res.status(200).json({ message: "Ignored non-success event" });
    }

    // Idempotency on the Yoco transaction id. Mirrors the PayFast IPN
    // pattern in /api/webhooks/payment-confirmation.ts. Wave 24:
    // tri-state - duplicate (200), unique (proceed), or check failed
    // (500 so Yoco retries instead of double-processing on a transient
    // DB blip).
    const dupCheck = await isDuplicateYocoPayment(sb, yocoTxId);
    if (dupCheck === "duplicate") {
      return res.status(200).json({ message: "Already processed", orderId });
    }
    if (dupCheck === "error") {
      console.error("[yoco-webhook] dedup check failed for txId", yocoTxId);
      return res.status(500).json({ error: "Dedup check failed, retry the event" });
    }

    const amountInRands =
      typeof payload.amount === "number" ? payload.amount / 100 : 0;

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
      "yoco",
      yocoTxId,
      {
        userId: order.user_id,
        companyId: order.company_id || order.user_id,
        clientId: order.client_id || undefined,
        currency: order.currency,
        paymentType: isDeposit ? "deposit" : "balance",
        gatewayProvider: "yoco",
      },
    );
    if (!recordResult.success) {
      return res.status(500).json({ error: "Failed to record payment" });
    }

    if (isDeposit) {
      await paymentProcessingService.processDepositPayment(
        order.id,
        yocoTxId,
        "yoco",
        order.user_id,
      );
    } else {
      await paymentProcessingService.processBalancePayment(
        order.id,
        yocoTxId,
        "yoco",
        order.user_id,
      );
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    // Phase 6 follow-up: same rationale as PayFast webhook capture.
    const { captureException } = await import("@/lib/observability");
    captureException(e, {
      tags: { route: "/api/webhooks/yoco-confirmation", provider: "yoco" },
      level: "error",
      extra: { raw_preview: raw.slice(0, 200) },
    });
    return res.status(500).json({ error: e?.message || "Yoco webhook failed" });
  }
}

// Wave 24: returns tri-state instead of boolean. The previous boolean
// variant logged the error then processed anyway - a flaky RLS /
// network blip would silently double-process the payment. Returning
// "error" lets the caller fail closed; Yoco retries on 5xx.
async function isDuplicateYocoPayment(sb: any, yocoTxId: string): Promise<"duplicate" | "unique" | "error"> {
  const { data, error } = await sb
    .from("payments")
    .select("id")
    .or(`gateway_transaction_id.eq.${yocoTxId},transaction_id.eq.${yocoTxId}`)
    .limit(1);
  if (error) {
    console.warn("[yoco-webhook] dedup check failed:", error.message);
    return "error";
  }
  return Array.isArray(data) && data.length > 0 ? "duplicate" : "unique";
}
