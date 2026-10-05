/**
 * Platform Stripe subscription webhook.
 *
 * Distinct from /api/webhooks/stripe-confirmation.ts (the per-tenant
 * ORDER webhook): this endpoint handles plan billing on the PLATFORM
 * Stripe account, i.e. companies paying for CateringMS.
 *
 * Env: STRIPE_PLATFORM_SECRET_KEY + STRIPE_SUBSCRIPTION_WEBHOOK_SECRET.
 * Without them the endpoint acknowledges and does nothing.
 *
 * Enable these events on the Stripe endpoint:
 *   checkout.session.completed, checkout.session.expired,
 *   checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
 *   customer.subscription.created / updated / deleted,
 *   invoice.payment_succeeded, invoice.payment_failed
 *
 * Cases:
 *   checkout completed / async succeeded -> confirm with Stripe, activate
 *   checkout expired / async failed      -> checkout row failed/expired, access unchanged
 *   subscription created/updated/deleted -> mirror status (active, trial, past_due, cancelled)
 *   invoice paid                         -> billing_history, access restored
 *   invoice failed                       -> billing_history, past_due + email
 *
 * Idempotency: each event is logged with UNIQUE (provider, event_id) and
 * marked "processing" until it finishes. A re-delivery of a finished event
 * is acknowledged; a re-delivery of one that failed midway is re-run
 * (every write below is an upsert keyed on Stripe ids, so re-running is safe).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import {
  confirmStripePlanCheckout,
  platformStripe,
  stableUuid,
  syncStripeSubscription,
} from "@/services/platformPlanBilling";

export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function ownerFor(sb: any, companyId: string): Promise<string | null> {
  const { data } = await sb.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  return data?.owner_id ?? null;
}

async function companyForCustomer(sb: any, customer: unknown, metadataCompanyId?: string | null) {
  if (metadataCompanyId) return metadataCompanyId;
  const customerId = typeof customer === "string" ? customer : (customer as any)?.id;
  if (!customerId) return null;
  const { data } = await sb.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id ?? null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  if (!process.env.STRIPE_PLATFORM_SECRET_KEY || !webhookSecret) {
    console.warn("[subscriptions/stripe] STRIPE_PLATFORM_SECRET_KEY or STRIPE_SUBSCRIPTION_WEBHOOK_SECRET missing - acknowledging without processing.");
    return res.status(200).json({ ok: true, scaffold: true });
  }

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch (e: any) {
    return res.status(400).json({ error: `Could not read body: ${e?.message || "unknown"}` });
  }
  const sigHeader = req.headers["stripe-signature"] as string | undefined;
  if (!sigHeader) return res.status(400).json({ error: "Missing stripe-signature header" });

  const stripe = platformStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sigHeader, webhookSecret);
  } catch (e: any) {
    console.warn("[subscriptions/stripe] signature verification failed:", e?.message);
    return res.status(401).json({ error: "Invalid signature" });
  }

  const sb: any = getServiceSupabase();
  const { error: logErr } = await sb.from("subscription_webhook_events").insert({
    provider: "stripe", event_id: event.id, event_type: event.type,
    // eslint-disable-next-line no-restricted-syntax -- raw is jsonb; the Stripe event object is stored verbatim
    raw: event as any, rejection_reason: "processing",
  });
  if (logErr) {
    if (logErr.code !== "23505") {
      // Without the log we cannot guarantee idempotency; let Stripe retry.
      console.error("[subscriptions/stripe] event log insert failed:", logErr);
      return res.status(500).json({ error: "Could not record event" });
    }
    const { data: prior } = await sb.from("subscription_webhook_events")
      .select("rejection_reason").eq("provider", "stripe").eq("event_id", event.id).maybeSingle();
    const unfinished = prior?.rejection_reason === "processing" || String(prior?.rejection_reason || "").startsWith("failed:");
    if (!unfinished) return res.status(200).json({ ok: true, duplicate: true });
  }

  const finish = (reason: string | null, companyId?: string | null) => sb.from("subscription_webhook_events")
    .update({ rejection_reason: reason, processed_at: new Date().toISOString(), ...(companyId ? { company_id: companyId } : {}) })
    .eq("provider", "stripe").eq("event_id", event.id);

  const obj: any = (event.data as any)?.object ?? {};
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = obj as Stripe.Checkout.Session;
        const checkoutId = session.metadata?.platformCheckoutId;
        if (session.mode !== "subscription" || !checkoutId) {
          await finish("ignored:not_a_plan_checkout");
          break;
        }
        const { data: checkout, error } = await sb.from("platform_subscription_checkouts")
          .select("*").eq("id", checkoutId).maybeSingle();
        if (error) throw error;
        if (!checkout) { await finish("ignored:unknown_plan_checkout"); break; }
        if (event.type === "checkout.session.async_payment_failed") {
          const nowIso = new Date().toISOString();
          await sb.from("platform_subscription_checkouts").update({
            status: "failed", provider_status: "async_payment_failed", failure_reason: "Stripe could not collect the first payment.",
            completed_at: nowIso, updated_at: nowIso,
          }).eq("id", checkout.id).eq("status", "pending");
        } else {
          // Re-read from Stripe: it is authoritative and also handles expiry.
          await confirmStripePlanCheckout(sb, checkout);
        }
        await finish(null, checkout.company_id);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = obj as Stripe.Subscription;
        const synced = await syncStripeSubscription(sb, sub);
        if (!synced) { await finish("no_company_for_customer"); break; }
        if (event.type === "customer.subscription.deleted") {
          try {
            const { billingEmailService } = await import("@/services/billingEmailService");
            await billingEmailService.notifySubscriptionCancelled(synced.ownerId, {
              plan_name: synced.planName,
              cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : new Date().toISOString(),
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            }, "cancelled");
          } catch (emailErr) {
            console.warn("[subscriptions/stripe] cancellation email failed:", emailErr);
          }
        }
        await finish(null, synced.companyId);
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const inv = obj as Stripe.Invoice;
        const stripeSubId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        const companyId = await companyForCustomer(sb, inv.customer, (inv as any).subscription_details?.metadata?.companyId);
        if (!companyId) { await finish("no_company_for_customer"); break; }
        const ownerId = await ownerFor(sb, companyId);
        if (!ownerId) throw new Error("Company owner missing for billing history");
        const succeeded = event.type === "invoice.payment_succeeded";
        const amount = (succeeded ? inv.amount_paid : inv.amount_due) / 100;
        // A R0 trial-start invoice is not a payment worth recording.
        if (succeeded && amount <= 0) { await finish("ignored:zero_amount_invoice", companyId); break; }

        const subscriptionRowId = stripeSubId ? stableUuid(`stripe-subscription:${stripeSubId}`) : null;
        const { data: subRow } = subscriptionRowId
          ? await sb.from("subscriptions").select("id").eq("id", subscriptionRowId).maybeSingle()
          : { data: null };
        const { error: bhErr } = await sb.from("billing_history").upsert({
          id: stableUuid(`stripe-invoice:${inv.id}:${succeeded ? "paid" : `failed:${inv.attempt_count}`}`),
          subscription_id: subRow?.id || null,
          user_id: ownerId,
          company_id: companyId,
          amount,
          currency: String(inv.currency || "zar").toUpperCase(),
          status: succeeded ? "completed" : "failed",
          invoice_url: inv.hosted_invoice_url ?? null,
          invoice_pdf_url: inv.invoice_pdf ?? null,
          payment_method: "stripe",
        });
        if (bhErr) throw bhErr;

        // Keep access in step with Stripe's view of the subscription.
        if (stripeSubId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubId);
          await syncStripeSubscription(sb, sub, companyId);
        } else if (!succeeded) {
          const { error } = await sb.from("companies").update({ subscription_status: "past_due" }).eq("id", companyId);
          if (error) throw error;
        }

        try {
          const { billingEmailService } = await import("@/services/billingEmailService");
          const line = inv.lines?.data?.[0];
          const periodStart = line?.period?.start ? new Date(line.period.start * 1000).toISOString() : new Date().toISOString();
          const periodEnd = line?.period?.end ? new Date(line.period.end * 1000).toISOString() : new Date().toISOString();
          if (succeeded) {
            await billingEmailService.notifyPaymentSucceeded(ownerId, {
              amount, currency: String(inv.currency || "zar").toUpperCase(), paid_at: new Date().toISOString(),
              transaction_id: inv.id || null, billing_period_start: periodStart, billing_period_end: periodEnd,
              next_billing_date: periodEnd, invoice_pdf_url: inv.invoice_pdf || inv.hosted_invoice_url || null,
            });
          } else {
            await billingEmailService.notifyPaymentFailed(ownerId, {
              amount, currency: String(inv.currency || "zar").toUpperCase(), created_at: new Date().toISOString(),
              failed_reason: inv.next_payment_attempt
                ? `Stripe could not charge your card. It will retry on ${new Date(inv.next_payment_attempt * 1000).toLocaleDateString("en-ZA")}; update your card to avoid losing access.`
                : "Stripe could not charge your card. Update your payment method to keep access.",
            });
          }
        } catch (emailErr) {
          console.warn("[subscriptions/stripe] billing email failed:", emailErr);
        }
        await finish(null, companyId);
        break;
      }

      default:
        await finish(`unhandled_event:${event.type}`);
        break;
    }
  } catch (e: any) {
    console.error("[subscriptions/stripe] handler failed:", e);
    await finish(`failed:${String(e?.message || "error").slice(0, 300)}`);
    // 500 so Stripe retries; the "failed:" marker lets the retry re-run.
    return res.status(500).json({ error: e?.message || "handler failed" });
  }

  return res.status(200).json({ ok: true });
}

export default withApiLogging(handler);
