/* Recheck unresolved sessions fairly. Only authenticated provider evidence
 * can settle/expire an attempt; a missing webhook or elapsed time is unknown.
 * PayFast history and the verified-event inbox have dedicated workers.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireCronAuth } from "@/lib/cronAuth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getCheckoutGatewayCredentials } from "@/lib/checkoutGatewayCredentials";
import { paymentGatewayService } from "@/services/paymentGatewayService";
import { transitionPaymentAttempt, touchPaymentAttempt } from "@/services/paymentAttemptService";
import { settleTenantGatewayPayment } from "@/lib/tenantGatewaySettlement";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
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
    .or(`last_checked_at.is.null,last_checked_at.lt.${recheckCutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });

  const eligibleAttempts = ((attempts || []) as any[]).filter((attempt) =>
    !attempt.last_checked_at || attempt.last_checked_at < recheckCutoff,
  );

  let checked = 0;
  let expired = 0;
  let webhookMissing = 0;
  let recovered = 0;
  let failures = 0;
  for (const attempt of eligibleAttempts) {
    checked += 1;
    // A provider has already confirmed the charge. Keep waiting for its
    // signed webhook, even if the hosted checkout's original TTL elapsed.
    // Re-check provider-confirmed candidates until they actually settle.

    let providerStatus: string | null = null;
    let providerPaid = false;
    let providerTerminalUnpaid = false;
    let settled = false;
    try {
      const gatewayId = String(attempt.metadata?.gatewayId || "");
      let configured = gatewayId
        ? await getCheckoutGatewayCredentials(sb, attempt, gatewayId)
        : null;
      if (!configured) {
        const { data: gateway } = await sb
          .from("payment_gateways")
          .select("id")
          .eq("company_id", attempt.company_id)
          .eq("provider", attempt.provider)
          .is("deleted_at", null)
          .order("is_active", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (gateway?.id) configured = await paymentGatewayService.getByIdWithCredentials(gateway.id, sb);
      }
      if (configured?.gateway.company_id === attempt.company_id && configured.gateway.provider === attempt.provider) {
        const creds = configured?.credentials || {};
        if (attempt.provider === "stripe" && creds.secretKey) {
          const stripe = new Stripe(creds.secretKey, { timeout: 10000, maxNetworkRetries: 0, apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion });
          const session = await stripe.checkout.sessions.retrieve(attempt.provider_session_id);
          providerStatus = `${session.status || "unknown"}:${session.payment_status || "unknown"}`;
          providerPaid = session.payment_status === "paid";
          providerTerminalUnpaid = session.status === "expired" && session.payment_status === "unpaid";
          if (providerPaid) {
            const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
            if (!intentId || session.id !== attempt.provider_session_id ||
                session.metadata?.paymentAttemptId !== String(attempt.metadata?.paymentAttemptId || attempt.id) ||
                session.metadata?.companyId !== attempt.company_id ||
                Number(session.amount_total) !== Math.round(Number(attempt.amount) * 100)) {
              throw new Error("Stripe session does not match saved checkout");
            }
            const intent = await stripe.paymentIntents.retrieve(intentId);
            if (intent.status !== "succeeded") throw new Error("Stripe paid session has no successful payment intent");
            await settleTenantGatewayPayment({ admin: sb, provider: "stripe", transactionId: intent.id,
              companyId: attempt.company_id, orderId: attempt.payment_type === "invoice" ? attempt.invoice_id : attempt.order_id,
              paymentType: attempt.payment_type, invoiceId: attempt.invoice_id, paymentAttempt: attempt,
              amount: intent.amount_received / 100, currency: intent.currency });
            settled = true; recovered += 1;
          }
        } else if (attempt.provider === "yoco" && creds.secretKey) {
          // Checkout keys cannot query the separate Yoco business Payments
          // API. No GET checkout endpoint is documented for this API. Keep
          // the attempt unresolved until a signed webhook is received/replayed.
          providerStatus = "awaiting_signed_yoco_webhook";
        } else {
          providerStatus = "awaiting_webhook";
        }
      }
    } catch (providerError: any) {
      failures += 1;
      providerStatus = `status_check_failed:${providerError?.message || "provider error"}`;
    }

    if (settled) continue;
    await touchPaymentAttempt(attempt.id, providerStatus);
    if (providerPaid) {
      webhookMissing += 1;
      const marked = await sb.from("payment_attempts").update({ provider_status: "paid_waiting_webhook", updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("status", "pending");
      if (marked.error) throw marked.error;
      if (attempt.provider_status !== "paid_waiting_webhook") await notifyPaymentAttemptFailed({
        admin: sb,
        attempt,
        mode: "webhook_missing",
        reason: `${attempt.provider} reports the payment as paid, but its webhook has not reached CateringMS yet. The attempt remains pending to prevent an unsafe double ledger entry.`,
      });
      continue;
    }

    // Time elapsed or an unreachable provider is not evidence of non-payment.
    if (providerTerminalUnpaid) {
      const transitioned = await transitionPaymentAttempt({
        provider: attempt.provider,
        attemptId: attempt.id,
        status: "expired",
        providerStatus: providerStatus || attempt.provider_status || "expired",
        failureReason: "Provider confirmed this session expired or was cancelled without payment.",
      });
      if (transitioned.changed && transitioned.attempt) {
        expired += 1;
        await notifyPaymentAttemptFailed({
          admin: sb,
          attempt: transitioned.attempt,
          reason: "The checkout expired before the payment could be confirmed.",
        });
      }
    }
  }

  await recordCronHeartbeat(sb, "reconcile-payment-attempts", failures ? "error" : "ok", { source: auth.source, checked, expired, recovered, errors_count: failures });
  return res.status(failures ? 503 : 200).json({ ok: failures === 0, checked, expired, recovered, webhook_missing: webhookMissing });
}

export default withApiLogging(handler);
