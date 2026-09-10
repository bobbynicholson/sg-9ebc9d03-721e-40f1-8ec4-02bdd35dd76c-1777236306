/**
 * POST /api/booking-packages/[id]/unlink - Wave 70.45b
 *
 * Body: { order_id: string }
 *
 * Detaches an order from this package. Order becomes standalone again.
 * Does NOT auto-delete the package even if it ends up with zero orders
 * - operator may want to relink other orders later.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { unlinkOrderFromPackage, getPackage } from "@/services/booking/bookingPackageService";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
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

    // Confirm the order actually belongs to this package before
    // detaching - prevents an accidental detach of an order linked to
    // a different package (which the body could otherwise force).
    const { data: order } = await ssr
      .from("orders")
      .select("id, package_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return res.status(404).json({ error: "Order not found" });
    if ((order as any).package_id !== packageId) {
      return res.status(400).json({ error: "Order is not linked to this package" });
    }

    const result = await unlinkOrderFromPackage(orderId, ssr);
    if (!result.ok) return res.status(500).json({ error: result.error || "Unlink failed" });

    const fresh = await getPackage(packageId, ssr);
    return res.status(200).json({ ok: true, package: fresh });
  } catch (err: any) {
    console.error("[booking-packages/unlink] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Unlink failed" });
  }
}

export default withApiLogging(handler);
