/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform owner (super_admin) plan-billing controls.
 *
 * GET  /api/platform/subscriptions
 *   Per-company billing details the companies row does not carry: which
 *   provider bills it, monthly vs yearly, the real amount and next charge.
 *
 * POST /api/platform/subscriptions { action: "cancel", companyId }
 *   Stops billing AT THE PROVIDER first (PayFast agreement / Stripe
 *   subscription), then marks the plan and company cancelled. If the
 *   provider does not confirm, nothing is changed here, so the card is
 *   never left being charged for a company shown as cancelled.
 *   Yoco plans are prepaid; there is nothing to stop at Yoco.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { PayFastService } from "@/lib/payfastService";
import { platformStripe } from "@/services/platformPlanBilling";
import { withApiLogging } from "@/lib/withApiLogging";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireSuperAdmin(req: NextApiRequest, res: NextApiResponse) {
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) { res.status(401).json({ error: "Not signed in" }); return null; }
  const { data: profile } = await ssr.from("profiles").select("role, active_role").eq("id", user.id).single();
  if (![profile?.role, profile?.active_role].includes("super_admin")) {
    res.status(403).json({ error: "Super admin only" });
    return null;
  }
  return user;
}

function providerOf(sub: any, company: any): "stripe" | "yoco" | "payfast" | null {
  if (sub?.stripe_subscription_id || sub?.payment_provider === "stripe") return "stripe";
  if (sub?.payment_provider === "yoco") return "yoco";
  if (sub?.payment_provider === "payfast" || company?.payfast_subscription_token) return "payfast";
  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireSuperAdmin(req, res);
  if (!user) return;
  const db: any = getServiceSupabase();

  try {
    if (req.method === "GET") {
      const [{ data: subs, error: subsError }, { data: companies, error: companyError }] = await Promise.all([
        db.from("subscriptions").select("*").in("status", ["active", "trial", "past_due"])
          .order("current_period_end", { ascending: false }).limit(10000),
        db.from("companies").select("id, payfast_subscription_token").limit(10000),
      ]);
      if (subsError) throw subsError;
      if (companyError) throw companyError;
      const tokenByCompany = new Map((companies || []).map((c: any) => [c.id, c.payfast_subscription_token]));
      const billing: Record<string, any> = {};
      for (const sub of subs || []) {
        if (billing[sub.company_id]) continue; // newest period wins
        billing[sub.company_id] = {
          provider: providerOf(sub, { payfast_subscription_token: tokenByCompany.get(sub.company_id) }),
          billing_cycle: sub.billing_cycle === "yearly" || sub.billing_cycle === "annual" ? "yearly" : "monthly",
          amount: Number(sub.amount) || 0,
          currency: sub.currency || "ZAR",
          current_period_end: sub.current_period_end || null,
          next_billing_date: sub.next_billing_date || null,
          cancel_at_period_end: !!sub.cancel_at_period_end,
        };
      }
      for (const company of companies || []) {
        if (!billing[company.id] && company.payfast_subscription_token) {
          billing[company.id] = { provider: "payfast", billing_cycle: "monthly", amount: null };
        }
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ billing });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    const companyId = String(req.body?.companyId || "");
    if (req.body?.action !== "cancel" || !UUID.test(companyId)) {
      return res.status(400).json({ error: "Expected { action: 'cancel', companyId }" });
    }

    const { data: company, error: companyError } = await db.from("companies")
      .select("id, payfast_subscription_token, subscription_status").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return res.status(404).json({ error: "Company not found" });
    const { data: renewing, error: subsError } = await db.from("subscriptions").select("*")
      .eq("company_id", companyId).in("status", ["active", "trial", "past_due"]);
    if (subsError) throw subsError;

    // 1. Stop the money at each provider. Abort on the first unconfirmed stop.
    const stopped: string[] = [];
    for (const sub of renewing || []) {
      if (!sub.stripe_subscription_id) continue;
      try {
        await platformStripe().subscriptions.cancel(sub.stripe_subscription_id);
        stopped.push("Stripe");
      } catch (e: any) {
        if (e?.code !== "resource_missing") {
          console.error("[platform/subscriptions] Stripe cancel failed:", e);
          return res.status(502).json({
            error: `Stripe did not confirm the cancellation (${e?.message || "error"}). Nothing was changed; the company is still billed. Retry.`,
          });
        }
      }
    }
    if (company.payfast_subscription_token) {
      const merchantId = process.env.PAYFAST_PLATFORM_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID || "";
      const merchantKey = process.env.PAYFAST_PLATFORM_MERCHANT_KEY || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY || "";
      const passphrase = process.env.PAYFAST_PLATFORM_PASSPHRASE || process.env.PAYFAST_PASSPHRASE || "";
      if (!merchantId || !merchantKey || !passphrase) {
        return res.status(503).json({ error: "PayFast billing credentials are missing, so the PayFast agreement cannot be stopped. Nothing was changed." });
      }
      const svc = new PayFastService({ merchantId, merchantKey, passphrase,
        testMode: (process.env.PAYFAST_PLATFORM_TEST_MODE || process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE) === "true" });
      const ok = await svc.cancelSubscription(company.payfast_subscription_token);
      if (!ok) {
        return res.status(502).json({
          error: `PayFast did not confirm the cancellation.${stopped.length ? ` ${stopped.join(", ")} billing was already stopped.` : ""} The company was not marked cancelled - retry.`,
        });
      }
      stopped.push("PayFast");
    }

    // 2. Only now record the cancellation.
    const nowIso = new Date().toISOString();
    if ((renewing || []).length) {
      const { error } = await db.from("subscriptions").update({
        status: "cancelled", cancelled_at: nowIso, cancel_at_period_end: false, next_billing_date: null,
        cancellation_reason: "Cancelled by platform owner", updated_at: nowIso,
      }).in("id", (renewing || []).map((s: any) => s.id));
      if (error) throw error;
    }
    const { error: updateError } = await db.from("companies")
      .update({ subscription_status: "cancelled", subscription_ends_at: nowIso, updated_at: nowIso }).eq("id", companyId);
    if (updateError) throw updateError;

    return res.status(200).json({ ok: true, stopped });
  } catch (e: any) {
    console.error("[platform/subscriptions] failed:", e);
    return res.status(500).json({ error: e?.message || "Platform subscription action failed" });
  }
}

export default withApiLogging(handler);
