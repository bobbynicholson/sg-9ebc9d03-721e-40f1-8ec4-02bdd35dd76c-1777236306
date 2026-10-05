/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform plan billing through Stripe and Yoco (server-only).
 *
 * This is a company paying the PLATFORM for its CateringMS plan, so it
 * uses the platform's own provider accounts from server env - never a
 * tenant's gateway credentials.
 *
 *   Stripe  - a real Stripe Billing subscription. Stripe stores the card
 *             and charges it every month/year until cancelled.
 *   Yoco    - Yoco's Checkout API cannot store or re-charge a card, so each
 *             paid checkout buys one prepaid period. The renewal cron emails
 *             a pay link before each period ends; paying extends the plan,
 *             and an unpaid plan moves to past_due and then suspended.
 *
 * Only provider-verified evidence (a signed webhook, or Stripe's API) moves
 * a checkout to succeeded. Every write is keyed so a retried webhook, a
 * replayed return page, or both arriving together grants access once.
 *
 * Env:
 *   STRIPE_PLATFORM_SECRET_KEY, STRIPE_SUBSCRIPTION_WEBHOOK_SECRET
 *   YOCO_PLATFORM_SECRET_KEY,   YOCO_PLATFORM_WEBHOOK_SECRET
 */
import crypto from "node:crypto";
import Stripe from "stripe";
import type { SubscriptionPlan } from "@/types/payments";
import { loadPlatformSubscriptionPlan } from "@/lib/platformSubscriptionPlans";
import { createYocoCheckout } from "@/lib/yocoService";

const STRIPE_API_VERSION = "2024-12-18.acacia" as Stripe.LatestApiVersion;

export type PlatformPlanProvider = "payfast" | "stripe" | "yoco";
export type PlanCycle = "monthly" | "yearly";

export function platformBillingProviders(): Record<PlatformPlanProvider, boolean> {
  const env = process.env;
  return {
    payfast: Boolean((env.PAYFAST_PLATFORM_MERCHANT_ID || env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID) &&
      (env.PAYFAST_PLATFORM_MERCHANT_KEY || env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY) &&
      (env.PAYFAST_PLATFORM_PASSPHRASE || env.PAYFAST_PASSPHRASE || env.NEXT_PUBLIC_PAYFAST_PASSPHRASE)),
    stripe: Boolean(env.STRIPE_PLATFORM_SECRET_KEY && env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET),
    yoco: Boolean(env.YOCO_PLATFORM_SECRET_KEY && env.YOCO_PLATFORM_WEBHOOK_SECRET),
  };
}

export function platformStripe(): Stripe {
  const key = process.env.STRIPE_PLATFORM_SECRET_KEY;
  if (!key) throw new Error("Stripe plan billing is not configured");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION, timeout: 15000, maxNetworkRetries: 1 });
}

export function stableUuid(seed: string): string {
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Same calendar rule as PayFast plans: Jan 31 + 1 month = Feb 28/29. */
export function addBillingPeriod(from: Date, cycle: PlanCycle): Date {
  const next = new Date(from);
  if (cycle === "yearly") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
  }
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function planAmount(plan: SubscriptionPlan, cycle: PlanCycle): number {
  return Math.round((cycle === "yearly" ? plan.annualPrice : plan.monthlyPrice) * 100) / 100;
}

async function loadCompany(admin: any, companyId: string) {
  const { data, error } = await admin.from("companies")
    .select("id, slug, company_name, email, owner_id, subscription_status, subscription_plan, trial_ends_at, stripe_customer_id, payfast_subscription_token")
    .eq("id", companyId).single();
  if (error || !data) throw error || new Error("Company not found");
  return data as any;
}

/** The plan that currently renews this company, if any. */
export async function currentRenewingSubscription(admin: any, companyId: string) {
  const { data, error } = await admin.from("subscriptions").select("*")
    .eq("company_id", companyId).in("status", ["active", "trial", "past_due"])
    .order("current_period_end", { ascending: false }).limit(5);
  if (error) throw error;
  return (data || []) as any[];
}

// - Stripe -------------------------------------------------------------

interface StartCheckoutInput {
  admin: any;
  companyId: string;
  userId: string;
  plan: SubscriptionPlan;
  cycle: PlanCycle;
  origin: string;
  tenantSlug: string;
  email: string;
  name: string;
}

function tenantPath(slug: string) {
  return slug ? `/${encodeURIComponent(slug)}` : "";
}

async function ensureStripeCustomer(stripe: Stripe, admin: any, company: any, email: string, name: string) {
  if (company.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(company.stripe_customer_id);
      if (!(existing as any).deleted) return existing.id;
    } catch (error: any) {
      // A customer from the other mode (test vs live) or a deleted one is
      // replaced; any other Stripe failure must stop the checkout.
      if (error?.code !== "resource_missing") throw error;
    }
  }
  const customer = await stripe.customers.create({
    email: email || company.email || undefined,
    name: company.company_name || name || undefined,
    metadata: { companyId: company.id },
  }, { idempotencyKey: `cms-customer-${company.id}-${company.stripe_customer_id || "new"}` });
  const { error } = await admin.from("companies").update({ stripe_customer_id: customer.id }).eq("id", company.id);
  if (error) throw error;
  return customer.id;
}

export async function startStripePlanCheckout(input: StartCheckoutInput) {
  const stripe = platformStripe();
  const company = await loadCompany(input.admin, input.companyId);
  const customerId = await ensureStripeCustomer(stripe, input.admin, company, input.email, input.name);

  // An abandoned tab can still be completed for 24h. Close older open
  // sessions first so one company can never end up with two auto-renewing
  // Stripe subscriptions. A session Stripe already completed is settled
  // instead, and then blocks the new checkout.
  const { data: openCheckouts, error: openError } = await input.admin.from("platform_subscription_checkouts")
    .select("*").eq("company_id", input.companyId).eq("provider", "stripe").eq("status", "pending")
    .not("provider_session_id", "is", null);
  if (openError) throw openError;
  for (const open of openCheckouts || []) {
    try {
      await stripe.checkout.sessions.expire(open.provider_session_id);
      await input.admin.from("platform_subscription_checkouts").update({
        status: "expired", provider_status: "replaced", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", open.id).eq("status", "pending");
    } catch {
      // Not open any more (completed or expired): let Stripe say which.
      if (await confirmStripePlanCheckout(input.admin, open) === "succeeded") {
        throw new Error("An earlier Stripe checkout for this company has just completed");
      }
    }
  }
  const amount = planAmount(input.plan, input.cycle);
  const checkoutId = crypto.randomUUID();
  const base = `${input.origin}${tenantPath(input.tenantSlug)}`;

  // Honour an unexpired trial: Stripe needs trial_end at least 48h ahead.
  const trialEnd = company.subscription_status === "trial" && company.trial_ends_at
    ? Math.floor(new Date(company.trial_ends_at).getTime() / 1000)
    : 0;
  const useTrial = trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600;

  const { error: insertError } = await input.admin.from("platform_subscription_checkouts").insert({
    id: checkoutId, company_id: input.companyId, created_by: input.userId, provider: "stripe",
    plan_id: input.plan.id, billing_cycle: input.cycle, amount, currency: "ZAR",
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  });
  if (insertError) throw insertError;

  const metadata = { companyId: input.companyId, planId: input.plan.id, cycle: input.cycle, platformCheckoutId: checkoutId };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: input.companyId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "zar",
          unit_amount: Math.round(amount * 100),
          recurring: { interval: input.cycle === "yearly" ? "year" : "month" },
          product_data: { name: `CateringMS ${input.plan.name} plan` },
        },
      }],
      subscription_data: { metadata, ...(useTrial ? { trial_end: trialEnd } : {}) },
      metadata,
      success_url: `${base}/subscription/success?provider=stripe&checkout_id=${checkoutId}`,
      cancel_url: `${base}/admin/subscription?cancelled=1&checkout_id=${checkoutId}`,
    }, { idempotencyKey: `cms-plan-checkout-${checkoutId}` });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    const { error } = await input.admin.from("platform_subscription_checkouts")
      .update({ provider_session_id: session.id, updated_at: new Date().toISOString() }).eq("id", checkoutId);
    if (error) throw error;
    return { checkoutId, url: session.url };
  } catch (error: any) {
    await input.admin.from("platform_subscription_checkouts").update({
      status: "failed", failure_reason: String(error?.message || "Stripe checkout failed").slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", checkoutId);
    throw error;
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  if (status === "active") return "active";
  if (status === "trialing") return "trial";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "cancelled";
  return "suspended";
}

/**
 * Mirror a Stripe subscription onto subscriptions + companies. Used by the
 * webhook (every customer.subscription.* event) and by the return-page
 * check, so both paths produce the same rows.
 */
export async function syncStripeSubscription(admin: any, sub: Stripe.Subscription, fallbackCompanyId?: string | null) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  let companyId = String(sub.metadata?.companyId || fallbackCompanyId || "");
  if (!companyId && customerId) {
    const { data } = await admin.from("companies").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    companyId = data?.id || "";
  }
  if (!companyId) return null;
  const company = await loadCompany(admin, companyId);
  if (company.stripe_customer_id && customerId && company.stripe_customer_id !== customerId) {
    throw new Error("Stripe customer does not belong to this company");
  }
  if (!company.owner_id) throw new Error("Company owner missing for subscription");

  const status = mapStripeStatus(sub.status);
  const item = sub.items?.data?.[0];
  const planId = String(sub.metadata?.planId || company.subscription_plan || "");
  const plan = planId ? await loadPlatformSubscriptionPlan(admin, planId) : null;
  const interval = item?.price?.recurring?.interval;
  const nowIso = new Date().toISOString();
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

  const { data: row, error: subError } = await admin.from("subscriptions").upsert({
    id: stableUuid(`stripe-subscription:${sub.id}`),
    company_id: companyId,
    user_id: company.owner_id,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    payment_provider: "stripe",
    plan_id: plan?.id || planId || null,
    plan_name: plan?.name || item?.price?.nickname || planId || "Plan",
    amount: (item?.price?.unit_amount ?? 0) / 100,
    currency: String(sub.currency || "zar").toUpperCase(),
    billing_cycle: interval === "year" ? "yearly" : "monthly",
    status,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: periodEnd,
    next_billing_date: sub.cancel_at_period_end || status === "cancelled" ? null : periodEnd,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : company.trial_ends_at,
    updated_at: nowIso,
  }, { onConflict: "stripe_subscription_id" }).select("id").single();
  if (subError) throw subError;

  // An incomplete first payment must not take away an existing trial or
  // other plan; only a subscription that is (or was) live drives access.
  if (sub.status !== "incomplete" && sub.status !== "incomplete_expired") {
    const patch: Record<string, unknown> = { subscription_status: status, stripe_customer_id: customerId, updated_at: nowIso };
    if (plan?.id && status !== "cancelled") patch.subscription_plan = plan.id;
    const { error } = await admin.from("companies").update(patch).eq("id", companyId);
    if (error) throw error;
  }
  return { companyId, subscriptionRowId: row?.id as string, status, ownerId: company.owner_id as string, planName: plan?.name || "your plan" };
}

/**
 * Resolve a Stripe plan checkout by asking Stripe. Safe from the return page
 * and from the webhook: only a complete session with a live subscription
 * activates anything, and the session must match our saved checkout.
 */
export async function confirmStripePlanCheckout(admin: any, checkout: any) {
  if (checkout.status !== "pending" || !checkout.provider_session_id) return checkout.status;
  const stripe = platformStripe();
  const session = await stripe.checkout.sessions.retrieve(checkout.provider_session_id, { expand: ["subscription"] });
  if (session.metadata?.platformCheckoutId !== checkout.id || session.metadata?.companyId !== checkout.company_id) {
    throw new Error("Stripe session does not match this plan checkout");
  }
  const nowIso = new Date().toISOString();
  if (session.status === "expired") {
    await admin.from("platform_subscription_checkouts").update({
      status: "expired", provider_status: "expired", completed_at: nowIso, updated_at: nowIso, last_checked_at: nowIso,
    }).eq("id", checkout.id).eq("status", "pending");
    return "expired";
  }
  const sub = session.subscription && typeof session.subscription === "object" ? session.subscription as Stripe.Subscription : null;
  const paidOrTrial = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (session.status !== "complete" || !paidOrTrial || !sub || !["active", "trialing"].includes(sub.status)) {
    await admin.from("platform_subscription_checkouts").update({
      provider_status: `${session.status}:${session.payment_status}`, last_checked_at: nowIso, updated_at: nowIso,
    }).eq("id", checkout.id).eq("status", "pending");
    return "pending";
  }
  const synced = await syncStripeSubscription(admin, sub, checkout.company_id);
  const { data: marked } = await admin.from("platform_subscription_checkouts").update({
    status: "succeeded", provider_status: sub.status, provider_payment_id: sub.id,
    subscription_id: synced?.subscriptionRowId || null, completed_at: nowIso, updated_at: nowIso, last_checked_at: nowIso,
  }).eq("id", checkout.id).eq("status", "pending").select("id");
  if (marked?.length && synced?.ownerId) {
    try {
      const { billingEmailService } = await import("@/services/billingEmailService");
      const item = sub.items?.data?.[0];
      await billingEmailService.notifySubscriptionStarted(synced.ownerId, {
        plan_name: synced.planName,
        amount: (item?.price?.unit_amount ?? 0) / 100,
        paid_amount: (session.amount_total ?? 0) / 100,
        currency: "ZAR",
        billing_cycle: item?.price?.recurring?.interval === "year" ? "yearly" : "monthly",
        subscription_status: synced.status,
        next_billing_date: new Date(sub.current_period_end * 1000).toISOString(),
      });
    } catch (emailError) {
      console.warn("[platformPlanBilling] Stripe start email failed:", emailError);
    }
  }
  return "succeeded";
}

// - Yoco ---------------------------------------------------------------

export async function startYocoPlanCheckout(input: StartCheckoutInput) {
  const secretKey = process.env.YOCO_PLATFORM_SECRET_KEY;
  if (!secretKey) throw new Error("Yoco plan billing is not configured");
  const amount = planAmount(input.plan, input.cycle);
  const checkoutId = crypto.randomUUID();
  const base = `${input.origin}${tenantPath(input.tenantSlug)}`;
  const { error: insertError } = await input.admin.from("platform_subscription_checkouts").insert({
    id: checkoutId, company_id: input.companyId, created_by: input.userId, provider: "yoco",
    plan_id: input.plan.id, billing_cycle: input.cycle, amount, currency: "ZAR",
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  });
  if (insertError) throw insertError;
  try {
    const checkout = await createYocoCheckout({
      secretKey,
      amount,
      successUrl: `${base}/subscription/success?provider=yoco&checkout_id=${checkoutId}`,
      cancelUrl: `${base}/admin/subscription?cancelled=1&checkout_id=${checkoutId}`,
      metadata: {
        platformCheckoutId: checkoutId,
        paymentAttemptId: checkoutId,
        companyId: input.companyId,
        planId: input.plan.id,
        cycle: input.cycle,
        purpose: "platform_plan",
      },
    });
    const { error } = await input.admin.from("platform_subscription_checkouts")
      .update({ provider_session_id: checkout.id, updated_at: new Date().toISOString() }).eq("id", checkoutId);
    if (error) throw error;
    return { checkoutId, url: checkout.redirectUrl };
  } catch (error: any) {
    await input.admin.from("platform_subscription_checkouts").update({
      status: "failed", failure_reason: String(error?.message || "Yoco checkout failed").slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", checkoutId);
    throw error;
  }
}

/**
 * Grant one prepaid period for a verified Yoco payment. The period is
 * pinned on the checkout row first, so retries never extend twice.
 */
export async function settleYocoPlanPayment(admin: any, checkout: any, payment: { id: string; amountCents: number; currency: string }) {
  if (checkout.status === "succeeded") return { duplicate: true };
  if (Math.round(Number(checkout.amount) * 100) !== payment.amountCents ||
      String(payment.currency || "ZAR").toUpperCase() !== String(checkout.currency).toUpperCase()) {
    throw new Error("Yoco plan payment amount does not match the checkout");
  }
  const company = await loadCompany(admin, checkout.company_id);
  if (!company.owner_id) throw new Error("Company owner missing for subscription");
  const plan = await loadPlatformSubscriptionPlan(admin, checkout.plan_id);
  if (!plan) throw new Error("Unknown subscription plan");
  const cycle: PlanCycle = checkout.billing_cycle === "yearly" ? "yearly" : "monthly";
  const subscriptionId = stableUuid(`yoco-subscription:${checkout.company_id}`);
  const nowIso = new Date().toISOString();

  let periodStart = checkout.period_start ? new Date(checkout.period_start) : null;
  let periodEnd = checkout.period_end ? new Date(checkout.period_end) : null;
  if (!periodStart || !periodEnd) {
    // Renewing an unexpired Yoco period stacks onto its end; anything else
    // starts today. A remaining trial is consumed first, like PayFast.
    const { data: existing, error } = await admin.from("subscriptions")
      .select("current_period_end, status").eq("id", subscriptionId).maybeSingle();
    if (error) throw error;
    const now = Date.now();
    const existingEnd = existing && existing.status !== "cancelled" && existing.current_period_end
      ? new Date(existing.current_period_end).getTime() : 0;
    const trialEnd = company.subscription_status === "trial" && company.trial_ends_at
      ? new Date(company.trial_ends_at).getTime() : 0;
    const start = Math.max(now, existingEnd, trialEnd);
    periodStart = new Date(start);
    periodEnd = addBillingPeriod(periodStart, cycle);
    const { data: pinned, error: pinError } = await admin.from("platform_subscription_checkouts").update({
      period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), updated_at: nowIso,
    }).eq("id", checkout.id).is("period_end", null).select("period_start, period_end");
    if (pinError) throw pinError;
    if (!pinned?.length) {
      // A concurrent delivery pinned it first; use that period.
      const { data: fresh, error: freshError } = await admin.from("platform_subscription_checkouts")
        .select("period_start, period_end, status").eq("id", checkout.id).single();
      if (freshError) throw freshError;
      if (fresh.status === "succeeded") return { duplicate: true };
      periodStart = new Date(fresh.period_start);
      periodEnd = new Date(fresh.period_end);
    }
  }

  const { error: subError } = await admin.from("subscriptions").upsert({
    id: subscriptionId, company_id: checkout.company_id, user_id: company.owner_id,
    payment_provider: "yoco", plan_id: plan.id, plan_name: plan.name,
    amount: Number(checkout.amount), currency: "ZAR", billing_cycle: cycle, status: "active",
    current_period_start: periodStart.toISOString(), current_period_end: periodEnd.toISOString(),
    // The renewal cron emails a Yoco pay link ahead of this date.
    next_billing_date: periodEnd.toISOString(),
    cancel_at_period_end: false, cancelled_at: null,
    trial_ends_at: company.trial_ends_at, updated_at: nowIso,
  });
  if (subError) throw subError;

  const { error: billingError } = await admin.from("billing_history").upsert({
    id: stableUuid(`yoco:${payment.id}`), subscription_id: subscriptionId, user_id: company.owner_id,
    company_id: checkout.company_id, amount: Number(checkout.amount), currency: "ZAR",
    status: "completed", payment_method: "yoco",
  });
  if (billingError) throw billingError;

  // Paid now (any remaining trial days were added in front of the period),
  // so the company is active and the trial cron no longer applies.
  const { error: companyError } = await admin.from("companies").update({
    subscription_status: "active", subscription_plan: plan.id, updated_at: nowIso,
  }).eq("id", checkout.company_id);
  if (companyError) throw companyError;

  const { data: marked, error: markError } = await admin.from("platform_subscription_checkouts").update({
    status: "succeeded", provider_status: "succeeded", provider_payment_id: payment.id,
    subscription_id: subscriptionId, completed_at: nowIso, updated_at: nowIso,
  }).eq("id", checkout.id).eq("status", "pending").select("id");
  if (markError) throw markError;

  if (marked?.length) {
    try {
      const { billingEmailService } = await import("@/services/billingEmailService");
      await billingEmailService.notifyPaymentSucceeded(company.owner_id, {
        amount: Number(checkout.amount), currency: "ZAR", paid_at: nowIso, transaction_id: payment.id,
        billing_period_start: periodStart.toISOString(), billing_period_end: periodEnd.toISOString(),
        next_billing_date: periodEnd.toISOString(), invoice_pdf_url: null,
      });
    } catch (emailError) {
      console.warn("[platformPlanBilling] Yoco payment email failed:", emailError);
    }
  }
  return { duplicate: !marked?.length, periodEnd: periodEnd.toISOString() };
}
