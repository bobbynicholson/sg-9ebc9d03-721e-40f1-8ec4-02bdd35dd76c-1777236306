/**
 * POST /api/admin/invoices/bulk-remind
 *
 * Phase 6 #9: bulk payment reminder for outstanding (or overdue)
 * invoices. Sends a per-tenant branded reminder email per invoice
 * row in one operator click. Each send goes through emailService
 * so it picks up the tenant's sender + audit logging + quarantine
 * rules; failures don't unwind the rest of the batch.
 *
 * Auth: admin/owner in the tenant.
 *
 * Body:
 *   { scope: 'outstanding' | 'overdue', dryRun?: boolean }
 *
 * Returns (send):    { ok, sent, failed, skipped, total }
 * Returns (dryRun):  { ok, dryRun: true, total, withEmail, withoutEmail, preview: [{ clientName, balance, due_date }] }
 *
 * INV-B (invoices follow-ups): dryRun mode powers the recipient
 * preview in BulkRemindDialog. Pre-INV-B operators clicked
 * "Send overdue reminders", got a blunt confirm() with no context,
 * then learned after-the-fact how many actually went and how many
 * were skipped (no email). The dry-run lets the dialog tell them
 * up-front.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { emailService } from "@/services/emailService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const scope = String((req.body || {}).scope || "outstanding");
    if (!["outstanding", "overdue"].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'outstanding' or 'overdue'" });
    }
    const dryRun = (req.body || {}).dryRun === true;

    // Pull invoices in the right scope. We treat 'sent' + 'partial' +
    // 'outstanding' as outstanding (anything not paid + not draft +
    // not refunded). Overdue narrows that to past due_date.
    const todayIso = new Date().toISOString().slice(0, 10);
    let q = ssr
      .from("invoices")
      .select("id, invoice_number, total_amount, balance_due, due_date, public_token, order_id, client_id, status")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid", "overdue"] as any)
      .order("due_date", { ascending: true });
    if (scope === "overdue") {
      // INV-A (invoices audit): an invoice due TODAY is not yet
      // overdue - it becomes overdue tomorrow. Pre-INV-A this used
      // `lte` and chased clients a day early; embarrassing on the
      // day the deposit was actually due. Strict less-than now.
      q = q.lt("due_date", todayIso);
    }
    const { data: invoices, error: invErr } = await q;
    if (invErr) {
      console.error("[bulk-remind] invoices read failed:", invErr);
      return res.status(500).json({ error: invErr.message });
    }

    const list = (invoices || []) as any[];
    if (list.length === 0) {
      if (dryRun) {
        return res.status(200).json({
          ok: true,
          dryRun: true,
          total: 0,
          withEmail: 0,
          withoutEmail: 0,
          preview: [],
        });
      }
      return res.status(200).json({ ok: true, total: 0, sent: 0, failed: 0, skipped: 0 });
    }

    // Cache company name + base URL for the per-invoice email body.
    const { data: companyRow } = await ssr
      .from("companies")
      .select("company_name, currency")
      .eq("id", companyId)
      .maybeSingle();
    const companyName = ((companyRow as any)?.company_name as string) || "your caterer";
    const currencyCode = ((companyRow as any)?.currency as string) || "ZAR";
    const sym =
      currencyCode === "GBP" ? "£" :
      currencyCode === "USD" ? "$" :
      currencyCode === "EUR" ? "€" :
      "R";
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = req.headers.host || "";
    const baseUrl = host ? `${proto}://${host}` : "";

    // Resolve client emails per invoice. Some invoices link via
    // client_id, others have the email cached on the order. Pull both
    // sources in parallel to keep this cheap.
    const clientIds = list.map((i) => i.client_id).filter(Boolean);
    const orderIds = list.map((i) => i.order_id).filter(Boolean);
    const [clientsRes, ordersRes] = await Promise.all([
      // TIGHTEN I.81: filter soft-deleted client / order rows. Both
      // tables have deleted_at; without the guard a bulk reminder
      // could resolve to a stale client_name from a deleted row.
      clientIds.length > 0
        ? ssr.from("clients").select("id, email, client_name").in("id", clientIds).is("deleted_at", null)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length > 0
        ? ssr.from("orders").select("id, client_email, client_name").in("id", orderIds).is("deleted_at", null)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const clientById = new Map<string, any>();
    for (const c of (clientsRes.data || []) as any[]) clientById.set(c.id, c);
    const orderById = new Map<string, any>();
    for (const o of (ordersRes.data || []) as any[]) orderById.set(o.id, o);

    if (dryRun) {
      // INV-B: count + first-5-recipient preview for the dialog. We
      // mirror the same email-resolution logic the send loop uses
      // (client.email -> order.client_email) so the withEmail /
      // withoutEmail counts the dialog shows match what actually
      // happens on send.
      let withEmail = 0;
      let withoutEmail = 0;
      const preview: Array<{ clientName: string; balance: number; due_date: string | null; hasEmail: boolean }> = [];
      for (const inv of list) {
        const client = inv.client_id ? clientById.get(inv.client_id) : null;
        const order = inv.order_id ? orderById.get(inv.order_id) : null;
        const to = (client?.email as string) || (order?.client_email as string) || null;
        const name = (client?.client_name as string) || (order?.client_name as string) || "Unknown client";
        if (to) withEmail += 1; else withoutEmail += 1;
        if (preview.length < 5) {
          preview.push({
            clientName: name,
            balance: Number(inv.balance_due || inv.total_amount || 0),
            due_date: inv.due_date || null,
            hasEmail: !!to,
          });
        }
      }
      return res.status(200).json({
        ok: true,
        dryRun: true,
        total: list.length,
        withEmail,
        withoutEmail,
        preview,
      });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const inv of list) {
      try {
        const client = inv.client_id ? clientById.get(inv.client_id) : null;
        const order = inv.order_id ? orderById.get(inv.order_id) : null;
        const to = (client?.email as string) || (order?.client_email as string) || null;
        const name = (client?.client_name as string) || (order?.client_name as string) || "there";
        if (!to) {
          skipped += 1;
          continue;
        }
        const balance = Number(inv.balance_due || inv.total_amount || 0);
        const due = inv.due_date
          ? new Date(inv.due_date).toLocaleDateString("en-ZA", {
              day: "numeric", month: "short", year: "numeric",
            })
          : "the agreed date";
        const link = inv.public_token && baseUrl
          ? `${baseUrl}/pay/i/${inv.public_token}`
          : null;
        const firstName = String(name).split(" ")[0] || "there";
        const subject = `Friendly reminder: invoice ${inv.invoice_number || ""} - ${companyName}`;
        const body =
          `Hi ${firstName},\n\n` +
          `Just a friendly reminder that invoice ${inv.invoice_number || ""} is currently outstanding. ` +
          `Balance due: ${sym} ${balance.toFixed(2)} (due ${due}).\n\n` +
          (link ? `View / pay online: ${link}\n\n` : "") +
          `Reply to this email if there's anything we can sort out.\n\n` +
          `-- ${companyName}`;
        const ok = await emailService.sendEmail({
          companyId,
          to,
          subject,
          template: "transactional",
          orderId: inv.order_id,
          variables: {
            clientName: name,
            orderNumber: inv.invoice_number,
            invoice_link: link || "",
          },
          html: `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`,
          text: body,
          _client: ssr,
        } as any);
        if (ok) sent += 1;
        else failed += 1;
      } catch (e) {
        console.warn("[bulk-remind] per-invoice send failed:", inv.id, e);
        failed += 1;
      }
    }

    // Single audit row covering the batch - saves spamming audit
    // _logs with N rows when the operator hits the button on a 50-
    // invoice tenant.
    try {
      await ssr.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "invoice_reminder_batch_sent",
        entity_type: "company",
        entity_id: companyId,
        details: { scope, total: list.length, sent, failed, skipped },
      });
    } catch (auditErr) {
      console.warn("[bulk-remind] audit insert failed:", auditErr);
    }

    return res.status(200).json({
      ok: true,
      total: list.length,
      sent,
      failed,
      skipped,
    });
  } catch (err: any) {
    console.error("[bulk-remind] crashed:", err);
    return res.status(500).json({ error: err?.message || "Bulk remind failed" });
  }
}

export default withApiLogging(handler);
