/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getRequestSupabase } from "@/lib/supabase/service";
import { applyCorsHeaders, isUuid } from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";

/**
 * GET /api/public/quotes/[token]/catalogue
 *
 * Public, token-scoped. Feeds the "Request changes" item editor on the
 * public quote view (/q/[token]) so the client can ADD dishes / equipment
 * on top of the lines already on the quote (which the page already holds
 * client-side from fetchByToken). Mirrors the catalogue half of
 * buildOrderEditData, but resolves the company from the quote's
 * public_token instead of a logged-in session - the token IS the auth.
 *
 * Returns:
 *   - menu_catalogue:      active, non-deleted menu items for the tenant
 *   - equipment_catalogue: available, non-deleted equipment for the tenant
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, error: "Not found" });

  const supabase = await getRequestSupabase();

  // Resolve the company via the quote token. company_id is derived
  // server-side, never trusted from the caller.
  const { data: quote, error: quoteErr } = await (supabase as any)
    .from("quotes")
    .select("id, company_id, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  if (quoteErr) {
    console.error("[public/quotes/[token]/catalogue] quote fetch failed:", quoteErr);
    return res.status(500).json({ ok: false, error: "Lookup failed" });
  }
  if (!quote || quote.deleted_at) {
    return res.status(404).json({ ok: false, error: "Quote not found" });
  }

  const companyId = quote.company_id;
  const [{ data: menuRows }, { data: equipRows }] = await Promise.all([
    (supabase as any)
      .from("menu_items")
      .select("id, item_name, base_price, category")
      .eq("company_id", companyId)
      .eq("is_available", true)
      .is("deleted_at", null)
      .order("item_name", { ascending: true }),
    (supabase as any)
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
  }));
  const equipment_catalogue = ((equipRows || []) as any[]).map((e) => ({
    equipment_id: e.id,
    name: e.name,
    unit_price: Number(e.rental_price) || 0,
    category: e.category || null,
    available_quantity: Number(e.available_quantity) || 0,
  }));

  return res.status(200).json({ ok: true, menu_catalogue, equipment_catalogue });
}

export default withApiLogging(handler);
