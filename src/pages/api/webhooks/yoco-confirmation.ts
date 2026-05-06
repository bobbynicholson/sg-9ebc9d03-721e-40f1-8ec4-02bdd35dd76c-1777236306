/**
 * Yoco webhook handler -- per-tenant variant.
 *
 * Tenants who pick Yoco in /admin/payment-gateways have their
 * webhookSecret stored in payment_gateway_credentials. Yoco signs
 * webhooks with HMAC-SHA256 over the raw body using that secret.
 * Idempotency on the Yoco transaction id mirrors the PayFast IPN
 * pattern in payment-confirmation.ts -- DO NOT modify that file from
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

    // Signature header is required only when a secret is configured.
    // Yoco lets you skip webhook signing for sandbox; we tolerate that
    // by accepting the body when no secret is set, but log a warning so
    // the operator knows to lock it down before going live.
    if (webhookSecret) {
      const sigHeader =
        (req.headers["webhook-signature"] as string | undefined) ||
        (req.headers["yoco-signature"] as string | undefined);
      if (!verifyYocoSignature(raw, sigHeader, webhookSecret)) {
        return res.status(401).json({ error: "Invalid Yoco signature" });
      }
    } else {
      console.warn(`[yoco-webhook] no webhookSecret for company ${companyId} -- accepting unsigned`);
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
    // pattern in /api/webhooks/payment-confirmation.ts.
    const dup = await isDuplicateYocoPayment(sb, yocoTxId);
    if (dup) {
      return res.status(200).json({ message: "Already processed", orderId });
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
    console.error("[yoco-webhook] crashed:", e, "raw:", raw.slice(0, 200));
    return res.status(500).json({ error: e?.message || "Yoco webhook failed" });
  }
}

async function isDuplicateYocoPayment(sb: any, yocoTxId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("payments")
    .select("id")
    .or(`gateway_transaction_id.eq.${yocoTxId},transaction_id.eq.${yocoTxId}`)
    .limit(1);
  if (error) {
    console.warn("[yoco-webhook] dedup check failed, processing anyway:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}
