/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "deposit-reminder";

/**
 * FEAT (2026-06-12) - automated unpaid-DEPOSIT reminder sender.
 *
 * Gap (Raj, June 2026): balance-reminder chases unpaid balances on
 * delivered orders, but nothing chased the deposit. A client could
 * accept a quote, receive the deposit invoice, never pay - and hear
 * nothing again. The order sat in the "Unpaid" dashboard tile until
 * the operator noticed by hand.
 *
 * Strategy: every morning, find orders where the deposit is unpaid
 * (orders.deposit_paid = false), the event is still in the future,
 * and the deposit invoice went out at least 3 days ago. Send a
 * friendly nudge with the public /pay/i/{token} link.
 *
 * Pacing: one reminder per 3 days per order (email_automation_log
 * dedup window), capped at 3 reminders total - after that it's an
 * operator conversation, not an automation. Stops the moment the
 * deposit is received (deposit_paid flips) or the event date passes.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */

const REMIND_AFTER_DAYS = 3;       // grace period after invoice issue
const REMIND_EVERY_DAYS = 3;       // spacing between nudges
const MAX_REMINDERS = 3;           // lifetime cap per order
const TEMPLATE_TYPE = "deposit_reminder";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const graceCutoff = new Date(now.getTime() - REMIND_AFTER_DAYS * 86_400_000).toISOString();
    const dedupCutoff = new Date(now.getTime() - REMIND_EVERY_DAYS * 86_400_000).toISOString();

    // Unpaid-deposit orders with a future event. Limit per run to
    // keep the cron tight; the daily cadence catches the rest.
    const { data: orders, error } = await sb
      .from("orders")
      .select("id, company_id, order_number, client_email, client_name, event_name, event_date, deposit_amount, created_at, status")
      .eq("deposit_paid", false)
      .gte("event_date", today)
      .in("status", ["pending", "confirmed"])
      .is("deleted_at", null)
      .lte("created_at", graceCutoff)
      .limit(200);
    if (error) {
      console.error("[deposit-reminder] orders fetch failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }
    if (!orders || orders.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, considered: 0, queued: 0 });
      return res.status(200).json({ ok: true, queued: 0 });
    }

    // Cron context: no request host available, so explicit config
    // first with the canonical production domain as the backstop.
    const origin = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://cateringms.com"
    ).replace(/\/$/, "");

    let queued = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const order of orders as any[]) {
      try {
        if (!order.client_email) { skipped += 1; continue; }

        // The unpaid deposit invoice carries the public pay token.
        // No invoice yet (generation failed at convert time) -> skip;
        // a reminder without a pay link just generates support email.
        const { data: invoice } = await sb
          .from("invoices")
          .select("id, public_token, balance_due, total_amount, amount_paid, status, due_date")
          .eq("order_id", order.id)
          .neq("status", "paid")
          .gt("balance_due", 0)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!invoice || !(invoice as any).public_token) { skipped += 1; continue; }

        // Pacing gate 1: nothing in the last REMIND_EVERY_DAYS days.
        const { count: recentCount } = await sb
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("order_id", order.id)
          .eq("template_type", TEMPLATE_TYPE)
          .gte("sent_at", dedupCutoff);
        if (recentCount && recentCount > 0) { skipped += 1; continue; }

        // Pacing gate 2: lifetime cap.
        const { count: totalCount } = await sb
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("order_id", order.id)
          .eq("template_type", TEMPLATE_TYPE);
        if (totalCount && totalCount >= MAX_REMINDERS) { skipped += 1; continue; }

        // Tenant display name for the sign-off.
        let tenantName = "Your catering team";
        try {
          const { data: companyRow } = await sb
            .from("companies")
            .select("company_name")
            .eq("id", order.company_id)
            .maybeSingle();
          if ((companyRow as any)?.company_name) tenantName = (companyRow as any).company_name;
        } catch { /* keep fallback */ }

        const payLink = `${origin}/pay/i/${(invoice as any).public_token}`;
        const depositDue = Number((invoice as any).balance_due || order.deposit_amount || 0);
        const firstName = String(order.client_name || "there").trim().split(/\s+/)[0] || "there";
        const eventName = order.event_name || "your event";
        const eventDateLabel = order.event_date
          ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
          : "";

        const { emailService } = await import("@/services/emailService");
        // template + variables: sendEmailDetailed routes through
        // resolveEmailTemplate (tenant override beats global default
        // beats this inline fallback) and logs under TEMPLATE_TYPE,
        // which is what the pacing gates above query.
        await emailService.sendEmail({
          companyId: order.company_id,
          to: order.client_email,
          template: TEMPLATE_TYPE,
          subject: `Friendly reminder - deposit for ${eventName}`,
          body:
            `Hi {{first_name}},\n\n` +
            `Just a gentle nudge from {{tenant_name}} - the deposit for {{event_name}}` +
            `{{event_date_phrase}} is still outstanding. Your date is only locked in once it lands.\n\n` +
            `Pay securely here: {{invoice_link}}\n\n` +
            `Already paid by EFT? Ignore this - it can take a day to reflect. ` +
            `Anything changed on your side? Just reply to this email.\n\n` +
            `Thanks,\n{{tenant_name}}`,
          variables: {
            first_name: firstName,
            client_name: order.client_name || "",
            tenant_name: tenantName,
            company_name: tenantName,
            event_name: eventName,
            event_date: eventDateLabel,
            event_date_phrase: eventDateLabel ? ` on ${eventDateLabel}` : "",
            order_number: order.order_number || order.id,
            deposit_amount: depositDue.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            invoice_link: payLink,
            invoice_url: payLink,
          },
          orderId: order.id,
          // Service-role client: cron runs unauthenticated, so without it
          // the provider lookup is RLS-blocked and the send silently
          // no-ops (logged "sent" but never delivered).
          _client: sb,
        } as any);
        queued += 1;
      } catch (e: any) {
        errors.push(`order ${order.id}: ${e?.message || e}`);
      }
    }

    // Past-event unpaid-deposit escalation. The client nudges above stop
    // once the event date passes (gte event_date filter), so an event that
    // came and went with the deposit never paid would go silent. That's an
    // admin problem now, not a client nudge - escalate in-app so it gets
    // chased or the order cleaned up. Deduped daily per order.
    let escalated = 0;
    try {
      const { data: pastDue } = await sb
        .from("orders")
        .select("id, company_id, region_id, order_number, event_name, event_date, deposit_amount")
        .eq("deposit_paid", false)
        .lt("event_date", today)
        .in("status", ["pending", "confirmed"])
        .is("deleted_at", null)
        .limit(300);
      if (pastDue && pastDue.length) {
        const { notificationService } = await import("@/services/notificationService");
        for (const o of pastDue as any[]) {
          try {
            const amt = Number(o.deposit_amount || 0);
            const amtLabel = amt > 0 ? ` of R${amt.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
            const sent = await notificationService.broadcastNotification(
              {
                companyId: o.company_id,
                regionId: o.region_id || null,
                targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
                title: `⚠️ Deposit never paid: ${o.order_number || String(o.id).slice(0, 8)}`,
                message: `${o.event_name && o.event_name !== "Untitled" ? o.event_name : "An event"} (${o.event_date}) has passed but its deposit${amtLabel} was never paid. Chase payment or cancel / clean up the order.`,
                type: "deposit_overdue_past_event",
                priority: "high",
                link: `/admin/orders?orderId=${o.id}`,
                relatedEntityType: "order",
                relatedEntityId: o.id,
                dedup: true,
                dedupWindowMinutes: 20 * 60,
              },
              sb,
            );
            if ((sent || 0) > 0) escalated += 1;
          } catch (e: any) {
            errors.push(`past-event ${o.id}: ${e?.message || e}`);
          }
        }
      }
    } catch (escErr: any) {
      console.warn("[deposit-reminder] past-event escalation failed (non-blocking):", escErr?.message || escErr);
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      considered: orders.length,
      queued,
      skipped,
      escalated,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      considered: orders.length,
      queued,
      skipped,
      escalated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[deposit-reminder] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
