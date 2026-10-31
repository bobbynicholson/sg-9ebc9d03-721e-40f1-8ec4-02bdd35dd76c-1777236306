/**
 * DELETE /api/payment-gateways/[id]
 *
 * Soft-deletes the gateway via deleted_at. Frees the (company,
 * provider) slot so the operator can re-configure the same provider
 * from scratch with new credentials. If the deleted gateway was
 * active, no other row activates - the operator must explicitly
 * pick a replacement.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireActiveApiProfile } from "@/lib/requireActiveApiProfile";
import { getServiceSupabase } from "@/lib/supabase/service";
import { paymentGatewayService } from "@/services/paymentGatewayService";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";


const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const gatewayId = String(req.query.id || "");
    if (!gatewayId) return res.status(400).json({ error: "Gateway id is required" });

    const actor = await requireActiveApiProfile(req, res, ADMIN_ROLES);
    if (!actor) return;
    const { user, profile, role } = actor;

    // Super_admin may target any tenant via ?company_id=...
    let companyId = (profile as any)?.company_id as string | null;
    if (role === "super_admin") {
      const override = String(req.query.company_id || "").trim();
      if (override) companyId = override;
    }
    if (!companyId) {
      const msg = role === "super_admin"
        ? "company_id is required for super_admin"
        : "No company assigned to your profile";
      return res.status(400).json({ error: msg });
    }

    const sb = getServiceSupabase();
    const result = await paymentGatewayService.softDelete(companyId, gatewayId, user.id, sb);
    if (result.ok) {
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: result.error });
  } catch (e: any) {
    console.error("/api/payment-gateways/[id] DELETE crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Delete failed" });
  }
}

export default withApiLogging(handler);
