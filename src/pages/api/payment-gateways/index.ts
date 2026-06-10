/**
 * GET /api/payment-gateways
 *   Lists every non-deleted gateway for the caller's company.
 *   Returns metadata only - credentials are never selected.
 *
 * POST /api/payment-gateways
 *   Upserts (provider, metadata, credentials) for the caller's company.
 *   Requires admin / company_admin / owner / super_admin within the
 *   tenant. Service-role client used for the credentials table write
 *   (RLS denies authenticated access to that table by design).
 *
 * Body:
 *   {
 *     provider: 'payfast'|'yoco'|'peach',
 *     is_test:  boolean,
 *     success_url?: string|null,
 *     cancel_url?:  string|null,
 *     notify_url?:  string|null,
 *     credentials:  { [key: string]: string }
 *   }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  paymentGatewayService,
  PAYMENT_GATEWAY_PROVIDERS,
  type PaymentGatewayProvider,
} from "@/services/paymentGatewayService";
import { withApiLogging } from "@/lib/withApiLogging";


const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[payment-gateways/index] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    // Resolve which company we're acting on. Tenant admins are scoped
    // to their own profile.company_id. Super_admin has no company on
    // their profile - they pass company_id via ?company_id=... (GET)
    // or body.company_id (POST) to act on a specific tenant.
    let companyId = (profile as any)?.company_id as string | null;
    if (role === "super_admin") {
      const override = String(
        (req.method === "GET" ? req.query.company_id : (req.body as any)?.company_id) || "",
      ).trim();
      if (override) companyId = override;
    }
    if (!companyId) {
      const msg = role === "super_admin"
        ? "company_id is required for super_admin"
        : "No company assigned to your profile";
      return res.status(400).json({ error: msg });
    }

    if (req.method === "GET") {
      // Use the enriched server-only method so each gateway returns
      // last-4 hints for its credentials. Real values stay on the
      // server - the hints field is a display string only.
      const sb = getServiceSupabase();
      const configs = await paymentGatewayService.listWithCredentialHints(companyId, sb);
      return res.status(200).json({ gateways: configs });
    }

    if (req.method === "POST") {
      const body = (req.body || {}) as any;
      const provider = String(body.provider || "") as PaymentGatewayProvider;
      if (!PAYMENT_GATEWAY_PROVIDERS.includes(provider)) {
        return res.status(400).json({ error: "Unsupported provider" });
      }
      const credentials = body.credentials;
      if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
        return res.status(400).json({ error: "credentials object is required" });
      }
      // Coerce values to strings - avoids storing junk like nested
      // objects or numbers in the JSONB blob.
      const cleanCreds: Record<string, string> = {};
      for (const [k, v] of Object.entries(credentials)) {
        if (typeof v === "string" && v.trim().length > 0) cleanCreds[k] = v;
      }
      if (Object.keys(cleanCreds).length === 0) {
        return res.status(400).json({ error: "At least one credential field is required" });
      }

      const sb = getServiceSupabase();
      const result = await paymentGatewayService.upsertWithCredentials(
        companyId,
        user.id,
        {
          provider,
          is_test: body.is_test === false ? false : true,
          success_url: body.success_url ?? null,
          cancel_url: body.cancel_url ?? null,
          notify_url: body.notify_url ?? null,
          credentials: cleanCreds,
        },
        sb,
      );
      if (result.ok) {
        return res.status(200).json({ ok: true, gateway: result.gateway });
      }
      return res.status(500).json({ error: result.error });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("/api/payment-gateways crashed:", e);
    return res.status(500).json({ error: e?.message || "Payment gateway endpoint failed" });
  }
}

export default withApiLogging(handler);
