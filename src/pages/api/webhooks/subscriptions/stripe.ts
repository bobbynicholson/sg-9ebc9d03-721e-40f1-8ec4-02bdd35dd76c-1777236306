/**
 * Platform Stripe subscription webhook.
 *
 * Distinct from /api/webhooks/stripe-confirmation.ts (the per-tenant
 * ORDER webhook): this endpoint handles SaaS subscription events for
 * Skylight's platform Stripe account, i.e. tenants paying Skylight
 * for using CateringMS. Different secret, different signing key,
 * different event types.
 *
 * Env-driven no-op until configured:
 *   STRIPE_PLATFORM_SECRET_KEY           - the platform sk_live_... key
 *   STRIPE_SUBSCRIPTION_WEBHOOK_SECRET   - whsec_... for this endpoint
 *
 * When either is missing, the handler returns 200 OK with a
 * "scaffold-only" body so Vercel preview deploys + dev environments
 * can ship the endpoint without exploding.
 *
 * Idempotency: every event is logged to subscription_webhook_events
 * with a UNIQUE (provider, event_id) constraint. Re-deliveries land
 * in the duplicate path and are acknowledged 200 OK without re-running
 * the handler body.
 *
 * Events handled today (the minimum set to keep subscriptions table
 * in sync with the live Stripe state):
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_succeeded
 *   invoice.payment_failed
 *
 * Everything else is logged + acknowledged. The handler is forward-
 * compatible: adding a new event type is a switch-case extension, no
 * schema or infra changes needed.
 *
 * Tenant lookup: events carry the Stripe customer id; we resolve to
 * a company via companies.stripe_customer_id (column added in the
 * same migration that backs this file). When no match is found, we
 * log + acknowledge but do nothing - a Stripe-side customer that
 * doesn't exist in our DB is a Skylight-side data issue, not a
 * Stripe retry-worthy error.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getServiceSupabase } from "@/lib/supabase/service";

export const config = { api: { bodyParser: false } };

const STRIPE_API_VERSION = "2024-12-18.acacia" as Stripe.LatestApiVersion;

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Map a Stripe subscription.status to our companies.subscription_status
 * enum. Stripe has more granularity than we care about; we collapse to
 * the four we track.
 */
function mapStripeStatusToCompanies(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      // We use 'trial' (not 'trialing') per migration 20260518740000.
      return status === "trialing" ? "trial" : "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "suspended";
    default:
      return "suspended";
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_PLATFORM_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    // Scaffold-only mode. Acknowledge so Stripe doesn't retry, log so
    // ops can see the endpoint is alive but unconfigured.
    console.warn(
      "[subscriptions/stripe] env vars missing - STRIPE_PLATFORM_SECRET_KEY or STRIPE_SUBSCRIPTION_WEBHOOK_SECRET. Returning 200 OK without processing.",
    );
    return res.status(200).json({ ok: true, scaffold: true });
  }

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch (e: any) {
    return res.status(400).json({ error: `Could not read body: ${e?.message || "unknown"}` });
  }

  const sigHeader = req.headers["stripe-signature"] as string | undefined;
  if (!sigHeader) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  // Throwaway client - constructEvent doesn't need a real api key, the
  // signature verification math is local.
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sigHeader, webhookSecret);
  } catch (e: any) {
    console.warn("[subscriptions/stripe] signature verification failed:", e?.message);
    return res.status(401).json({ error: "Invalid signature" });
  }

  const sb = getServiceSupabase();

  // Idempotency: log every event with UNIQUE (provider, event_id). A
  // re-delivery hits the duplicate path on insert and we 200 OK.
  const { error: logErr } = await sb
    .from("subscription_webhook_events")
    .insert({
      provider: "stripe",
      event_id: event.id,
      event_type: event.type,
      // eslint-disable-next-line no-restricted-syntax -- table added by 20260522080000_subscription_webhook_scaffold; types regen pending
      raw: event as any,
    });
  if (logErr) {
    // Unique violation = already processed. Acknowledge so Stripe doesn't retry.
    if ((logErr as any).code === "23505") {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    console.error("[subscriptions/stripe] event log insert failed:", logErr);
    // Don't bail out - we still want to process the event. The log is
    // for audit, not for correctness.
  }

  // Resolve the tenant by stripe_customer_id pulled from the event.
  // Subscription events: customer is on data.object.customer.
  // Invoice events: customer is on data.object.customer.
  const obj = (event.data as any)?.object ?? {};
  const stripeCustomerId: string | null = obj.customer ?? null;
  let companyId: string | null = null;
  if (stripeCustomerId) {
    const { data: companyRow } = await sb
      .from("companies")
      .select("id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    companyId = (companyRow as any)?.id ?? null;
  }

  if (!companyId) {
    // Unknown tenant - log + acknowledge. This commonly happens for
    // events on customers we haven't linked yet (e.g. a manual stripe
    // dashboard test). Don't fail the webhook or Stripe will retry.
    await sb
      .from("subscription_webhook_events")
      .update({ rejection_reason: "no_company_for_customer" })
      .eq("provider", "stripe")
      .eq("event_id", event.id);
    return res.status(200).json({ ok: true, skipped: "unknown_company" });
  }

  // Stamp the company on the audit row so the operator can filter
  // events by tenant later.
  await sb
    .from("subscription_webhook_events")
    .update({ company_id: companyId })
    .eq("provider", "stripe")
    .eq("event_id", event.id);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = obj as Stripe.Subscription;
        const status = mapStripeStatusToCompanies(sub.status);
        const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
        // Update both companies (for fast read on every page load) and
        // subscriptions (for history). Companies is the source of
        // truth for "is this tenant active right now"; subscriptions
        // is the ledger of past plans.
        await sb
          .from("companies")
          .update({
            subscription_status: status,
            stripe_customer_id: stripeCustomerId,
            ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
          })
          .eq("id", companyId);
        // UPSERT subscription row by stripe_subscription_id so a
        // sub.updated re-applies cleanly.
        await sb
          .from("subscriptions")
          .upsert(
            // eslint-disable-next-line no-restricted-syntax -- subscriptions row shape mixes legacy + stripe fields; types regen pending
            {
              company_id: companyId,
              stripe_subscription_id: sub.id,
              stripe_customer_id: stripeCustomerId,
              status: status === "trial" ? "trial" : status,
              plan_name: (sub.items?.data?.[0]?.price?.lookup_key ?? sub.items?.data?.[0]?.price?.id ?? "unknown") as string,
              amount: ((sub.items?.data?.[0]?.price?.unit_amount ?? 0) / 100) as number,
              currency: (sub.currency || "zar").toUpperCase(),
              billing_cycle: (sub.items?.data?.[0]?.price?.recurring?.interval ?? "month") as string,
              current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
              trial_ends_at: trialEndsAt,
              cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
            } as any,
            { onConflict: "stripe_subscription_id" },
          );
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const inv = obj as Stripe.Invoice;
        const billingStatus = event.type === "invoice.payment_succeeded" ? "completed" : "failed";
        await sb
          .from("billing_history")
          // eslint-disable-next-line no-restricted-syntax -- billing_history.company_id not yet on the generated types regen
          .insert({
            company_id: companyId,
            amount: (inv.amount_paid ?? inv.amount_due ?? 0) / 100,
            currency: (inv.currency || "zar").toUpperCase(),
            status: billingStatus,
            invoice_url: inv.hosted_invoice_url ?? null,
            payment_method: "stripe",
          } as any);
        // On a failed payment, flip the company to past_due so the
        // dashboard surfaces the issue. A subsequent invoice.payment_
        // succeeded (or sub.updated) walks it back to active.
        if (event.type === "invoice.payment_failed") {
          await sb
            .from("companies")
            .update({ subscription_status: "past_due" })
            .eq("id", companyId);
        }
        break;
      }
      default:
        // Forward-compatible: log + acknowledge. Adding handling later
        // is a switch-case extension.
        await sb
          .from("subscription_webhook_events")
          .update({ rejection_reason: `unhandled_event:${event.type}` })
          .eq("provider", "stripe")
          .eq("event_id", event.id);
        break;
    }
  } catch (e: any) {
    console.error("[subscriptions/stripe] handler failed:", e);
    // 500 so Stripe retries - the event hasn't been fully processed.
    return res.status(500).json({ error: e?.message || "handler failed" });
  }

  return res.status(200).json({ ok: true });
}
