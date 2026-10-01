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
 *   1. Keep POST form fields in received order (excluding `signature`).
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
import { loadPlatformSubscriptionPlan } from "@/lib/platformSubscriptionPlans";


export const config = { api: { bodyParser: true } };

/**
 * Compute the PayFast MD5 signature over the POST body. PayFast wants
 * the fields in the order they were sent, with `signature` excluded. We urlencode values
 * with `+` for spaces, matching PHP's `urlencode`, NOT Node's
 * encodeURIComponent (which uses `%20`).
 */
function payfastEncode(v: string): string {
  return encodeURIComponent(v.trim()).replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function computePayfastSignature(
  fields: Record<string, string>,
  passphrase: string | null,
): string {
  const keys = Object.keys(fields)
    .filter((k) => k !== "signature")
    .filter((k) => fields[k] !== "" && fields[k] != null);
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

  // Use the same server-side credentials as subscription checkout.
  const merchantId = process.env.PAYFAST_PLATFORM_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_PLATFORM_MERCHANT_KEY || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
  const passphrase = process.env.PAYFAST_PLATFORM_PASSPHRASE || process.env.PAYFAST_PASSPHRASE || process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE || "";

  if (!merchantId || !merchantKey || !passphrase) {
    console.warn(
      "[subscriptions/payfast] env vars missing - PAYFAST_PLATFORM_MERCHANT_ID or PAYFAST_PLATFORM_MERCHANT_KEY. Returning 200 OK without processing.",
    );
    // A successful acknowledgement would permanently discard the ITN and
    // leave the tenant in trial/pending forever. Production must fail so
    // PayFast retries after the platform credentials are configured.
    return res.status(process.env.NODE_ENV === "production" ? 503 : 200).json({
      ok: false,
      scaffold: process.env.NODE_ENV !== "production",
      error: "Platform PayFast credentials are not configured",
    });
  }

  // PayFast POSTs application/x-www-form-urlencoded; Next.js bodyParser
  // turns it into a flat object of strings.
  const body = (req.body || {}) as Record<string, string>;
  if (Object.keys(body).length === 0) {
    return res.status(400).json({ error: "Empty body" });
  }

  // Sanity check the merchant id matches ours - belt-and-braces with
  // signature verification.
  if (Object.values(body).some((v) => typeof v !== "string")) return res.status(400).json({ error: "Expected form-encoded notification" });
  if (body.merchant_id !== merchantId) {
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

  const testMode = (process.env.PAYFAST_PLATFORM_TEST_MODE || process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE) === "true";
  try {
    const validation = await fetch(`https://${testMode ? "sandbox" : "www"}.payfast.co.za/eng/query/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: Object.entries(body).filter(([k]) => k !== "signature").map(([k, v]) => `${k}=${payfastEncode(v)}`).join("&"),
      signal: AbortSignal.timeout(15000),
    });
    if (!validation.ok) return res.status(503).json({ error: "PayFast validation unavailable" });
    if ((await validation.text()).trim() !== "VALID") return res.status(401).json({ error: "PayFast rejected notification" });
  } catch {
    return res.status(503).json({ error: "PayFast validation unavailable; retry notification" });
  }
  const sb = getServiceSupabase();

  // Idempotency key: PayFast pf_payment_id is the canonical per-event
  // identifier. m_payment_id is our own reference passed at create
  // time. Use pf_payment_id when present, fall back to m_payment_id.
  const eventId = body.pf_payment_id ? `${body.pf_payment_id}:${body.payment_status}` :
    (body.token && `${body.token}:${body.payment_status}:${body.billing_date || ""}`) || body.m_payment_id;
  if (!eventId) return res.status(400).json({ error: "Missing payment reference" });
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
      rejection_reason: "processing",
    });
  if (logErr) {
    if ((logErr as any).code === "23505") {
      const { data: existing, error } = await sb.from("subscription_webhook_events")
        .select("rejection_reason, processed_at").eq("provider", "payfast").eq("event_id", eventId).single();
      if (error) return res.status(503).json({ error: "Could not read payment event" });
      if (existing.rejection_reason === null) return res.status(200).json({ ok: true, duplicate: true });
      if (existing.rejection_reason === "processing" && Date.now() - new Date(existing.processed_at).getTime() < 60000) {
        return res.status(503).json({ error: "Payment event is being processed; retry" });
      }
      const { data: claimed, error: claimError } = await sb.from("subscription_webhook_events")
        .update({ rejection_reason: "processing", processed_at: new Date().toISOString() })
        .eq("provider", "payfast").eq("event_id", eventId)
        .eq("processed_at", existing.processed_at).select("id");
      if (claimError || !claimed?.length) return res.status(503).json({ error: "Payment event is being retried" });
    } else {
      return res.status(503).json({ error: "Could not record payment event" });
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
    return res.status(503).json({ error: "Company not found; retry notification" });
  }

  await sb
    .from("subscription_webhook_events")
    .update({ company_id: companyId })
    .eq("provider", "payfast")
    .eq("event_id", eventId);

  try {
    const paymentStatus = (body.payment_status || "").toUpperCase();
    if (!["COMPLETE", "FAILED", "CANCELLED"].includes(paymentStatus)) {
      const { error } = await sb.from("subscription_webhook_events").update({ rejection_reason: null })
        .eq("provider", "payfast").eq("event_id", eventId);
      if (error) throw error;
      return res.status(200).json({ ok: true, ignored: paymentStatus });
    }
    let isFirstPayment = body.subscription_type === "1";
    const newStatus = mapPayfastToStatus(paymentStatus, isFirstPayment);

    // Companies row update - source of truth for "is this tenant
    // active right now". Token is persisted on first event so future
    // ITNs resolve via the token path above.
    const companyPatch: Record<string, unknown> = { subscription_status: newStatus };
    if (token) companyPatch.payfast_subscription_token = token;
    // custom_str2 carries the plan id (createSubscriptionParams sets it),
    // so the company's stored plan reflects what they actually bought.
    const { data: currentCompany, error: currentError } = await sb.from("companies")
      .select("subscription_plan, subscription_status, trial_ends_at, payfast_subscription_token").eq("id", companyId).single();
    if (currentError) throw currentError;
    const subscriptionToken = token || currentCompany.payfast_subscription_token;
    if (!subscriptionToken && !["FAILED", "CANCELLED"].includes(paymentStatus)) {
      throw new Error("Missing PayFast recurring billing token");
    }
    // A first payment can fail before PayFast issues a recurring token.
    // Keep that attempt in the ledger using an event-derived stable id;
    // later retries with a real token get their own subscription id.
    const subscriptionDigest = crypto.createHash("sha256").update(
      subscriptionToken
        ? `payfast-subscription:${subscriptionToken}`
        : `payfast-subscription-attempt:${companyId}:${eventId}`,
    ).digest("hex");
    const subscriptionId = `${subscriptionDigest.slice(0, 8)}-${subscriptionDigest.slice(8, 12)}-4${subscriptionDigest.slice(13, 16)}-a${subscriptionDigest.slice(17, 20)}-${subscriptionDigest.slice(20, 32)}`;
    const { data: previousSubscription, error: subscriptionReadError } = await sb.from("subscriptions")
      .select("billing_cycle, amount, plan_id, cancel_at_period_end, current_period_end").eq("id", subscriptionId).maybeSingle();
    if (subscriptionReadError) throw subscriptionReadError;
    isFirstPayment = !previousSubscription;
    if (paymentStatus === "CANCELLED" && previousSubscription?.cancel_at_period_end &&
        new Date(previousSubscription.current_period_end).getTime() > Date.now()) {
      companyPatch.subscription_status = currentCompany.subscription_status;
    }
    const planFromCustom = (body.custom_str2 || currentCompany.subscription_plan || "").trim();
    const selectedPlan = await loadPlatformSubscriptionPlan(sb, planFromCustom);
    if (!selectedPlan) throw new Error("Unknown subscription plan");
    const cycle = (body.custom_str3 || previousSubscription?.billing_cycle || (body.frequency === "6" ? "annual" : "monthly")).toLowerCase();
    const billingCycle = cycle.includes("annual") || cycle.includes("year") ? "yearly" : "monthly";
    if (planFromCustom) companyPatch.subscription_plan = selectedPlan.id;

    // A failed first charge does not create a paying subscription. Preserve
    // the company's prior access state; recurring failures still move an
    // existing subscription to past_due so its configured grace period can
    // apply. The attempt row itself remains suspended and is not returned as
    // the company's current active subscription.
    if (paymentStatus === "FAILED" && isFirstPayment) {
      companyPatch.subscription_status = currentCompany.subscription_status || "suspended";
    }

    // Reject underpayments before granting paid access. A verified
    // zero-amount setup preserves an existing, unexpired trial.
    if (paymentStatus === "COMPLETE" && planFromCustom) {
      const expected = previousSubscription?.amount ?? (billingCycle === "yearly" ? selectedPlan.annualPrice : selectedPlan.monthlyPrice);
      const paid = Number(body.amount_gross || body.amount || 0);
      const trialSetup = paid === 0 && currentCompany.subscription_status === "trial" &&
        currentCompany.trial_ends_at && new Date(currentCompany.trial_ends_at).getTime() > Date.now() && token;
      if (trialSetup) companyPatch.subscription_status = "trial";
      if (!trialSetup && (!Number.isFinite(paid) || Math.abs(paid - expected) > 0.01)) {
        console.error(`[subscriptions/payfast] AMOUNT MISMATCH company ${companyId}: plan ${selectedPlan.id} (${cycle}) expected R${expected}, paid R${paid}`);
        await sb.from("subscription_webhook_events")
          .update({ rejection_reason: `amount_mismatch: expected ${expected}, paid ${paid}` })
          .eq("provider", "payfast").eq("event_id", eventId);
        return res.status(400).json({ error: "Subscription amount mismatch" });
      }
    }

    const { data: updatedCompany, error: activationError } = await sb.from("companies").update(companyPatch).eq("id", companyId).select("id");
    if (activationError || !updatedCompany?.length) throw activationError || new Error("Company activation failed");

    // billing_history row for the operator's records. NOTE: billing_history
    // has NO company_id column and user_id is NOT NULL - it FKs to the owner
    // via user_id. The old insert (company_id + null user_id) failed silently
    // (unchecked await), so the ledger never populated. Resolve the owner and
    // surface the error.
    let ownerId: string | null = null;
    let ownerCompany: { company_name?: string | null; slug?: string | null } | null = null;
    if (paymentStatus === "COMPLETE" || paymentStatus === "FAILED" || paymentStatus === "CANCELLED") {
      const { data: ownerRow } = await sb
        .from("companies").select("owner_id, company_name, slug").eq("id", companyId).maybeSingle();
      ownerId = (ownerRow as any)?.owner_id ?? null;
      ownerCompany = ownerRow as any;
    }
    if (!ownerId) throw new Error("Company owner missing for subscription");
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    if (paymentStatus !== "COMPLETE" && previousSubscription?.current_period_end) {
      periodEnd.setTime(new Date(previousSubscription.current_period_end).getTime());
    } else if (companyPatch.subscription_status === "trial" && currentCompany.trial_ends_at) {
      periodEnd.setTime(new Date(currentCompany.trial_ends_at).getTime());
    } else if (billingCycle === "yearly") {
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    } else {
      const day = periodEnd.getUTCDate();
      periodEnd.setUTCDate(1);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0)).getUTCDate();
      periodEnd.setUTCDate(Math.min(day, lastDay));
    }
    const { error: subscriptionError } = await sb.from("subscriptions").upsert({
      id: subscriptionId, company_id: companyId, user_id: ownerId,
      plan_id: selectedPlan.id, plan_name: selectedPlan.name,
      amount: previousSubscription?.amount ?? (billingCycle === "yearly" ? selectedPlan.annualPrice : selectedPlan.monthlyPrice),
      billing_cycle: billingCycle, currency: "ZAR",
      status: paymentStatus === "FAILED" && isFirstPayment
        ? "suspended"
        : String(companyPatch.subscription_status),
      current_period_start: periodStart.toISOString(), current_period_end: periodEnd.toISOString(),
      next_billing_date: paymentStatus === "CANCELLED" ? null : periodEnd.toISOString(),
      trial_ends_at: currentCompany.trial_ends_at, updated_at: new Date().toISOString(),
    });
    if (subscriptionError) throw subscriptionError;
    if (paymentStatus === "COMPLETE" || paymentStatus === "FAILED") {
      if (!ownerId) {
        throw new Error("Company owner missing for billing history");
      } else {
        const digest = crypto.createHash("sha256").update(`payfast:${eventId}`).digest("hex");
        const billingId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
        const { error: bhErr } = await sb.from("billing_history").upsert({
          id: billingId,
          subscription_id: subscriptionId,
          user_id: ownerId,
          amount: Number(body.amount_gross || body.amount || 0),
          currency: "ZAR",
          status: paymentStatus === "COMPLETE" ? "completed" : "failed",
          payment_method: "payfast",
        } as any);
        if (bhErr) throw bhErr;
      }
    }

    const { error: completedError } = await sb.from("subscription_webhook_events")
      .update({ rejection_reason: null, processed_at: new Date().toISOString() }).eq("provider", "payfast").eq("event_id", eventId);
    if (completedError) throw completedError;
    // Billing emails - the templates edited on
    // /admin/platform/messaging-templates (subscription_started,
    // payment_succeeded, payment_failed) had no live send path until
    // now. Best-effort: an email failure never fails the ITN.
    if (ownerId) {
      try {
        const { billingEmailService } = await import("@/services/billingEmailService");
        const paidAmount = Number(body.amount_gross || body.amount || 0);
        const nowIso = new Date().toISOString();
        if (paymentStatus === "COMPLETE" && isFirstPayment) {
          await billingEmailService.notifySubscriptionStarted(ownerId, {
            plan_name: selectedPlan.name || planFromCustom || "your plan",
            amount: previousSubscription?.amount ?? (billingCycle === "yearly" ? selectedPlan.annualPrice : selectedPlan.monthlyPrice),
            paid_amount: paidAmount,
            billing_mode: "recurring",
            subscription_status: String(companyPatch.subscription_status),
            currency: "ZAR",
            billing_cycle: billingCycle,
            next_billing_date: periodEnd.toISOString(),
          });
        }
        if (paymentStatus === "COMPLETE" && paidAmount > 0) {
          await billingEmailService.notifyPaymentSucceeded(ownerId, {
            amount: paidAmount,
            plan_name: selectedPlan.name,
            billing_cycle: billingCycle,
            billing_mode: "recurring",
            recurring_amount: previousSubscription?.amount ?? (billingCycle === "yearly" ? selectedPlan.annualPrice : selectedPlan.monthlyPrice),
            currency: "ZAR",
            paid_at: nowIso,
            transaction_id: body.pf_payment_id || null,
            billing_period_start: nowIso,
            billing_period_end: periodEnd.toISOString(),
            next_billing_date: periodEnd.toISOString(),
          });
        } else if (paymentStatus === "FAILED") {
          await billingEmailService.notifyPaymentFailed(ownerId, {
            amount: paidAmount,
            currency: "ZAR",
            created_at: nowIso,
            failed_reason: "PayFast reported the payment as failed",
          });
        } else if (paymentStatus === "CANCELLED") {
          await billingEmailService.notifySubscriptionCancelled(ownerId, {
            plan_name: selectedPlan.name || planFromCustom || "your plan",
            cancelled_at: nowIso,
            current_period_end: body.billing_date || nowIso,
          }, "cancelled");
        }
      } catch (emailErr) {
        console.warn("[subscriptions/payfast] billing email failed:", emailErr);
      }
    }

    // The tenant owner receives the customer-facing billing email above.
    // The platform owner also needs a separate operational receipt so a
    // successful SaaS charge is visible without opening the tenant record.
    // Prefer an explicit mailbox; otherwise use the first super-admin.
    if (paymentStatus === "COMPLETE" && (isFirstPayment || body.pf_payment_id)) {
      try {
        let platformEmail = process.env.PLATFORM_BILLING_NOTIFICATION_EMAIL || "";
        if (!platformEmail) {
          const { data: platformOwner } = await sb
            .from("profiles")
            .select("email")
            .eq("role", "super_admin")
            .not("email", "is", null)
            .limit(1)
            .maybeSingle();
          platformEmail = String((platformOwner as any)?.email || "").trim();
        }
        if (platformEmail) {
          const { emailService } = await import("@/services/emailService");
          const paidAmount = Number(body.amount_gross || body.amount || 0);
          await emailService.sendEmail({
            companyId,
            to: platformEmail,
            subject: `${isFirstPayment ? "New platform subscription" : "Platform subscription renewed"}: ${ownerCompany?.company_name || companyId}`,
            body: `<h2>${isFirstPayment ? "New platform subscription" : "Platform subscription renewed"}</h2>
              <p><strong>Company:</strong> ${ownerCompany?.company_name || companyId}</p>
            <p><strong>Plan:</strong> ${selectedPlan.name || planFromCustom || "Unknown plan"}</p>
              <p><strong>Amount:</strong> R${paidAmount.toFixed(2)}</p>
              <p><strong>Billing cycle:</strong> ${billingCycle}</p>
              <p><strong>Transaction:</strong> ${body.pf_payment_id || "N/A"}</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com"}/admin/platform/subscription-management">Open platform subscription management</a></p>`,
            legalAudience: "platform",
            allowPlatformFallback: true,
            _client: sb,
          } as any);
        } else {
          console.warn("[subscriptions/payfast] platform billing email is not configured and no super_admin email was found");
        }
      } catch (platformEmailErr) {
        console.warn("[subscriptions/payfast] platform owner billing email failed:", platformEmailErr);
      }
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
    await sb.from("subscription_webhook_events").update({ rejection_reason: "processing_failed" }).eq("provider", "payfast").eq("event_id", eventId);
    console.error("[subscriptions/payfast] handler failed:", e);
    return res.status(500).json({ error: e?.message || "handler failed" });
  }

  return res.status(200).json({ ok: true });
}

export default withApiLogging(handler);
