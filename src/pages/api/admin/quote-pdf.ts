/**
 * GET /api/admin/quote-pdf?id=<quoteId>
 *
 * Phase 16 #3. Renders a quote PDF and streams it back to the
 * browser as application/pdf so the admin can download a copy
 * without firing a send. The existing send-email route renders
 * the PDF inline as an attachment; this route exposes the same
 * pipeline as a direct download.
 *
 * Auth: any signed-in user belonging to the quote's tenant. RLS
 * on quotes already enforces the company scope; we just verify
 * the caller has a session.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

export const config = {
  api: {
    // PDF buffer can be 50-300 KB. Default body cap is fine.
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }
  const quoteId = typeof req.query.id === "string" ? req.query.id : null;
  if (!quoteId) return res.status(400).json({ error: "Missing id" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: q } = await ssr
      .from("quotes")
      .select(`
        id, quote_number, quote_name, client_name, event_date, event_time, setup_time, guest_count,
        venue_address, menu_items, equipment_items, notes, terms_and_conditions,
        subtotal, tax_amount, discount_amount, total, total_amount, status,
        delivery_fee, delivery_distance_km,
        valid_until, accepted_at, updated_at,
        company:company_id (
          company_name, legal_name, logo_url, email, phone, website,
          address_line1, address_line2, city,
          primary_color, vat_registered, vat_number, vat_rate,
          registration_number, tax_number,
          updated_at
        )
      `)
      .eq("id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!q) return res.status(404).json({ error: "Quote not found" });

    const { renderQuotePdf, sanitiseFilename } = await import("@/services/pdf");
    const pdfBuffer = await renderQuotePdf(
      {
        quote_number: q.quote_number,
        quote_name: q.quote_name,
        client_name: q.client_name,
        event_date: q.event_date,
        event_time: q.event_time,
        setup_time: q.setup_time,
        guest_count: q.guest_count,
        venue_address: q.venue_address,
        menu_items: q.menu_items,
        equipment_items: q.equipment_items,
        subtotal: q.subtotal,
        delivery_fee: q.delivery_fee,
        delivery_distance_km: q.delivery_distance_km,
        discount_amount: q.discount_amount,
        tax_amount: q.tax_amount,
        total: Number(q.total ?? q.total_amount ?? 0),
        valid_until: q.valid_until,
        terms_and_conditions: q.terms_and_conditions,
        notes: q.notes,
        status: q.status,
        accepted_at: q.accepted_at,
        company: q.company || {},
      },
      {
        cacheKey: {
          quoteId,
          quoteUpdatedAt: q.updated_at ?? null,
          companyUpdatedAt: q.company?.updated_at ?? null,
        },
      },
    );

    const filename = `Quote-${sanitiseFilename(q.quote_number || quoteId)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error("[quote-pdf] crashed:", err);
    return res.status(500).json({ error: err?.message || "PDF render failed" });
  }
}
