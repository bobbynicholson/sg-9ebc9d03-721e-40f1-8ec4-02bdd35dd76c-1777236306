/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/subscription/create-session
 *
 * Starts a plan checkout with the chosen platform provider:
 *   payfast (default) - self-submitting PayFast subscription form HTML
 *   stripe            - Stripe Checkout URL for an auto-renewing subscription
 *   yoco              - Yoco Checkout URL for one prepaid billing period
 *
 * For PayFast this builds the SUBSCRIPTION (plan) checkout form SERVER-side
 * and returns the self-submitting HTML, mirroring how order/deposit payments
 * work (/api/payments/create-session). Doing it here instead of in the
 * browser means:
 *   - the PayFast passphrase stays server-only (never shipped to the
 *     client via NEXT_PUBLIC_*), and
 *   - the company_id used for reconciliation comes from the server
 *     session, not client input (can't be spoofed).
 *
 * Credentials come from the PLATFORM PayFast account (this is the tenant
 * paying US), read from server-only env, with the NEXT_PUBLIC_* vars as a
 * backward-compatible fallback.
 *
 * Returns: { ok: true, provider, html } | { ok: true, provider, url, checkoutId } | { error }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { PayFastService } from "@/lib/payfastService";
import { loadPlatformSubscriptionPlan } from "@/lib/platformSubscriptionPlans";
import { isPayfastTestPlan, isPayfastTestTenant, PAYFAST_TEST_PLAN_AMOUNT_ZAR } from "@/lib/payfastTestPlan";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";
import { publicAppOrigin } from "@/lib/publicAppOrigin";
import {
  currentRenewingSubscription,
  platformBillingProviders,
  startStripePlanCheckout,
  startYocoPlanCheckout,
  type PlatformPlanProvider,
} from "@/services/platformPlanBilling";

function providerLabel(provider: PlatformPlanProvider) {
  return provider === "stripe" ? "Stripe" : provider === "yoco" ? "Yoco" : "PayFast";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Must be a signed-in tenant user - the subscription attaches to
    // THEIR company, resolved server-side.
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to upgrade your plan." });

    const { data: profile } = await ssr
      .from("profiles")
      .select("company_id, full_name, email, role")
      .eq("id", user.id)
      .maybeSingle();
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) {
      return res.status(400).json({ error: "Your account isn't linked to a company yet." });
    }

    if (!["owner", "company_admin", "admin", "super_admin"].includes((profile as any)?.role)) {
      return res.status(403).json({ error: "Only a company administrator can manage billing." });
    }
    const body = (req.body || {}) as any;
    const planId = String(body.planId || "");
    const cycle = body.cycle === "annual" ? "annual" : "monthly";
    const admin = getServiceSupabase();
    const { data: companyRow, error: companyError } = await admin
      .from("companies")
      .select("trial_ends_at, subscription_status, payfast_subscription_token, slug")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!companyRow) return res.status(404).json({ error: "Company not found." });
    const isTestPlan = isPayfastTestPlan(planId);
    if (isTestPlan && (!isPayfastTestTenant(companyRow.slug) || body.cycle === "annual")) {
      return res.status(403).json({ error: "The R5 one-time test payment is only available to its dedicated test tenant." });
    }
    const plan = await loadPlatformSubscriptionPlan(admin, planId, { requireActive: true });
    if (!plan) return res.status(400).json({ error: "This plan is not currently available. Choose an active plan and try again." });
    if (isTestPlan && plan.monthlyPrice !== PAYFAST_TEST_PLAN_AMOUNT_ZAR) {
      return res.status(503).json({ error: "The R5 test plan is not configured at the expected one-time price." });
    }
    if (companyRow.payfast_subscription_token && ["active", "trial", "past_due"].includes(companyRow.subscription_status)) {
      return res.status(409).json({ error: "This company already has recurring billing. Manage the existing subscription before starting another." });
    }

    const provider: PlatformPlanProvider = body.provider === "stripe" || body.provider === "yoco" ? body.provider : "payfast";
    if (isTestPlan && provider !== "payfast") {
      return res.status(400).json({ error: "The R5 test plan is PayFast-only." });
    }
    if (!platformBillingProviders()[provider]) {
      return res.status(400).json({ error: `${providerLabel(provider)} plan billing isn't configured yet. Choose another payment method.` });
    }

    // Never let one company end up paying two providers for overlapping
    // periods. A Stripe subscription renews on its own; a Yoco period is
    // prepaid and can only be extended with another Yoco payment.
    const renewing = await currentRenewingSubscription(admin, companyId);
    const liveStripe = renewing.find((row: any) => row.stripe_subscription_id && !row.cancel_at_period_end);
    if (liveStripe) {
      return res.status(409).json({ error: "This company already has an auto-renewing Stripe subscription. Cancel it from Billing before starting another." });
    }
    const liveYoco = renewing.find((row: any) => row.payment_provider === "yoco" &&
      new Date(row.current_period_end).getTime() > Date.now());
    if (liveYoco && provider !== "yoco") {
      return res.status(409).json({
        error: `Your prepaid Yoco plan runs until ${new Date(liveYoco.current_period_end).toLocaleDateString("en-ZA")}. Renew with Yoco, or switch provider after that date.`,
      });
    }

    if (provider !== "payfast") {
      const origin = publicAppOrigin({
        environment: process.env.NODE_ENV,
        configuredUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL,
        vercelProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
        vercelUrl: process.env.VERCEL_URL,
        requestOrigin: req.headers.origin as string | undefined,
        requestHost: req.headers.host,
        forwardedProtocol: req.headers["x-forwarded-proto"] as string | undefined,
      });
      const fullName = String((profile as any)?.full_name || "").trim();
      const checkoutInput = {
        admin, companyId, userId: user.id, plan,
        cycle: cycle === "annual" ? "yearly" as const : "monthly" as const,
        origin, tenantSlug: String((companyRow as any).slug || "").trim(),
        email: String(body.email || (profile as any)?.email || user.email || "").trim(),
        name: [body.firstName, body.lastName].filter(Boolean).join(" ").trim() || fullName,
      };
      try {
        const started = provider === "stripe"
          ? await startStripePlanCheckout(checkoutInput)
          : await startYocoPlanCheckout(checkoutInput);
        return res.status(200).json({ ok: true, provider, url: started.url, checkoutId: started.checkoutId });
      } catch (providerError: any) {
        console.error(`[subscription/create-session] ${provider} checkout failed:`, providerError);
        return res.status(502).json({
          error: `${providerLabel(provider)} could not start the checkout. Nothing was charged - please try again or choose another payment method.`,
        });
      }
    }

    // Platform PayFast credentials (server-only; never NEXT_PUBLIC for the
    // passphrase). Fall back to the NEXT_PUBLIC_* names so an existing
    // single-account setup keeps working.
    const merchantId = process.env.PAYFAST_PLATFORM_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_PLATFORM_MERCHANT_KEY || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PLATFORM_PASSPHRASE || process.env.PAYFAST_PASSPHRASE || process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE || "";
    const testMode =
      (process.env.PAYFAST_PLATFORM_TEST_MODE || process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE) === "true";
    if (!merchantId || !merchantKey || !passphrase) {
      return res.status(400).json({
        error: "Plan billing isn't configured yet. Set the platform PayFast credentials.",
      });
    }

    // Resolve display name + email: prefer the form values, fall back to
    // the profile / company contact.
    let firstName = String(body.firstName || "").trim();
    let lastName = String(body.lastName || "").trim();
    let email = String(body.email || "").trim();
    if ((!firstName || !email) && profile) {
      const fn = String((profile as any).full_name || "").trim();
      if (!firstName && fn) firstName = fn.split(/\s+/)[0] || "";
      if (!lastName && fn) lastName = fn.split(/\s+/).slice(1).join(" ");
      if (!email) email = String((profile as any).email || user.email || "");
    }
    if (!email) {
      // Last resort: the company contact email.
      try {
        const admin = getServiceSupabase();
        const { data: c } = await admin.from("companies").select("email").eq("id", companyId).maybeSingle();
        if ((c as any)?.email) email = (c as any).email;
      } catch { /* non-fatal */ }
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (req.headers.origin as string) ||
      `https://${req.headers.host || "cateringms.com"}`;

    const checkoutOrigin = new URL(baseUrl);
    if (checkoutOrigin.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(checkoutOrigin.hostname)) {
      return res.status(400).json({ error: "PayFast needs a public HTTPS callback. Open the app through a public HTTPS URL and set NEXT_PUBLIC_SITE_URL to that URL before checkout." });
    }
    const svc = new PayFastService({ merchantId, merchantKey, passphrase, testMode });
    // Always send PayFast back to the public site root, and preserve the
    // company URL so its return lands on the right tenant's success screen.
    const siteOrigin = checkoutOrigin.origin;
    const tenantSlug = String((companyRow as any).slug || "").trim();
    // custom_str1 = company_id (server-resolved) so the webhook flips the
    // right company to 'active'. custom_str2 = plan id, custom_str3 = cycle.
    const buyer = { firstName: firstName || "Customer", lastName, email, userId: companyId };
    const params = isTestPlan
      ? svc.createOneTimePlanParams(plan, buyer, siteOrigin, tenantSlug || undefined)
      : svc.createSubscriptionParams(
          plan,
          buyer,
          cycle,
          siteOrigin,
          companyRow?.subscription_status === "trial" && companyRow.trial_ends_at
            ? new Date(companyRow.trial_ends_at).getTime() > Date.now()
              ? new Date(companyRow.trial_ends_at).toISOString().split("T")[0]
              : undefined
            : undefined,
          tenantSlug || undefined,
        );
    const html = svc.generatePaymentForm(params);

    return res.status(200).json({ ok: true, provider: "payfast", html });
  } catch (e: any) {
    console.error("/api/subscription/create-session crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Could not start checkout" });
  }
}

export default withApiLogging(handler);
