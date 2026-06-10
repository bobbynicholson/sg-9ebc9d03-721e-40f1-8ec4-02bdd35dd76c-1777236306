/**
 * /api/booking-packages - Wave 70.45b
 *
 * GET  -> list all packages for the caller's company (optional ?status=
 *         filter, comma-separated).
 * POST -> create a fresh package in draft status. Orders are linked
 *         separately via /api/booking-packages/[id]/link.
 *
 * Admin/owner only. Tenant-scoped via the caller's profile.company_id.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { createPackage, listPackages, type BookingPackageStatus } from "@/services/booking/bookingPackageService";
import { withApiLogging } from "@/lib/withApiLogging";


const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const companyId = (profile as any)?.company_id as string | null;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    if (req.method === "GET") {
      const statusParam = String(req.query.status || "").trim();
      const status = statusParam
        ? (statusParam.split(",").map((s) => s.trim()).filter(Boolean) as BookingPackageStatus[])
        : undefined;
      const packages = await listPackages(companyId, { status }, ssr);
      return res.status(200).json({ ok: true, packages });
    }

    if (req.method === "POST") {
      const body = (req.body || {}) as any;
      const name = String(body.name || "").trim();
      if (!name) return res.status(400).json({ error: "Name is required" });

      const result = await createPackage(
        {
          company_id: companyId,
          name,
          primary_client_id: body.primary_client_id ?? null,
          venue_summary: body.venue_summary ?? null,
          starts_at: body.starts_at ?? null,
          ends_at: body.ends_at ?? null,
          notes: body.notes ?? null,
          created_by: user.id,
        },
        ssr,
      );
      if (!result.ok) return res.status(500).json({ error: result.error || "Create failed" });
      return res.status(200).json({ ok: true, package: result.package });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[booking-packages] crashed:", err);
    return res.status(500).json({ error: err?.message || "Request failed" });
  }
}

export default withApiLogging(handler);
