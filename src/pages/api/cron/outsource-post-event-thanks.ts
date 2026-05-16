/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Wave 67.3 -- outsource provider post-event thanks + invoice nudge.
 *
 * 24-48h after the event date for any assignment in accepted /
 * on_site / completed status that hasn't been invoiced yet, send a
 * short thanks + "please invoice us within X days" prompt. Closes
 * the loop and prompts the provider to send their invoice early
 * rather than 6 weeks later.
 *
 * Idempotent via email_automation_log.
 *
 * Schedule: daily (the 24-48h window keeps it from firing twice
 * even if cron skips a day).
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
    const now = new Date();
    // Window: event was between 24-72h ago. Tight enough that we don't
    // hit older completed jobs but loose enough that a missed cron run
    // doesn't drop the message.
    const windowEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const windowStart = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

    const { data: assignments, error } = await (sb as any)
      .from("outsource_assignments")
      .select(`
        id, company_id, order_id, provider_id, status,
        required_on_site_at, service_description,
        quoted_cost, cost_currency, rate_type,
        invoice_received,
        provider:provider_id ( provider_name, contact_person, email, payment_terms_days )
      `)
      .in("status", ["accepted", "on_site", "completed"])
      .eq("invoice_received", false)
      .gte("required_on_site_at", windowStart)
      .lte("required_on_site_at", windowEnd)
      .is("deleted_at", null);

    if (error) {
      console.error("[outsource-post-event-thanks] fetch failed:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!assignments || assignments.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }

    const { emailService } = await import("@/services/emailService");
    const recentIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const a of assignments as any[]) {
      try {
        const providerEmail = (a.provider?.email as string | null | undefined) || null;
        const providerName = (a.provider?.provider_name as string | null | undefined) || "there";
        if (!providerEmail) {
          skipped += 1;
          continue;
        }

        // Idempotency: 7-day lookback per (order_id, recipient_email,
        // template_type) since email_automation_log has no entity_id.
        const { count: recentCount } = await (sb as any)
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("order_id", a.order_id)
          .eq("recipient_email", providerEmail)
          .eq("template_type", "outsource_post_event_thanks")
          .gte("sent_at", recentIso);
        if (recentCount && recentCount > 0) {
          skipped += 1;
          continue;
        }

        const { data: order } = await (sb as any)
          .from("orders")
          .select("order_number, event_date, client_name")
          .eq("id", a.order_id)
          .maybeSingle();

        const firstName = (a.provider?.contact_person || providerName).split(" ")[0];
        const eventLabel = (order as any)?.event_date
          ? new Date((order as any).event_date).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })
          : "the event";
        const fee = `${a.cost_currency || "ZAR"} ${Number(a.quoted_cost || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
        const paymentTerms = a.provider?.payment_terms_days
          ? `${a.provider.payment_terms_days} days`
          : "7 days";

        const subject = `Thanks for ${eventLabel} -- invoice us when you're ready`;
        const bodyText = [
          `Hi ${firstName},`,
          ``,
          `Thanks for your work on ${eventLabel}${(order as any)?.order_number ? ` (${(order as any).order_number})` : ""}.`,
          ``,
          `When you have a moment, please send through your invoice for ${fee} so we can settle within ${paymentTerms}.`,
          ``,
          `Reply to this email or send via your usual channel.`,
          ``,
          `Cheers!`,
        ].filter(Boolean).join("\n");

        const result = await emailService.sendEmail({
          companyId: a.company_id,
          to: providerEmail,
          subject,
          body: `<pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; white-space: pre-wrap;">${bodyText
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
          orderId: a.order_id,
          templateType: "outsource_post_event_thanks",
        } as any);
        if (result) sent += 1;
        else skipped += 1;
      } catch (e: any) {
        errors.push(`${a.id}: ${e?.message || e}`);
        console.error("[outsource-post-event-thanks] assignment failed:", a.id, e);
      }
    }

    return res.status(200).json({ ok: true, sent, skipped, errors });
  } catch (err: any) {
    console.error("[outsource-post-event-thanks] crashed:", err);
    return res.status(500).json({ error: err?.message || "Cron crashed" });
  }
}
