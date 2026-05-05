/**
 * DELETE /api/payment-gateways/[id]
 *
 * Soft-deletes the gateway via deleted_at. Frees the (company,
 * provider) slot so the operator can re-configure the same provider
 * from scratch with new credentials. If the deleted gateway was
 * active, no other row activates -- the operator must explicitly
 * pick a replacement.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentGatewayService } from "@/services/paymentGatewayService";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
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
    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "No company assigned" });

    const sb = getServiceSupabase();
    const result = await paymentGatewayService.softDelete(companyId, gatewayId, user.id, sb);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("/api/payment-gateways/[id] DELETE crashed:", e);
    return res.status(500).json({ error: e?.message || "Delete failed" });
  }
}
