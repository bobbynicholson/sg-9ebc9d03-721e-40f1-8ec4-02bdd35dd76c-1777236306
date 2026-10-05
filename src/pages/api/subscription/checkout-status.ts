/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/subscription/checkout-status { checkout_id }
 *
 * Status of a Stripe/Yoco plan checkout for the return page. A browser
 * return is not proof of payment:
 *   Stripe - we ask Stripe directly (throttled), so a late or missing
 *            webhook does not leave a paid company locked out.
 *   Yoco   - Yoco has no checkout lookup API; the signed webhook is the
 *            only evidence, so this just reports the saved state.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { confirmStripePlanCheckout } from "@/services/platformPlanBilling";
import { withApiLogging } from "@/lib/withApiLogging";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const checkoutId = String(req.body?.checkout_id || "").trim();
  if (!UUID.test(checkoutId)) return res.status(400).json({ error: "Invalid checkout reference" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to check this payment." });
    const { data: profile, error: profileError } = await ssr.from("profiles")
      .select("company_id").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;

    const admin: any = getServiceSupabase();
    const { data: checkout, error } = await admin.from("platform_subscription_checkouts")
      .select("*").eq("id", checkoutId).maybeSingle();
    if (error) throw error;
    if (!checkout || checkout.company_id !== (profile as any)?.company_id) {
      return res.status(404).json({ error: "Checkout not found" });
    }

    let status = checkout.status as string;
    const lastChecked = checkout.last_checked_at ? new Date(checkout.last_checked_at).getTime() : 0;
    if (status === "pending" && checkout.provider === "stripe" && Date.now() - lastChecked > 8000) {
      try {
        status = await confirmStripePlanCheckout(admin, checkout);
      } catch (providerError) {
        // Fall back to the webhook; never report a failure we did not see.
        console.warn("[subscription/checkout-status] Stripe check failed:", providerError);
        await admin.from("platform_subscription_checkouts")
          .update({ last_checked_at: new Date().toISOString() }).eq("id", checkout.id);
      }
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      status,
      provider: checkout.provider,
      periodEnd: checkout.period_end || null,
      failureReason: status === "failed" ? checkout.failure_reason || null : null,
    });
  } catch (e: any) {
    console.error("[subscription/checkout-status] failed:", e);
    return res.status(500).json({ error: "Could not check the payment status. Please retry shortly." });
  }
}

export default withApiLogging(handler);
