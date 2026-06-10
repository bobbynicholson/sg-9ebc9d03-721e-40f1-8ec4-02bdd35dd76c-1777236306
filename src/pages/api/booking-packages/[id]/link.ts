/**
 * POST /api/booking-packages/[id]/link - Wave 70.45b
 *
 * Body: { order_id: string }
 *
 * Links an existing order to this package. Idempotent. Promotes the
 * package from draft -> active on first link. Tenant-scoped on both
 * the package AND the order (an order can only be linked to a package
 * in the same company).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { linkOrderToPackage, getPackage } from "@/services/booking/bookingPackageService";
import { withApiLogging } from "@/lib/withApiLogging";


const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const packageId = String(req.query.id || "");
    if (!packageId) return res.status(400).json({ error: "Package id is required" });

    const orderId = String((req.body || {}).order_id || "");
    if (!orderId) return res.status(400).json({ error: "order_id is required" });

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
    if (!ADMIN_ROLES.has(role)) return res.status(403).json({ error: "Admin or owner only" });

    const pkg = await getPackage(packageId, ssr);
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    if (role !== "super_admin" && pkg.company_id !== callerCompanyId) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Order tenant gate: must belong to the same company as the package.
    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, deleted_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }
    if ((order as any).company_id !== pkg.company_id) {
      return res.status(400).json({ error: "Order and package belong to different companies" });
    }

    const result = await linkOrderToPackage(orderId, packageId, ssr);
    if (!result.ok) return res.status(500).json({ error: result.error || "Link failed" });

    const fresh = await getPackage(packageId, ssr);
    return res.status(200).json({ ok: true, package: fresh });
  } catch (err: any) {
    console.error("[booking-packages/link] crashed:", err);
    return res.status(500).json({ error: err?.message || "Link failed" });
  }
}

export default withApiLogging(handler);
