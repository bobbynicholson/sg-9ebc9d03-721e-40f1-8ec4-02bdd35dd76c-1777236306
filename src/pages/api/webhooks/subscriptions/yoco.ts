/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform Yoco plan-payment webhook.
 *
 * Distinct from /api/webhooks/yoco-confirmation (tenant ORDER payments on
 * each company's own Yoco account): this endpoint receives events from the
 * PLATFORM Yoco account, where companies pay for their CateringMS plan.
 *
 * Register it once with scripts/register-yoco-platform-webhook.mjs and set
 * YOCO_PLATFORM_WEBHOOK_SECRET to the whsec_ secret Yoco returns.
 *
 * payment.succeeded -> one prepaid period (settleYocoPlanPayment)
 * payment.failed    -> recorded; the hosted checkout lets the payer retry
 * anything else     -> acknowledged
 *
 * Non-2xx only when a retry can help (tracking row not yet attached, DB
 * error), so Yoco re-delivers instead of the payment being lost.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyYocoSignature } from "@/lib/yocoService";
import { getServiceSupabase } from "@/lib/supabase/service";
import { settleYocoPlanPayment } from "@/services/platformPlanBilling";
import { withApiLogging } from "@/lib/withApiLogging";

export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c) => {
      const chunk = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += chunk.length;
      if (size > 1024 * 1024) return reject(new Error("Yoco event body is too large"));
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
  const secret = process.env.YOCO_PLATFORM_WEBHOOK_SECRET || "";
  if (!secret) return res.status(503).json({ error: "Yoco plan billing webhook is not configured" });

  let raw = "";
  try {
    raw = await readRawBody(req);
  } catch (e: any) {
    return res.status(413).json({ error: e?.message || "Could not read body" });
  }
  const header = (name: string) => typeof req.headers[name] === "string" ? req.headers[name] as string : undefined;
  if (!verifyYocoSignature(raw, header("webhook-signature"), secret, header("webhook-id"), header("webhook-timestamp"))) {
    return res.status(401).json({ error: "Invalid Yoco signature or timestamp" });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: "Invalid JSON body" }); }
  const payload = event?.payload || {};
  const metadata = payload.metadata || {};
  const eventType = String(event?.type || "").toLowerCase();
  const platformCheckoutId = typeof metadata.platformCheckoutId === "string" ? metadata.platformCheckoutId : "";
  // The platform Yoco account may also take other payments; only our plan
  // checkouts carry platformCheckoutId.
  if (!platformCheckoutId || metadata.purpose !== "platform_plan") {
    return res.status(200).json({ message: "Ignored: not a plan checkout" });
  }

  const sb: any = getServiceSupabase();
  try {
    const { data: checkout, error } = await sb.from("platform_subscription_checkouts")
      .select("*").eq("id", platformCheckoutId).maybeSingle();
    if (error) throw error;
    if (!checkout || checkout.provider !== "yoco") {
      return res.status(200).json({ message: "Ignored: unknown plan checkout" });
    }
    if (metadata.companyId && metadata.companyId !== checkout.company_id) {
      return res.status(400).json({ error: "Yoco metadata does not match the plan checkout" });
    }
    const yocoCheckoutId = typeof metadata.checkoutId === "string" ? metadata.checkoutId : "";
    if (yocoCheckoutId && checkout.provider_session_id && yocoCheckoutId !== checkout.provider_session_id) {
      return res.status(400).json({ error: "Yoco checkout ID does not match the plan checkout" });
    }
    if (yocoCheckoutId && !checkout.provider_session_id) {
      // The webhook beat the session attach; Yoco will retry.
      return res.status(503).json({ error: "Plan checkout is still being prepared" });
    }

    const eventId = String(event.id || `${payload.id}:${eventType}`);
    const { error: logError } = await sb.from("subscription_webhook_events").upsert({
      provider: "yoco", event_id: eventId, event_type: eventType || "unknown",
      company_id: checkout.company_id,
      raw: { id: event.id, type: event.type, payment_id: payload.id, status: payload.status, amount: payload.amount, currency: payload.currency, mode: payload.mode, metadata },
      rejection_reason: "processing",
    }, { onConflict: "provider,event_id", ignoreDuplicates: true });
    if (logError) console.warn("[subscriptions/yoco] event log failed:", logError);

    const nowIso = new Date().toISOString();
    if (eventType === "payment.succeeded" && payload.status === "succeeded") {
      if (typeof payload.id !== "string" || typeof payload.amount !== "number") {
        return res.status(400).json({ error: "Yoco payment is missing its id or amount" });
      }
      const result = await settleYocoPlanPayment(sb, checkout, {
        id: payload.id, amountCents: payload.amount, currency: payload.currency || "ZAR",
      });
      await sb.from("subscription_webhook_events").update({ rejection_reason: null, processed_at: nowIso })
        .eq("provider", "yoco").eq("event_id", eventId);
      return res.status(200).json({ ok: true, duplicate: result.duplicate });
    }

    if (eventType === "payment.failed") {
      await sb.from("platform_subscription_checkouts").update({
        provider_status: "payment_failed_retryable", last_checked_at: nowIso, updated_at: nowIso,
      }).eq("id", checkout.id).eq("status", "pending");
    }
    await sb.from("subscription_webhook_events").update({ rejection_reason: `not_settled:${eventType}`, processed_at: nowIso })
      .eq("provider", "yoco").eq("event_id", eventId);
    return res.status(200).json({ message: "Recorded" });
  } catch (e: any) {
    console.error("[subscriptions/yoco] failed:", e);
    const mismatch = /does not match/i.test(String(e?.message || ""));
    return res.status(mismatch ? 400 : 500).json({ error: e?.message || "Yoco plan webhook failed" });
  }
}

export default withApiLogging(handler);
