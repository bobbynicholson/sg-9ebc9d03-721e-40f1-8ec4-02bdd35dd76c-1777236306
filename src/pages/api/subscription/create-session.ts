/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/subscription/create-session
 *
 * Builds the PayFast SUBSCRIPTION (plan) checkout form SERVER-side and
 * returns the self-submitting HTML, mirroring how order/deposit payments
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
 * Returns: { ok: true, html } | { ok: false, error }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { PayFastService, getPlanById } from "@/lib/payfastService";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";

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
      .select("company_id, full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) {
      return res.status(400).json({ error: "Your account isn't linked to a company yet." });
    }

    const body = (req.body || {}) as any;
    const planId = String(body.planId || "");
    const cycle = body.cycle === "annual" ? "annual" : "monthly";
    const plan = getPlanById(planId);
    if (!plan) return res.status(400).json({ error: "Unknown plan." });

    // Platform PayFast credentials (server-only; never NEXT_PUBLIC for the
    // passphrase). Fall back to the NEXT_PUBLIC_* names so an existing
    // single-account setup keeps working.
    const merchantId = process.env.PAYFAST_PLATFORM_MERCHANT_ID || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_PLATFORM_MERCHANT_KEY || process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PLATFORM_PASSPHRASE || process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE || "";
    const testMode =
      (process.env.PAYFAST_PLATFORM_TEST_MODE || process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE) === "true";
    if (!merchantId || !merchantKey) {
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

    const svc = new PayFastService({ merchantId, merchantKey, passphrase, testMode });
    // custom_str1 = company_id (server-resolved) so the webhook flips the
    // right company to 'active'. custom_str2 = plan id, custom_str3 = cycle.
    const params = svc.createSubscriptionParams(
      plan,
      { firstName: firstName || "Customer", lastName, email, userId: companyId },
      cycle,
      baseUrl,
    );
    const html = svc.generatePaymentForm(params);

    return res.status(200).json({ ok: true, html });
  } catch (e: any) {
    console.error("/api/subscription/create-session crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Could not start checkout" });
  }
}

export default withApiLogging(handler);
