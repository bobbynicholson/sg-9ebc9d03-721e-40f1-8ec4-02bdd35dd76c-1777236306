/**
 * GET /api/booking-packages/available-orders - PKG-B (packages audit, PKG-2).
 *
 * Returns orders eligible to be linked into a booking package for the
 * caller's company. Eligibility = same company, not soft-deleted, not
 * already in a package, not cancelled.
 *
 * Replaces the UUID-paste dialog on the package detail page with a
 * searchable picker. The pre-PKG-B UX asked the operator to paste an
 * order UUID, which no real operator was going to do.
 *
 * Query:
 *   ?q=<free text> - matches order_number, client_name, event_name
 *   ?limit=<n>     - default 20, capped at 50
 *
 * Admin/owner only. Tenant-scoped via the caller's profile.company_id.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

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

    const q = String(req.query.q || "").trim();
    const limitRaw = parseInt(String(req.query.limit || "20"), 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 50);

    let query = (ssr as any)
      .from("orders")
      .select("id, order_number, client_name, event_name, event_date, event_time, guest_count, total_amount, status")
      .eq("company_id", companyId)
      .is("package_id", null)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("event_date", { ascending: false, nullsFirst: false })
      .limit(limit);

    // Free-text filter across the three columns operators are most
    // likely to recall. ILIKE keeps it case-insensitive; the % wraps
    // make it a contains match.
    if (q) {
      const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      query = query.or(
        `order_number.ilike.${pattern},client_name.ilike.${pattern},event_name.ilike.${pattern}`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("[booking-packages/available-orders] query failed:", error);
      return res.status(500).json({ error: error.message || "Query failed" });
    }

    return res.status(200).json({ ok: true, orders: data || [] });
  } catch (err: any) {
    console.error("[booking-packages/available-orders] crashed:", err);
    return res.status(500).json({ error: err?.message || "Request failed" });
  }
}
