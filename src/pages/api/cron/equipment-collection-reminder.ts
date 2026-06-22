/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "equipment-collection-reminder";

/**
 * Wave 50 C5 - equipment collection reminder.
 *
 * Audit (Specialist 5) found that when orderWorkflow flips an order
 * to delivered it auto-creates a collection driver_assignment +
 * notifies the driver, but the client never hears that someone is
 * coming back for the kit. Surprise driver shows up the next
 * morning.
 *
 * Strategy: runs morning (07:00) + evening (18:00). Find collection
 * assignments scheduled for today / tomorrow that haven't completed,
 * and:
 *   - email the CLIENT a heads-up (24h dedup), AND
 *   - notify the assigned DRIVER + the company ADMINS in-app so the
 *     collection run is actually on someone's radar. Two phases:
 *       eve  - collection is tomorrow ("collection run tomorrow")
 *       day  - collection is today    ("today is your collection run")
 *     Distinct notification types per phase/role -> each fires once.
 *
 * Previously this cron emailed only the client; the driver was pinged
 * just once when the collection assignment was first created (at
 * delivery time) and the admin was never reminded on the day.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();
    const tomorrowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();

    const { data: assignments, error } = await (sb as any)
      .from("driver_assignments")
      .select("id, company_id, order_id, driver_id, scheduled_for, status")
      .eq("assignment_type", "collection")
      .neq("status", "completed")
      .lte("scheduled_for", tomorrowEnd);
    if (error) {
      console.error("[equipment-collection-reminder] fetch failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }
    if (!assignments || assignments.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, considered: 0, sent: 0 });
      return res.status(200).json({ ok: true, sent: 0 });
    }

    const { resolveEmailTemplate } = await import("@/services/email/templateResolver");
    const { emailService } = await import("@/services/emailService");
    const { notificationService } = await import("@/services/notificationService");
    const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    let driverPings = 0;
    let adminPings = 0;
    const errors: string[] = [];

    for (const a of assignments as any[]) {
      try {
        const { data: order } = await (sb as any)
          .from("orders")
          .select("id, client_email, client_name, order_number, event_name, venue_address, company_id, region_id")
          .eq("id", a.order_id)
          .maybeSingle();
        if (!order) continue;

        const orderLabel = (order as any).order_number || String(a.order_id).slice(0, 8);
        const venue = (order as any).venue_address ? String((order as any).venue_address).split(",")[0] : "";
        // Phase by hours-until, tz-robust: day = happening today/soon,
        // eve = tomorrow. The 07:00 + 18:00 runs land each phase once.
        const hoursUntil = a.scheduled_for
          ? (new Date(a.scheduled_for).getTime() - now.getTime()) / 3_600_000
          : 0;
        const phase: "day" | "eve" | null =
          hoursUntil <= 14 && hoursUntil > -6 ? "day"
          : hoursUntil > 14 && hoursUntil <= 38 ? "eve"
          : null;
        const whenLabel = a.scheduled_for
          ? new Date(a.scheduled_for).toLocaleString("en-ZA", {
              weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })
          : phase === "eve" ? "tomorrow" : "today";

        // ---- Driver + admin in-app pings (independent of client email) ----
        if (phase) {
          const driverType = `collection_reminder_driver_${phase}`;
          const adminType = `collection_reminder_admin_${phase}`;
          const headline = phase === "eve"
            ? `Collection run tomorrow: ${orderLabel}`
            : `Today's collection run: ${orderLabel}`;
          // Assigned driver (per-user, deduped per phase).
          if (a.driver_id) {
            try {
              const created = await notificationService.createNotification(
                {
                  company_id: (order as any).company_id || a.company_id,
                  recipient_id: a.driver_id,
                  user_id: a.driver_id,
                  notification_type: driverType,
                  title: `📦 ${headline}`,
                  message: `Pick up the equipment from ${venue || "the venue"} - scheduled ${whenLabel}.`,
                  priority: phase === "day" ? "high" : "normal",
                  link: "/team-portal/driver/dashboard",
                  related_entity_type: "order",
                  related_entity_id: a.order_id,
                  dedup: true,
                  dedupWindowMinutes: 18 * 60,
                } as any,
                sb,
              );
              if (created) driverPings += 1;
            } catch (e: any) {
              errors.push(`assignment ${a.id} driver ping: ${e?.message || e}`);
            }
          }
          // Company admins / owner (deduped per phase per order).
          try {
            const adminSent = await notificationService.broadcastNotification(
              {
                companyId: (order as any).company_id || a.company_id,
                regionId: (order as any).region_id || null,
                targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
                title: `📦 ${headline}`,
                message: `Equipment collection${venue ? ` from ${venue}` : ""} is scheduled ${whenLabel}${a.driver_id ? "" : " - no driver assigned yet"}.`,
                type: adminType,
                priority: phase === "day" ? "high" : "normal",
                link: `/admin/orders?orderId=${a.order_id}`,
                relatedEntityType: "order",
                relatedEntityId: a.order_id,
                dedup: true,
                dedupWindowMinutes: 18 * 60,
              },
              sb,
            );
            if ((adminSent || 0) > 0) adminPings += 1;
          } catch (e: any) {
            errors.push(`assignment ${a.id} admin ping: ${e?.message || e}`);
          }
        }

        // ---- Client email (unchanged) ----
        if (!(order as any).client_email) continue;

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
          // Service-role client: cron runs unauthenticated, so without it
          // the provider lookup is RLS-blocked and the send silently
          // no-ops (logged "sent" but never delivered).
          _client: sb,
        } as any);
        sent += 1;
      } catch (e: any) {
        errors.push(`assignment ${a.id}: ${e?.message || e}`);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      considered: assignments.length,
      sent,
      driverPings,
      adminPings,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      considered: assignments.length,
      sent,
      driverPings,
      adminPings,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[equipment-collection-reminder] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
