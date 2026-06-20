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
    const companyId = order.company_id;

    // --- Tenant catalogues (active only) -----------------------------
    const [{ data: menuRows }, { data: equipRows }] = await Promise.all([
      sb
        .from("menu_items")
        .select("id, item_name, base_price, category, dietary_tags")
        .eq("company_id", companyId)
        .eq("is_available", true)
        .is("deleted_at", null)
        .order("item_name", { ascending: true }),
      sb
        .from("equipment")
        .select("id, name, rental_price, category, available_quantity")
        .eq("company_id", companyId)
        .eq("is_available", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
    ]);

    const menu_catalogue = ((menuRows || []) as any[]).map((m) => ({
      menu_item_id: m.id,
      item_name: m.item_name,
      unit_price: Number(m.base_price) || 0,
      category: m.category || null,
      dietary_tags: m.dietary_tags || null,
    }));
    const equipment_catalogue = ((equipRows || []) as any[]).map((e) => ({
      equipment_id: e.id,
      name: e.name,
      unit_price: Number(e.rental_price) || 0,
      category: e.category || null,
      available_quantity: Number(e.available_quantity) || 0,
    }));

    // --- Order's current lines ---------------------------------------
    const { data: itemRows } = await sb
      .from("order_items")
      .select("menu_item_id, item_name, quantity, unit_price, line_total")
      .eq("order_id", order_id);
    const current_menu = ((itemRows || []) as any[]).map((it) => ({
      menu_item_id: it.menu_item_id || null,
      item_name: it.item_name,
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      line_total: Number(it.line_total) || 0,
    }));

    // Current equipment: booked (non-cancelled) lines joined to the
    // catalogue for name/price the bookings row doesn't carry.
    const { data: bookingRows } = await sb
      .from("equipment_bookings")
      .select("equipment_id, quantity, status")
      .eq("order_id", order_id)
      .neq("status", "cancelled");
    const bookedIds = Array.from(
      new Set(((bookingRows || []) as any[]).map((b) => b.equipment_id).filter(Boolean)),
    );
    const equipNameById = new Map<string, { name: string; unit_price: number }>();
    if (bookedIds.length > 0) {
      const { data: eqRows } = await sb
        .from("equipment")
        .select("id, name, rental_price")
        .in("id", bookedIds);
      for (const e of (eqRows || []) as any[]) {
        equipNameById.set(e.id, { name: e.name, unit_price: Number(e.rental_price) || 0 });
      }
    }
    const current_equipment = ((bookingRows || []) as any[]).map((b) => {
      const meta = equipNameById.get(b.equipment_id) || { name: "Equipment", unit_price: 0 };
      return {
        equipment_id: b.equipment_id,
        name: meta.name,
        quantity: Number(b.quantity) || 0,
        unit_price: meta.unit_price,
      };
    });

    // Effective VAT rate so the editor's live total preview matches what
    // the approve-cascade will compute (subtotal -> tax -> total). Derive
    // from the order's own numbers; fall back to 15% (SA standard).
    const subtotal = Number(order.subtotal) || 0;
    const taxAmount = Number(order.tax_amount ?? order.tax) || 0;
    const tax_rate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 10000 : 0.15;

    return res.status(200).json({
      ok: true,
      currency: order.currency || "ZAR",
      guest_count: Number(order.guest_count) || 0,
      delivery_fee: Number(order.delivery_fee) || 0,
      discount_amount: Number(order.discount_amount) || 0,
      // Current authoritative total + subtotal so the editor can derive a
      // self-calibrating "estimated new total": ratio = order_total /
      // (current menu sum + delivery), then new estimate scales with the
      // edited menu. Starts EXACTLY at order_total when nothing changed,
      // so the client never sees an inconsistent jump.
      order_total: Number(order.total_amount) || 0,
      order_subtotal: subtotal,
      tax_rate,
      menu_catalogue,
      equipment_catalogue,
      current_menu,
      current_equipment,
    });
  } catch (e: any) {
    console.error("[order-edit-data] crashed:", e);
    return res.status(500).json({ error: e?.message || "Failed to load editor data" });
  }
}

export default withApiLogging(handler);
