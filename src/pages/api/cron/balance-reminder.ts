/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { buildPayInvoiceUrlServer } from "@/lib/customerLinksServer";


const CRON_NAME = "balance-reminder";

/**
 * Wave 50 C4 - automated balance-due reminder sender.
 *
 * Audit (Specialist 5) found `update-overdue-invoices` cron only
 * stamped the overdue status; no email actually went out. Operators
 * had to click "Bulk remind" by hand. Customers heard nothing
 * between deposit + delivery, then a sudden balance demand.
 *
 * Strategy: every morning, find delivered orders whose balance
 * isn't paid AND whose balance_due_date is within the next 3 days
 * OR already past. Queue a balance_invoice_issued reminder. 24h
 * dedup so the cron stays daily even if it runs more often.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Pull invoices with balance owed where due_date is approaching
    // or past. Limits to 200 per run to keep the cron tight.
    const { data: invoices, error } = await (sb as any)
      .from("invoices")
      .select("id, company_id, order_id, total_amount, amount_paid, balance_due, due_date, public_token")
      .gt("balance_due", 0)
      .lte("due_date", threeDaysFromNow)
      .is("deleted_at", null)
      .neq("status", "paid")
      .limit(200);
    if (error) {
      console.error("[balance-reminder] invoices fetch failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }
    if (!invoices || invoices.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, considered: 0, queued: 0 });
      return res.status(200).json({ ok: true, queued: 0 });
    }

    let queued = 0;
    const errors: string[] = [];

    for (const inv of invoices as any[]) {
      try {
        // Pull order + client details for the email.
        const { data: order } = await (sb as any)
          .from("orders")
          .select("id, client_email, client_name, order_number, event_name, event_date")
          .eq("id", inv.order_id)
          .maybeSingle();
        if (!order || !(order as any).client_email) continue;

        // Idempotency: skip if a balance_reminder was queued in the
        // last 24h for this invoice.
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const { count: recentCount } = await (sb as any)
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("order_id", inv.order_id)
          .eq("template_type", "balance_invoice_issued")
          .gte("sent_at", yesterday);
        if (recentCount && recentCount > 0) continue;

        const { resolveEmailTemplate } = await import("@/services/email/templateResolver");
        const { emailService } = await import("@/services/emailService");

        const invoiceLink = buildPayInvoiceUrlServer(inv.public_token) ||
          `${process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com"}/client-portal/billing?invoiceId=${inv.id}`;
        const formattedAmount = `R ${Number(inv.balance_due || 0).toFixed(2)}`;
        const variables: Record<string, string> = {
          first_name: ((order as any).client_name || "there").split(" ")[0],
          client_name: (order as any).client_name || "there",
          order_number: (order as any).order_number || (order as any).id,
          event_name: (order as any).event_name || "your event",
          amount: formattedAmount,
          balance_amount: formattedAmount,
          amount_due: formattedAmount,
          invoice_link: invoiceLink,
          pay_link: invoiceLink,
          due_date: inv.due_date || "soon",
        };
        const resolved = await resolveEmailTemplate({
          companyId: inv.company_id,
          templateType: "balance_invoice_issued",
          variables,
          fallback: {
            subject: `Balance reminder for ${variables.event_name}`,
            bodyHtml:
              `Hi ${variables.first_name},\n\n` +
              `A friendly nudge - the balance for ${variables.order_number} ` +
              `(${variables.event_name}) is ${variables.balance_amount}, due ${variables.due_date}.\n\n` +
              `Reply to this email if anything's changed on your side.\n\n` +
              `Thanks!`,
          },
        });

        await emailService.sendEmail({
          companyId: inv.company_id,
          to: (order as any).client_email,
          subject: resolved.subject,
          body: resolved.bodyHtml,
          orderId: inv.order_id,
          templateType: "balance_invoice_issued",
          // Service-role client: this runs as an unauthenticated cron, so
          // without it the provider lookup is RLS-blocked and the send
          // silently no-ops (logged "sent" but never delivered).
          _client: sb,
        } as any);
        queued += 1;
      } catch (e: any) {
        errors.push(`invoice ${inv.id}: ${e?.message || e}`);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      considered: invoices.length,
      queued,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      considered: invoices.length,
      queued,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[balance-reminder] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
