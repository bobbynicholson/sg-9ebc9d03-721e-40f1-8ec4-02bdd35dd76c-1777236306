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

    // Per-company brand name for {{tenant_name}} in the reminder body.
    // Cached so a tenant with many overdue invoices is looked up once.
    const companyNameCache = new Map<string, string>();
    const tenantName = async (companyId: string): Promise<string> => {
      if (companyNameCache.has(companyId)) return companyNameCache.get(companyId) as string;
      const { data: co } = await (sb as any)
        .from("companies")
        .select("company_name")
        .eq("id", companyId)
        .maybeSingle();
      const name = ((co as any)?.company_name as string) || "your caterer";
      companyNameCache.set(companyId, name);
      return name;
    };

    for (const inv of invoices as any[]) {
      try {
        // Pull order + client details for the email.
        const { data: order } = await (sb as any)
          .from("orders")
          .select("id, client_id, client_email, client_name, order_number, event_name, event_date")
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
          .eq("template_type", "balance_reminder_email")
          // Dedup on created_at, NOT sent_at: logEmailSent only ever writes
          // created_at (sent_at stays NULL), so a sent_at filter matched zero
          // rows and the reminder re-fired on every run.
          .gte("created_at", yesterday);
        if (recentCount && recentCount > 0) continue;

        const { emailService } = await import("@/services/emailService");

        const invoiceLink = buildPayInvoiceUrlServer(inv.public_token) ||
          `${process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com"}/client-portal/billing?invoiceId=${inv.id}`;
        const formattedAmount = `R ${Number(inv.balance_due || 0).toFixed(2)}`;
        const brand = await tenantName(inv.company_id);
        const variables: Record<string, string> = {
          first_name: ((order as any).client_name || "there").split(" ")[0],
          client_name: (order as any).client_name || "there",
          order_number: (order as any).order_number || (order as any).id,
          event_name: (order as any).event_name || "your event",
          event_date: (order as any).event_date || "the agreed date",
          amount: formattedAmount,
          balance_amount: formattedAmount,
          amount_due: formattedAmount,
          invoice_link: invoiceLink,
          pay_link: invoiceLink,
          due_date: inv.due_date || "soon",
          tenant_name: brand,
        };
        // Use the dedicated "Balance reminder" template (balance_reminder_email)
        // - NOT balance_invoice_issued. The reminder cron was reusing the
        // invoice-issued template, so the tenant's editable reminder copy was
        // dead and clients got "invoice issued" wording on a chase email.
        //
        // Pass it as `template` (not a pre-resolved body) so emailService
        // logs email_automation_log.template_type = "balance_reminder_email".
        // The 24h dedup above keys off exactly that value; when this was sent
        // as a raw body the row logged as "custom", the dedup never matched,
        // and the reminder re-fired on every run.
        const fallbackSubject = `Balance reminder for ${variables.event_name}`;
        const fallbackBody =
          `Hi ${variables.first_name},\n\n` +
          `A friendly nudge - the balance for ${variables.order_number} ` +
          `(${variables.event_name}) is ${variables.balance_amount}, due ${variables.due_date}.\n\n` +
          `Pay link: ${variables.pay_link}\n\n` +
          `Reply to this email if anything's changed on your side.\n\n` +
          `Thanks,\n${brand}`;

        await emailService.sendEmail({
          companyId: inv.company_id,
          to: (order as any).client_email,
          template: "balance_reminder_email",
          subject: fallbackSubject,
          body: fallbackBody,
          variables,
          orderId: inv.order_id,
          // Service-role client: this runs as an unauthenticated cron, so
          // without it the provider lookup is RLS-blocked and the send
          // silently no-ops (logged "sent" but never delivered).
          _client: sb,
        } as any);
        queued += 1;

        // Also surface the reminder in the client's portal bell (email +
        // in-app, same as the manual bulk-remind path). Best-effort:
        // resolveClientUserId returns null for un-linked portal-token
        // clients - skip rather than insert a row no auth user can read.
        try {
          const { resolveClientUserId } = await import("@/services/lifecycle/resolveClientUserId");
          const { notificationService } = await import("@/services/notificationService");
          const clientUid = await resolveClientUserId(sb, (order as any).client_id || null);
          if (clientUid) {
            await notificationService.createNotification({
              company_id: inv.company_id,
              recipient_id: clientUid,
              user_id: clientUid,
              notification_type: "balance_reminder",
              title: "Payment reminder",
              message: `A friendly reminder: the balance for ${variables.event_name} is ${formattedAmount}, due ${variables.due_date}.`,
              priority: "normal",
              link: `/client-portal/billing?invoiceId=${inv.id}`,
              related_entity_type: "invoice",
              related_entity_id: inv.id,
            }, sb);
          }
        } catch (notifyErr: any) {
          console.warn("[balance-reminder] client in-app notify failed:", inv.id, notifyErr?.message || notifyErr);
        }
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
