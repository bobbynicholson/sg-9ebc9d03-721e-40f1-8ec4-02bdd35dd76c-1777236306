/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/client-tokens/order-edit-data
 *
 * Feeds the client-facing order editor on /c/order/[id]. Returns, under
 * the same per-order token-bearer auth as amend-order / cancel-order:
 *
 *   - menu_catalogue:      the tenant's active menu items (id, name,
 *                          price, category) so the client can ADD dishes.
 *   - equipment_catalogue: the tenant's available equipment (id, name,
 *                          price, category) so the client can ADD kit.
 *   - current_menu:        the order's live menu lines (from order_items,
 *                          the authoritative line-item layer) pre-resolved
 *                          with menu_item_id so the editor can prefill +
 *                          the amend cascade can re-snapshot cost.
 *   - current_equipment:   the order's live equipment lines (from
 *                          equipment_bookings joined to equipment) so the
 *                          editor can prefill quantities + names.
 *
 * The editor turns these into a proposed_changes payload it POSTs to
 * /api/client-tokens/amend-order. We deliberately keep the catalogue
 * read here (not in client_view_order) so the heavyweight RPC stays lean
 * and only the editor pays for the catalogue fetch.
 *
 * Body: { order_id }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const order_id = String(body.order_id || "").trim();
    if (!order_id || !/^[0-9a-f-]{36}$/i.test(order_id)) {
      return res.status(400).json({ error: "valid order_id required" });
    }

    // Same token-bearer auth surface as amend-order: the per-order cookie
    // (or the account-scope cookie) set by /api/client-tokens/validate.
    const cookieName = `cms_client_token_${order_id}`;
    const tokenHash = (
      req.cookies?.[cookieName] ||
      req.cookies?.cms_client_account_token ||
      ""
    ).trim();
    if (!tokenHash) {
      return res.status(401).json({ error: "Open the order link from your email first" });
    }

    const sb = getServiceSupabase();

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.socket as any)?.remoteAddress ||
      null;
    const ua = (req.headers["user-agent"] as string) || null;

    // Validate the token against THIS order; reuse the same RPC the rest
    // of the token-bearer flow trusts so tenant + email scoping is honoured.
    const { data: viewData, error: viewErr } = await (sb as any).rpc("client_view_order", {
      p_token_hash: tokenHash,
      p_order_id: order_id,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (viewErr) {
      console.error("[order-edit-data] view RPC failed:", viewErr);
      return res.status(500).json({ error: "Lookup failed" });
    }
    const view: any = viewData;
    if (!view?.ok) {
      return res.status(401).json({ error: view?.code || "invalid_token" });
    }
    const order: any = view.order;

    const { buildOrderEditData } = await import("@/services/order/orderEditData");
    const payload = await buildOrderEditData(sb, order);
    return res.status(200).json(payload);
  } catch (e: any) {
    console.error("[order-edit-data] crashed:", e);
    return res.status(500).json({ error: e?.message || "Failed to load editor data" });
  }
}

export default withApiLogging(handler);
