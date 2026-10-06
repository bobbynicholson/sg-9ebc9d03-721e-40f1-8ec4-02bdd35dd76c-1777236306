/**
 * GET /api/invoices/[id]/receipt-pdf
 *
 * Client-facing receipt download (CLI-I / CLI-30). Streams a single-
 * page PDF acknowledging payment for a paid invoice.
 *
 * Authz:
 *   - Caller must be signed in
 *   - Caller must own the invoice. Ownership is satisfied when
 *     EITHER the invoice's clients row matches one of the user's
 *     clients.user_id rows OR clients.email matches user.email
 *     (case-insensitive). This mirrors the dashboard fallback for
 *     orders booked before sign-up.
 *
 * Caching:
 *   - In-memory PDF cache (renderReceiptPdf) keyed on invoice id +
 *     paid_at + updated_at chain, TTL 30 min process-local.
 *   - HTTP Cache-Control: private, max-age=3600 so the user's
 *     browser also caches for an hour - the spec asked for that to
 *     avoid regenerating on every download.
 *
 * The invoice must be paid (status='paid' AND paid_at IS NOT NULL).
 * Routes hitting this endpoint for an unpaid invoice get a 409.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { buildPdfEftPaymentDetails, isEftPaymentMethod } from "@/lib/pdfPaymentDetails";


export const config = {
  api: {
    // PDF buffers run ~30-120 KB. Lift the default body cap so a
    // larger logo + many line items still streams cleanly.
    responseLimit: false,
  },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  const invoiceId = typeof req.query.id === "string" ? req.query.id : null;
  if (!invoiceId) return res.status(400).json({ error: "Missing invoice id" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user },
    } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    // Hydrate the invoice + every join we need to populate the PDF.
    // RLS scopes per-tenant; the explicit ownership check below
    // narrows to "this user owns this invoice".
    const { data: invRow, error: invErr } = await ssr
      .from("invoices")
      .select(`
        id, invoice_number, invoice_date, due_date, status, paid_at,
        subtotal, tax_amount, total_amount, amount_paid, balance_due,
        invoice_data, updated_at, company_id, client_id,
        client:client_id (
          id, user_id, client_name, email, phone,
          billing_address_line1, billing_address_line2,
          billing_city, billing_postal_code
        ),
        order:order_id (
          id, order_number, event_name, event_date, updated_at
        ),
        company:company_id (
          id, slug, company_name, legal_name, logo_url, email, phone,
          address_line1, address_line2, city, state_province,
          postal_code, country, primary_color, currency,
          vat_registered, vat_number, vat_rate,
          registration_number, tax_number,
          bank_name, bank_account_holder, bank_account_number,
          bank_branch_code, bank_account_type, eft_instructions,
          updated_at
        )
      `)
      .eq("id", invoiceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (invErr) {
      console.error("[invoices/receipt-pdf] invoice read failed:", invErr);
      return res.status(500).json({ error: "Invoice lookup failed" });
    }
    if (!invRow) return res.status(404).json({ error: "Invoice not found" });

    const inv = invRow as any;

    // Authz: clients.user_id direct match OR clients.email case-
    // insensitive match against the signed-in email. Either one is
    // sufficient because the magic-link relink flow guarantees a
    // signed-in user with the right email will have a clients row
    // attached eventually, but until that happens email is the only
    // anchor we have.
    const clientUserId = inv.client?.user_id || null;
    const clientEmail = (inv.client?.email || "").toLowerCase();
    const userEmail = (user.email || "").toLowerCase();
    const ownerMatches =
      (clientUserId && clientUserId === user.id) ||
      (clientEmail && userEmail && clientEmail === userEmail);

    if (!ownerMatches) {
      // 404 not 403 - don't reveal whether the invoice exists for
      // some other client to a probing caller.
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Only paid invoices get a receipt. Surface as 409 so the UI
    // can distinguish "wrong state" from "missing" or "denied".
    if (inv.status !== "paid" || !inv.paid_at) {
      return res.status(409).json({ error: "Invoice is not paid yet" });
    }

    // Read the complete settlement trail. A fully paid invoice can have a
    // deposit plus one or more follow-up payments; showing only the newest
    // row would hide the transaction ID / timestamp the client needs.
    // invoice_id is canonical; only legacy rows with a NULL invoice_id may
    // fall back to the linked order.
    let paymentMethod: string | null = null;
    let paymentReference: string | null = null;
    let paymentProvider: string | null = null;
    let transactionId: string | null = null;
    let paymentRows: any[] = [];
    try {
      const { data: payRows } = await ssr
        .from("payments")
        .select("amount, currency, payment_method, payment_reference, gateway_transaction_id, transaction_id, gateway, gateway_provider, completed_at, processed_at, payment_date, created_at, updated_at")
        .or(
          inv.order?.id
            ? `invoice_id.eq.${inv.id},and(invoice_id.is.null,order_id.eq.${inv.order.id})`
            : `invoice_id.eq.${inv.id}`,
        )
        .eq("payment_status", "completed")
        .order("payment_date", { ascending: true });
      paymentRows = (payRows as any[]) || [];
      const pay = paymentRows[paymentRows.length - 1];
      if (pay) {
        paymentMethod = pay.payment_method || null;
        paymentReference = pay.payment_reference || pay.gateway_transaction_id || pay.transaction_id || null;
        paymentProvider = pay.gateway_provider || pay.gateway || null;
        transactionId = pay.gateway_transaction_id || pay.transaction_id || null;
      }
    } catch (payErr) {
      // Non-fatal - receipt still renders without method/ref.
      console.warn("[invoices/receipt-pdf] payments lookup failed:", payErr);
    }

    // Pre-fetch the company logo as a data URI so @react-pdf's
    // <Image> doesn't do its own outbound fetch from inside the
    // renderer (same trick as admin/quote-pdf). Best-effort: drop
    // the logo on any failure rather than crashing the route.
    let logoUrl: string | null = inv.company?.logo_url ?? null;
    if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const resp = await fetch(logoUrl, { signal: ctl.signal });
        clearTimeout(t);
        if (resp.ok) {
          const ct = resp.headers.get("content-type") || "image/png";
          const buf = Buffer.from(await resp.arrayBuffer());
          logoUrl = `data:${ct};base64,${buf.toString("base64")}`;
        } else {
          logoUrl = null;
        }
      } catch (logoErr) {
        console.warn("[invoices/receipt-pdf] logo pre-fetch failed:", logoErr);
        logoUrl = null;
      }
    } else if (logoUrl && !/^data:/i.test(logoUrl)) {
      logoUrl = null;
    }

    // Resolve line items. Preferred source is invoice_data.line_items
    // (the snapshot taken at invoice generation, immune to later order
    // edits). Fall back to order_items when invoice_data is empty -
    // older invoices written before the snapshot pattern landed need
    // the original join.
    const invoiceData = inv.invoice_data || {};
    const paymentRecords = paymentRows.map((payment) => ({
      amount: payment.amount != null ? Number(payment.amount) : null,
      currency: payment.currency || inv.company?.currency || null,
      payment_method: payment.payment_method || null,
      payment_provider: payment.gateway_provider || payment.gateway || null,
      transaction_id: payment.gateway_transaction_id || payment.transaction_id || null,
      payment_reference: payment.payment_reference || null,
      paid_at: payment.completed_at || payment.processed_at || payment.payment_date || payment.created_at || null,
    }));
    const hasEftPayment = paymentRecords.some((payment) => isEftPaymentMethod(payment.payment_method));
    const eftDetails = hasEftPayment
      ? buildPdfEftPaymentDetails(inv.company || {}, invoiceData.bankDetails || {}, {
          reference: inv.invoice_number || null,
        })
      : null;
    const paymentAuditVersion = paymentRows
      .map((payment) => payment.updated_at || payment.completed_at || payment.processed_at || payment.payment_date || payment.created_at || "")
      .filter(Boolean)
      .join("|") || null;
    let lineItems: Array<{
      name: string;
      description?: string | null;
      quantity?: number | null;
      unit_price?: number | null;
      total?: number | null;
    }> = [];

    if (Array.isArray(invoiceData.line_items) && invoiceData.line_items.length > 0) {
      lineItems = invoiceData.line_items.map((it: any) => ({
        name: it.name || it.description || it.item_name || "Item",
        description: it.description || null,
        quantity: it.quantity ?? null,
        unit_price: it.unit_price ?? it.unitPrice ?? null,
        total: it.line_total ?? it.total ?? null,
      }));
    } else if (inv.order?.id) {
      const { data: oi } = await ssr
        .from("order_items")
        .select("item_name, description, quantity, unit_price, line_total")
        .eq("order_id", inv.order.id);
      lineItems = ((oi as any[]) || []).map((r) => ({
        name: r.item_name || "Item",
        description: r.description || null,
        quantity: r.quantity ?? null,
        unit_price: r.unit_price ?? null,
        total: r.line_total ?? null,
      }));
    }

    const clientAddress =
      [
        inv.client?.billing_address_line1,
        inv.client?.billing_address_line2,
        inv.client?.billing_city,
        inv.client?.billing_postal_code,
      ]
        .filter(Boolean)
        .join(", ") || null;

    const { renderReceiptPdf, sanitiseFilename } = await import("@/services/pdf");
    const pdfBuffer = await renderReceiptPdf(
      {
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        paid_at: inv.paid_at,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        payment_provider: paymentProvider,
        transaction_id: transactionId,
        payment_records: paymentRecords,
        eft_details: eftDetails,
        client: {
          name: inv.client?.client_name || "",
          email: inv.client?.email || null,
          phone: inv.client?.phone || null,
          address: clientAddress,
        },
        order_number: inv.order?.order_number || null,
        event_name: inv.order?.event_name || null,
        event_date: inv.order?.event_date || null,
        line_items: lineItems,
        subtotal: inv.subtotal,
        tax_amount: inv.tax_amount,
        discount_amount: invoiceData?.discount_amount ?? null,
        total_amount: Number(inv.total_amount ?? 0),
        amount_paid: inv.amount_paid != null ? Number(inv.amount_paid) : null,
        currency: inv.company?.currency || "ZAR",
        company: {
          ...(inv.company || {}),
          logo_url: logoUrl,
        },
      },
      {
        cacheKey: {
          invoiceId: inv.id,
          paidAt: paymentAuditVersion ? `${inv.paid_at}:${paymentAuditVersion}` : inv.paid_at,
          invoiceUpdatedAt: inv.updated_at,
          companyUpdatedAt: inv.company?.updated_at,
        },
      },
    );

    const filename = `receipt-${sanitiseFilename(inv.invoice_number || inv.id)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    // CLI-30 brief: cache for one hour. private + immutable inside
    // the TTL because the receipt is keyed on paid_at - if the admin
    // corrects the payment, the cache key shifts and the next request
    // re-renders.
    res.setHeader("Cache-Control", "private, max-age=3600, immutable");
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error("[invoices/receipt-pdf] crashed:", err);
    const payload: any = {
      error: err?.message || "Receipt PDF render failed",
      name: err?.name || undefined,
    };
    if (process.env.NODE_ENV !== "production") {
      payload.stack = err?.stack;
    }
    return res.status(500).json(payload);
  }
}

export default withApiLogging(handler);
