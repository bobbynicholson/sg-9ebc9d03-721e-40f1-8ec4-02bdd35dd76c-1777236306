/**
 * /api/booking-packages/[id] -- Wave 70.45b
 *
 * GET    -> fetch a single package with its linked orders.
 * PATCH  -> update metadata (name, notes, venue_summary, dates,
 *           primary client). Status changes go through dedicated
 *           cancel / link helpers so cascades fire.
 * DELETE -> soft-delete the package (orders detach but survive).
 *
 * Admin/owner only. Tenant-scoped: the package's company_id must
 * match the caller's profile.company_id (or caller is super_admin).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import {
  getPackage,
  updatePackage,
  deletePackage,
} from "@/services/booking/bookingPackageService";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const packageId = String(req.query.id || "");
    if (!packageId) return res.status(400).json({ error: "Package id is required" });

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
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    // Tenant gate -- read the package's company_id first so PATCH/DELETE
    // can't be used to mutate another tenant's data even if RLS were
    // mis-configured.
    const pkg = await getPackage(packageId, ssr);
    if (!pkg) return res.status(404).json({ error: "Package not found" });
    if (role !== "super_admin" && pkg.company_id !== callerCompanyId) {
      return res.status(403).json({ error: "Wrong company" });
    }

    if (req.method === "GET") {
      return res.status(200).json({ ok: true, package: pkg });
    }

    if (req.method === "PATCH") {
      const body = (req.body || {}) as any;
      const patch: any = {};
      if (body.name !== undefined) patch.name = String(body.name);
      if (body.notes !== undefined) patch.notes = body.notes;
      if (body.venue_summary !== undefined) patch.venue_summary = body.venue_summary;
      if (body.starts_at !== undefined) patch.starts_at = body.starts_at;
      if (body.ends_at !== undefined) patch.ends_at = body.ends_at;
      if (body.primary_client_id !== undefined) patch.primary_client_id = body.primary_client_id;
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No updatable fields supplied" });
      }
      const result = await updatePackage(packageId, patch, ssr);
      if (!result.ok) return res.status(500).json({ error: result.error || "Update failed" });
      const fresh = await getPackage(packageId, ssr);
      return res.status(200).json({ ok: true, package: fresh });
    }

    if (req.method === "DELETE") {
      const result = await deletePackage(packageId, ssr);
      if (!result.ok) return res.status(500).json({ error: result.error || "Delete failed" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[booking-packages/[id]] crashed:", err);
    return res.status(500).json({ error: err?.message || "Request failed" });
  }
}
