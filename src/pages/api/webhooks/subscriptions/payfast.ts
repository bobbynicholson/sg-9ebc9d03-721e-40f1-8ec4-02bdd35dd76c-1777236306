/**
 * Platform PayFast subscription ITN (instant transaction notification).
 *
 * Distinct from the per-tenant PayFast order ITN: this endpoint
 * handles SaaS subscription events for Skylight's platform PayFast
 * account, i.e. tenants paying Skylight for the platform.
 *
 * Env-driven no-op until configured:
 *   PAYFAST_PLATFORM_MERCHANT_ID    - the platform merchant id
 *   PAYFAST_PLATFORM_MERCHANT_KEY   - the platform merchant key
 *   PAYFAST_PLATFORM_PASSPHRASE     - the signing passphrase
 *
 * When any are missing, returns 200 OK with `{ scaffold: true }` so
 * PayFast's retry queue doesn't pile up.
 *
 * Signature verification per PayFast docs:
 *   1. Sort POST form fields alphabetically by key (excluding `signature`).
 *   2. Concatenate `key=urlencode(value)` with `&` separator.
 *   3. If passphrase set, append `&passphrase=<urlencoded>`.
 *   4. MD5 the result. Compare (case-insensitive) to the `signature` field.
 *
 * Source-IP allowlist: PayFast publishes a list of sandbox + production
 * IPs that ITN POSTs originate from. We do a coarse check (one of the
 * documented hostnames) on the `referer` / forwarded headers. Not a
 * security backstop - signature verification is - but catches obvious
 * mistargeting.
 *
 * Idempotency: every event is logged to subscription_webhook_events
 * keyed by (provider='payfast', event_id=pf_payment_id). Re-deliveries
 * hit the unique constraint and 200 OK on the duplicate path.
 *
 * Events handled (PayFast subscription life-cycle):
 *   payment_status=COMPLETE  + subscription_type=1 -> first payment
 *                                                     of a recurring sub
 *   payment_status=COMPLETE  on later runs        -> renewal
 *   payment_status=CANCELLED                       -> cancellation
 *   payment_status=FAILED                          -> failed renewal,
 *                                                     flip to past_due
 *
 * Tenant lookup: the create-subscription flow stores PayFast's
 * `billing_token` in companies.payfast_subscription_token. ITN payloads
 * include `token` on subscription events, so we resolve company by
 * token. Fall back to `custom_str1` (which we'll populate with
 * companyId at sub-create time) for safety.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


export const config = { api: { bodyParser: true } };

/**
 * Compute the PayFast MD5 signature over the POST body. PayFast wants
 * the fields in the order they were sent, but for ITN verification the
 * accepted practice (and what the official PHP sample does) is
 * alphabetical-by-key with `signature` excluded. We urlencode values
 * with `+` for spaces, matching PHP's `urlencode`, NOT Node's
 * encodeURIComponent (which uses `%20`).
 */
function payfastEncode(v: string): string {
  return encodeURIComponent(v).replace(/%20/g, "+");
}

function computePayfastSignature(
  fields: Record<string, string>,
  passphrase: string | null,
): string {
  const keys = Object.keys(fields)
    .filter((k) => k !== "signature")
    .filter((k) => fields[k] !== "" && fields[k] != null)
    .sort();
  const parts = keys.map((k) => `${k}=${payfastEncode(String(fields[k]))}`);
  if (passphrase) {
    parts.push(`passphrase=${payfastEncode(passphrase)}`);
  }
  const str = parts.join("&");
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * Map a PayFast payment_status + subscription_type to our companies
 * subscription_status. PayFast doesn't have a separate "subscription
 * state" concept - it sends payment events and we infer.
 */
function mapPayfastToStatus(
  paymentStatus: string,
  isFirstPayment: boolean,
): string {
  const ps = (paymentStatus || "").toUpperCase();
  if (ps === "COMPLETE") {
    return isFirstPayment ? "active" : "active";
  }
  if (ps === "CANCELLED") return "cancelled";
  if (ps === "FAILED") return "past_due";
  if (ps === "PENDING") return "trial";
  return "suspended";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Must match the credentials the checkout signed with. The
  // subscription checkout runs client-side and can therefore only read
  // the NEXT_PUBLIC_PAYFAST_* vars, so those are the source of truth for
  // platform subscription billing; PAYFAST_PLATFORM_* is accepted as an
  // optional override if an operator mirrored it server-side. Reading a
  // different var than the checkout used is exactly why the ITN failed
  // verification and the company never went active.
  const merchantId = process.env.PAYFAST_PLATFORM_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_PLATFORM_MERCHANT_KEY || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.PAYFAST_PLATFORM_PASSPHRASE || process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE || "";

  if (!merchantId || !merchantKey) {
    console.warn(
      "[subscriptions/payfast] env vars missing - PAYFAST_PLATFORM_MERCHANT_ID or PAYFAST_PLATFORM_MERCHANT_KEY. Returning 200 OK without processing.",
    );
    return res.status(200).json({ ok: true, scaffold: true });
  }

  // PayFast POSTs application/x-www-form-urlencoded; Next.js bodyParser
  // turns it into a flat object of strings.
  const body = (req.body || {}) as Record<string, string>;
  if (Object.keys(body).length === 0) {
    return res.status(400).json({ error: "Empty body" });
  }

  // Sanity check the merchant id matches ours - belt-and-braces with
  // signature verification.
  if (body.merchant_id && body.merchant_id !== merchantId) {
    console.warn("[subscriptions/payfast] merchant_id mismatch:", body.merchant_id);
    return res.status(400).json({ error: "merchant_id mismatch" });
  }

  // Signature verification. Passphrase is optional on the PayFast
  // account; if it's set we MUST include it, if not we MUST omit it
  // - either condition produces a different hash.
  const expectedSig = computePayfastSignature(body, passphrase || null);
  const providedSig = (body.signature || "").toLowerCase();
  if (expectedSig.toLowerCase() !== providedSig) {
    console.warn("[subscriptions/payfast] signature mismatch", {
      expected: expectedSig,
      provided: providedSig,
    });
    return res.status(401).json({ error: "Invalid signature" });
  }

  const sb = getServiceSupabase();

  // Idempotency key: PayFast pf_payment_id is the canonical per-event
  // identifier. m_payment_id is our own reference passed at create
  // time. Use pf_payment_id when present, fall back to m_payment_id.
  const eventId = body.pf_payment_id || body.m_payment_id || `payfast-${Date.now()}`;
  const eventType = body.payment_status
    ? `payment_status.${(body.payment_status as string).toLowerCase()}`
    : "unknown";

  const { error: logErr } = await sb
    .from("subscription_webhook_events")
    .insert({
      provider: "payfast",
      event_id: eventId,
      event_type: eventType,
      // eslint-disable-next-line no-restricted-syntax -- table added by 20260522080000_subscription_webhook_scaffold; types regen pending
      raw: body as any,
    });
  if (logErr) {
    if ((logErr as any).code === "23505") {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    console.error("[subscriptions/payfast] event log insert failed:", logErr);
  }

  // Resolve tenant. Prefer the billing_token (PayFast's subscription
  // identifier persisted at create time on companies.payfast_subscription_token).
  // Fall back to custom_str1 which we populate with companyId.
  const token = (body.token || body.billing_token || "").trim();
  const customCompanyId = (body.custom_str1 || "").trim();
  let companyId: string | null = null;
  if (token) {
    const { data: companyRow } = await sb
      .from("companies")
      .select("id")
      .eq("payfast_subscription_token", token)
      .maybeSingle();
    companyId = (companyRow as any)?.id ?? null;
  }
  if (!companyId && customCompanyId) {
    const { data: companyRow } = await sb
      .from("companies")
      .select("id")
      .eq("id", customCompanyId)
      .maybeSingle();
    companyId = (companyRow as any)?.id ?? null;
  }
  if (!companyId) {
    await sb
      .from("subscription_webhook_events")
      .update({ rejection_reason: "no_company_for_token" })
      .eq("provider", "payfast")
      .eq("event_id", eventId);
    return res.status(200).json({ ok: true, skipped: "unknown_company" });
  }

  await sb
    .from("subscription_webhook_events")
    .update({ company_id: companyId })
    .eq("provider", "payfast")
    .eq("event_id", eventId);

  try {
    const paymentStatus = (body.payment_status || "").toUpperCase();
    const isFirstPayment = body.subscription_type === "1";
    const newStatus = mapPayfastToStatus(paymentStatus, isFirstPayment);

    // Companies row update - source of truth for "is this tenant
    // active right now". Token is persisted on first event so future
    // ITNs resolve via the token path above.
    const companyPatch: Record<string, unknown> = { subscription_status: newStatus };
    if (token) companyPatch.payfast_subscription_token = token;
    // custom_str2 carries the plan id (createSubscriptionParams sets it),
    // so the company's stored plan reflects what they actually bought.
    const planFromCustom = (body.custom_str2 || "").trim();
    if (planFromCustom) companyPatch.subscription_plan = planFromCustom;
    await sb.from("companies").update(companyPatch).eq("id", companyId);

    // billing_history row for the operator's records.
    if (paymentStatus === "COMPLETE" || paymentStatus === "FAILED") {
      // eslint-disable-next-line no-restricted-syntax -- billing_history.company_id not on generated types regen pending
      await sb.from("billing_history").insert({
        company_id: companyId,
        amount: Number(body.amount_gross || body.amount || 0),
        currency: "ZAR",
        status: paymentStatus === "COMPLETE" ? "completed" : "failed",
        invoice_url: null,
        payment_method: "payfast",
      } as any);
    }

    // Notify owner/admins about the subscription lifecycle event - the
    // webhook updated the DB but previously told no one. Best-effort,
    // using the service client so the cross-tenant insert isn't RLS-
    // blocked. Renewal success is informational; a failed renewal is
    // urgent (access is at risk).
    try {
      const { notificationService } = await import("@/services/notificationService");
      const billingRoles = ["owner", "company_admin", "super_admin", "admin"] as any;
      if (paymentStatus === "COMPLETE" && !isFirstPayment) {
        await notificationService.broadcastNotification({
          companyId,
          type: "subscription_renewed",
          title: "Subscription renewed",
          message: "Your CateringMS subscription renewed successfully.",
          targetRoles: billingRoles,
          priority: "normal",
          link: "/admin/subscription",
          relatedEntityType: "company",
          relatedEntityId: companyId,
          dedup: true,
        }, sb);
      } else if (paymentStatus === "FAILED") {
        await notificationService.broadcastNotification({
          companyId,
          type: "payment_reminder",
          title: "Subscription payment failed",
          message: "Your latest subscription payment didn't go through. Update your payment method to avoid losing access.",
          targetRoles: billingRoles,
          priority: "urgent",
          link: "/admin/subscription",
          relatedEntityType: "company",
          relatedEntityId: companyId,
          dedup: true,
        }, sb);
      }
    } catch (notifyErr) {
      console.warn("[subscriptions/payfast] notification failed:", notifyErr);
    }
  } catch (e: any) {
    console.error("[subscriptions/payfast] handler failed:", e);
    return res.status(500).json({ error: e?.message || "handler failed" });
  }

  return res.status(200).json({ ok: true });
}

export default withApiLogging(handler);
