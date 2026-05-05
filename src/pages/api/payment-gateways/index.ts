/**
 * GET /api/payment-gateways
 *   Lists every non-deleted gateway for the caller's company.
 *   Returns metadata only -- credentials are never selected.
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

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
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
    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId) {
      return res.status(403).json({ error: "No company assigned" });
    }

    if (req.method === "GET") {
      // Browser-safe list: RLS keeps it scoped, credentials sibling
      // table is never selected here.
      const configs = await paymentGatewayService.list(companyId, ssr);
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
      // Coerce values to strings -- avoids storing junk like nested
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
      if (!result.ok) {
        return res.status(500).json({ error: result.error });
      }
      return res.status(200).json({ ok: true, gateway: result.gateway });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("/api/payment-gateways crashed:", e);
    return res.status(500).json({ error: e?.message || "Payment gateway endpoint failed" });
  }
}
