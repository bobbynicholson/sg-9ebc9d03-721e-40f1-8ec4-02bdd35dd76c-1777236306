/**
 * POST /api/payment-gateways/[id]/activate
 *
 * Atomically activates one gateway and deactivates all siblings for
 * the caller's company. The DB partial unique index enforces
 * one-active-per-company; this route deactivates first, then
 * activates the chosen one to clear the constraint.
 *
 * Auth: admin / company_admin / owner / super_admin within the
 * tenant. Tenant scope enforced both by profile.company_id and the
 * service's belt-and-braces lookup.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentGatewayService } from "@/services/paymentGatewayService";

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

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[payment-gateways/[id]/activate] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    // Super_admin may target any tenant via ?company_id=... or body.company_id;
    // tenant admins are pinned to their profile.company_id.
    let companyId = (profile as any)?.company_id as string | null;
    if (role === "super_admin") {
      const override = String(
        req.query.company_id || (req.body as any)?.company_id || "",
      ).trim();
      if (override) companyId = override;
    }
    if (!companyId) {
      const msg = role === "super_admin"
        ? "company_id is required for super_admin"
        : "No company assigned to your profile";
      return res.status(400).json({ error: msg });
    }

    const sb = getServiceSupabase();
    const result = await paymentGatewayService.activate(companyId, gatewayId, user.id, sb);
    // Invert the check so TS narrows result on the failure branch.
    // `if (!result.ok)` doesn't always narrow when the union is read
    // through the service module boundary - early-return on success
    // and the rest of the function sees the failure shape cleanly.
    if (result.ok) {
      return res.status(200).json({ ok: true, gateway: result.gateway });
    }
    return res.status(400).json({ error: result.error });
  } catch (e: any) {
    console.error("/api/payment-gateways/[id]/activate crashed:", e);
    return res.status(500).json({ error: e?.message || "Activate failed" });
  }
}
