/**
 * POST /api/admin/inventory/draft-reorder
 *
 * Phase 5 #5: bundle every below-minimum inventory item into a
 * draft shopping list so shopping_staff has a one-click reorder
 * starting point instead of building the list ingredient-by-
 * ingredient. Doesn't auto-send anywhere - the operator still
 * reviews, picks supplier, adjusts qty, then assigns the list.
 *
 * Auth: shopping_staff / admin / owner in the tenant.
 *
 * Body: {}
 *
 * Returns: { list_id, item_count, items: [{ name, qty }] }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
  "shopping_staff",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Shopping / admin / owner only" });
    }
    const companyId = (profile as any)?.company_id;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    // Find every below-min inventory item. We compare against
    // minimum_stock and skip items with no minimum set (NULL) so a
    // tenant that hasn't configured pars yet doesn't get a draft
    // full of every item they own.
    const { data: lowStock, error } = await ssr
      .from("inventory_items")
      .select("id, item_name, unit_of_measure, current_stock, minimum_stock, reorder_quantity, preferred_supplier_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("minimum_stock", "is", null);
    if (error) return res.status(500).json({ error: error.message });

    const below = (lowStock || []).filter(
      (i: any) =>
        Number(i.current_stock || 0) <= Number(i.minimum_stock || 0) &&
        Number(i.minimum_stock || 0) > 0,
    );
    if (below.length === 0) {
      return res.status(200).json({ ok: true, item_count: 0, list_id: null, items: [] });
    }

    // Create the parent shopping_lists row. list_date = today; status
    // 'draft' so the operator can edit before assigning.
    const today = new Date().toISOString().slice(0, 10);
    const { data: list, error: listErr } = await ssr
      .from("shopping_lists")
      .insert({
        company_id: companyId,
        user_id: user.id,
        list_date: today,
        status: "draft",
        source: "low_stock_auto",
        notes: "Auto-drafted from below-minimum inventory items. Review supplier + quantity before assigning.",
      } as any)
      .select("id")
      .single();
    if (listErr) {
      console.error("[draft-reorder] list create failed:", listErr);
      return res.status(500).json({ error: listErr.message });
    }
    const listId = (list as any).id as string;

    // Items: prefer reorder_quantity when set, otherwise default to
    // 2x the minimum_stock so the operator at least starts above
    // par. Carry the inventory_item_id link so the receive-stock
    // flow can hydrate.
    const itemRows = below.map((i: any) => {
      const qty =
        Number(i.reorder_quantity || 0) > 0
          ? Number(i.reorder_quantity)
          : Math.max(1, Number(i.minimum_stock || 0) * 2 - Number(i.current_stock || 0));
      return {
        shopping_list_id: listId,
        inventory_item_id: i.id,
        item_name: i.item_name,
        quantity: qty,
        unit: i.unit_of_measure || null,
        supplier_id: i.preferred_supplier_id || null,
        status: "pending",
      };
    });

    const { error: itemsErr } = await ssr
      .from("shopping_list_items")
      .insert(itemRows as any);
    if (itemsErr) {
      // Roll back the list to keep things tidy.
      await ssr.from("shopping_lists").delete().eq("id", listId);
      console.error("[draft-reorder] items insert failed:", itemsErr);
      return res.status(500).json({ error: itemsErr.message });
    }

    // Audit trail.
    try {
      await ssr.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "shopping_list_drafted_from_low_stock",
        entity_type: "shopping_list",
        entity_id: listId,
        details: { item_count: itemRows.length },
      });
    } catch (auditErr) {
      console.warn("[draft-reorder] audit insert failed:", auditErr);
    }

    return res.status(200).json({
      ok: true,
      list_id: listId,
      item_count: itemRows.length,
      items: itemRows.map((r) => ({ name: r.item_name, qty: r.quantity, unit: r.unit })),
    });
  } catch (err: any) {
    console.error("[draft-reorder] crashed:", err);
    return res.status(500).json({ error: err?.message || "Draft failed" });
  }
}
