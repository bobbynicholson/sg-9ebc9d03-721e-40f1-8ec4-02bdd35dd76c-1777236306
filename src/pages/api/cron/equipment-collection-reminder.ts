/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Wave 50 C5 -- equipment collection reminder.
 *
 * Audit (Specialist 5) found that when orderWorkflow flips an order
 * to delivered it auto-creates a collection driver_assignment +
 * notifies the driver, but the client never hears that someone is
 * coming back for the kit. Surprise driver shows up the next
 * morning.
 *
 * Strategy: every morning, find collection assignments scheduled
 * for today / tomorrow that haven't been completed yet, and email
 * the client a heads-up. 24h dedup so re-runs stay polite.
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
    const tomorrowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();

    const { data: assignments, error } = await (sb as any)
      .from("driver_assignments")
      .select("id, company_id, order_id, scheduled_for, status")
      .eq("assignment_type", "collection")
      .neq("status", "completed")
      .lte("scheduled_for", tomorrowEnd);
    if (error) {
      console.error("[equipment-collection-reminder] fetch failed:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!assignments || assignments.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }

    const { resolveEmailTemplate } = await import("@/services/email/templateResolver");
    const { emailService } = await import("@/services/emailService");
    const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    const errors: string[] = [];

    for (const a of assignments as any[]) {
      try {
        const { data: order } = await (sb as any)
          .from("orders")
          .select("id, client_email, client_name, order_number, event_name, venue_address")
          .eq("id", a.order_id)
          .maybeSingle();
        if (!order || !(order as any).client_email) continue;

        // Idempotency
        const { count: recentCount } = await (sb as any)
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("order_id", a.order_id)
          .eq("template_type", "equipment_collection_reminder")
          .gte("sent_at", yesterdayIso);
        if (recentCount && recentCount > 0) continue;

        const variables: Record<string, string> = {
          first_name: ((order as any).client_name || "there").split(" ")[0],
          order_number: (order as any).order_number || (order as any).id,
          event_name: (order as any).event_name || "your event",
          venue_address: (order as any).venue_address || "the venue",
          collection_time: a.scheduled_for
            ? new Date(a.scheduled_for).toLocaleString("en-ZA", {
                weekday: "short", day: "numeric", month: "short",
                hour: "2-digit", minute: "2-digit",
              })
            : "tomorrow",
        };

        const resolved = await resolveEmailTemplate({
          companyId: a.company_id,
          templateType: "equipment_collection_reminder",
          variables,
          fallback: {
            subject: `Quick heads-up: equipment collection for ${variables.event_name}`,
            bodyHtml:
              `Hi ${variables.first_name},\n\n` +
              `Just a heads-up that our driver is coming to collect the equipment ` +
              `from ${variables.venue_address} around ${variables.collection_time}.\n\n` +
              `Please make sure someone's there and the gear's ready to load. ` +
              `Reply to this email if the time doesn't work and we'll re-schedule.\n\n` +
              `Thanks!`,
          },
        });

        await emailService.sendEmail({
          companyId: a.company_id,
          to: (order as any).client_email,
          subject: resolved.subject,
          body: resolved.bodyHtml,
          orderId: a.order_id,
          templateType: "equipment_collection_reminder",
        } as any);
        sent += 1;
      } catch (e: any) {
        errors.push(`assignment ${a.id}: ${e?.message || e}`);
      }
    }

    return res.status(200).json({
      ok: true,
      considered: assignments.length,
      sent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[equipment-collection-reminder] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
