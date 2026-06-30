/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FIX (2026-06-12): GET /api/public/invoices/[token]/get
 *
 * Public, unauthenticated. Returns the invoice + company branding the
 * /pay/i/[token] page renders.
 *
 * Why this exists: migration 20260521090000 dropped the open
 * `anon_read_invoice_by_token` RLS policy (it had no token check - a
 * cross-tenant leak), asserting "no app code depends on direct anon
 * SELECT against these tables". That was wrong twice over:
 * /pay/i/[token].tsx selected invoices directly with the anon key
 * (silently empty after the drop -> every public pay link rendered
 * "Invoice not found"), and its company embed asked for a
 * `phone_number` column that doesn't exist on companies (the column
 * is `phone`), which 400'd the query anyway.
 *
 * Same shape as /api/public/quotes/[token]/get: service-role SELECT,
 * token-in-WHERE as the access secret, rate-limited per IP.
 */

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

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } },
};

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function moneyNumber(...values: any[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function menuLineFromRow(row: any): any {
  const quantity = moneyNumber(row?.quantity, row?.qty, 1) || 1;
  const unitPrice = moneyNumber(row?.unitPrice, row?.unit_price, row?.price);
  const total = moneyNumber(row?.total, row?.line_total, row?.lineTotal, quantity * unitPrice);
  return {
    description: row?.description || row?.item_name || row?.menu_item_name || row?.name || "Menu item",
    quantity,
    unitPrice,
    total,
    note: row?.notes || row?.note || null,
  };
}

function equipmentLineFromRow(row: any): any {
  const equipment = row?.equipment || {};
  const quantity = moneyNumber(row?.quantity, row?.qty, 1) || 1;
  const unitPrice = moneyNumber(row?.unitPrice, row?.unit_price, row?.rentalPrice, row?.rental_price, equipment?.rental_price);
  const total = moneyNumber(row?.total, row?.line_total, row?.lineTotal, quantity * unitPrice);
  return {
    description: row?.description || row?.equipment_name || row?.name || equipment?.name || "Equipment",
    quantity,
    unitPrice,
    total,
    isHireIn: row?.isHireIn ?? row?.is_hire_in ?? equipment?.is_hire_in ?? false,
    note: row?.notes || row?.note || null,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, error: "Not found" });

  const supabase = getServiceSupabase() as any;

  // Liberal limit - the pay page reloads on payment-return redirects.
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 120,
    bucket: "hour",
  });
  if (!rl.allowed) return res.status(429).json({ ok: false, error: "Too many requests" });

  // Service-role SELECT bypasses RLS; the unguessable public_token in
  // the WHERE clause is the access secret. `phone_number:phone` keeps
  // the page's existing InvoiceView shape while reading the real
  // column name.
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, public_token, invoice_number, invoice_date, due_date, order_id,
      total_amount, amount_paid, balance_due, status, invoice_data,
      companies:company_id (
        id, company_name, logo_url, email, phone_number:phone,
        vat_registered, vat_number, vat_rate, deposit_percent,
        primary_color, secondary_color, accent_color,
        brand_font_body, brand_font_display
      )
    `)
    .eq("public_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[public/invoices/get] fetch failed:", error);
    return res.status(500).json({ ok: false, error: "Lookup failed" });
  }

  if (!data) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  let invoiceForResponse = data as any;
  const invoiceData = invoiceForResponse.invoice_data && typeof invoiceForResponse.invoice_data === "object"
    ? { ...invoiceForResponse.invoice_data }
    : {};
  const snapshotItems = asArray(invoiceData.items);
  const hasMenuSnapshot = asArray(invoiceData.menuItems).length > 0 || asArray(invoiceData.menu_items).length > 0;
  const hasEquipmentSnapshot = asArray(invoiceData.equipmentItems).length > 0 || asArray(invoiceData.equipment_items).length > 0;

  if (invoiceForResponse.order_id) {
    const { data: orderMeta } = await supabase
      .from("orders")
      .select("id, quote_id, package_id")
      .eq("id", invoiceForResponse.order_id)
      .maybeSingle();

    let quoteMenuItems: any[] = [];
    let quoteEquipmentItems: any[] = [];
    if ((orderMeta as any)?.quote_id) {
      const { data: quote } = await supabase
        .from("quotes")
        .select("menu_items, equipment_items")
        .eq("id", (orderMeta as any).quote_id)
        .maybeSingle();
      quoteMenuItems = asArray((quote as any)?.menu_items);
      quoteEquipmentItems = asArray((quote as any)?.equipment_items);
    }

    if (!hasMenuSnapshot) {
      let menuItems = quoteMenuItems.map(menuLineFromRow);
      if (menuItems.length === 0) {
        const { data: orderItems } = await supabase
          .from("order_items")
          .select("item_name, description, quantity, unit_price, line_total")
          .eq("order_id", invoiceForResponse.order_id)
          .order("created_at", { ascending: true });
        menuItems = (orderItems || []).map(menuLineFromRow);
      }
      if (menuItems.length > 0) invoiceData.menuItems = menuItems;
    }

    if (!hasEquipmentSnapshot) {
      let equipmentItems = quoteEquipmentItems.map(equipmentLineFromRow);
      if (equipmentItems.length === 0) {
        const { data: bookings } = await supabase
          .from("equipment_bookings")
          .select("id, quantity, equipment:equipment_id(name, rental_price, is_hire_in)")
          .eq("order_id", invoiceForResponse.order_id)
          .order("created_at", { ascending: true });
        equipmentItems = (bookings || []).map(equipmentLineFromRow);
      }
      if (equipmentItems.length > 0) invoiceData.equipmentItems = equipmentItems;
    }

    if (!invoiceData.packageName && (orderMeta as any)?.package_id) {
      const { data: bookingPackage } = await supabase
        .from("booking_packages")
        .select("name")
        .eq("id", (orderMeta as any).package_id)
        .maybeSingle();
      if ((bookingPackage as any)?.name) invoiceData.packageName = (bookingPackage as any).name;
    }
  }

  if (snapshotItems.length === 0 && asArray(invoiceData.menuItems).length > 0) {
    invoiceData.items = asArray(invoiceData.menuItems);
  }
  invoiceForResponse = {
    ...invoiceForResponse,
    invoice_data: invoiceData,
  };

  // Completed payments against this invoice, so the page can show WHEN
  // the deposit (and any further payment) actually landed, not just the
  // running total. Ordered oldest-first so the deposit reads first.
  const { data: payments } = await supabase
    .from("payments")
    .select("amount, processed_at, payment_status, payment_type, gateway_provider")
    .eq("invoice_id", (data as any).id)
    .eq("payment_status", "completed")
    .order("processed_at", { ascending: true });

  return res.status(200).json({ ok: true, invoice: { ...invoiceForResponse, payments: payments || [] } });
}

export default withApiLogging(handler);
