/**
 * GET /api/cron/late-event-check
 *
 * Cron worker that flags orders where the event date has already
 * passed but the order isn't yet delivered / completed / cancelled.
 * Closes the audit-flagged "late-running events have no escalation
 * chain" gap.
 *
 * Logic:
 *   - Walks orders with status NOT IN (delivered, completed, cancelled)
 *     where event_date < CURRENT_DATE.
 *   - For each, checks if a 'order_late_alert' notification has been
 *     fired in the last 24h. Skips if yes (idempotent across cron
 *     ticks).
 *   - Otherwise inserts a high-priority in-app notification to the
 *     order's company_id owner / dispatch user.
 *
 * Auth: shared CRON_SECRET via Authorization: Bearer ${CRON_SECRET}.
 *
 * Vercel cron schedule: every 15 minutes (configured in vercel.json).
 * Runs alongside the existing process-email-queue cron.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALERT_TYPE = "order_late_alert";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const supabase: any = getServiceSupabase();
  const todayIso = new Date().toISOString().slice(0, 10);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Pull every order that's past event_date and not closed out.
  const { data: late, error } = await supabase
    .from("orders")
    .select("id, company_id, user_id, order_number, client_name, event_date, status, venue_address")
    .lt("event_date", todayIso)
    .not("status", "in", "(delivered,completed,cancelled)")
    .is("deleted_at", null)
    .limit(500);
  if (error) {
    console.error("[cron/late-event-check] read failed:", error);
    return res.status(500).json({ error: error.message });
  }

  let alerted = 0;
  let skipped = 0;
  // Wave 24: collect per-row errors instead of letting one bad row
  // (RLS quirk, FK violation, transient connection blip) crash the
  // whole loop. The previous pattern was bare awaits with no
  // error check on the insert - a failed insert silently bumped
  // `alerted` and the operator never saw the alert.
  const errors: string[] = [];

  for (const order of late || []) {
    try {
      // Idempotency: did we already alert in the last 24h?
      const { count: recentAlerts, error: countErr } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", order.company_id)
        .eq("notification_type", ALERT_TYPE)
        .ilike("message", `%${order.order_number || order.id}%`)
        .gte("created_at", dayAgo);
      if (countErr) {
        errors.push(`${order.id}: dedupe check failed: ${countErr.message}`);
        continue;
      }
      if (typeof recentAlerts === "number" && recentAlerts > 0) {
        skipped += 1;
        continue;
      }

      const eventLabel = order.event_date
        ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
        : "";
      const venue = order.venue_address ? String(order.venue_address).split(",")[0] : "";

      const { error: insertErr } = await supabase.from("notifications").insert({
        company_id: order.company_id,
        user_id: order.user_id,
        recipient_id: order.user_id,
        notification_type: ALERT_TYPE,
        title: `⚠️ Order past event date: ${order.order_number || order.id.slice(0, 8)}`,
        message:
          `Event was ${eventLabel}${venue ? ` at ${venue}` : ""}. ` +
          `Status is still "${order.status}" - check with the team and update or cancel.`,
        priority: "urgent",
        link: `/admin/orders?orderId=${order.id}`,
      } as any);
      if (insertErr) {
        errors.push(`${order.id}: insert failed: ${insertErr.message}`);
        continue;
      }

      alerted += 1;
    } catch (e: any) {
      // Belt-and-braces: covers rare cases where the supabase client
      // throws (network unreachable, parse failure on response body).
      errors.push(`${order.id}: ${e?.message || String(e)}`);
    }
  }

  if (errors.length > 0) {
    console.warn("[cron/late-event-check] per-row errors:", errors);
  }

  return res.status(200).json({
    ok: true,
    checked: (late || []).length,
    alerted,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
