/**
 * POST /api/orders/[id]/preview-as-client
 *
 * Admin-side helper that mints a fresh client_access_token for an
 * order and returns the public /c/order/{id}?t={token} URL. Used
 * by the "View as client sees it" button in the admin order modal
 * so the operator can sanity-check what the customer is seeing
 * after an inline edit.
 *
 * Auth: admin/owner of the order's company. Tokens auto-expire in
 * 60 days (per mint_client_order_token RPC) so this is safe to
 * spam without leaking access.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    if (!orderId) return res.status(400).json({ error: "Order id is required" });

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

    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, deleted_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (order as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // TIGHTEN I.115: also resolve the tenant slug so the returned URL
    // is /{slug}/c/order/{id}?t=... - matches the rest of the
    // customer-facing surface and routes through the tenant rewrite
    // chain in production.
    const { data: companyRow } = await ssr
      .from("companies")
      .select("slug")
      .eq("id", (order as any).company_id)
      .maybeSingle();
    const slug = (companyRow as any)?.slug
      ? String((companyRow as any).slug).trim()
      : null;

    const { data: tokenRow, error: mintErr } = await ssr.rpc("mint_client_order_token", {
      p_company_id: (order as any).company_id,
      p_order_id: orderId,
      p_label: `admin-preview-${user.id.slice(0, 8)}`,
    });
    if (mintErr) return res.status(500).json({ error: dbErrorMessage(mintErr) });

    const raw = (tokenRow as any)?.raw_token;
    if (!raw) return res.status(500).json({ error: "Token mint failed" });

    const slugSeg = slug ? `/${slug.replace(/^\/+|\/+$/g, "")}` : "";
    return res.status(200).json({
      ok: true,
      url: `${slugSeg}/c/order/${orderId}?t=${raw}`,
    });
  } catch (err: any) {
    console.error("[orders/preview-as-client] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Preview link failed" });
  }
}

export default withApiLogging(handler);
