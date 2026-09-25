/*
 * Reconcile checkout attempts that never received a webhook.
 *
 * Webhooks remain the settlement authority. This worker does not invent a
 * successful payment from a browser redirect; it records provider status,
 * expires abandoned sessions, and alerts the company when a provider says a
 * payment is paid but our webhook has not arrived yet.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireCronAuth } from "@/lib/cronAuth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentGatewayService } from "@/services/paymentGatewayService";
import { transitionPaymentAttempt, touchPaymentAttempt } from "@/services/paymentAttemptService";
import { notifyPaymentAttemptFailed } from "@/services/payments/notifyPaymentAttemptFailed";
import Stripe from "stripe";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb = getServiceSupabase();
  // A browser redirect/return is not settlement. Give the provider's
  // signed webhook a quiet grace period first, then re-check only at a
  // bounded cadence so this worker never hammers a provider while a
  // checkout is still legitimately pending.
  const initialGraceCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recheckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: attempts, error } = await sb
    .from("payment_attempts")
    .select("*")
    .eq("status", "pending")
    .lt("created_at", initialGraceCutoff)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });

  const eligibleAttempts = ((attempts || []) as any[]).filter((attempt) =>
    !attempt.last_checked_at || attempt.last_checked_at < recheckCutoff,
  );

  let checked = 0;
  let expired = 0;
  let webhookMissing = 0;
  for (const attempt of eligibleAttempts) {
    checked += 1;
    if (attempt.expires_at && new Date(attempt.expires_at).getTime() <= Date.now()) {
      const transitioned = await transitionPaymentAttempt({
        provider: attempt.provider,
        attemptId: attempt.id,
        status: "expired",
        providerStatus: attempt.provider_status || "expired",
        failureReason: "Checkout session expired before a payment confirmation webhook arrived.",
      });
      if (transitioned.changed && transitioned.attempt) {
        expired += 1;
        await notifyPaymentAttemptFailed({
          admin: sb,
          attempt: transitioned.attempt,
          reason: "The checkout expired before the payment could be confirmed.",
        });
      }
      continue;
    }

    let providerStatus: string | null = null;
    let providerPaid = false;
    try {
      const { data: gateway } = await sb
        .from("payment_gateways")
        .select("id")
        .eq("company_id", attempt.company_id)
        .eq("provider", attempt.provider)
        .is("deleted_at", null)
        .order("is_active", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (gateway?.id) {
        const configured = await paymentGatewayService.getByIdWithCredentials(gateway.id, sb);
        const creds = configured?.credentials || {};
        if (attempt.provider === "stripe" && creds.secretKey) {
          const stripe = new Stripe(creds.secretKey, { apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion });
          const session = await stripe.checkout.sessions.retrieve(attempt.provider_session_id);
          providerStatus = `${session.status || "unknown"}:${session.payment_status || "unknown"}`;
          providerPaid = session.payment_status === "paid";
        } else if (attempt.provider === "yoco" && creds.secretKey) {
          const response = await fetch(`https://payments.yoco.com/api/checkouts/${encodeURIComponent(attempt.provider_session_id)}`, {
            headers: { Authorization: `Bearer ${creds.secretKey}` },
          });
          if (response.ok) {
            const checkout = await response.json();
            providerStatus = String(checkout.status || "unknown");
            providerPaid = ["succeeded", "successful", "paid", "completed"].includes(providerStatus.toLowerCase());
          }
        } else {
          providerStatus = "awaiting_webhook";
        }
      }
    } catch (providerError: any) {
      providerStatus = `status_check_failed:${providerError?.message || "provider error"}`;
    }

    await touchPaymentAttempt(attempt.id, providerStatus);
    if (providerPaid && attempt.provider_status !== "paid_waiting_webhook") {
      webhookMissing += 1;
      await sb.from("payment_attempts").update({ provider_status: "paid_waiting_webhook", updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("status", "pending");
      await notifyPaymentAttemptFailed({
        admin: sb,
        attempt,
        mode: "webhook_missing",
        reason: `${attempt.provider} reports the payment as paid, but its webhook has not reached CateringMS yet. The attempt remains pending to prevent an unsafe double ledger entry.`,
      });
    }
  }

  return res.status(200).json({ ok: true, checked, expired, webhook_missing: webhookMissing });
}

export default withApiLogging(handler);
