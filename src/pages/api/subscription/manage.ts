import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { PayFastService } from "@/lib/payfastService";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const client = createPagesServerClient({ req, res });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to manage billing." });
    const { data: profile } = await client.from("profiles").select("company_id, role").eq("id", user.id).single();
    if (!profile?.company_id || !["owner", "company_admin", "admin", "super_admin"].includes(profile.role || "")) {
      return res.status(403).json({ error: "Only company administrators can manage billing." });
    }
    const db = getServiceSupabase();
    const { data: subscription, error } = await db.from("subscriptions").select("*")
      .eq("id", String(req.body?.subscriptionId || "")).eq("company_id", profile.company_id).single();
    if (error || !subscription) return res.status(404).json({ error: "Subscription not found." });
    const { data: company } = await db.from("companies").select("payfast_subscription_token")
      .eq("id", profile.company_id).single();
    if (!company?.payfast_subscription_token) return res.status(409).json({ error: "This subscription is not linked to PayFast." });
    const merchantId = process.env.PAYFAST_PLATFORM_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID || "";
    const merchantKey = process.env.PAYFAST_PLATFORM_MERCHANT_KEY || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY || "";
    const passphrase = process.env.PAYFAST_PLATFORM_PASSPHRASE || process.env.PAYFAST_PASSPHRASE || "";
    if (!merchantId || !merchantKey || !passphrase) return res.status(503).json({ error: "PayFast billing is not configured." });
    const svc = new PayFastService({ merchantId, merchantKey, passphrase,
      testMode: (process.env.PAYFAST_PLATFORM_TEST_MODE || process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE) === "true" });
    const action = req.body?.action;
    if (!["cancel", "resume"].includes(action)) return res.status(400).json({ error: "Unknown billing action." });
    const immediate = req.body?.immediate === true;
    if (action === "resume" && (subscription.status === "cancelled" || subscription.cancel_at_period_end)) {
      return res.status(409).json({ error: "A cancelled PayFast agreement requires a new checkout." });
    }
    const token = company.payfast_subscription_token;
    const ok = action === "resume" ? await svc.unpauseSubscription(token)
      : await svc.cancelSubscription(token);
    if (!ok) return res.status(502).json({ error: "PayFast did not confirm the billing change. Please retry." });
    const status = action === "cancel" && immediate ? "cancelled" : subscription.status;
    const { data: updated, error: updateError } = await db.from("subscriptions").update({
      status, cancel_at_period_end: action === "cancel" && !immediate,
      cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
      cancellation_reason: action === "cancel" ? String(req.body?.reason || "") : null,
      cancellation_feedback: action === "cancel" ? String(req.body?.feedback || "") : null,
      updated_at: new Date().toISOString(),
    }).eq("id", subscription.id).select("*").single();
    if (updateError) throw updateError;
    if (status === "cancelled") {
      const { error: companyError } = await db.from("companies").update({ subscription_status: "cancelled" }).eq("id", profile.company_id);
      if (companyError) throw companyError;
    }
    return res.status(200).json({ ok: true, subscription: updated });
  } catch (error) {
    console.error("PayFast subscription management failed", error);
    return res.status(500).json({ error: "Could not save billing change. Retry or contact support." });
  }
}
export default withApiLogging(handler);
