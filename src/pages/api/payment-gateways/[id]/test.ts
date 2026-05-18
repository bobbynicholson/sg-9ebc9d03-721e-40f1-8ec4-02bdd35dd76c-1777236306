/**
 * POST /api/payment-gateways/[id]/test
 *
 * "Test connection" ping for a tenant's saved gateway. Reads the
 * credentials via service-role Supabase, hands off to the right
 * provider lib, and stamps `last_verified_at` on success so the admin
 * UI can show when the operator last confirmed the keys work.
 *
 * Failure is NOT fatal - we return ok:false plus the provider error
 * so the operator sees what happened, and we DON'T touch
 * last_verified_at on a failed ping.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentGatewayService } from "@/services/paymentGatewayService";
import { pingPayFastCredentials } from "@/lib/payfastService";
import { pingYocoCredentials } from "@/lib/yocoService";
import { pingStripeCredentials } from "@/lib/stripeService";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const gatewayId = String(req.query.id || "");
    if (!gatewayId) return res.status(400).json({ error: "Gateway id is required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    let companyId = (profile as any)?.company_id as string | null;
    if (role === "super_admin") {
      const override = String(req.query.company_id || "").trim();
      if (override) companyId = override;
    }
    if (!companyId) {
      return res.status(400).json({ error: "company_id is required" });
    }

    const sb = getServiceSupabase();
    const found = await paymentGatewayService.getByIdWithCredentials(gatewayId, sb);
    if (!found || found.gateway.company_id !== companyId) {
      return res.status(404).json({ error: "Gateway not found for this company" });
    }

    const provider = found.gateway.provider;
    const creds = found.credentials;
    let result: { ok: boolean; message?: string };

    if (provider === "payfast") {
      result = pingPayFastCredentials({
        merchantId: creds.merchantId || "",
        merchantKey: creds.merchantKey || "",
        passphrase: creds.passphrase || "",
      });
    } else if (provider === "yoco") {
      const ping = await pingYocoCredentials(creds.secretKey || "");
      result = { ok: ping.ok, message: ping.message };
    } else if (provider === "stripe") {
      result = await pingStripeCredentials(creds.secretKey || "");
    } else {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    if (result.ok) {
      const stamp = await paymentGatewayService.markVerified(gatewayId, sb);
      return res.status(200).json({
        ok: true,
        provider,
        verified_at: stamp.verified_at,
      });
    }
    return res.status(200).json({
      ok: false,
      provider,
      message: result.message || "Test failed",
    });
  } catch (e: any) {
    console.error("/api/payment-gateways/[id]/test crashed:", e);
    return res.status(500).json({ error: e?.message || "Test connection failed" });
  }
}
