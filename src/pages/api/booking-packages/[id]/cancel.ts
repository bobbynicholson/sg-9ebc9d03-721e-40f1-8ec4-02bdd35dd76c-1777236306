/**
 * POST /api/booking-packages/[id]/cancel - Wave 70.45b
 *
 * Body: { reason: string }
 *
 * Cancels the entire package + cascades cancelOrder() to every linked,
 * non-terminal child order. Owner-only - a package cancel can fan out
 * to 3+ refunds in one shot, so we require an owner-tier role rather
 * than the broader admin set.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { cancelPackage, getPackage } from "@/services/booking/bookingPackageService";

const OWNER_ROLES = new Set(["super_admin", "company_admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const packageId = String(req.query.id || "");
    if (!packageId) return res.status(400).json({ error: "Package id is required" });

    const reason = String((req.body || {}).reason || "").trim();
    if (!reason) return res.status(400).json({ error: "Reason is required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    const callerCompanyId = (profile as any)?.company_id as string | null;
    if (!OWNER_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner-tier role required - package cancels cascade to every linked order." });
    }

    const pkg = await getPackage(packageId, ssr);
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    if (role !== "super_admin" && pkg.company_id !== callerCompanyId) {
      return res.status(403).json({ error: "Wrong company" });
    }
    if (pkg.status === "cancelled") {
      return res.status(409).json({ error: "Package is already cancelled" });
    }

    const result = await cancelPackage(packageId, reason, ssr, user.id);
    if (!result.ok) return res.status(500).json({ error: result.error || "Cancel failed" });
    return res.status(200).json({
      ok: true,
      orders_cancelled: result.ordersCancelled,
    });
  } catch (err: any) {
    console.error("[booking-packages/cancel] crashed:", err);
    return res.status(500).json({ error: err?.message || "Cancel failed" });
  }
}
