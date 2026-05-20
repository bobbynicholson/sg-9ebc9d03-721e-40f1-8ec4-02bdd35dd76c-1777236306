/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";

const CRON_NAME = "recurring-invoices";

/**
 * Wave 68 - daily cron for recurring invoices.
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
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();
    // UTC tomorrow is the loose upper bound. Per-template we then
    // re-check next_run_at against THAT tenant's local today so a
    // cron running at UTC midnight doesn't fire SAST templates a
    // day early.
    const utcTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // Pull the template + the tenant timezone so each row can be
    // evaluated against its own local day.
    const { data: templates, error: tErr } = await sb
      .from("recurring_invoice_templates")
      .select("*, company:companies(timezone)")
      .eq("active", true)
      .lte("next_run_at", utcTomorrow);
    if (tErr) {
      console.error("[recurring-invoices] templates fetch failed:", tErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: tErr.message });
      return res.status(500).json({ error: tErr.message });
    }

    if (!templates || templates.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, considered: 0, generated: 0 });
      return res.status(200).json({ ok: true, generated: 0 });
    }

    let generated = 0;
    const errors: string[] = [];

    for (const t of templates as any[]) {
      const tenantTz = t.company?.timezone || DEFAULT_TENANT_TIMEZONE;
      const todayIso = toZonedISO(now, tenantTz);

      // Honour pause + end gates against tenant local date.
      if (t.pause_until && String(t.pause_until) > todayIso) continue;
      if (t.end_date && String(t.end_date) < todayIso) continue;
      // Tenant local today must have actually reached next_run_at;
      // the UTC pre-filter above is intentionally loose.
      if (t.next_run_at && String(t.next_run_at) > todayIso) continue;

      try {
        // Build invoice row. Uses the same shape ensureInvoiceForOrder
        // produces but without an order link - recurring invoices
        // are a separate flow from order-driven invoicing.
        const invoiceNumber = await _consumeInvoiceNumber(sb, t.company_id);
        const dueDate = (() => {
          // 14 days from tenant local today, expressed as tenant
          // local date. Stamping a UTC due_date would render off by
          // a day for SAST tenants when this cron fires at UTC
          // midnight.
          const future = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
          return toZonedISO(future, tenantTz);
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

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      considered: templates.length,
      generated,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      considered: templates.length,
      generated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[recurring-invoices] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
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
