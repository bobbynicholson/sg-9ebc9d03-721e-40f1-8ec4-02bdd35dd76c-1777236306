/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { buildPayInvoiceUrlServer } from "@/lib/customerLinksServer";
import { outstandingDepositReminderAmount } from "@/lib/depositReminderAmount";
import { reconcileCompanyInvoiceDueDates } from "@/services/invoiceDueDateService";
import {
  fetchClientPaymentSchedules,
  fetchCompaniesWithClientReminders,
  isPaymentReminderDue,
  paymentReminderTargetDate,
  readPaymentDueSettings,
  readPaymentReminderSettings,
  resolvePaymentSchedule,
  type ClientPaymentSchedule,
  type PaymentDueSettings,
  type PaymentReminderSettings,
} from "@/lib/paymentReminderSchedule";


const CRON_NAME = "balance-reminder";

/**
 * Wave 50 C4 - automated balance-due reminder sender.
 *
 * Audit (Specialist 5) found `update-overdue-invoices` cron only
 * stamped the overdue status; no email actually went out. Operators
 * had to click "Bulk remind" by hand. Customers heard nothing
 * between deposit + delivery, then a sudden balance demand.
 *
 * Strategy (2026-10-14): only for companies that turned payment
 * reminders on in Settings -> Financial (off by default). Each unpaid
 * invoice gets ONE reminder, N days before payment is due (payment
 * due = X days before/after the event, also set there), instead of
 * the old daily nudge from 3 days before the invoice due date.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Companies that turned payment reminders on (Settings -> Financial),
    // plus companies where a client turned them on for itself (Contacts).
    // Unset = off, so nothing goes out by default.
    const { data: companiesOn, error: companiesOnError } = await (sb as any)
      .from("companies")
      .select("id")
      .eq("dispatch_settings->paymentReminders->>mode", "before_due");
    const candidateIds = Array.from(new Set([
      ...((companiesOn || []) as any[]).map((c) => c.id),
      ...(await fetchCompaniesWithClientReminders(sb)),
    ]));
    const { data: enabledCompanies, error: companiesLoadError } = candidateIds.length
      ? await (sb as any)
          .from("companies")
          .select("id, dispatch_settings, balance_due_days, deposit_percent")
          .in("id", candidateIds)
      : { data: [], error: null };
    const companiesError = companiesOnError || companiesLoadError;
    if (companiesError) {
      console.error("[balance-reminder] companies fetch failed:", companiesError);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: companiesError.message });
      return res.status(500).json({ error: companiesError.message });
    }
    const reminderSettings = new Map<string, { reminders: PaymentReminderSettings; due: PaymentDueSettings }>();
    const depositPercentByCompany = new Map<string, number | null>();
    for (const co of (enabledCompanies || []) as any[]) {
      reminderSettings.set(co.id, {
        reminders: readPaymentReminderSettings(co.dispatch_settings),
        due: readPaymentDueSettings(co.dispatch_settings, co.balance_due_days),
      });
      depositPercentByCompany.set(co.id, co.deposit_percent == null ? null : Number(co.deposit_percent));
    }
    if (reminderSettings.size === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, considered: 0, queued: 0 });
      return res.status(200).json({ ok: true, queued: 0 });
    }
    // Reminder copy and invoice links must show the same current due date.
    // Do not proceed to delivery when date reconciliation fails.
    for (const companyId of reminderSettings.keys()) {
      await reconcileCompanyInvoiceDueDates(sb, companyId);
    }

    // Unpaid invoices for those companies. Whether each one is due a
    // reminder today is decided per invoice below.
    const { data: invoices, error } = await (sb as any)
      .from("invoices")
      .select("id, company_id, order_id, total_amount, amount_paid, balance_due, due_date, public_token, invoice_data")
      .in("company_id", Array.from(reminderSettings.keys()))
      .gt("balance_due", 0)
      .is("deleted_at", null)
      .neq("status", "paid")
      .limit(1000);
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
    const clientSchedules = new Map<string, ClientPaymentSchedule | null>();

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
          .select("id, client_id, client_email, client_name, order_number, event_name, event_date, deposit_paid, deposit_amount, deposit_percentage, amount_paid, total_amount, status")
          .eq("id", inv.order_id)
          .maybeSingle();
        if (!order || !(order as any).client_email) continue;

        // An unpaid deposit on an upcoming order is deposit-reminder's
        // job; skipping it here stops the client getting both emails.
        // Derive payment from the order and invoice amounts as well as the
        // legacy flag so a paid deposit on an imported/older order gets a
        // balance reminder even when deposit_paid was never synchronized.
        const outstandingDeposit = outstandingDepositReminderAmount({
          depositPaid: (order as any).deposit_paid,
          orderTotalAmount: (order as any).total_amount,
          orderAmountPaid: (order as any).amount_paid,
          orderDepositAmount: (order as any).deposit_amount,
          orderDepositPercent: (order as any).deposit_percentage,
          invoiceTotalAmount: inv.total_amount,
          invoiceAmountPaid: inv.amount_paid,
          invoiceBalanceDue: inv.balance_due,
          snapshotFirstPaymentAmount: (inv as any).invoice_data?.initialPaymentAmount,
          companyDepositPercent: depositPercentByCompany.get(inv.company_id),
        });
        if (
          outstandingDeposit > 0.009 &&
          ["pending", "confirmed"].includes((order as any).status) &&
          (order as any).event_date >= today
        ) continue;

        // Timing: the client's own setting (Contacts) wins over the
        // company's (Settings -> Financial). One reminder on the chosen
        // day, with a short catch-up window for missed runs, never daily.
        const companySettings = reminderSettings.get(inv.company_id);
        if (!companySettings) continue;
        const clientId = (order as any).client_id as string | null;
        if (clientId && !clientSchedules.has(clientId)) {
          const fetched = await fetchClientPaymentSchedules(sb, [clientId]);
          clientSchedules.set(clientId, fetched.get(clientId) || null);
        }
        const settings = resolvePaymentSchedule(companySettings, clientId ? clientSchedules.get(clientId) : null);
        const targetDate = paymentReminderTargetDate(settings.reminders, settings.due, (order as any).event_date);
        if (!isPaymentReminderDue(targetDate, today)) continue;

        // Idempotency: skip if a balance reminder already went out for
        // this order on or after the reminder day.
        const yesterday = `${targetDate}T00:00:00Z`;
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

        const { deliverAutomatedEmail } = await import("@/lib/email/automatedDelivery");

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

        const delivery = await deliverAutomatedEmail(sb, {
          companyId: inv.company_id,
          to: (order as any).client_email,
          recipientName: (order as any).client_name || null,
          template: "balance_reminder_email",
          subject: fallbackSubject,
          body: fallbackBody,
          variables,
          orderId: inv.order_id,
          triggerEvent: "payment.balance_reminder",
          triggerRefId: inv.order_id,
        } as any);
        if (!delivery.success) throw new Error(delivery.error || "Balance reminder was not sent");
        // Turned off in Email settings: no email and no client bell reminder.
        if (delivery.skippedBySettings) continue;
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
