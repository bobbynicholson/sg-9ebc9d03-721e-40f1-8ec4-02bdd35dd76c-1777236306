import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { documentImportAccess, documentImportError } from "@/server/documentImport";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).end();
  const access = await documentImportAccess(req, res, true); if (!access) return;
  const { db, companyId, userId, canManage } = access;
  try {
    const source = req.method === "GET" ? req.query : req.body;
    const quoteId = source.quoteId || null, orderId = source.orderId || null;
    const menuIds: string[] = typeof source.menuIds === "string" ? source.menuIds.split(",").filter(Boolean) : [];
    if (![quoteId, orderId, ...menuIds].filter(Boolean).every((v) => z.string().uuid().safeParse(v).success) || menuIds.length > 100) return res.status(400).json({ error: "Invalid booking." });
    if (quoteId || orderId) {
      const found = await db.from(orderId ? "orders" : "quotes").select("id").eq("id", orderId || quoteId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      if (found.error || !found.data) return res.status(404).json({ error: "Booking not found." });
    }
    if (req.method === "POST") {
      if (!canManage) return res.status(403).json({ error: "An administrator must complete import setup." });
      const fileId = req.body.documentId;
      if (!z.string().uuid().safeParse(fileId).success) return res.status(400).json({ error: "Choose the imported document." });
      const found = await db.from("document_import_files").select("*").eq("id", fileId).eq("company_id", companyId).eq("status", "committed").single();
      if (found.error || !found.data) return res.status(404).json({ error: "Imported document not found." });
      const doc = found.data;
      const gaps = await db.rpc("booking_import_gaps", { p_company_id: companyId, p_quote_id: doc.target_table === "quotes" ? doc.target_id : null, p_order_id: doc.target_table === "orders" ? doc.target_id : null, p_include_review: false });
      if (gaps.error) throw gaps.error;
      if (gaps.data.length) return res.status(409).json({ error: "Complete the linked catalogue details first.", gaps: gaps.data });
      const result = await db.from("document_import_files").update({ setup_completed_at: new Date().toISOString(), setup_completed_by: userId }).eq("id", fileId).eq("company_id", companyId);
      if (result.error) throw result.error;
      return res.json({ ok: true });
    }
    const result = await db.rpc("booking_import_gaps", { p_company_id: companyId, p_quote_id: quoteId, p_order_id: orderId, p_menu_ids: menuIds });
    if (result.error) throw result.error;
    return res.json({ gaps: result.data });
  } catch (error) { return res.status(500).json({ error: documentImportError(error) }); }
}
