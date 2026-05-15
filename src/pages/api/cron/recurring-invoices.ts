/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Wave 68 -- daily cron for recurring invoices.
 *
 * Runs every morning at 06:00 SAST. Walks every
 * recurring_invoice_templates row where active=true AND
 * next_run_at <= today AND (pause_until IS NULL OR pause_until <= today)
 * AND (end_date IS NULL OR end_date >= today). For each row:
 *   1. Generate an invoices row from the template's line_items
 *   2. Stamp the invoice with company_id, client_name, line items,
 *      subtotal/tax/total
 *   3. Advance next_run_at by frequency (weekly +7, fortnightly +14,
 *      monthly +1month, quarterly +3months)
 *   4. Insert a recurring_invoice_runs row for audit
 *
 * Idempotent: a re-run on the same day picks up only templates that
 * were already advanced; the next_run_at advance after success
 * prevents double-generation.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provided = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = getServiceSupabase();
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data: templates, error: tErr } = await (sb as any)
      .from("recurring_invoice_templates")
      .select("*")
      .eq("active", true)
      .lte("next_run_at", todayIso);
    if (tErr) {
      console.error("[recurring-invoices] templates fetch failed:", tErr);
      return res.status(500).json({ error: tErr.message });
    }

    if (!templates || templates.length === 0) {
      return res.status(200).json({ ok: true, generated: 0 });
    }

    let generated = 0;
    const errors: string[] = [];

    for (const t of templates as any[]) {
      // Honour pause + end gates.
      if (t.pause_until && String(t.pause_until) > todayIso) continue;
      if (t.end_date && String(t.end_date) < todayIso) continue;

      try {
        // Build invoice row. Uses the same shape ensureInvoiceForOrder
        // produces but without an order link -- recurring invoices
        // are a separate flow from order-driven invoicing.
        const invoiceNumber = await _consumeInvoiceNumber(sb, t.company_id);
        const dueDate = (() => {
          const d = new Date();
          d.setDate(d.getDate() + 14); // 14-day terms
          return d.toISOString().slice(0, 10);
        })();
        const { data: insertedInvoice, error: invErr } = await (sb as any)
          .from("invoices")
          .insert([{
            company_id: t.company_id,
            client_id: t.client_id,
            invoice_number: invoiceNumber,
            invoice_date: todayIso,
            due_date: dueDate,
            subtotal: Number(t.subtotal || 0),
            tax_amount: Number(t.tax_amount || 0),
            total_amount: Number(t.total_amount || 0),
            balance_due: Number(t.total_amount || 0),
            amount_paid: 0,
            status: "draft",
            invoice_data: {
              clientName: t.client_name,
              clientEmail: t.client_email,
              items: t.line_items || [],
              subtotal: Number(t.subtotal || 0),
              taxAmount: Number(t.tax_amount || 0),
              total: Number(t.total_amount || 0),
              recurring_template_id: t.id,
            },
          }])
          .select("id")
          .single();
        if (invErr) throw invErr;

        // Advance next_run_at by frequency.
        const next = _advanceDate(t.next_run_at, t.frequency);
        await (sb as any)
          .from("recurring_invoice_templates")
          .update({ next_run_at: next, updated_at: new Date().toISOString() })
          .eq("id", t.id);

        // Audit row.
        await (sb as any)
          .from("recurring_invoice_runs")
          .insert([{
            template_id: t.id,
            invoice_id: (insertedInvoice as any).id,
            success: true,
            scheduled_for: t.next_run_at,
          }]);
        generated += 1;
      } catch (e: any) {
        errors.push(`template ${t.id}: ${e?.message || e}`);
        try {
          await (sb as any)
            .from("recurring_invoice_runs")
            .insert([{
              template_id: t.id,
              success: false,
              error: e?.message || "unknown",
              scheduled_for: t.next_run_at,
            }]);
        } catch {/* swallow */}
      }
    }

    return res.status(200).json({
      ok: true,
      considered: templates.length,
      generated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[recurring-invoices] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

async function _consumeInvoiceNumber(sb: any, companyId: string): Promise<string> {
  // Reuse the canonical document-number RPC if available; fall back
  // to a timestamp-based id so the cron never blocks on numbering.
  try {
    const { data, error } = await sb.rpc("consume_next_document_number", {
      p_company_id: companyId,
      p_doc_type: "invoice",
    });
    if (!error && data) return String(data);
  } catch {/* fall through */}
  return `INV-AUTO-${Date.now().toString(36).toUpperCase()}`;
}

function _advanceDate(fromIso: string, frequency: string): string {
  const d = new Date(`${fromIso}T00:00:00`);
  switch (frequency) {
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "fortnightly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    default: d.setDate(d.getDate() + 7);
  }
  return d.toISOString().slice(0, 10);
}
