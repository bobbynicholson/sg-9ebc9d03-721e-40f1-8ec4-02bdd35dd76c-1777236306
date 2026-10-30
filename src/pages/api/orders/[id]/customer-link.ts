/**
 * POST /api/orders/[id]/customer-link
 *
 * Mints a client_access_token for an order so a customer email or
 * WhatsApp sent from the browser (driver "on the way", invoice emails,
 * post-order steps) carries a link that opens the order directly.
 *
 * mint_client_order_token is no longer executable by signed-in users
 * (20261029140000): a link is a grant of access, so it is minted here
 * only after checking the caller is active staff of the order's company.
 * Returns { token }; the caller builds the URL (customerLinksServer).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return res.status(400).json({ error: "Order id is required" });
    const rawLabel = typeof req.body?.label === "string" ? req.body.label : "";
    const label = rawLabel.replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 60) || "browser-link";

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, company_id, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.is_active === false || profile.deleted_at || profile.role === "client") {
      return res.status(403).json({ error: "Staff only" });
    }

    const admin = getServiceSupabase();
    const { data: order } = await admin
      .from("orders")
      .select("id, company_id, deleted_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || (order as any).deleted_at) return res.status(404).json({ error: "Order not found" });
    if (profile.role !== "super_admin" && profile.company_id !== (order as any).company_id) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { data: tokenRow, error } = await admin.rpc("mint_client_order_token", {
      p_company_id: (order as any).company_id,
      p_order_id: orderId,
      p_label: label,
    });
    const token = (tokenRow as any)?.raw_token;
    if (error || !token) return res.status(500).json({ error: "Link could not be created" });
    return res.status(200).json({ token });
  } catch (err) {
    console.error("[orders/customer-link] failed:", err);
    return res.status(500).json({ error: "Link could not be created" });
  }
}

export default withApiLogging(handler);
