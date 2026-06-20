/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/orders/[id]/edit-data
 *
 * Session-auth sibling of /api/client-tokens/order-edit-data. Feeds the
 * SAME OrderEditDialog on the logged-in client portal (my-orders), so the
 * authed surface gets the full editor (menu / equipment / guests / venue /
 * timing) instead of the old guest-count+venue+notes stub. Ownership is
 * verified the same way /api/orders/amendment-request does it (linked
 * client OR admin in the company); the catalogue reads then run under the
 * service client so tenant-table RLS doesn't hide the menu/equipment.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildOrderEditData } from "@/services/order/orderEditData";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "").trim();
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return res.status(400).json({ error: "valid order id required" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to edit this order" });

    const { data: order, error: orderErr } = await ssr
      .from("orders")
      .select("id, company_id, client_id, guest_count, delivery_fee, discount_amount, total_amount, subtotal, tax_amount, tax, currency, status, deleted_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) console.error("[orders/edit-data] order fetch failed:", orderErr);
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Ownership: linked client OR admin/owner in the same company.
    // Mirrors /api/orders/amendment-request so the two stay in lockstep.
    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id, email")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    const isAdminInCompany =
      ["super_admin", "company_admin", "admin", "owner"].includes(role) &&
      (profile as any)?.company_id === (order as any).company_id;

    let isLinkedClient = false;
    if (!isAdminInCompany && (order as any).client_id) {
      const { data: clientRow } = await ssr
        .from("clients")
        .select("id, user_id, email")
        .eq("id", (order as any).client_id)
        .maybeSingle();
      if (clientRow) {
        const cr = clientRow as any;
        const userEmail = (user.email || (profile as any)?.email || "").toLowerCase().trim();
        const clientEmail = (cr.email || "").toLowerCase().trim();
        isLinkedClient =
          (cr.user_id && cr.user_id === user.id) ||
          (!!userEmail && !!clientEmail && userEmail === clientEmail);
      }
    }
    if (!isAdminInCompany && !isLinkedClient) {
      return res.status(403).json({ error: "Not allowed to edit this order" });
    }

    // Catalogue reads under service role (tenant tables aren't readable
    // by a client session under RLS).
    const payload = await buildOrderEditData(getServiceSupabase(), order as any);
    return res.status(200).json(payload);
  } catch (e: any) {
    console.error("[orders/edit-data] crashed:", e);
    return res.status(500).json({ error: e?.message || "Failed to load editor data" });
  }
}

export default withApiLogging(handler);
