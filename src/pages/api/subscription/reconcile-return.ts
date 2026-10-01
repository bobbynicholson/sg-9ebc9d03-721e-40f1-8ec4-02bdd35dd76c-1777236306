/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Verify a PayFast browser return when the server-to-server ITN is late or
 * missing. This fallback is deliberately limited to the isolated R5
 * one-time test plan: recurring plans still require their verified ITN (and
 * billing token) before access can be activated.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchRecentPayFastTransactions, queryPayFastTransaction } from "@/lib/payfastService";
import { loadPlatformSubscriptionPlan } from "@/lib/platformSubscriptionPlans";
import {
  isPayfastTestPlan,
  isPayfastTestTenant,
  PAYFAST_TEST_PLAN_AMOUNT_ZAR,
} from "@/lib/payfastTestPlan";
import { withApiLogging } from "@/lib/withApiLogging";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stableUuid(seed: string): string {
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function replyPending(res: NextApiResponse) {
  return res.status(202).json({ ok: true, confirmed: false, pending: true });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to confirm this payment." });

    const { data: profile, error: profileError } = await ssr
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    const companyId = String((profile as any)?.company_id || "");
    if (!companyId) return res.status(403).json({ error: "Your account is not linked to a company." });
    if (!["owner", "company_admin", "admin", "super_admin"].includes(String((profile as any)?.role || ""))) {
      return res.status(403).json({ error: "Only a company administrator can confirm billing." });
    }

    const merchantPaymentId = String(req.body?.m_payment_id || "").trim();
    if (!UUID_PATTERN.test(merchantPaymentId)) {
      return res.status(400).json({ error: "Payment reference is invalid." });
    }

    const merchantId = process.env.PAYFAST_PLATFORM_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
    const passphrase = process.env.PAYFAST_PLATFORM_PASSPHRASE
      || process.env.PAYFAST_PASSPHRASE
      || process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE
      || "";
    const isTest = (process.env.PAYFAST_PLATFORM_TEST_MODE || process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE) === "true";
    if (!merchantId || !passphrase) {
      return res.status(503).json({ error: "PayFast payment verification is not configured." });
    }

    const admin = getServiceSupabase() as any;
    const { data: company, error: companyError } = await admin.from("companies")
      .select("id, slug, owner_id, subscription_status, subscription_plan, trial_ends_at, payfast_subscription_token")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) return res.status(404).json({ error: "Company not found." });

    const transactions = await fetchRecentPayFastTransactions(
      { merchantId, passphrase, isTest },
      7,
    );
    const transaction = transactions.find((item) => item.m_payment_id === merchantPaymentId);
    if (!transaction?.pf_payment_id) return replyPending(res);

    // The PayFast history row must map this exact checkout to the signed-in
    // tenant before the source transaction is queried or any access changes.
    if (transaction.custom_str1 !== companyId) {
      return res.status(403).json({ error: "This payment belongs to a different company." });
    }
    const planId = String(transaction.custom_str2 || "").trim();
    if (!isPayfastTestPlan(planId)) {
      // Standard subscriptions need the PayFast ITN to provide their
      // recurring billing token. A browser return alone cannot substitute.
      return replyPending(res);
    }
    if (!isPayfastTestTenant(company.slug) || String(transaction.custom_str3 || "monthly").toLowerCase() !== "monthly") {
      return res.status(403).json({ error: "The one-time test payment is not valid for this company." });
    }

    const selectedPlan = await loadPlatformSubscriptionPlan(admin, planId);
    if (!selectedPlan || selectedPlan.monthlyPrice !== PAYFAST_TEST_PLAN_AMOUNT_ZAR) {
      return res.status(503).json({ error: "The R5 test plan is not configured at its expected amount." });
    }

    const payment = await queryPayFastTransaction(
      { merchantId, passphrase, isTest },
      transaction.pf_payment_id,
    );
    if (!payment || payment.status !== "COMPLETE" || payment.m_payment_id !== merchantPaymentId
        || !Number.isFinite(payment.amount)
        || Math.abs(payment.amount / 100 - PAYFAST_TEST_PLAN_AMOUNT_ZAR) > 0.01) {
      return replyPending(res);
    }

    const eventId = `${transaction.pf_payment_id}:COMPLETE`;
    const { data: existingEvent, error: eventReadError } = await admin.from("subscription_webhook_events")
      .select("rejection_reason")
      .eq("provider", "payfast")
      .eq("event_id", eventId)
      .maybeSingle();
    if (eventReadError) throw eventReadError;

    // Do not let an old payment-return bookmark reactivate a plan that has
    // since been cancelled or expired. A payment already processed while
    // active remains a successful return.
    if (existingEvent?.rejection_reason === null) {
      const alreadyActive = String(company.subscription_status || "").toLowerCase() === "active";
      return res.status(200).json({ ok: true, confirmed: alreadyActive, alreadyProcessed: true });
    }
    if (String(company.subscription_status || "").toLowerCase() === "active") {
      return res.status(200).json({ ok: true, confirmed: true, alreadyActive: true });
    }
    if (company.payfast_subscription_token) {
      return res.status(409).json({ error: "An existing recurring subscription must be confirmed by its PayFast notification." });
    }
    if (!company.owner_id) throw new Error("Company owner is missing.");

    const subscriptionId = stableUuid(`payfast-subscription-attempt:${companyId}:${eventId}`);
    const billingId = stableUuid(`payfast:${eventId}`);
    const now = new Date();
    const periodEnd = new Date(now);
    const day = periodEnd.getUTCDate();
    periodEnd.setUTCDate(1);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0)).getUTCDate();
    periodEnd.setUTCDate(Math.min(day, lastDay));
    const nowIso = now.toISOString();

    const { error: subscriptionError } = await admin.from("subscriptions").upsert({
      id: subscriptionId,
      company_id: companyId,
      user_id: company.owner_id,
      plan_id: selectedPlan.id,
      plan_name: selectedPlan.name,
      amount: PAYFAST_TEST_PLAN_AMOUNT_ZAR,
      billing_cycle: "monthly",
      currency: "ZAR",
      status: "active",
      current_period_start: nowIso,
      current_period_end: periodEnd.toISOString(),
      next_billing_date: null,
      trial_ends_at: company.trial_ends_at,
      updated_at: nowIso,
    });
    if (subscriptionError) throw subscriptionError;

    const { error: billingError } = await admin.from("billing_history").upsert({
      id: billingId,
      subscription_id: subscriptionId,
      user_id: company.owner_id,
      amount: PAYFAST_TEST_PLAN_AMOUNT_ZAR,
      currency: "ZAR",
      status: "completed",
      payment_method: "payfast",
    });
    if (billingError) throw billingError;

    const { data: activated, error: activationError } = await admin.from("companies")
      .update({ subscription_status: "active", subscription_plan: selectedPlan.id, updated_at: nowIso })
      .eq("id", companyId)
      .select("id");
    if (activationError || !activated?.length) throw activationError || new Error("Company activation failed.");

    const { error: eventError } = await admin.from("subscription_webhook_events").upsert({
      provider: "payfast",
      event_id: eventId,
      event_type: "payment_status.complete",
      company_id: companyId,
      raw: {
        recovery_method: "verified_payfast_return_query",
        m_payment_id: merchantPaymentId,
        pf_payment_id: transaction.pf_payment_id,
        payment_status: payment.status,
        amount_zar: PAYFAST_TEST_PLAN_AMOUNT_ZAR,
        custom_str1: companyId,
        custom_str2: planId,
        custom_str3: "monthly",
      },
      rejection_reason: null,
      processed_at: nowIso,
    }, { onConflict: "provider,event_id" });
    if (eventError) throw eventError;

    return res.status(200).json({ ok: true, confirmed: true, recovered: true });
  } catch (error: any) {
    console.error("[subscription/reconcile-return] verification failed:", error);
    return res.status(500).json({ error: "Could not verify the PayFast return. Please retry shortly." });
  }
}

export default withApiLogging(handler);
