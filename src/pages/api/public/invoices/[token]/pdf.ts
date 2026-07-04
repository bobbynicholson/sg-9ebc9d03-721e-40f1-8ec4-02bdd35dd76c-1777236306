/**
 * GET /api/public/invoices/[token]/pdf
 *
 * Public, token-gated download of the clean react-pdf tax invoice (same
 * renderer as the emailed invoice attachment). The /pay/i/[token] page's
 * "Save as PDF" used window.print(), which stamps the browser's own
 * header/footer (date, page URL, page numbers) onto the output and breaks
 * sections mid-page. This streams the real generated PDF instead.
 * (2026-07-04, extends the same fix already applied to quotes/receipts.)
 *
 * Auth: the invoice public_token IS the capability - it's the same token
 * that renders the full invoice on the public pay page.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

export const config = { api: { responseLimit: false } };

async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).end("Method Not Allowed");
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ error: "Not found" });

  const supabase = getServiceSupabase();
  const rl = await checkAndIncrementRateLimit(token, hashIp(getClientIp(req as any)), supabase, { limit: 30, bucket: "minute" });
  if (!rl.allowed) return res.status(429).json({ error: "Too many requests, slow down" });

  try {
    const { data: inv, error } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, invoice_date, due_date, status,
        subtotal, tax_amount, total_amount, amount_paid, balance_due,
        notes, invoice_data, updated_at,
        client:client_id ( client_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_postal_code ),
        order:order_id ( order_number, event_name, event_date, updated_at ),
        company:company_id ( company_name, legal_name, logo_url, email, phone, address_line1, address_line2, city, state_province, postal_code, country, primary_color, vat_registered, vat_number, vat_rate, registration_number, tax_number, currency, updated_at )
      `)
      .eq("public_token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return res.status(500).json({ error: `Invoice read failed: ${dbErrorMessage(error)}` });
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const client = (inv as any).client || {};
    const order = (inv as any).order || {};
    const company = (inv as any).company || {};

    // Logo -> data URI so the renderer doesn't do its own un-timed fetch.
    let logoUrl = company.logo_url ?? null;
    if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(logoUrl, { signal: ctl.signal });
        clearTimeout(t);
        if (r.ok) {
          const ct = r.headers.get("content-type") || "image/png";
          if (/^image\/(?:png|jpe?g)(?:;|$)/i.test(ct)) logoUrl = `data:${ct};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
          else logoUrl = null;
        } else logoUrl = null;
      } catch { logoUrl = null; }
    } else if (logoUrl && !/^data:/i.test(logoUrl)) logoUrl = null;

    // Line items from invoice_data. invoice_data splits food + equipment
    // into separate arrays (menuItems / equipmentItems); combine BOTH so
    // the PDF isn't missing the equipment lines (bug found 2026-07-04:
    // only the food showed, so lines didn't sum to the total). Fall back
    // to a flat line_items/items array for older invoices.
    const idata = (inv as any).invoice_data || {};
    const mapItem = (it: any) => ({
      name: it.description || it.name || it.item_name || "Item",
      description: it.detail || null,
      quantity: it.quantity ?? it.qty ?? null,
      unit_price: it.unitPrice ?? it.unit_price ?? null,
      total: Number(it.total ?? it.line_total ?? 0),
    });
    let line_items: any[] = [];
    if (Array.isArray(idata.menuItems) || Array.isArray(idata.equipmentItems)) {
      line_items = [
        ...(Array.isArray(idata.menuItems) ? idata.menuItems.map(mapItem) : []),
        ...(Array.isArray(idata.equipmentItems) ? idata.equipmentItems.map(mapItem) : []),
      ];
    } else {
      const raw = Array.isArray(idata.line_items) ? idata.line_items : Array.isArray(idata.items) ? idata.items : [];
      line_items = raw.map(mapItem);
    }
    // Surge / discount adjustment: if the line totals don't reconcile to
    // the subtotal, add a single adjustment line so the itemised list
    // always sums to the total shown (the pay page does the same).
    const itemsSum = line_items.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const subtotalNum = Number((inv as any).subtotal || 0);
    const adjustment = Math.round((subtotalNum - itemsSum) * 100) / 100;
    if (Math.abs(adjustment) >= 0.01) {
      line_items.push({
        name: adjustment < 0 ? "Discount / adjustment" : "Surge / adjustment",
        description: null, quantity: null, unit_price: null, total: adjustment,
      });
    }

    const clientAddress = [client.billing_address_line1, client.billing_address_line2, client.billing_city, client.billing_postal_code].filter(Boolean).join(", ") || null;

    const { renderInvoicePdf, sanitiseFilename } = await import("@/services/pdf");
    const pdfBuffer = await renderInvoicePdf(
      {
        invoice_number: (inv as any).invoice_number,
        invoice_date: (inv as any).invoice_date,
        due_date: (inv as any).due_date,
        status: (inv as any).status,
        client: { name: client.client_name || "", email: client.email || null, phone: client.phone || null, address: clientAddress },
        order_number: order.order_number || null,
        event_name: order.event_name || null,
        event_date: order.event_date || null,
        line_items,
        subtotal: (inv as any).subtotal,
        tax_amount: (inv as any).tax_amount,
        total_amount: Number((inv as any).total_amount || 0),
        amount_paid: (inv as any).amount_paid,
        balance_due: (inv as any).balance_due,
        notes: (inv as any).notes || null,
        payment_terms: null,
        company: {
          company_name: company.company_name, legal_name: company.legal_name, logo_url: logoUrl,
          email: company.email, phone: company.phone,
          address_line1: company.address_line1, address_line2: company.address_line2, city: company.city,
          state_province: company.state_province, postal_code: company.postal_code, country: company.country,
          primary_color: company.primary_color, vat_registered: company.vat_registered, vat_number: company.vat_number,
          vat_rate: company.vat_rate, registration_number: company.registration_number, tax_number: company.tax_number,
          currency: company.currency,
        },
      },
      { cacheKey: { invoiceId: (inv as any).id, invoiceUpdatedAt: (inv as any).updated_at ?? null, orderUpdatedAt: order.updated_at ?? null, companyUpdatedAt: company.updated_at ?? null } },
    );

    const filename = `Invoice-${sanitiseFilename((inv as any).invoice_number || (inv as any).id)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error("[public/invoice-pdf] crashed:", err);
    return res.status(500).json({ error: err?.message || dbErrorMessage(err) || "PDF render failed" });
  }
}

export default withApiLogging(handler);
