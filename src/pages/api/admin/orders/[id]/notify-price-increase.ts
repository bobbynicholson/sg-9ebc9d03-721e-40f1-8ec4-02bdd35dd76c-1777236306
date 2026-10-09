/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { buildPayInvoiceUrlServer, mintOrderCustomerLink } from "@/lib/customerLinksServer";
import { escapeHtml } from "@/lib/embedFormApi";
import { emailService } from "@/services/emailService";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner", "sales_admin", "region_admin"]);

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const orderId = typeof req.query.id === "string" ? req.query.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return res.status(400).json({ error: "Valid order id required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const { data: profile, error: profileError } = await ssr.from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return res.status(500).json({ error: dbErrorMessage(profileError) });
    const role = String((profile as any)?.active_role || (profile as any)?.role || "");
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = String((profile as any)?.company_id || "");
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const previousTotal = Number((req.body || {}).previousTotal);
    if (!Number.isFinite(previousTotal) || previousTotal < 0) {
      return res.status(400).json({ error: "A valid previous total is required" });
    }

    const admin = getServiceSupabase();
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id, company_id, order_number, client_name, client_email, event_name, event_date, total_amount, amount_paid, currency, quote_id, companies:company_id(company_name, slug, currency)")
      .eq("id", orderId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (orderError) return res.status(500).json({ error: dbErrorMessage(orderError) });
    if (!order) return res.status(404).json({ error: "Order not found in your company" });

    const newTotal = Number((order as any).total_amount || 0);
    const changeAmount = Number((newTotal - previousTotal).toFixed(2));
    if (changeAmount <= 0.005) return res.status(200).json({ ok: true, skipped: "no_increase" });
    const clientEmail = String((order as any).client_email || "").trim();
    if (!clientEmail) return res.status(200).json({ ok: true, skipped: "no_client_email" });

    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await admin.from("audit_logs").select("details")
      .eq("company_id", companyId)
      .eq("action", "client_amount_increase_email_sent")
      .eq("entity_id", orderId)
      .gte("created_at", cutoff)
      .limit(10);
    if ((recent || []).some((row: any) => Math.abs(Number(row.details?.new_total) - newTotal) < 0.005)) {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    const company = (order as any).companies || {};
    const currency = String((order as any).currency || company.currency || "ZAR").toUpperCase();
    const paid = Number((order as any).amount_paid || 0);
    const balance = Math.max(0, Number((newTotal - paid).toFixed(2)));
    const [{ data: invoice }, orderUrl] = await Promise.all([
      admin.from("invoices").select("public_token, invoice_number")
        .eq("order_id", orderId).eq("company_id", companyId).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle().then((result: any) => ({ data: result.data })),
      mintOrderCustomerLink({ sb: admin, companyId, orderId, label: "order-amount-increase-email", slug: company.slug }),
    ]);
    const invoiceUrl = buildPayInvoiceUrlServer((invoice as any)?.public_token, { slug: company.slug });
    const eventLabel = (order as any).event_name ? ` for ${escapeHtml((order as any).event_name)}` : "";
    const reason = String((req.body || {}).reason || "Your booking details were updated by the catering team.").trim().slice(0, 300);
    const body = `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;">
      <p>Hi ${escapeHtml(String((order as any).client_name || "there").split(/\s+/)[0])},</p>
      <p>The total for order <strong>${escapeHtml(String((order as any).order_number || orderId))}</strong>${eventLabel} has increased.</p>
      <table role="presentation" style="border-collapse:collapse;width:100%;max-width:480px;">
        <tr><td style="padding:7px 12px 7px 0;color:#64748b;">Previous total</td><td style="padding:7px 0;text-align:right;">${escapeHtml(formatMoney(previousTotal, currency))}</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#64748b;">Updated total</td><td style="padding:7px 0;text-align:right;font-weight:700;">${escapeHtml(formatMoney(newTotal, currency))}</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#64748b;">Increase</td><td style="padding:7px 0;text-align:right;color:#047857;font-weight:700;">${escapeHtml(formatMoney(changeAmount, currency))}</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#64748b;">Paid to date</td><td style="padding:7px 0;text-align:right;">${escapeHtml(formatMoney(paid, currency))}</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#64748b;">Balance still due</td><td style="padding:7px 0;text-align:right;font-weight:700;">${escapeHtml(formatMoney(balance, currency))}</td></tr>
      </table>
      <p>Reason: ${escapeHtml(reason)}</p>
      <p><a href="${escapeHtml(invoiceUrl || orderUrl)}">Review your updated booking${invoiceUrl ? " and invoice" : ""}</a></p>
      <p>If anything doesn’t look right, reply to this email and we’ll help.</p>
    </div>`;
    const sent = await emailService.sendEmail({
      companyId,
      to: clientEmail,
      subject: `Updated total for order ${String((order as any).order_number || "")}`,
      body,
      orderId,
      bypassQuarantine: true,
      _client: admin,
    } as any);
    if (sent === false) return res.status(502).json({ error: "Order was updated, but the client email could not be sent" });

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: companyId,
      user_id: user.id,
      action: "client_amount_increase_email_sent",
      entity_type: "orders",
      entity_id: orderId,
      details: {
        quote_id: (order as any).quote_id,
        previous_total: previousTotal,
        new_total: newTotal,
        change_amount: changeAmount,
        amount_paid: paid,
        balance_due: balance,
        reason,
        recipient: clientEmail,
      },
    });
    if (auditError) console.warn("[order/notify-price-increase] email sent but audit write failed:", auditError.message);
    return res.status(200).json({ ok: true, sent: true, changeAmount, balanceDue: balance });
  } catch (error: any) {
    console.error("[order/notify-price-increase] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error) });
  }
}

export default withApiLogging(handler);