/**
 * GET /api/cron/late-event-check
 *
 * Cron worker that flags orders where the event date has already
 * passed but the order isn't yet delivered / completed / cancelled.
 * Closes the audit-flagged "late-running events have no escalation
 * chain" gap.
 *
 * Logic:
 *   - Walks past-event orders, including closed orders so stale alerts
 *     can be cleared after delivery/completion.
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
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { isOrderDeliveryComplete } from "@/services/order/orderTimeline";


const CRON_NAME = "late-event-check";

const ALERT_TYPE = "order_late_alert";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const supabase: any = getServiceSupabase();
  const todayIso = new Date().toISOString().slice(0, 10);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Pull every order that's past event_date and not closed out.
  const { data: late, error } = await supabase
    .from("orders")
    .select("id, company_id, user_id, order_number, client_name, event_date, status, delivered_at, completed_at, departed_venue_at, event_complete_at, venue_address")
    .lt("event_date", todayIso)
    .is("deleted_at", null)
    .order("event_date", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[cron/late-event-check] read failed:", error);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, run_id: auth.runId, error_message: error.message,
    });
    return res.status(500).json({ error: error.message });
  }

  const lateOrders = (late || []) as any[];
  const lateOrderIds = lateOrders.map((order) => order.id).filter(Boolean);
  const assignmentsByOrder = new Map<string, any[]>();
  if (lateOrderIds.length > 0) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("driver_assignments")
      .select("order_id, assignment_type, status, delivered_at, completed_at")
      .in("order_id", lateOrderIds);
    if (assignmentError) {
      // Keep alerting if assignment evidence cannot be read; never suppress
      // an overdue alert based on a failed operational lookup.
      console.warn("[cron/late-event-check] assignment lookup failed:", assignmentError);
    } else {
      for (const assignment of assignments || []) {
        const rows = assignmentsByOrder.get(assignment.order_id) || [];
        rows.push(assignment);
        assignmentsByOrder.set(assignment.order_id, rows);
      }
    }
  }

  let alerted = 0;
  let skipped = 0;
  // orders.user_id is nullable (imports / magic-link / system orders) but
  // notifications.user_id is NOT NULL, so a null recipient 23502s and the
  // late-event alert is silently lost - exactly the orders that most need
  // escalating. Fall back to the company owner (cached per company).
  const ownerCache = new Map<string, string | null>();
  const resolveRecipient = async (order: any): Promise<string | null> => {
    if (order.user_id) return order.user_id;
    const cid = order.company_id;
    if (!cid) return null;
    if (!ownerCache.has(cid)) {
      const { data: co } = await supabase
        .from("companies").select("owner_id").eq("id", cid).maybeSingle();
      ownerCache.set(cid, (co as any)?.owner_id ?? null);
    }
    return ownerCache.get(cid) ?? null;
  };
  // Wave 24: collect per-row errors instead of letting one bad row
  // (RLS quirk, FK violation, transient connection blip) crash the
  // whole loop. The previous pattern was bare awaits with no
  // error check on the insert - a failed insert silently bumped
  // `alerted` and the operator never saw the alert.
  const errors: string[] = [];

  for (const order of lateOrders) {
    try {
      const terminal = ["cancelled", "canceled"].includes(String(order.status || "").toLowerCase());
      if (terminal || isOrderDeliveryComplete(order, assignmentsByOrder.get(order.id) || [])) {
        const notificationLabel = order.order_number || order.id.slice(0, 8);
        const readAt = new Date().toISOString();
        const [linkedAlerts, legacyAlerts] = await Promise.all([
          supabase.from("notifications")
            .update({ is_read: true, read_at: readAt })
            .eq("company_id", order.company_id)
            .eq("notification_type", ALERT_TYPE)
            .eq("related_entity_id", order.id)
            .eq("is_read", false),
          supabase.from("notifications")
            .update({ is_read: true, read_at: readAt })
            .eq("company_id", order.company_id)
            .eq("notification_type", ALERT_TYPE)
            .is("related_entity_id", null)
            .eq("is_read", false)
            .ilike("title", `%${notificationLabel}%`),
        ]);
        if (linkedAlerts.error || legacyAlerts.error) {
          errors.push(`${order.id}: could not clear resolved late alert: ${linkedAlerts.error?.message || legacyAlerts.error?.message}`);
        }
        skipped += 1;
        continue;
      }
      // Idempotency: did we already alert in the last 24h?
      // Prefer the foreign-key link. Older rows may have null
      // related_entity_id, so dedupe those by the order number in the title
      // (the alert message itself does not contain the order number).
      const orderLabel = order.order_number || order.id.slice(0, 8);
      const [linkedRecent, legacyRecent] = await Promise.all([
        supabase.from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("company_id", order.company_id)
          .eq("notification_type", ALERT_TYPE)
          .eq("related_entity_id", order.id)
          .gte("created_at", dayAgo),
        supabase.from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("company_id", order.company_id)
          .eq("notification_type", ALERT_TYPE)
          .is("related_entity_id", null)
          .ilike("title", `%${orderLabel}%`)
          .gte("created_at", dayAgo),
      ]);
      if (linkedRecent.error || legacyRecent.error) {
        errors.push(`${order.id}: dedupe check failed: ${linkedRecent.error?.message || legacyRecent.error?.message}`);
        continue;
      }
      const recentAlerts = (linkedRecent.count || 0) + (legacyRecent.count || 0);
      if (typeof recentAlerts === "number" && recentAlerts > 0) {
        skipped += 1;
        continue;
      }

      const eventLabel = order.event_date
        ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
        : "";
      const venue = order.venue_address ? String(order.venue_address).split(",")[0] : "";

      const recipientId = await resolveRecipient(order);
      if (!recipientId) {
        errors.push(`${order.id}: no owner/user to alert (un-owned order)`);
        continue;
      }
      const { error: insertErr } = await supabase.from("notifications").insert({
        company_id: order.company_id,
        user_id: recipientId,
        recipient_id: recipientId,
        notification_type: ALERT_TYPE,
        title: `⚠️ Order past event date: ${order.order_number || order.id.slice(0, 8)}`,
        message:
          `Event was ${eventLabel}${venue ? ` at ${venue}` : ""}. ` +
          `Status is still "${order.status}" - check with the team and update or cancel.`,
        priority: "urgent",
        link: `/admin/orders?orderId=${order.id}`,
        related_entity_type: "order",
        related_entity_id: order.id,
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

  await recordCronHeartbeat(supabase, CRON_NAME, errors.length > 0 ? "error" : "ok", {
    source: auth.source, run_id: auth.runId,
    checked: (late || []).length,
    alerted,
    skipped,
    errors_count: errors.length,
  });
  return res.status(200).json({
    ok: true,
    checked: (late || []).length,
    alerted,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export default withApiLogging(handler);
